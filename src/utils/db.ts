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
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_guilds (
        guild_id TEXT PRIMARY KEY,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS voice_snapshot (
        guild_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // อัปเดตโครงสร้างสำหรับฟีเจอร์ใหม่ (ปลอดภัย — รันซ้ำได้เสมอ)
    // weekly_channel_id    : ห้องที่รับรายงานประจำสัปดาห์
    // last_weekly_sent_at  : เวลาส่งรายงานล่าสุด (กันส่งซ้ำข้ามการรีสตาร์ท)
    // log_channel_id       : เดิม NOT NULL → ผ่อนเป็น nullable เพื่อรองรับดิสที่ตั้งแค่รายงาน
    await client.query('ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS weekly_channel_id TEXT');
    await client.query('ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_weekly_sent_at TIMESTAMPTZ');
    await client.query('ALTER TABLE guild_settings ALTER COLUMN log_channel_id DROP NOT NULL');

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

// ─────────────────────────────────────────────────────────────
// ค่าห้องรายงานประจำสัปดาห์ + เวลาส่งล่าสุด (ใช้โดยระบบรายงานอัตโนมัติ)
// ─────────────────────────────────────────────────────────────

/** อ่านค่าห้องรายงานประจำสัปดาห์จาก DB — undefined = ยังไม่มีแถวของเซิร์ฟเวอร์นี้, null = ปิดไว้ */
export async function getWeeklyChannelDb(guildId: string): Promise<string | null | undefined> {
  const client = getPool();
  if (!client || !ready) return undefined;

  try {
    const result = await client.query<{ weekly_channel_id: string | null }>(
      'SELECT weekly_channel_id FROM guild_settings WHERE guild_id = $1',
      [guildId],
    );
    if (!result.rows.length) return undefined;
    return result.rows[0].weekly_channel_id;
  } catch (error) {
    console.error('[db] อ่านค่าห้องรายงานไม่สำเร็จ:', error);
    return undefined;
  }
}

/** ตั้งค่าห้องรายงานประจำสัปดาห์ (null = ปิด) — คืน false ถ้า DB ไม่พร้อม/บันทึกไม่สำเร็จ */
export async function setWeeklyChannelDb(guildId: string, channelId: string | null): Promise<boolean> {
  const client = getPool();
  if (!client || !ready) return false;

  try {
    await client.query(
      `INSERT INTO guild_settings (guild_id, weekly_channel_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (guild_id)
       DO UPDATE SET weekly_channel_id = EXCLUDED.weekly_channel_id, updated_at = now()`,
      [guildId, channelId],
    );
    return true;
  } catch (error) {
    console.error('[db] บันทึกค่าห้องรายงานไม่สำเร็จ:', error);
    return false;
  }
}

/** เซิร์ฟเวอร์ที่มีห้องรายงานประจำสัปดาห์ตั้งไว้ (ใช้โดยตัวส่งอัตโนมัติ) */
export interface WeeklyTarget {
  guildId: string;
  channelId: string;
  /** เวลาที่ส่งรายงานล่าสุด (null = ยังไม่เคยส่ง) */
  lastSent: Date | null;
}

/** รายชื่อเซิร์ฟเวอร์ที่ต้องส่งรายงานประจำสัปดาห์ */
export async function getWeeklyTargets(): Promise<WeeklyTarget[]> {
  const client = getPool();
  if (!client || !ready) return [];

  try {
    const result = await client.query<{
      guild_id: string;
      weekly_channel_id: string;
      last_weekly_sent_at: Date | null;
    }>(
      `SELECT guild_id, weekly_channel_id, last_weekly_sent_at
         FROM guild_settings
        WHERE weekly_channel_id IS NOT NULL`,
    );
    return result.rows.map((row) => ({
      guildId: row.guild_id,
      channelId: row.weekly_channel_id,
      lastSent: row.last_weekly_sent_at,
    }));
  } catch (error) {
    console.error('[db] ดึงรายชื่อเซิร์ฟเวอร์สำหรับรายงานไม่สำเร็จ:', error);
    return [];
  }
}

/** บันทึกเวลาที่ส่งรายงานประจำสัปดาห์ล่าสุด (กันส่งซ้ำ) */
export async function markWeeklySent(guildId: string): Promise<void> {
  const client = getPool();
  if (!client || !ready) return;

  try {
    await client.query(
      'UPDATE guild_settings SET last_weekly_sent_at = now() WHERE guild_id = $1',
      [guildId],
    );
  } catch (error) {
    console.error('[db] บันทึกเวลาส่งรายงานไม่สำเร็จ:', error);
  }
}

// ─────────────────────────────────────────────────────────────
// รายชื่อเซิร์ฟเวอร์ที่บอทอยู่ (ตาราง bot_guilds)
// — ให้เว็บรู้ว่าบอทอยู่ดิสไหนได้โดยไม่ต้องใช้ bot token เลย
// ─────────────────────────────────────────────────────────────

/** ซิงก์รายชื่อเซิร์ฟเวอร์ที่บอทอยู่ลง DB (แทนที่ทั้งชุด — เรียกตอนออนไลน์ + ตอนเข้า/ออกดิส) */
export async function syncBotGuilds(guildIds: string[]): Promise<void> {
  const client = getPool();
  if (!client || !ready) return;

  try {
    if (guildIds.length === 0) {
      await client.query('DELETE FROM bot_guilds');
      return;
    }
    await client.query('DELETE FROM bot_guilds WHERE guild_id <> ALL($1::text[])', [guildIds]);
    await client.query(
      `INSERT INTO bot_guilds (guild_id, updated_at)
       SELECT unnest($1::text[]), now()
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = now()`,
      [guildIds],
    );
  } catch (error) {
    console.error('[db] ซิงก์รายชื่อเซิร์ฟเวอร์ของบอทไม่สำเร็จ:', error);
  }
}

// ─────────────────────────────────────────────────────────────
// Snapshot ห้องเสียงปัจจุบัน (ตาราง voice_snapshot)
// — บอทซิงก์ "รายชื่อห้องเสียง + คนที่อยู่ในแต่ละห้อง" ให้เว็บแสดงแบบสด
// ─────────────────────────────────────────────────────────────

/** บันทึก snapshot ห้องเสียงของเซิร์ฟเวอร์ (JSONB — แทนที่ทั้งก้อน) */
export async function setVoiceSnapshotDb(guildId: string, data: unknown): Promise<boolean> {
  const client = getPool();
  if (!client || !ready) return false;

  try {
    await client.query(
      `INSERT INTO voice_snapshot (guild_id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (guild_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [guildId, JSON.stringify(data)],
    );
    return true;
  } catch (error) {
    console.error('[db] บันทึก snapshot ห้องเสียงไม่สำเร็จ:', error);
    return false;
  }
}

/** ลบ snapshot ของเซิร์ฟเวอร์ (ตอนบอทถูกนำออกจากดิส) */
export async function deleteVoiceSnapshotDb(guildId: string): Promise<void> {
  const client = getPool();
  if (!client || !ready) return;

  try {
    await client.query('DELETE FROM voice_snapshot WHERE guild_id = $1', [guildId]);
  } catch (error) {
    console.error('[db] ลบ snapshot ห้องเสียงไม่สำเร็จ:', error);
  }
}
