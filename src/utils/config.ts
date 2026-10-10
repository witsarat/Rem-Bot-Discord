/**
 * src/utils/config.ts
 * เก็บค่า ID ห้อง logs ของแต่ละเซิร์ฟเวอร์ (แยกตาม Guild)
 * - โหมดหลัก: ฐานข้อมูลออนไลน์ (ถ้าตั้งค่า DATABASE_URL) — ข้อมูลอยู่ถาวร
 * - โหมดสำรอง: ไฟล์ config.json แบบเดิม (ใช้เมื่อยังไม่ตั้ง DB หรือ DB ล่ม)
 *
 * รูปแบบไฟล์ config.json (โหมดสำรอง):
 * {
 *   "guilds": {
 *     "<guildId>": { "logChannelId": "<channelId>", "updatedAt": "2026-01-01T00:00:00.000Z" }
 *   }
 * }
 */
import fs from 'fs';
import path from 'path';
import { getPool, getWeeklyChannelDb, isDbReady, setWeeklyChannelDb } from './db';

/** ตำแหน่งไฟล์ config.json (โหมดสำรอง — อยู่ที่โฟลเดอร์รากของโปรเจกต์) */
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

export interface GuildConfig {
  /** ID ของห้องข้อความที่ใช้บันทึก voice log */
  logChannelId?: string;
  /** ID ของห้องที่รับรายงานประจำสัปดาห์ */
  weeklyChannelId?: string;
  /** เวลาที่ตั้งค่าล่าสุด (ISO string) */
  updatedAt?: string;
}

interface ConfigFile {
  guilds: Record<string, GuildConfig>;
}

/** อ่านไฟล์ config.json (ถ้าไม่มี หรืออ่านไม่ได้ จะคืนค่าเริ่มต้นว่างๆ) */
function readConfig(): ConfigFile {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { guilds: {} };
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ConfigFile>;
    return { guilds: parsed.guilds ?? {} };
  } catch (error) {
    console.error('[config] อ่านไฟล์ config.json ไม่สำเร็จ ใช้ค่าเริ่มต้นแทน:', error);
    return { guilds: {} };
  }
}

/** เขียนไฟล์ config.json (โหมดสำรอง) */
function writeConfig(config: ConfigFile): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** ดู ID ห้อง logs ของเซิร์ฟเวอร์ (อ่านจาก DB ก่อน → ไม่มีค่อยอ่านไฟล์) */
export async function getLogChannelId(guildId: string): Promise<string | undefined> {
  const pool = getPool();
  if (pool && isDbReady()) {
    try {
      const result = await pool.query<{ log_channel_id: string }>(
        'SELECT log_channel_id FROM guild_settings WHERE guild_id = $1',
        [guildId],
      );
      return result.rows[0]?.log_channel_id;
    } catch (error) {
      console.error('[config] อ่านจาก DB ไม่สำเร็จ จะอ่านจากไฟล์แทน:', error);
    }
  }
  return readConfig().guilds[guildId]?.logChannelId;
}

/** บันทึก ID ห้อง logs ของเซิร์ฟเวอร์ (ลง DB ถ้าเปิดใช้ → ไม่งั้นลงไฟล์) */
export async function setLogChannelId(guildId: string, channelId: string): Promise<void> {
  const pool = getPool();
  if (pool && isDbReady()) {
    try {
      await pool.query(
        `INSERT INTO guild_settings (guild_id, log_channel_id, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (guild_id)
         DO UPDATE SET log_channel_id = EXCLUDED.log_channel_id, updated_at = now()`,
        [guildId, channelId],
      );
      return;
    } catch (error) {
      console.error('[config] บันทึกขึ้น DB ไม่สำเร็จ จะบันทึกลงไฟล์แทน:', error);
    }
  }

  const config = readConfig();
  config.guilds[guildId] = {
    ...config.guilds[guildId],
    logChannelId: channelId,
    updatedAt: new Date().toISOString(),
  };
  writeConfig(config);
}

/** ดู ID ห้องรายงานประจำสัปดาห์ (อ่านจาก DB ก่อน → ไม่มีค่อยอ่านไฟล์) */
export async function getWeeklyChannelId(guildId: string): Promise<string | undefined> {
  const pool = getPool();
  if (pool && isDbReady()) {
    const fromDb = await getWeeklyChannelDb(guildId);
    // มีแถวใน DB แล้ว → ใช้ค่าจาก DB (null = ปิดไว้); ไม่มีแถว → ลองอ่านไฟล์
    if (fromDb !== undefined) return fromDb ?? undefined;
  }
  return readConfig().guilds[guildId]?.weeklyChannelId;
}

/** บันทึก ID ห้องรายงานประจำสัปดาห์ (null = ปิด) — ลง DB ถ้าเปิดใช้ → ไม่งั้นลงไฟล์ */
export async function setWeeklyChannelId(guildId: string, channelId: string | null): Promise<void> {
  const pool = getPool();
  if (pool && isDbReady()) {
    const saved = await setWeeklyChannelDb(guildId, channelId);
    if (saved) return;
  }

  const config = readConfig();
  const entry = config.guilds[guildId] ?? {};
  if (channelId) {
    entry.weeklyChannelId = channelId;
  } else {
    delete entry.weeklyChannelId;
  }
  entry.updatedAt = new Date().toISOString();
  config.guilds[guildId] = entry;
  writeConfig(config);
}
