/**
 * src/utils/cardLayout.ts
 * เลย์เอาต์การ์ดที่แก้ไขได้จากแดชบอร์ด (Card Studio)
 * - เก็บในตาราง card_layouts (variant = 'profile' | 'weekly')
 * - ค่าทุกอย่างเป็น px บนผืนการ์ด (origin = มุมซ้ายบน)
 * - normalizeLayout() กันค่าขยะจาก DB/URL: clamp ช่วง, ตรวจ hex, เติมค่าที่หาย
 */
import { getPool, isDbReady } from './db';

export type CardVariant = 'profile' | 'weekly';

export interface CardLayout {
  version: 1;
  width: number;
  height: number;
  radius: number;
  colors: {
    bgFrom: string;
    bgTo: string;
    accent: string;
    accentSoft: string;
    text: string;
    muted: string;
  };
  avatar: { x: number; y: number; size: number };
  header: { x: number; y: number; titleSize: number; subtitleSize: number };
  name: { x: number; y: number; size: number };
  stats: { x: number; y: number; width: number; height: number; gap: number };
  band: { x: number; y: number; width: number; height: number; enabled: boolean };
  logo: { enabled: boolean; x: number; y: number; size: number };
}

/** ค่าเริ่มต้น = ดีไซน์ปัจจุบัน (โทนส้ม 1000×560) */
export const DEFAULT_LAYOUT: CardLayout = {
  version: 1,
  width: 1000,
  height: 560,
  radius: 32,
  colors: {
    bgFrom: '#1b1310',
    bgTo: '#2b1a12',
    accent: '#ff8c42',
    accentSoft: '#ffb37a',
    text: '#fff4ec',
    muted: '#d0b3a3',
  },
  avatar: { x: 128, y: 132, size: 148 },
  header: { x: 64, y: 44, titleSize: 13, subtitleSize: 13 },
  name: { x: 232, y: 118, size: 42 },
  stats: { x: 64, y: 248, width: 280, height: 160, gap: 16 },
  band: { x: 64, y: 428, width: 872, height: 76, enabled: true },
  logo: { enabled: true, x: 936, y: 44, size: 30 },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** แปลงข้อมูลดิบ (JSON จาก DB / base64 ใน URL) เป็นเลย์เอาต์ที่ปลอดภัยต่อการเรนเดอร์ */
export function normalizeLayout(raw: unknown): CardLayout {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LAYOUT;

  const width = num(input.width, d.width, 600, 1600);
  const height = num(input.height, d.height, 320, 900);
  const colorsIn = (input.colors ?? {}) as Record<string, unknown>;
  const avatarIn = (input.avatar ?? {}) as Record<string, unknown>;
  const headerIn = (input.header ?? {}) as Record<string, unknown>;
  const nameIn = (input.name ?? {}) as Record<string, unknown>;
  const statsIn = (input.stats ?? {}) as Record<string, unknown>;
  const bandIn = (input.band ?? {}) as Record<string, unknown>;
  const logoIn = (input.logo ?? {}) as Record<string, unknown>;

  // ให้ทุกบล็อกอยู่ในผืนการ์ดเสมอ
  const avatarSize = num(avatarIn.size, d.avatar.size, 48, Math.min(360, height - 40));

  return {
    version: 1,
    width,
    height,
    radius: num(input.radius, d.radius, 0, 48),
    colors: {
      bgFrom: color(colorsIn.bgFrom, d.colors.bgFrom),
      bgTo: color(colorsIn.bgTo, d.colors.bgTo),
      accent: color(colorsIn.accent, d.colors.accent),
      accentSoft: color(colorsIn.accentSoft, d.colors.accentSoft),
      text: color(colorsIn.text, d.colors.text),
      muted: color(colorsIn.muted, d.colors.muted),
    },
    avatar: {
      x: num(avatarIn.x, d.avatar.x, 0, width),
      y: num(avatarIn.y, d.avatar.y, 0, height),
      size: avatarSize,
    },
    header: {
      x: num(headerIn.x, d.header.x, 0, width),
      y: num(headerIn.y, d.header.y, 0, height),
      titleSize: num(headerIn.titleSize, d.header.titleSize, 9, 24),
      subtitleSize: num(headerIn.subtitleSize, d.header.subtitleSize, 9, 24),
    },
    name: {
      x: num(nameIn.x, d.name.x, 0, width),
      y: num(nameIn.y, d.name.y, 0, height),
      size: num(nameIn.size, d.name.size, 16, 72),
    },
    stats: {
      x: num(statsIn.x, d.stats.x, 0, width),
      y: num(statsIn.y, d.stats.y, 0, height),
      width: num(statsIn.width, d.stats.width, 140, 460),
      height: num(statsIn.height, d.stats.height, 96, 300),
      gap: num(statsIn.gap, d.stats.gap, 0, 80),
    },
    band: {
      x: num(bandIn.x, d.band.x, 0, width),
      y: num(bandIn.y, d.band.y, 0, height),
      width: num(bandIn.width, d.band.width, 200, width),
      height: num(bandIn.height, d.band.height, 56, 160),
      enabled: bool(bandIn.enabled, d.band.enabled),
    },
    logo: {
      enabled: bool(logoIn.enabled, d.logo.enabled),
      x: num(logoIn.x, d.logo.x, 0, width),
      y: num(logoIn.y, d.logo.y, 0, height),
      size: num(logoIn.size, d.logo.size, 16, 64),
    },
  };
}

/** อ่านเลย์เอาต์ที่บันทึกไว้ (ไม่มี/อ่านไม่ได้ → ค่าเริ่มต้น) */
export async function getCardLayout(guildId: string, variant: CardVariant = 'profile'): Promise<CardLayout> {
  const pool = getPool();
  if (!pool || !isDbReady()) return DEFAULT_LAYOUT;

  try {
    const result = await pool.query<{ layout: unknown }>(
      'SELECT layout FROM card_layouts WHERE guild_id = $1 AND variant = $2',
      [guildId, variant],
    );
    if (!result.rows.length) return DEFAULT_LAYOUT;
    return normalizeLayout(result.rows[0].layout);
  } catch (error) {
    console.error('[cardLayout] อ่านเลย์เอาต์ไม่สำเร็จ:', error);
    return DEFAULT_LAYOUT;
  }
}

/** เข้ารหัสเลย์เอาต์เป็น base64url (ใช้ส่งใน URL พรีวิว) */
export function encodeLayout(layout: CardLayout): string {
  return Buffer.from(JSON.stringify(layout), 'utf8').toString('base64url');
}

/** ถอด base64url → เลย์เอาต์ (ค่าผิดรูปแบบถือว่าใช้ค่าเริ่มต้น) */
export function decodeLayout(value: string | null | undefined): CardLayout {
  if (!value) return DEFAULT_LAYOUT;
  try {
    return normalizeLayout(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    return DEFAULT_LAYOUT;
  }
}
