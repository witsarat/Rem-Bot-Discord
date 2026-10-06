/**
 * src/utils/config.ts
 * จัดการไฟล์ config.json สำหรับเก็บค่า ID ห้อง logs ของแต่ละเซิร์ฟเวอร์ (แยกตาม Guild)
 *
 * รูปแบบไฟล์ config.json:
 * {
 *   "guilds": {
 *     "<guildId>": { "logChannelId": "<channelId>", "updatedAt": "2026-01-01T00:00:00.000Z" }
 *   }
 * }
 */
import fs from 'fs';
import path from 'path';

/** ตำแหน่งไฟล์ config.json (อยู่ที่โฟลเดอร์รากของโปรเจกต์) */
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

export interface GuildConfig {
  /** ID ของห้องข้อความที่ใช้บันทึก voice log */
  logChannelId: string;
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

/** เขียนไฟล์ config.json (จัดรูปแบบสวยงาม อ่านง่าย) */
function writeConfig(config: ConfigFile): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** ดู ID ห้อง logs ของเซิร์ฟเวอร์ (คืน undefined ถ้ายังไม่เคย setup) */
export function getLogChannelId(guildId: string): string | undefined {
  return readConfig().guilds[guildId]?.logChannelId;
}

/** บันทึก ID ห้อง logs ของเซิร์ฟเวอร์ลง config.json */
export function setLogChannelId(guildId: string, channelId: string): void {
  const config = readConfig();
  config.guilds[guildId] = {
    logChannelId: channelId,
    updatedAt: new Date().toISOString(),
  };
  writeConfig(config);
}
