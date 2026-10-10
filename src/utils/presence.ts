/**
 * src/utils/presence.ts
 * ระบบ Rich Presence ของบอท — อ่านค่าจากตาราง bot_settings (ตั้งผ่านหน้าเว็บ เฉพาะเจ้าของบอท)
 * ทำงานโดย: ใช้ค่าล่าสุดทันทีตอนบอทออนไลน์ + เช็คค่าใหม่จาก DB ทุก 30 วินาที
 */
import { ActivityType, type Client, type PresenceStatusData } from 'discord.js';
import { getBotPresenceDb, type BotPresenceSettings } from './db';

/** ค่าเริ่มต้น — ใช้เมื่อยังไม่มีค่าใน DB หรืออ่านไม่สำเร็จ */
export const DEFAULT_PRESENCE: BotPresenceSettings = {
  activityType: 'Watching',
  activityText: 'บันทึก Voice Log 🔊',
  status: 'online',
};

export const ACTIVITY_TYPE_NAMES = ['Playing', 'Watching', 'Listening', 'Competing'] as const;
export const STATUS_NAMES = ['online', 'idle', 'dnd', 'invisible'] as const;

export type ActivityTypeName = (typeof ACTIVITY_TYPE_NAMES)[number];
export type StatusName = (typeof STATUS_NAMES)[number];

const ACTIVITY_TYPE_MAP: Record<ActivityTypeName, ActivityType> = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

/** ตรวจว่าชื่อชนิดกิจกรรมอยู่ในรายการที่รองรับหรือไม่ */
export function isActivityTypeName(value: string): value is ActivityTypeName {
  return (ACTIVITY_TYPE_NAMES as readonly string[]).includes(value);
}

/** ตรวจว่าชื่อสถานะอยู่ในรายการที่รองรับหรือไม่ */
export function isStatusName(value: string): value is StatusName {
  return (STATUS_NAMES as readonly string[]).includes(value);
}

/** ตรวจ + ปรับค่าที่ได้จาก DB ให้ปลอดภัย (ค่าผิดรูปแบบ → ใช้ค่าเริ่มต้นของฟิลด์นั้น) */
export function normalizePresence(raw: Partial<BotPresenceSettings> | null | undefined): BotPresenceSettings {
  const activityType =
    raw?.activityType && isActivityTypeName(raw.activityType)
      ? raw.activityType
      : DEFAULT_PRESENCE.activityType;
  const status = raw?.status && isStatusName(raw.status) ? raw.status : DEFAULT_PRESENCE.status;
  const text = (raw?.activityText ?? '').trim().slice(0, 128);
  return {
    activityType,
    activityText: text.length > 0 ? text : DEFAULT_PRESENCE.activityText,
    status,
  };
}

/** อ่านค่าล่าสุดจาก DB (ไม่มีแถว → ค่าเริ่มต้น) */
export async function loadPresence(): Promise<BotPresenceSettings> {
  try {
    return normalizePresence(await getBotPresenceDb());
  } catch {
    return { ...DEFAULT_PRESENCE };
  }
}

/** นำค่าไปตั้งเป็นสถานะ (Rich Presence) ของบอท */
export function applyPresence(client: Client, settings: BotPresenceSettings): void {
  if (!client.user) return;
  const type = isActivityTypeName(settings.activityType)
    ? ACTIVITY_TYPE_MAP[settings.activityType]
    : ActivityType.Watching;
  client.user.setPresence({
    status: settings.status as PresenceStatusData,
    activities: [{ name: settings.activityText, type }],
  });
}

/** เช็คค่าจาก DB ทุก 30 วินาที — ตั้งค่าที่หน้าเว็บมีผลกับบอททุกเซิร์ฟเวอร์ */
const POLL_INTERVAL_MS = 30_000;

/** เริ่มระบบซิงก์สถานะ (เรียกครั้งเดียวหลังบอทออนไลน์) */
export function startPresenceSync(client: Client): void {
  let lastKey = '';
  const tick = async (): Promise<void> => {
    const settings = await loadPresence();
    const key = JSON.stringify(settings);
    if (key === lastKey) return;
    lastKey = key;
    applyPresence(client, settings);
    console.log(
      `✨ อัปเดตสถานะบอท: ${settings.activityType} "${settings.activityText}" (${settings.status})`,
    );
  };
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}
