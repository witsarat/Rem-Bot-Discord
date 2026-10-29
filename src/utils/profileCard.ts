/**
 * src/utils/profileCard.ts
 * เรนเดอร์การ์ดเป็นรูป PNG ด้วย @napi-rs/canvas (Skia)
 *
 *  - /profile → การ์ดสมาชิก 1000×560
 *  - รายงานประจำสัปดาห์ (Premium) → การ์ดสรุป 1000×620
 *
 * ดีไซน์ใหม่: โครงเดียวทุกธีม — หัวการ์ด + ฮีโร่ (avatar/ชื่อ/อันดับ) +
 * แถวสถิติ 3 ช่องคั่นเส้น + แถบข้อมูลล่าง + ฟุตเตอร์
 * สิ่งที่เปลี่ยนได้คือ "ธีมสี" จาก utils/cardLayout.ts (16 แบบ)
 */
import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { formatVoiceDuration } from './voiceStats';
import { DEFAULT_THEME, type CardColors, type CardTheme } from './cardLayout';

/**
 * สเกลการ์ด: วาดที่พิกัดดีไซน์ 1000×560 / 1000×620 แล้วย่อทั้งผืนตามค่านี้
 * 0.8 → การ์ดจริง 800×448 (โปรไฟล์) และ 800×496 (weekly)
 * อยากเล็กลง/ใหญ่ขึ้น แก้เลขนี้ที่เดียว (0.7 / 0.75 / 0.9) ไม่ต้องแก้พิกัดใด ๆ
 */
const SCALE = 0.8;

const PAD = 8;
const W = 1000;
const H = 560;
const WEEKLY_W = 1000;
const WEEKLY_H = 620;
const MARGIN = 56;

/** ขนาดไฟล์ PNG จริงที่ส่งออก (ใช้บอกฝั่งเว็บ/ทดสอบ) */
export const PROFILE_CARD_SIZE = { width: Math.round(W * SCALE), height: Math.round(H * SCALE) };
export const WEEKLY_CARD_SIZE = { width: Math.round(WEEKLY_W * SCALE), height: Math.round(WEEKLY_H * SCALE) };

const GOLD = '#ffd166';
const SILVER = '#d8d2cc';
const BRONZE = '#d98b5f';

/** สีทั้งหมดที่ใช้บนการ์ด (สืบทอดจากธีม + ค่าที่คำนวณเพิ่ม) */
interface Palette {
  bgFrom: string;
  bgTo: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  faint: string;
  band: string;
  border: string;
  line: string;
  chipBg: string;
  chipBorder: string;
  glowStrong: string;
  glowSoft: string;
  gold: string;
}

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function palette(colors: CardColors): Palette {
  // ธีมพื้นสว่าง (Arctic/Blossom) ใช้เลเยอร์ดำจางแทนขาว
  const light = luminance(colors.bgFrom) > 0.6;
  return {
    bgFrom: colors.bgFrom,
    bgTo: colors.bgTo,
    accent: colors.accent,
    accentSoft: colors.accentSoft,
    text: colors.text,
    muted: colors.muted,
    faint: hexToRgba(colors.muted, light ? 0.8 : 0.74),
    band: light ? 'rgba(15, 23, 42, 0.045)' : 'rgba(255, 255, 255, 0.05)',
    border: light ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.10)',
    line: light ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.09)',
    chipBg: hexToRgba(colors.accent, light ? 0.16 : 0.14),
    chipBorder: hexToRgba(colors.accent, 0.42),
    glowStrong: hexToRgba(colors.accent, light ? 0.12 : 0.20),
    glowSoft: hexToRgba(colors.accent, light ? 0.08 : 0.12),
    gold: GOLD,
  };
}

const FONT = { regular: 'sans-serif', bold: 'sans-serif', emoji: 'sans-serif', symbols: 'sans-serif' };
let fontsLoaded = false;

function assetPath(...parts: string[]): string | null {
  for (const root of [process.cwd(), path.resolve(__dirname, '..', '..')]) {
    const candidate = path.join(root, ...parts);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ensureFonts(): void {
  if (fontsLoaded) return;
  fontsLoaded = true;

  try {
    const regular = assetPath('assets', 'fonts', 'Anuphan-Regular.ttf');
    const bold = assetPath('assets', 'fonts', 'Anuphan-Bold.ttf');
    const emoji = assetPath('assets', 'fonts', 'NotoColorEmoji.ttf');
    const symbols = assetPath('assets', 'fonts', 'NotoSansSymbols2.ttf');

    if (regular) {
      GlobalFonts.registerFromPath(regular, 'Anuphan');
      FONT.regular = 'Anuphan';
    }
    if (bold) {
      GlobalFonts.registerFromPath(bold, 'AnuphanBold');
      FONT.bold = 'AnuphanBold';
    }
    if (emoji) {
      GlobalFonts.registerFromPath(emoji, 'NotoColorEmoji');
      FONT.emoji = 'NotoColorEmoji';
    }
    if (symbols) {
      GlobalFonts.registerFromPath(symbols, 'NotoSansSymbols2');
      FONT.symbols = 'NotoSansSymbols2';
    }
    if (!regular || !bold) console.warn('[card] ไม่พบฟอนต์ Anuphan — ใช้ฟอนต์ระบบแทน');
    if (!emoji) console.warn('[card] ไม่พบ Noto Color Emoji — อีโมจิอาจไม่ขึ้น');
  } catch (error) {
    console.warn('[card] ลงทะเบียนฟอนต์ไม่สำเร็จ:', error);
  }
}

// ─────────────────────────── ตัวช่วยวาด ───────────────────────────

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** ตั้งฟอนต์: ไทย/ละติน (Anuphan) → อีโมจิ → สัญลักษณ์ */
function setFont(ctx: SKRSContext2D, size: number, bold = false): void {
  ctx.font = `${bold ? '700' : '400'} ${size}px ${bold ? FONT.bold : FONT.regular}, ${FONT.emoji}, ${FONT.symbols}, sans-serif`;
}

/** ลดขนาดจนพอดี ถ้ายังไม่พอดีให้ตัดด้วย … */
function fitTextBlock(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  size: number,
  bold = false,
  min = 14,
): { text: string; size: number } {
  let current = size;
  while (current > min) {
    setFont(ctx, current, bold);
    if (ctx.measureText(text).width <= maxWidth) return { text, size: current };
    current -= 1;
  }
  return { text: clipText(ctx, text, maxWidth, min, bold), size: min };
}

function clipText(ctx: SKRSContext2D, text: string, maxWidth: number, size: number, bold = false): string {
  setFont(ctx, size, bold);
  if (ctx.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** พื้นหลังการ์ด + ไฮไลต์สี accent */
function drawBackground(ctx: SKRSContext2D, p: Palette, width = W, height = H): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, PAD, PAD, width - PAD * 2, height - PAD * 2, 32);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, p.bgFrom);
  bg.addColorStop(1, p.bgTo);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, PAD, PAD, width - PAD * 2, height - PAD * 2, 32);
  ctx.clip();

  const glow = ctx.createRadialGradient(width - 150, 20, 0, width - 150, 20, 420);
  glow.addColorStop(0, p.glowStrong);
  glow.addColorStop(1, hexToRgba(p.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(40, height, 0, 40, height, 320);
  glow2.addColorStop(0, p.glowSoft);
  glow2.addColorStop(1, hexToRgba(p.accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  const bar = ctx.createLinearGradient(0, 0, width * 0.7, 0);
  bar.addColorStop(0, p.accentSoft);
  bar.addColorStop(0.55, p.accent);
  bar.addColorStop(1, hexToRgba(p.accent, 0));
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, width, 3);
  ctx.restore();
}

/** หัวการ์ด: จุด accent + โลโก้ + RURU (ซ้าย) และข้อความกำกับ (ขวา) */
async function drawHeader(ctx: SKRSContext2D, p: Palette, rightLabel: string): Promise<void> {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.beginPath();
  ctx.arc(MARGIN + 4, 48, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = p.accent;
  ctx.fill();

  setFont(ctx, 12, true);
  ctx.fillStyle = p.text;
  ctx.fillText('RURU', MARGIN + 14, 52);
  const wordmarkWidth = ctx.measureText('RURU').width;

  const logoPath = assetPath('assets', 'ruru.png');
  if (logoPath) {
    try {
      const logo = await loadImage(fs.readFileSync(logoPath));
      const size = 26;
      const cx = MARGIN + 14 + wordmarkWidth + 14 + size / 2;
      const cy = 47;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max(size / logo.width, size / logo.height);
      ctx.drawImage(logo, cx - (logo.width * scale) / 2, cy - (logo.height * scale) / 2, logo.width * scale, logo.height * scale);
      ctx.restore();
    } catch {
      // โลโก้โหลดไม่ได้ — ข้ามไป
    }
  }

  setFont(ctx, 11);
  ctx.fillStyle = p.muted;
  ctx.textAlign = 'right';
  ctx.fillText(rightLabel, W - MARGIN, 52);
  ctx.textAlign = 'left';
}

const AVATAR_CACHE = new Map<string, { image: Image; at: number }>();
const AVATAR_TTL = 10 * 60 * 1000;

async function loadAvatar(url: string | null): Promise<Image | null> {
  if (!url) return null;
  const cached = AVATAR_CACHE.get(url);
  if (cached && Date.now() - cached.at < AVATAR_TTL) return cached.image;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const image = await loadImage(Buffer.from(await res.arrayBuffer()));
    if (AVATAR_CACHE.size > 200) AVATAR_CACHE.clear();
    AVATAR_CACHE.set(url, { image, at: Date.now() });
    return image;
  } catch {
    return null;
  }
}

function drawAvatar(ctx: SKRSContext2D, image: Image | null, cx: number, cy: number, r: number, initial: string, p: Palette): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(p.text, 0.05);
  ctx.fill();
  ctx.restore();

  if (image) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max((r * 2) / image.width, (r * 2) / image.height);
    ctx.drawImage(image, cx - (image.width * scale) / 2, cy - (image.height * scale) / 2, image.width * scale, image.height * scale);
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(p.accent, 0.22);
    ctx.fill();
    setFont(ctx, Math.round(r * 0.85), true);
    ctx.fillStyle = p.accentSoft;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, cy + r * 0.04);
    ctx.restore();
  }

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, p.accentSoft);
  ring.addColorStop(0.6, p.accent);
  ring.addColorStop(1, hexToRgba(p.accent, 0.5));
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = ring;
  ctx.stroke();
}

/** ช่องสถิติแนวตั้ง 1 ช่อง: label / ค่าใหญ่ / คำอธิบาย */
function drawStatColumn(
  ctx: SKRSContext2D,
  x: number,
  labelY: number,
  valueY: number,
  subY: number,
  width: number,
  label: string,
  value: string,
  sub: string,
  p: Palette,
  valueSize = 42,
): void {
  setFont(ctx, 12, true);
  ctx.fillStyle = p.muted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label.toUpperCase(), x, labelY);

  const fitted = fitTextBlock(ctx, value, width, valueSize, true, 22);
  setFont(ctx, fitted.size, true);
  ctx.fillStyle = p.text;
  ctx.fillText(fitted.text, x, valueY);

  setFont(ctx, 12);
  ctx.fillStyle = p.faint;
  ctx.fillText(clipText(ctx, sub, width, 12), x, subY);
}

/** เส้นคั่นแนวนอน */
function drawHLine(ctx: SKRSContext2D, y: number, x1: number, x2: number, p: Palette): void {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** เส้นคั่นแนวตั้ง */
function drawVLine(ctx: SKRSContext2D, x: number, y1: number, y2: number, p: Palette): void {
  ctx.beginPath();
  ctx.moveTo(x, y1);
  ctx.lineTo(x, y2);
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

const TH_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
const TH_DATETIME = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

// ─────────────────────────── การ์ด /profile ───────────────────────────

export interface ProfileCardInput {
  /** ชื่อผู้ใช้ (username) — การ์ดใช้ค่านี้แทน nickname เสมอ */
  username: string;
  avatarUrl: string | null;
  guildName: string;
  joinedAt: Date | null;
  rank: { place: number; total: number } | null;
  stats: {
    last7Ms: number;
    last7Sessions: number;
    last30Ms: number;
    last30Sessions: number;
    allMs: number;
    allSessions: number;
    joins: number;
    topChannel: string | null;
  };
}

export async function renderProfileCard(
  input: ProfileCardInput,
  theme: CardTheme = DEFAULT_THEME,
): Promise<Buffer> {
  ensureFonts();

  const p = palette(theme.colors);
  const ctx = createCanvas(PROFILE_CARD_SIZE.width, PROFILE_CARD_SIZE.height).getContext('2d');
  ctx.scale(SCALE, SCALE);
  const avatar = await loadAvatar(input.avatarUrl);

  drawBackground(ctx, p);
  await drawHeader(ctx, p, 'VOICE PROFILE');

  // ── ฮีโร่: avatar + ชื่อ + meta + อันดับ ──
  const avatarCx = MARGIN + 88;
  const avatarCy = 206;
  drawAvatar(ctx, avatar, avatarCx, avatarCy, 62, (input.username || '?').slice(0, 1).toUpperCase(), p);

  const textX = MARGIN + 176;

  // ป้ายอันดับ (มุมขวา) — วัดความกว้างจริงก่อน เพื่อกันชื่อชน
  let rankWidth = 0;
  if (input.rank) {
    const label = `อันดับ ${input.rank.place} / ${input.rank.total}`;
    setFont(ctx, 15, true);
    rankWidth = ctx.measureText(label).width + 36;
    const px = W - MARGIN - rankWidth;
    const py = 158;

    roundRect(ctx, px, py, rankWidth, 40, 20);
    ctx.fillStyle = p.chipBg;
    ctx.fill();
    ctx.strokeStyle = p.chipBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = p.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + rankWidth / 2, py + 21);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  const nameMax = W - MARGIN - textX - (rankWidth ? rankWidth + 24 : 0);
  const name = fitTextBlock(ctx, input.username, nameMax, 42, true, 24);
  setFont(ctx, name.size, true);
  ctx.fillStyle = p.text;
  ctx.fillText(name.text, textX, 178);

  // บรรทัดรอง: วันที่เข้าร่วม • บรรทัดล่าง: ชื่อเซิร์ฟเวอร์ (ไม่ใช้ nickname)
  setFont(ctx, 15);
  ctx.fillStyle = p.muted;
  ctx.fillText(
    clipText(ctx, input.joinedAt ? `เข้าร่วม ${TH_DATE.format(input.joinedAt)}` : 'สมาชิกเซิร์ฟเวอร์นี้', nameMax, 15),
    textX,
    208,
  );

  setFont(ctx, 13);
  ctx.fillStyle = p.faint;
  ctx.fillText(clipText(ctx, input.guildName, W - MARGIN - textX, 13), textX, 234);

  // ── เส้นคั่น ──
  drawHLine(ctx, 278, MARGIN, W - MARGIN, p);

  // ── สถิติ 3 ช่อง ──
  const colWidth = 264;
  const columns = [
    { label: '7 วันล่าสุด', value: formatVoiceDuration(input.stats.last7Ms), sub: `${input.stats.last7Sessions} ครั้ง` },
    { label: '30 วันล่าสุด', value: formatVoiceDuration(input.stats.last30Ms), sub: `${input.stats.last30Sessions} ครั้ง` },
    { label: 'สะสมทั้งหมด', value: formatVoiceDuration(input.stats.allMs), sub: `${input.stats.allSessions} ครั้ง` },
  ];

  columns.forEach((column, index) => {
    const x = MARGIN + index * 312;
    drawStatColumn(ctx, x, 318, 378, 404, colWidth, column.label, column.value, column.sub, p);
    if (index < columns.length - 1) drawVLine(ctx, x + colWidth + 18, 300, 412, p);
  });

  // ── แถบข้อมูลล่าง ──
  const bandY = 430;
  const bandH = 76;
  roundRect(ctx, MARGIN, bandY, W - MARGIN * 2, bandH, 18);
  ctx.fillStyle = p.band;
  ctx.fill();
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  setFont(ctx, 11, true);
  ctx.fillStyle = p.muted;
  ctx.textAlign = 'left';
  ctx.fillText('ห้องยอดนิยม', MARGIN + 24, bandY + 28);

  const topChannel = input.stats.topChannel ? `🔊 ${input.stats.topChannel}` : '—';
  const channelText = fitTextBlock(ctx, topChannel, 520, 16, true, 13);
  setFont(ctx, channelText.size, true);
  ctx.fillStyle = p.text;
  ctx.fillText(channelText.text, MARGIN + 24, bandY + 54);

  ctx.textAlign = 'right';
  setFont(ctx, 11, true);
  ctx.fillStyle = p.muted;
  ctx.fillText('เข้าห้องทั้งหมด', W - MARGIN - 24, bandY + 28);

  setFont(ctx, 16, true);
  ctx.fillStyle = p.text;
  ctx.fillText(`${input.stats.joins} ครั้ง`, W - MARGIN - 24, bandY + 54);
  ctx.textAlign = 'left';

  // ── ฟุตเตอร์ ──
  setFont(ctx, 12);
  ctx.fillStyle = p.faint;
  ctx.fillText('RURU · voice log bot', MARGIN, H - 24);

  ctx.textAlign = 'right';
  ctx.fillStyle = p.faint;
  ctx.fillText(`อัปเดต ${TH_DATETIME.format(new Date())} น.`, W - MARGIN, H - 24);
  ctx.textAlign = 'left';

  return ctx.canvas.encode('png');
}

// ─────────────────────────── การ์ด Weekly ───────────────────────────

export interface WeeklyCardInput {
  guildName: string;
  from: Date;
  to: Date;
  participants: number;
  totalMs: number;
  topChannel: { name: string; count: number } | null;
  rows: Array<{ username: string; totalMs: number; sessions: number }>;
}

/** การ์ดสรุปรายงานประจำสัปดาห์ (Premium) — Top 5 · ใช้ธีมสีเดียวกัน */
export async function renderWeeklyCard(
  input: WeeklyCardInput,
  theme: CardTheme = DEFAULT_THEME,
): Promise<Buffer> {
  ensureFonts();

  const p = palette(theme.colors);
  const ctx = createCanvas(WEEKLY_CARD_SIZE.width, WEEKLY_CARD_SIZE.height).getContext('2d');
  ctx.scale(SCALE, SCALE);

  drawBackground(ctx, p, WEEKLY_W, WEEKLY_H);
  await drawHeader(ctx, p, `${TH_DATE.format(input.from)} – ${TH_DATE.format(input.to)}`);

  // ── หัวเรื่อง ──
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 36, true);
  ctx.fillStyle = p.text;
  ctx.fillText('สรุปห้องเสียงประจำสัปดาห์', MARGIN, 146);

  setFont(ctx, 14);
  ctx.fillStyle = p.muted;
  ctx.fillText(clipText(ctx, input.guildName, W - MARGIN * 2, 14), MARGIN, 174);

  // ── KPI 3 ช่อง ──
  drawHLine(ctx, 200, MARGIN, W - MARGIN, p);
  const colWidth = 264;
  const kpis = [
    { label: 'สมาชิกที่ใช้งาน', value: `${input.participants}`, sub: 'คน' },
    { label: 'เวลารวมทุกคน', value: formatVoiceDuration(input.totalMs), sub: 'ทุกห้องเสียง' },
    {
      label: 'ห้องยอดนิยม',
      value: input.topChannel ? input.topChannel.name : '—',
      sub: input.topChannel ? `เข้าห้อง ${input.topChannel.count} ครั้ง` : 'ยังไม่มีข้อมูล',
    },
  ];

  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * 312;
    drawStatColumn(ctx, x, 238, 292, 314, colWidth, kpi.label, kpi.value, kpi.sub, p, index === 2 ? 26 : 38);
  });
  drawHLine(ctx, 336, MARGIN, W - MARGIN, p);

  // ── ตารางอันดับ 5 คน ──
  setFont(ctx, 12, true);
  ctx.fillStyle = p.muted;
  ctx.fillText('อันดับผู้ใช้งานห้องเสียง', MARGIN, 366);
  ctx.textAlign = 'right';
  ctx.fillText('เวลารวม', W - MARGIN - 150, 366);
  ctx.fillText('เข้าห้อง', W - MARGIN, 366);
  ctx.textAlign = 'left';

  const rows = input.rows.slice(0, 5);
  const rowHeight = 42;
  const startY = 384;
  const maxMs = Math.max(1, ...rows.map((row) => row.totalMs));
  const medal = [p.gold, SILVER, BRONZE];

  if (rows.length === 0) {
    setFont(ctx, 16);
    ctx.fillStyle = p.muted;
    ctx.fillText('ยังไม่มีข้อมูลการใช้งานห้องเสียงในสัปดาห์นี้', MARGIN, startY + 40);
  }

  rows.forEach((row, index) => {
    const y = startY + index * rowHeight;

    if (index < rows.length - 1) drawHLine(ctx, y + rowHeight - 6, MARGIN, W - MARGIN, p);

    setFont(ctx, 15, true);
    ctx.fillStyle = medal[index] ?? p.faint;
    ctx.fillText(String(index + 1).padStart(2, '0'), MARGIN, y + 24);

    const name = clipText(ctx, row.username, 270, 18, true);
    setFont(ctx, 18, true);
    ctx.fillStyle = p.text;
    ctx.fillText(name, MARGIN + 42, y + 24);

    // แถบเทียบเวลา (ความยาวตามสัดส่วน)
    const trackX = MARGIN + 340;
    const trackW = 220;
    roundRect(ctx, trackX, y + 13, trackW, 8, 4);
    ctx.fillStyle = p.line;
    ctx.fill();

    const barW = Math.max(6, Math.round(trackW * (row.totalMs / maxMs)));
    roundRect(ctx, trackX, y + 13, barW, 8, 4);
    ctx.fillStyle = index === 0 ? p.gold : p.accent;
    ctx.fill();

    setFont(ctx, 17, true);
    ctx.fillStyle = index === 0 ? p.gold : p.accentSoft;
    ctx.textAlign = 'right';
    ctx.fillText(formatVoiceDuration(row.totalMs), W - MARGIN - 150, y + 24);

    setFont(ctx, 14);
    ctx.fillStyle = p.muted;
    ctx.fillText(`${row.sessions} ครั้ง`, W - MARGIN, y + 24);
    ctx.textAlign = 'left';
  });

  // ── ฟุตเตอร์ ──
  setFont(ctx, 12);
  ctx.fillStyle = p.faint;
  ctx.fillText('RURU · รายงานอัตโนมัติทุกวันจันทร์ 09:00 น.', MARGIN, WEEKLY_H - 26);

  ctx.textAlign = 'right';
  ctx.fillStyle = p.faint;
  ctx.fillText(`อัปเดต ${TH_DATETIME.format(new Date())} น.`, W - MARGIN, WEEKLY_H - 26);
  ctx.textAlign = 'left';

  return ctx.canvas.encode('png');
}
