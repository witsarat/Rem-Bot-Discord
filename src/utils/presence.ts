/**
 * src/utils/presence.ts
 * ระบบ Rich Presence ของบอท — แนวเดียวกับส่วนขยาย Discord ของ VS Code
 *  (ข้อความหลัก + รายละเอียด 2 บรรทัด + เวลาทำงานเดิน + รูปใหญ่/รูเล็ก + ปุ่มลิงก์)
 * อ่านค่าจากตาราง bot_settings (ตั้งผ่านหน้าเว็บ เฉพาะเจ้าของบอท)
 * ใช้ค่าล่าสุดทันทีตอนบอทออนไลน์ + เช็คค่าใหม่จาก DB ทุก 30 วินาที
 */
import { ActivityType, type ActivitiesOptions, type Client, type PresenceStatusData } from 'discord.js';
import { getBotPresenceDb, type BotPresenceSettings } from './db';

/** ค่าเริ่มต้น — ใช้เมื่อยังไม่มีค่าใน DB หรืออ่านไม่สำเร็จ */
export const DEFAULT_PRESENCE: BotPresenceSettings = {
  activityType: 'Watching',
  activityText: 'บันทึก Voice Log 🔊',
  status: 'online',
  details: '',
  state: '',
  showElapsed: false,
  largeImage: '',
  largeText: '',
  smallImage: '',
  smallText: '',
  button1Label: '',
  button1Url: '',
  button2Label: '',
  button2Url: '',
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

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** ลิงก์ต้องขึ้นต้นด้วย https:// เท่านั้น (ข้อกำหนดของ Discord) */
function cleanUrl(value: unknown): string {
  const url = cleanText(value, 512);
  return /^https:\/\/\S+$/i.test(url) ? url : '';
}

/** ปุ่มต้องมีทั้งป้ายและลิงก์ ไม่งั้นตัดทิ้ง */
function cleanButton(label: unknown, url: unknown): { label: string; url: string } {
  const cleanLabel = cleanText(label, 32);
  const cleanLink = cleanUrl(url);
  return cleanLabel && cleanLink ? { label: cleanLabel, url: cleanLink } : { label: '', url: '' };
}

/** ตรวจ + ปรับค่าที่ได้จาก DB ให้ปลอดภัย (ค่าผิดรูปแบบ → ใช้ค่าเริ่มต้น/ตัดทิ้ง) */
export function normalizePresence(raw: Partial<BotPresenceSettings> | null | undefined): BotPresenceSettings {
  const activityType =
    raw?.activityType && isActivityTypeName(raw.activityType)
      ? raw.activityType
      : DEFAULT_PRESENCE.activityType;
  const status = raw?.status && isStatusName(raw.status) ? raw.status : DEFAULT_PRESENCE.status;
  const activityText = cleanText(raw?.activityText, 128) || DEFAULT_PRESENCE.activityText;
  const button1 = cleanButton(raw?.button1Label, raw?.button1Url);
  const button2 = cleanButton(raw?.button2Label, raw?.button2Url);
  return {
    activityType,
    activityText,
    status,
    details: cleanText(raw?.details, 128),
    state: cleanText(raw?.state, 128),
    showElapsed: Boolean(raw?.showElapsed),
    largeImage: cleanUrl(raw?.largeImage),
    largeText: cleanText(raw?.largeText, 128),
    smallImage: cleanUrl(raw?.smallImage),
    smallText: cleanText(raw?.smallText, 128),
    button1Label: button1.label,
    button1Url: button1.url,
    button2Label: button2.label,
    button2Url: button2.url,
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

  const buttons = [
    { label: settings.button1Label, url: settings.button1Url },
    { label: settings.button2Label, url: settings.button2Url },
  ].filter((button) => button.label && button.url);

  const assets =
    settings.largeImage || settings.smallImage
      ? {
          largeImage: settings.largeImage || undefined,
          largeText: settings.largeText || undefined,
          smallImage: settings.smallImage || undefined,
          smallText: settings.smallText || undefined,
        }
      : undefined;

  // เวลาทำงาน — นับจากเวลาที่บอทออนไลน์ (แบบเดียวกับ elapsed ของส่วนขยาย VS Code)
  const timestamps = settings.showElapsed
    ? { start: new Date(client.readyTimestamp ?? Date.now()) }
    : undefined;

  // หมายเหตุ: discord.js จำกัด type ของกิจกรรม "บัญชีบอท" ไว้แค่ name/type/state/url
  // แต่เราส่งฟิลด์เพิ่มเติม (details/เวลา/รูป/ปุ่ม) ไปด้วยเลย —
  // Discord จะแสดงหรือไม่แสดงขึ้นกับฝั่ง Discord เอง (ไม่กระทบการทำงานหลัก)
  const activity = {
    name: settings.activityText,
    type,
    details: settings.details || undefined,
    state: settings.state || undefined,
    timestamps,
    assets,
    buttons: buttons.length > 0 ? buttons : undefined,
  } as unknown as ActivitiesOptions;

  client.user.setPresence({
    status: settings.status as PresenceStatusData,
    activities: [activity],
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
      `✨ อัปเดตสถานะบอท: ${settings.activityType} "${settings.activityText}" (${settings.status})` +
        (settings.details ? ` — ${settings.details}` : ''),
    );
  };
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
}
