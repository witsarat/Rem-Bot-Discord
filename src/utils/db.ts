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
      CREATE TABLE IF NOT EXISTS bot_settings (
        id INTEGER PRIMARY KEY,
        activity_type TEXT NOT NULL,
        activity_text TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT,
        state TEXT,
        show_elapsed BOOLEAN NOT NULL DEFAULT false,
        large_image TEXT,
        large_text TEXT,
        small_image TEXT,
        small_text TEXT,
        button1_label TEXT,
        button1_url TEXT,
        button2_label TEXT,
        button2_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // อัปเกรดตารางเดิมให้รองรับ Rich Presence เต็มรูปแบบ (รันซ้ำได้เสมอ)
    for (const column of [
      'details TEXT',
      'state TEXT',
      'show_elapsed BOOLEAN NOT NULL DEFAULT false',
      'large_image TEXT',
      'large_text TEXT',
      'small_image TEXT',
      'small_text TEXT',
      'button1_label TEXT',
      'button1_url TEXT',
      'button2_label TEXT',
      'button2_url TEXT',
    ]) {
      await client.query(`ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS ${column}`);
    }

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
// ค่า Rich Presence ของบอท (ตาราง bot_settings — ตั้งค่าผ่านหน้าเว็บ เฉพาะเจ้าของบอท)
// ─────────────────────────────────────────────────────────────

/** ค่าสถานะที่แสดงของบอท (Rich Presence เต็มรูปแบบ — สไตล์ส่วนขยาย Discord ของ VS Code) */
export interface BotPresenceSettings {
  activityType: string;
  activityText: string;
  status: string;
  /** บรรทัดย่อยที่ 1 (เช่น "Editing index.ts") */
  details: string;
  /** บรรทัดย่อยที่ 2 (เช่น "Workspace: my-project") */
  state: string;
  /** แสดงเวลาทำงาน — นับจากเวลาที่บอทออนไลน์ */
  showElapsed: boolean;
  largeImage: string;
  largeText: string;
  smallImage: string;
  smallText: string;
  button1Label: string;
  button1Url: string;
  button2Label: string;
  button2Url: string;
}

interface BotPresenceRow {
  activity_type: string;
  activity_text: string;
  status: string;
  details: string | null;
  state: string | null;
  show_elapsed: boolean | null;
  large_image: string | null;
  large_text: string | null;
  small_image: string | null;
  small_text: string | null;
  button1_label: string | null;
  button1_url: string | null;
  button2_label: string | null;
  button2_url: string | null;
}

/** อ่านค่า Rich Presence จาก DB — null = ยังไม่มีแถว (ใช้ค่าเริ่มต้นแทน) */
export async function getBotPresenceDb(): Promise<BotPresenceSettings | null> {
  const client = getPool();
  if (!client || !ready) return null;

  try {
    const result = await client.query<BotPresenceRow>(
      `SELECT activity_type, activity_text, status,
              details, state, show_elapsed,
              large_image, large_text, small_image, small_text,
              button1_label, button1_url, button2_label, button2_url
         FROM bot_settings
        ORDER BY id
        LIMIT 1`,
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      activityType: row.activity_type,
      activityText: row.activity_text,
      status: row.status,
      details: row.details ?? '',
      state: row.state ?? '',
      showElapsed: row.show_elapsed ?? false,
      largeImage: row.large_image ?? '',
      largeText: row.large_text ?? '',
      smallImage: row.small_image ?? '',
      smallText: row.small_text ?? '',
      button1Label: row.button1_label ?? '',
      button1Url: row.button1_url ?? '',
      button2Label: row.button2_label ?? '',
      button2Url: row.button2_url ?? '',
    };
  } catch (error) {
    console.error('[db] อ่านค่า Rich Presence ไม่สำเร็จ:', error);
    return null;
  }
}

/** บันทึกค่า Rich Presence ลง DB (แถวเดียว id=1 — ฝั่งเว็บเขียนตารางเดียวกัน) */
export async function setBotPresenceDb(settings: BotPresenceSettings): Promise<boolean> {
  const client = getPool();
  if (!client || !ready) return false;

  try {
    await client.query(
      `INSERT INTO bot_settings
         (id, activity_type, activity_text, status,
          details, state, show_elapsed,
          large_image, large_text, small_image, small_text,
          button1_label, button1_url, button2_label, button2_url, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT (id)
       DO UPDATE SET activity_type = EXCLUDED.activity_type,
                     activity_text = EXCLUDED.activity_text,
                     status = EXCLUDED.status,
                     details = EXCLUDED.details,
                     state = EXCLUDED.state,
                     show_elapsed = EXCLUDED.show_elapsed,
                     large_image = EXCLUDED.large_image,
                     large_text = EXCLUDED.large_text,
                     small_image = EXCLUDED.small_image,
                     small_text = EXCLUDED.small_text,
                     button1_label = EXCLUDED.button1_label,
                     button1_url = EXCLUDED.button1_url,
                     button2_label = EXCLUDED.button2_label,
                     button2_url = EXCLUDED.button2_url,
                     updated_at = now()`,
      [
        settings.activityType,
        settings.activityText,
        settings.status,
        settings.details || null,
        settings.state || null,
        settings.showElapsed,
        settings.largeImage || null,
        settings.largeText || null,
        settings.smallImage || null,
        settings.smallText || null,
        settings.button1Label || null,
        settings.button1Url || null,
        settings.button2Label || null,
        settings.button2Url || null,
      ],
    );
    return true;
  } catch (error) {
    console.error('[db] บันทึกค่า Rich Presence ไม่สำเร็จ:', error);
    return false;
  }
}
