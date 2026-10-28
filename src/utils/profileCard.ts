/**
 * src/utils/profileCard.ts
 * เรนเดอร์การ์ดเป็นรูป PNG ด้วย @napi-rs/canvas (Skia)
 *
 *  - /profile → การ์ดสมาชิก
 *  - รายงานประจำสัปดาห์ (Premium) → การ์ดสรุป Top 5
 *
 * ข้อดีเทียบกับ SVG: วัดความกว้างข้อความจริง, รองรับอีโมจิสี (Noto Color Emoji)
 * และวาดชื่อที่มีอักษรพิเศษ (& < > “ ” ฯลฯ) ได้ตรงตัวโดยไม่ต้อง escape
 * ฟอนต์: Anuphan (ชุดเดียวกับเว็บ) + Noto Color Emoji — ฝังใน assets/fonts
 */
import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { formatVoiceDuration } from './voiceStats';

const W = 1000;
const PROFILE_H = 560;
const WEEKLY_H = 620;
const PAD = 8;
const RADIUS = 32;

const C = {
  bgFrom: '#1b1310',
  bgTo: '#2b1a12',
  card: '#241712',
  cardBorder: '#3d2a20',
  band: '#2a1a13',
  accent: '#ff8c42',
  accentSoft: '#ffb37a',
  gold: '#ffd166',
  silver: '#d8d2cc',
  bronze: '#d98b5f',
  text: '#fff4ec',
  muted: '#d0b3a3',
  dim: '#96796b',
  line: 'rgba(255, 236, 224, 0.10)',
  chipBg: 'rgba(255, 140, 66, 0.12)',
  chipBorder: 'rgba(255, 140, 66, 0.38)',
} as const;

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
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** ตั้งฟอนต์: ไทย/ละติน (Anuphan) → อีโมจิ (Noto Color Emoji) → สัญลักษณ์ (Noto Sans Symbols 2) */
function setFont(ctx: SKRSContext2D, size: number, bold = false): void {
  ctx.font = `${bold ? '700' : '400'} ${size}px ${bold ? FONT.bold : FONT.regular}, ${FONT.emoji}, ${FONT.symbols}, sans-serif`;
}

/** วาดข้อความให้พอดีความกว้าง (ลดขนาดลงทีละ 1px) */
function fitText(ctx: SKRSContext2D, text: string, maxWidth: number, size: number, bold = false, min = 12): number {
  let current = size;
  while (current > min) {
    setFont(ctx, current, bold);
    if (ctx.measureText(text).width <= maxWidth) return current;
    current -= 1;
  }
  setFont(ctx, min, bold);
  return min;
}

/** ลดขนาดจนพอดี ถ้ายังไม่พอดีให้ตัดด้วย … (กันข้อความล้นการ์ด) */
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

/** ตัดข้อความด้วย … ตามความกว้างจริง */
function clipText(ctx: SKRSContext2D, text: string, maxWidth: number, size: number, bold = false): string {
  setFont(ctx, size, bold);
  if (ctx.measureText(text).width <= maxWidth) return text;

  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** พื้นหลังการ์ด + ไฮไลต์ส้ม */
function drawBackground(ctx: SKRSContext2D, height: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, PAD, PAD, W - PAD * 2, height - PAD * 2, RADIUS);
  const bg = ctx.createLinearGradient(0, 0, W, height);
  bg.addColorStop(0, C.bgFrom);
  bg.addColorStop(1, C.bgTo);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, PAD, PAD, W - PAD * 2, height - PAD * 2, RADIUS);
  ctx.clip();

  const top = ctx.createRadialGradient(880, 30, 0, 880, 30, 360);
  top.addColorStop(0, 'rgba(255, 140, 66, 0.20)');
  top.addColorStop(1, 'rgba(255, 140, 66, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, height);

  const left = ctx.createRadialGradient(60, height, 0, 60, height, 300);
  left.addColorStop(0, 'rgba(255, 140, 66, 0.12)');
  left.addColorStop(1, 'rgba(255, 140, 66, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, W, height);

  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, C.accentSoft);
  bar.addColorStop(0.6, C.accent);
  bar.addColorStop(1, '#c2561f');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 4);
  ctx.restore();
}

/** โลโก้บอทเล็ก ๆ + คำว่า RURU (มุมขวาบน) */
async function drawWordmark(ctx: SKRSContext2D): Promise<void> {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 15, true);
  ctx.fillStyle = C.accent;
  ctx.fillText('RURU', W - 64, 44);
  const textWidth = ctx.measureText('RURU').width;

  const logoPath = assetPath('assets', 'ruru.png');
  if (!logoPath) return;

  try {
    const logo = await loadImage(fs.readFileSync(logoPath));
    const size = 30;
    const cx = W - 64 - textWidth - 16 - size / 2;
    const cy = 33;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max(size / logo.width, size / logo.height);
    ctx.drawImage(logo, cx - (logo.width * scale) / 2, cy - (logo.height * scale) / 2, logo.width * scale, logo.height * scale);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = C.chipBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } catch {
    // โลโก้โหลดไม่ได้ — ข้ามไป
  }

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

function drawAvatar(ctx: SKRSContext2D, image: Image | null, cx: number, cy: number, r: number, initial: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#221510';
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
    ctx.fillStyle = 'rgba(255, 140, 66, 0.22)';
    ctx.fill();
    setFont(ctx, Math.round(r * 0.85), true);
    ctx.fillStyle = C.accentSoft;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, cy + r * 0.04);
    ctx.restore();
  }

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, C.accentSoft);
  ring.addColorStop(0.6, C.accent);
  ring.addColorStop(1, '#c2561f');
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = ring;
  ctx.stroke();
}

/** การ์ดสถิติ 1 ใบ */
function drawStatCard(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  hint: string,
  accent: string,
): void {
  roundRect(ctx, x, y, width, height, 22);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  roundRect(ctx, x, y + 26, 5, height - 52, 2.5);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  setFont(ctx, 17);
  ctx.fillStyle = C.muted;
  ctx.fillText(clipText(ctx, label, width - 52, 17), x + 26, y + 46);

  const fitted = fitTextBlock(ctx, value, width - 52, 36, true, 16);
  setFont(ctx, fitted.size, true);
  ctx.fillStyle = C.text;
  ctx.fillText(fitted.text, x + 26, y + 104);

  setFont(ctx, 17);
  ctx.fillStyle = C.dim;
  ctx.fillText(clipText(ctx, hint, width - 52, 17), x + 26, y + 136);
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

// ─────────────────────────── การ์ดโปรไฟล์ ───────────────────────────

export interface ProfileCardInput {
  displayName: string;
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

export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
  ensureFonts();

  const canvas = createCanvas(W, PROFILE_H);
  const ctx = canvas.getContext('2d');
  const avatar = await loadAvatar(input.avatarUrl);

  drawBackground(ctx, PROFILE_H);
  await drawWordmark(ctx);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 13, true);
  ctx.fillStyle = C.accent;
  ctx.fillText('MEMBER CARD', 64, 44);
  setFont(ctx, 13);
  ctx.fillStyle = C.dim;
  ctx.fillText('VOICE LOG PROFILE', 64, 66);

  drawAvatar(ctx, avatar, 128, 132, 74, (input.displayName || '?').slice(0, 1).toUpperCase());

  // ชื่อ — รองรับอีโมจิและอักษรพิเศษในชื่อจริง (ลดขนาด/ตัดให้พอดีการ์ด)
  const name = fitTextBlock(ctx, input.displayName, 540, 42, true, 20);
  setFont(ctx, name.size, true);
  ctx.fillStyle = C.text;
  ctx.fillText(name.text, 232, 118);

  setFont(ctx, 20);
  ctx.fillStyle = C.accentSoft;
  ctx.fillText(clipText(ctx, `@${input.username}`, 520, 20), 232, 152);

  setFont(ctx, 17);
  ctx.fillStyle = C.muted;
  const guildLine = `${clipText(ctx, input.guildName, 400, 17)} · เข้าร่วม ${input.joinedAt ? TH_DATE.format(input.joinedAt) : '—'}`;
  ctx.fillText(guildLine, 232, 184);

  ctx.beginPath();
  ctx.moveTo(64, 222);
  ctx.lineTo(W - 64, 222);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawStatCard(ctx, 64, 248, 280, 160, '⏱️ 7 วันล่าสุด', formatVoiceDuration(input.stats.last7Ms), `เข้าห้อง ${input.stats.last7Sessions} ครั้ง`, C.accent);
  drawStatCard(ctx, 360, 248, 280, 160, '🗓️ 30 วันล่าสุด', formatVoiceDuration(input.stats.last30Ms), `เข้าห้อง ${input.stats.last30Sessions} ครั้ง`, C.accentSoft);
  drawStatCard(ctx, 656, 248, 280, 160, '🏆 ตลอดกาล', formatVoiceDuration(input.stats.allMs), `เข้าห้อง ${input.stats.allSessions} ครั้ง`, C.gold);

  // แถบอันดับ
  roundRect(ctx, 64, 428, W - 128, 76, 20);
  ctx.fillStyle = C.band;
  ctx.fill();
  ctx.strokeStyle = C.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const rankText = input.rank ? `#${input.rank.place} จาก ${input.rank.total} คน` : 'ยังไม่ถูกจัดอันดับ';
  ctx.textAlign = 'left';
  setFont(ctx, 16);
  ctx.fillStyle = C.dim;
  ctx.fillText('🏅 อันดับในเซิร์ฟเวอร์', 92, 456);
  setFont(ctx, 24, true);
  ctx.fillStyle = input.rank && input.rank.place <= 3 ? C.gold : C.text;
  ctx.fillText(rankText, 92, 484);

  ctx.beginPath();
  ctx.moveTo(380, 444);
  ctx.lineTo(380, 488);
  ctx.strokeStyle = C.cardBorder;
  ctx.stroke();

  setFont(ctx, 16);
  ctx.fillStyle = C.dim;
  ctx.fillText('🔊 ห้องยอดนิยม', 408, 456);
  setFont(ctx, 24, true);
  ctx.fillStyle = C.text;
  ctx.fillText(clipText(ctx, input.stats.topChannel ?? '—', 250, 24, true), 408, 484);

  ctx.beginPath();
  ctx.moveTo(700, 444);
  ctx.lineTo(700, 488);
  ctx.strokeStyle = C.cardBorder;
  ctx.stroke();

  setFont(ctx, 16);
  ctx.fillStyle = C.dim;
  ctx.fillText('🚪 เข้าห้องทั้งหมด', 728, 456);
  setFont(ctx, 24, true);
  ctx.fillStyle = C.accentSoft;
  ctx.fillText(`${input.stats.joins} ครั้ง`, 728, 484);

  setFont(ctx, 14);
  ctx.fillStyle = C.dim;
  ctx.fillText(`อัปเดต ${TH_DATETIME.format(new Date())} น.`, 64, 540);

  return canvas.encode('png');
}

// ─────────────────────────── การ์ดรายงานประจำสัปดาห์ ───────────────────────────

export interface WeeklyCardInput {
  guildName: string;
  from: Date;
  to: Date;
  participants: number;
  totalMs: number;
  topChannel: { name: string; count: number } | null;
  rows: Array<{ username: string; totalMs: number; sessions: number }>;
}

/** การ์ดสรุปรายงานประจำสัปดาห์ (Premium) — Top 5 */
export async function renderWeeklyCard(input: WeeklyCardInput): Promise<Buffer> {
  ensureFonts();

  const canvas = createCanvas(W, WEEKLY_H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, WEEKLY_H);
  await drawWordmark(ctx);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 13, true);
  ctx.fillStyle = C.accent;
  ctx.fillText('WEEKLY REPORT', 64, 44);
  setFont(ctx, 13);
  ctx.fillStyle = C.dim;
  ctx.fillText('VOICE LOG SUMMARY', 64, 66);

  setFont(ctx, 15);
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`${TH_DATE.format(input.from)} – ${TH_DATE.format(input.to)}`, W - 64, 72);
  ctx.textAlign = 'left';

  drawStatCard(ctx, 64, 104, 280, 140, '👥 สมาชิกที่ใช้งาน', `${input.participants} คน`, 'ในช่วง 7 วัน', C.accent);
  drawStatCard(ctx, 360, 104, 280, 140, '⏱️ เวลารวมทุกคน', formatVoiceDuration(input.totalMs), 'นับรวมทุกห้อง', C.accentSoft);
  drawStatCard(
    ctx,
    656,
    104,
    280,
    140,
    '🔊 ห้องยอดนิยม',
    input.topChannel ? clipText(ctx, input.topChannel.name, 220, 30, true) : '—',
    input.topChannel ? `เข้าห้อง ${input.topChannel.count} ครั้ง` : 'ยังไม่มีข้อมูล',
    C.gold,
  );

  setFont(ctx, 18, true);
  ctx.fillStyle = C.text;
  ctx.fillText('🏆 อันดับผู้ใช้งานห้องเสียง', 64, 292);

  setFont(ctx, 14);
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.fillText('เวลารวม', W - 240, 292);
  ctx.fillText('เข้าห้อง', W - 64, 292);
  ctx.textAlign = 'left';

  const rows = input.rows.slice(0, 5);
  const rowHeight = 52;
  const startY = 310;

  if (rows.length === 0) {
    setFont(ctx, 18);
    ctx.fillStyle = C.muted;
    ctx.fillText('ยังไม่มีข้อมูลการใช้งานห้องเสียงในสัปดาห์นี้', 64, startY + 40);
  }

  const medal = [C.gold, C.silver, C.bronze];

  rows.forEach((row, index) => {
    const y = startY + index * rowHeight;

    roundRect(ctx, 64, y, W - 128, rowHeight - 6, 14);
    ctx.fillStyle = index === 0 ? 'rgba(255, 140, 66, 0.12)' : C.band;
    ctx.fill();
    ctx.strokeStyle = index === 0 ? C.chipBorder : C.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(96, y + 23, 15, 0, Math.PI * 2);
    ctx.fillStyle = medal[index] ?? C.cardBorder;
    ctx.fill();
    setFont(ctx, 15, true);
    ctx.fillStyle = index < 3 ? '#2a1508' : C.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), 96, y + 24);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const name = clipText(ctx, row.username, 430, 21, true);
    setFont(ctx, 21, true);
    ctx.fillStyle = C.text;
    ctx.fillText(name, 124, y + 30);

    setFont(ctx, 20, true);
    ctx.fillStyle = index === 0 ? C.gold : C.accentSoft;
    ctx.textAlign = 'right';
    ctx.fillText(formatVoiceDuration(row.totalMs), W - 240, y + 30);

    setFont(ctx, 17);
    ctx.fillStyle = C.muted;
    ctx.fillText(`${row.sessions} ครั้ง`, W - 64, y + 30);
    ctx.textAlign = 'left';
  });

  const footerY = startY + Math.max(rows.length, 1) * rowHeight + 26;
  setFont(ctx, 14);
  ctx.fillStyle = C.dim;
  ctx.fillText(`${clipText(ctx, input.guildName, 420, 14)} · ข้อมูลจากฐานข้อมูล`, 64, footerY);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 236, 224, 0.40)';
  ctx.fillText(`ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. • ${TH_DATETIME.format(new Date())}`, W - 64, footerY);

  return canvas.encode('png');
}
