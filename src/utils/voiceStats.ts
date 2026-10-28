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

/** สถิติของช่วงเวลาหนึ่ง (ใช้ในการ์ด /profile) */
export interface PeriodVoiceStats {
  /** เวลารวมในห้องเสียง (มิลลิวินาที) */
  totalMs: number;
  /** จำนวนเซสชันที่เข้าห้อง */
  sessions: number;
}

/** สถิติห้องเสียงรายบุคคล แยกตามช่วงเวลา (ใช้กับการ์ด /profile) */
export interface UserVoiceStats {
  /** ทั้งหมด (ตลอดกาล) */
  all: PeriodVoiceStats;
  /** 30 วันล่าสุด */
  last30: PeriodVoiceStats;
  /** 7 วันล่าสุด */
  last7: PeriodVoiceStats;
  /** จำนวนครั้งที่เข้าห้องทั้งหมด */
  joins: number;
  /** ห้องที่เข้าบ่อยที่สุด (ตลอดกาล) */
  topChannel: { name: string; count: number } | null;
}

/**
 * คำนวณสถิติห้องเสียงของสมาชิก 1 คน (7 วัน / 30 วัน / ทั้งหมด) จากตาราง voice_logs
 * - ใช้หลักการจับคู่ join → leave เหมือน getVoiceLeaderboard
 * - เซสชันที่ยังไม่ปิดจะนับถึงปัจจุบัน ถ้าส่งชุด openNow มา
 * @returns สถิติ หรือ null ถ้าฐานข้อมูลยังไม่พร้อม/อ่านไม่สำเร็จ
 */
export async function getUserVoiceStats(
  guildId: string,
  userId: string,
  openNow?: Set<string>,
): Promise<UserVoiceStats | null> {
  const pool = getPool();
  if (!pool || !isDbReady()) return null;

  try {
    const result = await pool.query<{
      event: string;
      created_at: Date;
      channel_name: string | null;
    }>(
      `SELECT event, created_at, channel_name
         FROM voice_logs
        WHERE guild_id = $1 AND user_id = $2 AND event IN ('join', 'leave')
        ORDER BY created_at ASC, id ASC`,
      [guildId, userId],
    );

    const nowMs = Date.now();
    const windows = [
      { key: 'last7' as const, cutoff: nowMs - 7 * DAY_MS },
      { key: 'last30' as const, cutoff: nowMs - 30 * DAY_MS },
      { key: 'all' as const, cutoff: -Infinity },
    ];

    const totals: Record<'last7' | 'last30' | 'all', PeriodVoiceStats> = {
      last7: { totalMs: 0, sessions: 0 },
      last30: { totalMs: 0, sessions: 0 },
      all: { totalMs: 0, sessions: 0 },
    };

    /** ตัดช่วงเวลาให้อยู่ในหน้าต่าง แล้วบวกเข้าทุกช่วงที่มีส่วนทับกัน */
    const addSession = (startMs: number, endMs: number): void => {
      for (const window of windows) {
        const start = Math.max(startMs, window.cutoff);
        const end = Math.max(endMs, window.cutoff);
        if (end > start) {
          totals[window.key].totalMs += end - start;
          totals[window.key].sessions += 1;
        }
      }
    };

    let openJoin: number | null = null;
    let joins = 0;
    const channelCounts = new Map<string, number>();

    for (const row of result.rows) {
      const t = new Date(row.created_at).getTime();

      if (row.event === 'join') {
        if (openJoin === null) openJoin = t;
        joins += 1;
        if (row.channel_name) {
          channelCounts.set(row.channel_name, (channelCounts.get(row.channel_name) ?? 0) + 1);
        }
      } else if (openJoin !== null) {
        addSession(openJoin, t);
        openJoin = null;
      }
    }

    if (openJoin !== null && openNow?.has(userId)) addSession(openJoin, nowMs);

    const topChannel =
      [...channelCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }))[0] ?? null;

    return { ...totals, joins, topChannel };
  } catch (error) {
    console.error('[voiceStats] อ่านสถิติรายบุคคลไม่สำเร็จ:', error);
    return null;
  }
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
