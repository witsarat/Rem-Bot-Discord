/**
 * การเชื่อมต่อฐานข้อมูลของเว็บ (read/write — ใช้ฐานข้อมูลเดียวกับบอท)
 * อ่าน/เขียน: guild_settings (ค่าห้อง) และอ่าน voice_logs (ประวัติ + สถิติ)
 */
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool | null {
  const url = (process.env.DATABASE_URL ?? "").trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (error) => console.error("[web/db] pool error:", error.message));
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL ?? "").trim());
}

// ─────────────────────────── guild_settings ───────────────────────────

export interface GuildSettings {
  logChannelId: string | null;
  weeklyChannelId: string | null;
}

/** อ่านค่าห้องของเซิร์ฟเวอร์ (null = ยังไม่มีแถว) */
export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const db = getPool();
  if (!db) return null;

  const result = await db.query<{ log_channel_id: string | null; weekly_channel_id: string | null }>(
    "SELECT log_channel_id, weekly_channel_id FROM guild_settings WHERE guild_id = $1",
    [guildId],
  );
  if (!result.rows.length) return null;
  return {
    logChannelId: result.rows[0].log_channel_id,
    weeklyChannelId: result.rows[0].weekly_channel_id,
  };
}

/** บันทึกค่าห้อง (สร้างแถวอัตโนมัติถ้ายังไม่มี) */
export async function upsertGuildSettings(
  guildId: string,
  logChannelId: string | null,
  weeklyChannelId: string | null,
): Promise<void> {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL ยังไม่ได้ตั้งค่า");

  await db.query(
    `INSERT INTO guild_settings (guild_id, log_channel_id, weekly_channel_id, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (guild_id)
     DO UPDATE SET
       log_channel_id = EXCLUDED.log_channel_id,
       weekly_channel_id = EXCLUDED.weekly_channel_id,
       updated_at = now()`,
    [guildId, logChannelId, weeklyChannelId],
  );
}

// ─────────────────────────── voice_logs ───────────────────────────

export type VoiceEvent = "join" | "leave" | "move";

export interface VoiceLogRow {
  id: string;
  userId: string;
  username: string;
  event: VoiceEvent;
  channelName: string | null;
  fromChannelName: string | null;
  toChannelName: string | null;
  createdAt: string;
}

export interface VoiceLogsPage {
  rows: VoiceLogRow[];
  total: number;
}

/** อ่านประวัติ voice log แบบแบ่งหน้า (ใหม่สุดก่อน) */
export async function getVoiceLogs(
  guildId: string,
  options: { page: number; perPage: number; event?: VoiceEvent | null },
): Promise<VoiceLogsPage> {
  const db = getPool();
  if (!db) return { rows: [], total: 0 };

  const { page, perPage, event } = options;
  const offset = (page - 1) * perPage;

  const filter = event ? "AND event = $2" : "";
  const countParams: string[] = event ? [guildId, event] : [guildId];
  const listParams: Array<string | number> = event ? [guildId, event] : [guildId];
  listParams.push(perPage, offset);

  const countQuery = `SELECT count(*)::int AS total FROM voice_logs WHERE guild_id = $1 ${filter}`;
  const listQuery = `
    SELECT id::text AS id, user_id, username, event,
           channel_name, from_channel_name, to_channel_name,
           created_at
      FROM voice_logs
     WHERE guild_id = $1 ${filter}
     ORDER BY created_at DESC, id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;

  const [countResult, listResult] = await Promise.all([
    db.query<{ total: number }>(countQuery, countParams),
    db.query<{
      id: string;
      user_id: string;
      username: string;
      event: VoiceEvent;
      channel_name: string | null;
      from_channel_name: string | null;
      to_channel_name: string | null;
      created_at: Date;
    }>(listQuery, listParams),
  ]);

  return {
    total: countResult.rows[0]?.total ?? 0,
    rows: listResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      event: row.event,
      channelName: row.channel_name,
      fromChannelName: row.from_channel_name,
      toChannelName: row.to_channel_name,
      createdAt: row.created_at.toISOString(),
    })),
  };
}

export interface GuildStats {
  total: number;
  members: number;
  lastAt: string | null;
}

/** สถิติรวมของเซิร์ฟเวอร์ (จำนวนเหตุการณ์ / จำนวนสมาชิก / ล่าสุดเมื่อไร) */
export async function getGuildStats(guildId: string): Promise<GuildStats> {
  const db = getPool();
  if (!db) return { total: 0, members: 0, lastAt: null };

  const result = await db.query<{ total: number; members: number; last_at: Date | null }>(
    `SELECT count(*)::int AS total,
            count(DISTINCT user_id)::int AS members,
            max(created_at) AS last_at
       FROM voice_logs
      WHERE guild_id = $1`,
    [guildId],
  );
  const row = result.rows[0];
  return {
    total: row?.total ?? 0,
    members: row?.members ?? 0,
    lastAt: row?.last_at ? row.last_at.toISOString() : null,
  };
}

// ─────────────────────────── อันดับ (leaderboard) ───────────────────────────

export interface VoiceStatEventRow {
  user_id: string;
  username: string;
  event: VoiceEvent;
  created_at: Date;
}

/** เหตุการณ์ทั้งหมดของเซิร์ฟเวอร์ เรียงเก่า → ใหม่ (ใช้คำนวณอันดับเวลาห้องเสียง) */
export async function getVoiceStatEvents(guildId: string, since: Date | null): Promise<VoiceStatEventRow[]> {
  const db = getPool();
  if (!db) return [];

  if (since) {
    const result = await db.query<VoiceStatEventRow>(
      `SELECT user_id, username, event, created_at
         FROM voice_logs
        WHERE guild_id = $1 AND created_at >= $2
        ORDER BY created_at ASC, id ASC`,
      [guildId, since],
    );
    return result.rows;
  }

  const result = await db.query<VoiceStatEventRow>(
    `SELECT user_id, username, event, created_at
       FROM voice_logs
      WHERE guild_id = $1
      ORDER BY created_at ASC, id ASC`,
    [guildId],
  );
  return result.rows;
}
