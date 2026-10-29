/**
 * src/utils/premium.ts
 * ระบบ Premium ของ Rem — 29 บาท/เดือน ต่อเซิร์ฟเวอร์
 *
 * หน้าที่:
 *  - อ่าน/เขียนสถานะ Premium จากตาราง guild_subscriptions (ผ่าน utils/db)
 *  - แคชผลไว้ 60 วินาที กันยิงฐานข้อมูลทุกครั้งที่มีคนพิมพ์ /top
 *  - รวมนิยาม "อะไรฟรี / อะไร Premium" ไว้ที่เดียว ให้บอทกับเว็บตรงกัน
 *
 * การชำระเงิน: ยังไม่ผูกผู้ให้บริการ (เว้นไว้ตามที่ตกลง)
 *  - วันนี้เปิดใช้ด้วย /premium grant ของเจ้าของบอท
 *  - เมื่อต่อ PromptPay/Stripe ทีหลัง แค่เรียก grantPremium() จาก route/webhook ใหม่
 *    แล้วระบบที่เหลือ (การเช็คสิทธิ์ทั้งบอทและเว็บ) ทำงานต่อได้ทันที
 */
import {
  countActiveSubscriptions,
  getSubscriptionDb,
  grantSubscriptionDb,
  isDbReady,
  revokeSubscriptionDb,
  type GuildSubscription,
} from './db';
import { getOwnerIds } from './env';

/** ราคาแพ็กเกจ Premium (บาท/เดือน ต่อเซิร์ฟเวอร์) */
export const PREMIUM_PRICE_THB = 29;
/** จำนวนวันต่อ 1 รอบบิล (ใช้ทั้งตอนเปิดใช้และต่ออายุ) */
export const PREMIUM_PERIOD_DAYS = 30;
/** เซิร์ฟเวอร์ฟรีดูประวัติย้อนหลังได้กี่วัน */
export const FREE_HISTORY_DAYS = 30;
/** หน้าเว็บอธิบายแพ็กเกจ Premium */
export const PREMIUM_SITE_URL = 'https://rem-bot.vercel.app/premium';

/** ตารางเปรียบเทียบฟีเจอร์ (ใช้ใน /premium features และ README) */
export interface PremiumFeatureRow {
  name: string;
  free: string;
  premium: string;
}

export const PREMIUM_FEATURES: PremiumFeatureRow[] = [
  { name: 'บันทึกเข้า–ออก–ย้ายห้องเสียง', free: 'ไม่จำกัด', premium: 'ไม่จำกัด' },
  { name: '/setup • /help • /shake', free: '✓', premium: '✓' },
  { name: '/top 7 วัน / 30 วัน', free: '✓', premium: '✓' },
  { name: '/top ทั้งหมด (ตลอดกาล)', free: '—', premium: '✓' },
  { name: '/profile การ์ดสมาชิก', free: '✓', premium: '✓' },
  { name: 'รายงานประจำสัปดาห์', free: 'ส่งทดสอบเองได้', premium: 'ส่งอัตโนมัติทุกจันทร์ 09:00' },
  { name: `ประวัติในแดชบอร์ด`, free: `${FREE_HISTORY_DAYS} วันล่าสุด`, premium: 'ทั้งหมด' },
  { name: 'ส่งออก CSV', free: '—', premium: '✓' },
  { name: 'Role rewards (ยศตามชั่วโมงสะสม)', free: '1 เกณฑ์', premium: 'ไม่จำกัดเกณฑ์' },
];

/** สถานะ Premium ของเซิร์ฟเวอร์ 1 แห่ง (ใช้ทั้งในคำสั่ง Discord และหน้าเว็บถ้าต้องการ) */
export interface PremiumState {
  /** ใช้งาน Premium อยู่จริงหรือไม่ (status active + ยังไม่หมดอายุ) */
  premium: boolean;
  /** แถวในฐานข้อมูล (null = ยังไม่เคยสมัคร) */
  subscription: GuildSubscription | null;
  /** วันที่หมดอายุรอบปัจจุบัน (null = ไม่มี) */
  currentPeriodEnd: Date | null;
  /** เหลืออีกกี่วัน (null = ไม่มีวันหมดอายุ / ยังไม่สมัคร) */
  daysLeft: number | null;
  /** ราคาต่อเดือนที่ใช้อยู่ */
  priceThb: number;
  /** ฐานข้อมูลพร้อมใช้งานหรือไม่ — ถ้าไม่พร้อม ระบบ Premium ทั้งหมดจะปิด (ถือเป็นฟรี) */
  dbReady: boolean;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { state: PremiumState; expiresAt: number }>();

/** ตรวจว่าแถว subscription ยังใช้งานได้อยู่ไหม */
export function isSubscriptionActive(subscription: GuildSubscription | null, now = Date.now()): boolean {
  if (!subscription) return false;
  if (subscription.status !== 'active') return false;
  if (!subscription.currentPeriodEnd) return true; // ไม่มีวันหมดอายุ = ใช้ได้ตลอด
  return new Date(subscription.currentPeriodEnd).getTime() > now;
}

/** จำนวนวันที่เหลือ (ปัดขึ้น — เหลือ 12 ชั่วโมง = 1 วัน) */
function daysUntil(date: Date | null, now = Date.now()): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function buildState(subscription: GuildSubscription | null, dbReady: boolean): PremiumState {
  const premium = dbReady && isSubscriptionActive(subscription);
  return {
    premium,
    subscription,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    daysLeft: daysUntil(subscription?.currentPeriodEnd ?? null),
    priceThb: subscription?.priceThb ?? PREMIUM_PRICE_THB,
    dbReady,
  };
}

/**
 * อ่านสถานะ Premium ของเซิร์ฟเวอร์ (มีแคช 60 วินาที)
 * ถ้าฐานข้อมูลไม่พร้อม → ถือเป็นฟรี (ไม่ throw — คำสั่งอื่นยังทำงานได้)
 */
export async function getPremiumState(guildId: string, options?: { skipCache?: boolean }): Promise<PremiumState> {
  const dbReady = isDbReady();
  if (!dbReady) return buildState(null, false);

  const now = Date.now();
  if (!options?.skipCache) {
    const cached = cache.get(guildId);
    if (cached && cached.expiresAt > now) return cached.state;
  }

  const subscription = await getSubscriptionDb(guildId);
  const state = buildState(subscription, true);
  cache.set(guildId, { state, expiresAt: now + CACHE_TTL_MS });
  return state;
}

/** เซิร์ฟเวอร์นี้เป็น Premium อยู่หรือไม่ */
export async function isPremium(guildId: string): Promise<boolean> {
  return (await getPremiumState(guildId)).premium;
}

/** ล้างแคช (เรียกหลังเปิดใช้/ยกเลิก เพื่อให้มีผลทันที) */
export function invalidatePremiumCache(guildId?: string): void {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}

/** เปิดใช้หรือต่ออายุ Premium — คืนสถานะล่าสุด (null = บันทึกไม่สำเร็จ) */
export async function grantPremium(options: {
  guildId: string;
  days?: number;
  grantedBy?: string | null;
  note?: string | null;
  priceThb?: number;
}): Promise<GuildSubscription | null> {
  const subscription = await grantSubscriptionDb({
    guildId: options.guildId,
    days: options.days ?? PREMIUM_PERIOD_DAYS,
    priceThb: options.priceThb ?? PREMIUM_PRICE_THB,
    grantedBy: options.grantedBy ?? null,
    note: options.note ?? null,
  });

  if (subscription) invalidatePremiumCache(options.guildId);
  return subscription;
}

/** ยกเลิก Premium ทันที */
export async function revokePremium(guildId: string): Promise<boolean> {
  const ok = await revokeSubscriptionDb(guildId);
  if (ok) invalidatePremiumCache(guildId);
  return ok;
}

/** ผู้ใช้คนนี้เป็นเจ้าของบอทหรือไม่ — OWNER_ID ใน .env หรือเจ้าของแอป Discord (ที่ลงทะเบียนตอนบูต) */
const runtimeOwners = new Set<string>();

/** ลงทะเบียนเจ้าของที่รู้จาก Discord (application owner / สมาชิกทีม) — เรียกตอน ClientReady */
export function registerBotOwners(userIds: Array<string | null | undefined>): void {
  for (const id of userIds) {
    if (id && /^\d{17,20}$/.test(id)) runtimeOwners.add(id);
  }
}

export function isBotOwner(userId: string): boolean {
  return getOwnerIds().includes(userId) || runtimeOwners.has(userId);
}

/** จำนวนเจ้าของที่ระบบรู้จัก (OWNER_ID + จาก Discord) — ใช้ log ตอนบูต */
export function botOwnerCount(): number {
  return new Set([...getOwnerIds(), ...runtimeOwners]).size;
}

/** จำนวนเซิร์ฟเวอร์ที่เป็น Premium อยู่ (ใช้สรุปตอนบูต/log) */
export { countActiveSubscriptions };

/** วันที่แบบไทยสั้น เช่น "12 พ.ย. 2569" (เขตเวลาไทย) */
const TH_DATE_FULL = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

/** แปลงวันที่หมดอายุเป็นข้อความไทย (คืน "—" ถ้าไม่มี) */
export function formatPremiumDate(date: Date | null): string {
  if (!date) return '—';
  return TH_DATE_FULL.format(new Date(date));
}
