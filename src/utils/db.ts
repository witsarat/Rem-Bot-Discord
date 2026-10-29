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
    // PGSSLMODE=disable → ปิด SSL (ใช้กับ PostgreSQL ในเครื่อง/เทสต์ ที่ไม่ได้เปิด SSL)
    // ค่าเริ่มต้น: เปิด SSL แบบไม่ตรวจใบรับรอง (Supabase/Neon/Render ต้องใช้)
    const sslDisabled = /^(disable|false|0)$/i.test((process.env.PGSSLMODE ?? '').trim());
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslDisabled ? undefined : { rejectUnauthorized: false },
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

    // ── ระบบ Premium (29 บาท/เดือน ต่อเซิร์ฟเวอร์) ─────────────────
    // 1 แถว = 1 เซิร์ฟเวอร์ที่เคยมีสถานะ Premium
    // status     : 'active' = ใช้งานอยู่ (เช็ควันหมดอายุจาก current_period_end), 'revoked' = ถูกยกเลิก
    // price_thb  : ราคาที่ตกลงไว้ตอนเปิดใช้ (เก็บไว้เป็นประวัติ — ขึ้นราคาใหม่ไม่กระทบของเก่า)
    // granted_by : Discord user id ของผู้ที่เปิดใช้ให้ (เจ้าของบอท หรือระบบชำระเงินในอนาคต)
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_subscriptions (
        guild_id TEXT PRIMARY KEY,
        plan TEXT NOT NULL DEFAULT 'premium',
        status TEXT NOT NULL DEFAULT 'active',
        price_thb INTEGER NOT NULL DEFAULT 29,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        current_period_end TIMESTAMPTZ,
        granted_by TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_guild_subscriptions_period_end ON guild_subscriptions (current_period_end)',
    );

    // ── เลย์เอาต์การ์ดที่แก้ไขได้จากแดชบอร์ด (Card Studio) ─────────
    // 1 แถว = 1 เซิร์ฟเวอร์ + 1 ชนิดการ์ด (profile / weekly)
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_layouts (
        guild_id TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT 'profile',
        layout JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, variant)
      )
    `);

    // ── พื้นหลังการ์ดที่อัปโหลดเอง (เช่น ออกแบบใน Canva) ─────────
    // 1 แถว = 1 เซิร์ฟเวอร์ + 1 ชนิดการ์ด • เก็บไฟล์ใน DB (BYTEA) ไม่ต้องใช้ storage เพิ่ม
    await client.query(`
      CREATE TABLE IF NOT EXISTS card_backgrounds (
        guild_id TEXT NOT NULL,
        variant TEXT NOT NULL DEFAULT 'profile',
        mime TEXT NOT NULL,
        filename TEXT,
        bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, variant)
      )
    `);

    // ── Role rewards (voice-only) ────────────────────────────────
    // guild_reward_config : เปิด/ปิดโมดูล + ห้องประกาศ + โหมดเก็บยศ
    // guild_role_rewards : เกณฑ์ให้ยศอัตโนมัติ (ฟรี 1 เกณฑ์ / Premium ไม่จำกัด)
    // member_role_awards : ประวัติว่าใครได้ยศอะไรแล้ว (กันให้ซ้ำ)
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_reward_config (
        guild_id TEXT PRIMARY KEY,
        announce_channel_id TEXT,
        rewards_enabled BOOLEAN NOT NULL DEFAULT false,
        retention TEXT NOT NULL DEFAULT 'all',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS guild_role_rewards (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'voice',
        threshold_seconds BIGINT NOT NULL,
        role_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (guild_id, kind, threshold_seconds, role_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_role_awards (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        threshold_seconds BIGINT NOT NULL,
        awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, user_id, role_id)
      )
    `);

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
  /** เซิร์ฟเวอร์นี้เป็น Premium อยู่หรือไม่ (รายงานอัตโนมัติส่งเฉพาะ Premium) */
  premium: boolean;
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
      premium: boolean;
    }>(
      `SELECT g.guild_id,
              g.weekly_channel_id,
              g.last_weekly_sent_at,
              COALESCE(s.status = 'active' AND s.current_period_end > now(), false) AS premium
         FROM guild_settings g
         LEFT JOIN guild_subscriptions s ON s.guild_id = g.guild_id
        WHERE g.weekly_channel_id IS NOT NULL`,
    );
    return result.rows.map((row) => ({
      guildId: row.guild_id,
      channelId: row.weekly_channel_id,
      lastSent: row.last_weekly_sent_at,
      premium: row.premium,
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

// ─────────────────────────────────────────────────────────────
// ระบบ Premium (ตาราง guild_subscriptions) — 29 บาท/เดือน ต่อเซิร์ฟเวอร์
// ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'revoked';

/** แถวข้อมูลการสมัคร Premium ของ 1 เซิร์ฟเวอร์ */
export interface GuildSubscription {
  guildId: string;
  plan: string;
  status: SubscriptionStatus;
  /** ราคาที่ตกลงไว้ (บาท/เดือน) — เก็บเป็นประวัติ */
  priceThb: number;
  startedAt: Date;
  /** วันหมดอายุของรอบปัจจุบัน (null = ไม่มีวันหมดอายุ) */
  currentPeriodEnd: Date | null;
  grantedBy: string | null;
  note: string | null;
  updatedAt: Date;
}

interface SubscriptionRow {
  guild_id: string;
  plan: string;
  status: SubscriptionStatus;
  price_thb: number;
  started_at: Date;
  current_period_end: Date | null;
  granted_by: string | null;
  note: string | null;
  updated_at: Date;
}

function mapSubscription(row: SubscriptionRow): GuildSubscription {
  return {
    guildId: row.guild_id,
    plan: row.plan,
    status: row.status,
    priceThb: row.price_thb,
    startedAt: row.started_at,
    currentPeriodEnd: row.current_period_end,
    grantedBy: row.granted_by,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

/** อ่านข้อมูลการสมัครของเซิร์ฟเวอร์ (null = ยังไม่เคยสมัคร) */
export async function getSubscriptionDb(guildId: string): Promise<GuildSubscription | null> {
  const client = getPool();
  if (!client || !ready) return null;

  try {
    const result = await client.query<SubscriptionRow>(
      `SELECT guild_id, plan, status, price_thb, started_at, current_period_end,
              granted_by, note, updated_at
         FROM guild_subscriptions
        WHERE guild_id = $1`,
      [guildId],
    );
    return result.rows.length ? mapSubscription(result.rows[0]) : null;
  } catch (error) {
    console.error('[db] อ่านสถานะ Premium ไม่สำเร็จ:', error);
    return null;
  }
}

/**
 * เปิดใช้/ต่ออายุ Premium ของเซิร์ฟเวอร์
 * - ต่ออายุจากวันหมดอายุเดิมถ้ายังไม่หมด (ไม่เสียวันที่เหลือ) — ไม่งั้นเริ่มนับจากตอนนี้
 * - คืนแถวข้อมูลล่าสุด (null = บันทึกไม่สำเร็จ/DB ไม่พร้อม)
 */
export async function grantSubscriptionDb(options: {
  guildId: string;
  days: number;
  priceThb: number;
  grantedBy?: string | null;
  note?: string | null;
}): Promise<GuildSubscription | null> {
  const client = getPool();
  if (!client || !ready) return null;

  const days = Math.max(1, Math.trunc(options.days));

  try {
    const result = await client.query<SubscriptionRow>(
      `INSERT INTO guild_subscriptions
         (guild_id, plan, status, price_thb, started_at, current_period_end, granted_by, note, updated_at)
       VALUES ($1, 'premium', 'active', $2, now(), now() + make_interval(days => $3::int), $4, $5, now())
       ON CONFLICT (guild_id)
       DO UPDATE SET
         status = 'active',
         price_thb = EXCLUDED.price_thb,
         current_period_end =
           GREATEST(COALESCE(guild_subscriptions.current_period_end, now()), now())
           + make_interval(days => $3::int),
         granted_by = EXCLUDED.granted_by,
         note = EXCLUDED.note,
         updated_at = now()
       RETURNING guild_id, plan, status, price_thb, started_at, current_period_end,
                 granted_by, note, updated_at`,
      [options.guildId, options.priceThb, days, options.grantedBy ?? null, options.note ?? null],
    );
    return result.rows.length ? mapSubscription(result.rows[0]) : null;
  } catch (error) {
    console.error('[db] เปิดใช้/ต่ออายุ Premium ไม่สำเร็จ:', error);
    return null;
  }
}

/** ยกเลิก Premium ทันที (เก็บประวัติไว้ — ตั้ง status = 'revoked') */
export async function revokeSubscriptionDb(guildId: string): Promise<boolean> {
  const client = getPool();
  if (!client || !ready) return false;

  try {
    const result = await client.query(
      `UPDATE guild_subscriptions
          SET status = 'revoked',
              current_period_end = LEAST(COALESCE(current_period_end, now()), now()),
              updated_at = now()
        WHERE guild_id = $1`,
      [guildId],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('[db] ยกเลิก Premium ไม่สำเร็จ:', error);
    return false;
  }
}

/** เซิร์ฟเวอร์ที่ Premium ยังไม่หมดอายุ (ใช้สรุปจำนวนในหน้าแอดมิน/log) */
export async function countActiveSubscriptions(): Promise<number> {
  const client = getPool();
  if (!client || !ready) return 0;

  try {
    const result = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM guild_subscriptions
        WHERE status = 'active' AND current_period_end > now()`,
    );
    return result.rows[0]?.total ?? 0;
  } catch (error) {
    console.error('[db] นับจำนวน Premium ไม่สำเร็จ:', error);
    return 0;
  }
}
