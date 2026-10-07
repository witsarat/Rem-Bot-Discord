/**
 * src/utils/db.ts
 * ฐานข้อมูลออนไลน์ (PostgreSQL — รองรับ Supabase / Neon / Render Postgres ฯลฯ)
 * - ทำงานเมื่อตั้งค่า DATABASE_URL ใน .env / Environment Variables เท่านั้น
 * - ถ้าไม่ได้ตั้ง (หรือเชื่อมต่อไม่ได้) บอทจะกลับไปใช้ไฟล์ config.json แบบเดิมอัตโนมัติ
 */
import { Pool } from 'pg';

let pool: Pool | null = null;
let ready = false;

/** มีการตั้งค่า DATABASE_URL หรือไม่ */
export function isDbConfigured(): boolean {
  return Boolean((process.env.DATABASE_URL ?? '').trim());
}

/** เชื่อมต่อฐานข้อมูลสำเร็จแล้วหรือยัง (สร้างตารางเรียบร้อย) */
export function isDbReady(): boolean {
  return ready;
}

/** ขอ connection pool (สร้างครั้งแรกเมื่อถูกเรียก) */
export function getPool(): Pool | null {
  if (!isDbConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (error) => console.error('[db] pool error:', error));
  }
  return pool;
}

/** เชื่อมต่อ + สร้างตารางทั้งหมด (เรียกครั้งเดียวตอนบอทเริ่มทำงาน) */
export async function initDb(): Promise<void> {
  const client = getPool();
  if (!client) return; // ไม่ได้ใช้ DB — ใช้ config.json แบบเดิม

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        log_channel_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS voice_logs (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        event TEXT NOT NULL,
        channel_id TEXT,
        channel_name TEXT,
        from_channel_id TEXT,
        from_channel_name TEXT,
        to_channel_id TEXT,
        to_channel_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_voice_logs_guild_time ON voice_logs (guild_id, created_at DESC)',
    );
    ready = true;
    console.log('🗄️ เชื่อมต่อฐานข้อมูลออนไลน์แล้ว — เก็บ log + ห้องลง DB');
  } catch (error) {
    ready = false;
    console.error(
      '[db] เชื่อมต่อฐานข้อมูลไม่สำเร็จ — จะใช้ config.json แทนชั่วคราว:',
      error instanceof Error ? error.message : error,
    );
  }
}

/** ข้อมูล voice log 1 เหตุการณ์ */
export interface VoiceLogEntry {
  guildId: string;
  userId: string;
  username: string;
  event: 'join' | 'leave' | 'move';
  channelId?: string | null;
  channelName?: string | null;
  fromChannelId?: string | null;
  fromChannelName?: string | null;
  toChannelId?: string | null;
  toChannelName?: string | null;
}

/** บันทึกเหตุการณ์เข้า-ออก-ย้ายห้องเสียงลงตาราง voice_logs */
export async function insertVoiceLog(entry: VoiceLogEntry): Promise<void> {
  const client = getPool();
  if (!client || !ready) return;

  try {
    await client.query(
      `INSERT INTO voice_logs
         (guild_id, user_id, username, event,
          channel_id, channel_name,
          from_channel_id, from_channel_name,
          to_channel_id, to_channel_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.guildId,
        entry.userId,
        entry.username,
        entry.event,
        entry.channelId ?? null,
        entry.channelName ?? null,
        entry.fromChannelId ?? null,
        entry.fromChannelName ?? null,
        entry.toChannelId ?? null,
        entry.toChannelName ?? null,
      ],
    );
  } catch (error) {
    console.error('[db] บันทึก voice log ไม่สำเร็จ:', error);
  }
}
