/**
 * src/utils/voiceStats.ts
 * สถิติการใช้งานห้องเสียง — คำนวณจากตาราง voice_logs ในฐานข้อมูล
 * ใช้ร่วมกันโดยคำสั่ง /top และระบบรายงานประจำสัปดาห์
 *
 * หลักการนับเวลา:
 *   จับคู่เหตุการณ์ join → leave ของสมาชิกแต่ละคน (เรียงตามเวลา)
 *   เหตุการณ์ move (ย้ายห้อง) ไม่กระทบเวลารวม เพราะยังอยู่ในห้องเสียงต่อเนื่องกัน
 *   เซสชันที่ยังไม่ปิด (ยังอยู่ในห้องเสียงตอนนี้) จะนับเวลาถึงปัจจุบัน ถ้าส่งชุด openNow มา
 */
import { getPool, isDbReady } from './db';

/** สถิติรายบุคคล 1 แถว */
export interface VoiceStatRow {
  userId: string;
  username: string;
  /** เวลารวมที่อยู่ในห้องเสียง (มิลลิวินาที) */
  totalMs: number;
  /** จำนวนครั้งที่เข้าห้องเสียง */
  sessions: number;
}

/** ผลลัพธ์สถิติทั้งเซิร์ฟเวอร์ */
export interface VoiceLeaderboard {
  /** อันดับรายบุคคล เรียงจากมากไปน้อย (เฉพาะคนที่มีเวลามากกว่า 0) */
  rows: VoiceStatRow[];
  /** เวลารวมของทุกคน */
  totalMs: number;
  /** จำนวนสมาชิกที่ใช้งาน (ไม่ซ้ำ) */
  participants: number;
  /** ห้องยอดนิยม (นับจากจำนวนครั้งที่เข้าห้อง) */
  topChannel: { name: string; count: number } | null;
}

/** 1 วัน (มิลลิวินาที) */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * คำนวณอันดับเวลาอยู่ห้องเสียงของเซิร์ฟเวอร์จากฐานข้อมูล
 * @param guildId   เซิร์ฟเวอร์ที่ต้องการ
 * @param windowMs  ช่วงเวลาย้อนหลัง (ไม่ใส่/ใส่ null = ทั้งหมด) — เซสชันที่คาบเกี่ยวจะถูกตัดขอบให้
 * @param openNow   ชุด userId ที่กำลังอยู่ในห้องเสียงตอนนี้ (เซสชันที่ยังไม่ปิดจะนับถึงปัจจุบัน)
 * @returns สถิติ หรือ null ถ้าฐานข้อมูลยังไม่พร้อม
 */
export async function getVoiceLeaderboard(
  guildId: string,
  windowMs: number | null,
  openNow?: Set<string>,
): Promise<VoiceLeaderboard | null> {
  const pool = getPool();
  if (!pool || !isDbReady()) return null;

  const result = await pool.query<{
    user_id: string;
    username: string;
    event: string;
    created_at: Date;
    channel_name: string | null;
  }>(
    `SELECT user_id, username, event, created_at, channel_name
       FROM voice_logs
      WHERE guild_id = $1 AND event IN ('join', 'leave')
      ORDER BY user_id ASC, created_at ASC, id ASC`,
    [guildId],
  );

  const nowMs = Date.now();
  const cutoff = windowMs ? nowMs - windowMs : -Infinity;

  interface UserState {
    username: string;
    totalMs: number;
    sessions: number;
    openJoin: number | null;
  }

  const users = new Map<string, UserState>();
  const channelCounts = new Map<string, number>();

  for (const row of result.rows) {
    const t = new Date(row.created_at).getTime();

    let state = users.get(row.user_id);
    if (!state) {
      state = { username: row.username, totalMs: 0, sessions: 0, openJoin: null };
      users.set(row.user_id, state);
    }
    state.username = row.username; // ใช้ชื่อล่าสุดที่มีการบันทึก

    if (row.event === 'join') {
      if (state.openJoin === null) state.openJoin = t;
      if (row.channel_name && t >= cutoff) {
        channelCounts.set(row.channel_name, (channelCounts.get(row.channel_name) ?? 0) + 1);
      }
    } else {
      // event === 'leave' → ปิดเซสชัน (ถ้ามีเซสชันเปิดอยู่)
      if (state.openJoin !== null) {
        const start = Math.max(state.openJoin, cutoff);
        const end = Math.max(t, cutoff);
        if (end > start) {
          state.totalMs += end - start;
          state.sessions += 1;
        }
        state.openJoin = null;
      }
    }
  }

  // เซสชันที่ยังเปิดอยู่: นับถึง "ตอนนี้" เฉพาะคนที่ยังอยู่ในห้องเสียงจริง ๆ
  for (const [userId, state] of users) {
    if (state.openJoin !== null && openNow?.has(userId)) {
      const start = Math.max(state.openJoin, cutoff);
      if (nowMs > start) {
        state.totalMs += nowMs - start;
        state.sessions += 1;
      }
    }
  }

  const rows: VoiceStatRow[] = [...users.entries()]
    .map(([userId, state]) => ({
      userId,
      username: state.username,
      totalMs: state.totalMs,
      sessions: state.sessions,
    }))
    .filter((row) => row.totalMs > 0)
    .sort((a, b) => b.totalMs - a.totalMs);

  const totalMs = rows.reduce((sum, row) => sum + row.totalMs, 0);
  const topChannel =
    [...channelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))[0] ?? null;

  return { rows, totalMs, participants: rows.length, topChannel };
}

/** แปลงมิลลิวินาทีเป็นข้อความไทยอ่านง่าย เช่น "2 ชม. 30 น." / "1 วัน 4 ชม." */
export function formatVoiceDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days} วัน ${hours} ชม.`;
  if (hours > 0) return `${hours} ชม. ${minutes} น.`;
  if (minutes > 0) return `${minutes} น.`;
  return `${seconds} วิ`;
}
