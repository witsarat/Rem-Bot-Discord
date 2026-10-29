/**
 * src/utils/profileCard.ts
 * เรนเดอร์การ์ดเป็นรูป PNG ด้วย @napi-rs/canvas (Skia)
 *
 *  - /profile → การ์ดสมาชิก (ใช้เลย์เอาต์ที่แก้ได้จากแดชบอร์ด)
 *  - รายงานประจำสัปดาห์ (Premium) → การ์ดสรุป Top 5
 *
 * เลย์เอาต์ (ตำแหน่ง/ขนาด/สี) มาจาก utils/cardLayout.ts ซึ่งหน้า Card Studio ในเว็บแก้ได้
 * ค่าที่ไม่ได้ตั้งจะถูกเติมจาก DEFAULT_LAYOUT และถูก clamp ให้อยู่ในผืนการ์ดเสมอ
 */
import fs from 'fs';
import path from 'path';
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { formatVoiceDuration } from './voiceStats';
import { DEFAULT_LAYOUT, type CardLayout } from './cardLayout';

const PAD = 8;
const WEEKLY_W = 1000;
const WEEKLY_H = 620;

const GOLD = '#ffd166';
const SILVER = '#d8d2cc';
const BRONZE = '#d98b5f';

/** สีทั้งหมดที่ใช้บนการ์ด (สืบทอดจากเลย์เอาต์ + ค่าที่คำนวณเพิ่ม) */
interface Theme {
  bgFrom: string;
  bgTo: string;
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  card: string;
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

function theme(layout: CardLayout): Theme {
  const c = layout.colors;
  // ธีมพื้นสว่าง (เช่น Arctic/Blossom) ต้องใช้เลเยอร์ดำจาง ๆ แทนขาว เพื่อให้เห็นการ์ดย่อย
  const light = luminance(c.bgFrom) > 0.6;
  return {
    bgFrom: c.bgFrom,
    bgTo: c.bgTo,
    accent: c.accent,
    accentSoft: c.accentSoft,
    text: c.text,
    muted: c.muted,
    card: light ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.045)',
    band: light ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.05)',
    border: light ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.10)',
    line: light ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.10)',
    chipBg: hexToRgba(c.accent, light ? 0.16 : 0.14),
    chipBorder: hexToRgba(c.accent, 0.42),
    glowStrong: hexToRgba(c.accent, light ? 0.13 : 0.20),
    glowSoft: hexToRgba(c.accent, light ? 0.09 : 0.12),
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
function drawBackground(ctx: SKRSContext2D, layout: CardLayout, t: Theme, height = layout.height): void {
  const width = layout.width;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, PAD, PAD, width - PAD * 2, height - PAD * 2, layout.radius);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, t.bgFrom);
  bg.addColorStop(1, t.bgTo);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, PAD, PAD, width - PAD * 2, height - PAD * 2, layout.radius);
  ctx.clip();

  const top = ctx.createRadialGradient(width - 120, 30, 0, width - 120, 30, 360);
  top.addColorStop(0, t.glowStrong);
  top.addColorStop(1, hexToRgba(t.accent, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height);

  const left = ctx.createRadialGradient(60, height, 0, 60, height, 300);
  left.addColorStop(0, t.glowSoft);
  left.addColorStop(1, hexToRgba(t.accent, 0));
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width, height);

  const bar = ctx.createLinearGradient(0, 0, width, 0);
  bar.addColorStop(0, t.accentSoft);
  bar.addColorStop(0.6, t.accent);
  bar.addColorStop(1, hexToRgba(t.accent, 0.65));
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, width, 4);
  ctx.restore();
}

/** โลโก้บอท + คำว่า RURU ตามตำแหน่งในเลย์เอาต์ */
async function drawWordmark(ctx: SKRSContext2D, layout: CardLayout, t: Theme): Promise<void> {
  if (!layout.logo.enabled) return;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 15, true);
  ctx.fillStyle = t.accent;
  ctx.fillText('RURU', layout.logo.x, layout.logo.y);
  const textWidth = ctx.measureText('RURU').width;

  const logoPath = assetPath('assets', 'ruru.png');
  if (!logoPath || layout.logo.size < 20) return;

  try {
    const logo = await loadImage(fs.readFileSync(logoPath));
    const size = layout.logo.size;
    const cx = layout.logo.x - textWidth - 16 - size / 2;
    const cy = layout.logo.y - size * 0.36;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max(size / logo.width, size / logo.height);
    ctx.drawImage(logo, cx - (logo.width * scale) / 2, cy - (logo.height * scale) / 2, logo.width * scale, logo.height * scale);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = t.chipBorder;
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

function drawAvatar(ctx: SKRSContext2D, image: Image | null, cx: number, cy: number, r: number, initial: string, t: Theme): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = t.bgTo;
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
    ctx.fillStyle = hexToRgba(t.accent, 0.22);
    ctx.fill();
    setFont(ctx, Math.round(r * 0.85), true);
    ctx.fillStyle = t.accentSoft;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, cy + r * 0.04);
    ctx.restore();
  }

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, t.accentSoft);
  ring.addColorStop(0.6, t.accent);
  ring.addColorStop(1, hexToRgba(t.accent, 0.55));
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = ring;
  ctx.stroke();
}

/** การ์ดสถิติ 1 ใบ (ขนาดขึ้นกับเลย์เอาต์) */
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
  t: Theme,
): void {
  roundRect(ctx, x, y, width, height, 22);
  ctx.fillStyle = t.card;
  ctx.fill();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  roundRect(ctx, x, y + 26, 5, height - 52, 2.5);
  ctx.fillStyle = accent;
  ctx.fill();

  const labelSize = Math.max(12, Math.min(17, Math.round(height * 0.11)));
  const valueSize = Math.max(18, Math.min(36, Math.round(height * 0.23)));
  const hintSize = labelSize;
  const innerWidth = width - 52;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  setFont(ctx, labelSize);
  ctx.fillStyle = t.muted;
  ctx.fillText(clipText(ctx, label, innerWidth, labelSize), x + 26, y + 46);

  const fitted = fitTextBlock(ctx, value, innerWidth, valueSize, true, 16);
  setFont(ctx, fitted.size, true);
  ctx.fillStyle = t.text;
  ctx.fillText(fitted.text, x + 26, y + height * 0.65);

  setFont(ctx, hintSize);
  ctx.fillStyle = t.muted;
  ctx.fillText(clipText(ctx, hint, innerWidth, hintSize), x + 26, y + height - 24);
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

export async function renderProfileCard(
  input: ProfileCardInput,
  layout: CardLayout = DEFAULT_LAYOUT,
): Promise<Buffer> {
  ensureFonts();

  const t = theme(layout);
  const ctx = createCanvas(layout.width, layout.height).getContext('2d');
  const avatar = await loadAvatar(input.avatarUrl);

  drawBackground(ctx, layout, t);
  await drawWordmark(ctx, layout, t);

  // หัวการ์ด
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, layout.header.titleSize, true);
  ctx.fillStyle = t.accent;
  ctx.fillText('MEMBER CARD', layout.header.x, layout.header.y);
  setFont(ctx, layout.header.subtitleSize);
  ctx.fillStyle = t.muted;
  ctx.fillText('VOICE LOG PROFILE', layout.header.x, layout.header.y + layout.header.subtitleSize * 1.7);

  // รูปโปรไฟล์
  const avatarR = layout.avatar.size / 2;
  drawAvatar(ctx, avatar, layout.avatar.x, layout.avatar.y, avatarR, (input.displayName || '?').slice(0, 1).toUpperCase(), t);

  // ชื่อ + @username + เซิร์ฟเวอร์
  const maxNameWidth = Math.max(120, layout.width - layout.name.x - 40);
  const name = fitTextBlock(ctx, input.displayName, maxNameWidth, layout.name.size, true, 20);
  setFont(ctx, name.size, true);
  ctx.fillStyle = t.text;
  ctx.fillText(name.text, layout.name.x, layout.name.y);

  const handleSize = Math.max(12, Math.round(layout.name.size * 0.46));
  setFont(ctx, handleSize);
  ctx.fillStyle = t.accentSoft;
  ctx.fillText(clipText(ctx, `@${input.username}`, maxNameWidth, handleSize), layout.name.x, layout.name.y + layout.name.size * 0.82);

  const metaSize = Math.max(11, Math.round(layout.name.size * 0.38));
  setFont(ctx, metaSize);
  ctx.fillStyle = t.muted;
  const guildLine = `${clipText(ctx, input.guildName, maxNameWidth * 0.8, metaSize)} · เข้าร่วม ${
    input.joinedAt ? TH_DATE.format(input.joinedAt) : '—'
  }`;
  ctx.fillText(guildLine, layout.name.x, layout.name.y + layout.name.size * 1.55);

  // เส้นคั่น
  const dividerY = layout.name.y + layout.name.size * 2.45;
  ctx.beginPath();
  ctx.moveTo(layout.header.x, dividerY);
  ctx.lineTo(layout.width - layout.header.x, dividerY);
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  // สถิติ 3 ช่วง
  const s = layout.stats;
  drawStatCard(ctx, s.x, s.y, s.width, s.height, '⏱️ 7 วันล่าสุด', formatVoiceDuration(input.stats.last7Ms), `เข้าห้อง ${input.stats.last7Sessions} ครั้ง`, t.accent, t);
  drawStatCard(ctx, s.x + s.width + s.gap, s.y, s.width, s.height, '🗓️ 30 วันล่าสุด', formatVoiceDuration(input.stats.last30Ms), `เข้าห้อง ${input.stats.last30Sessions} ครั้ง`, t.accentSoft, t);
  drawStatCard(ctx, s.x + (s.width + s.gap) * 2, s.y, s.width, s.height, '🏆 ตลอดกาล', formatVoiceDuration(input.stats.allMs), `เข้าห้อง ${input.stats.allSessions} ครั้ง`, t.gold, t);

  // แถบอันดับ + ห้องยอดนิยม + จำนวนครั้ง
  if (layout.band.enabled) {
    const b = layout.band;
    roundRect(ctx, b.x, b.y, b.width, b.height, 20);
    ctx.fillStyle = t.band;
    ctx.fill();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const cellWidth = b.width / 3;
    const labelY = b.y + b.height * 0.36;
    const valueY = b.y + b.height * 0.73;
    const labelSize = Math.max(12, Math.round(b.height * 0.21));
    const valueSize = Math.max(16, Math.round(b.height * 0.32));

    const cells = [
      { label: '🏅 อันดับในเซิร์ฟเวอร์', value: input.rank ? `#${input.rank.place} จาก ${input.rank.total} คน` : 'ยังไม่ถูกจัดอันดับ', color: input.rank && input.rank.place <= 3 ? t.gold : t.text },
      { label: '🔊 ห้องยอดนิยม', value: input.stats.topChannel ?? '—', color: t.text },
      { label: '🚪 เข้าห้องทั้งหมด', value: `${input.stats.joins} ครั้ง`, color: t.accentSoft },
    ];

    cells.forEach((cell, index) => {
      const x = b.x + cellWidth * index + 28;
      if (index > 0) {
        ctx.beginPath();
        ctx.moveTo(b.x + cellWidth * index, b.y + b.height * 0.22);
        ctx.lineTo(b.x + cellWidth * index, b.y + b.height * 0.78);
        ctx.strokeStyle = t.border;
        ctx.stroke();
      }

      setFont(ctx, labelSize);
      ctx.fillStyle = t.muted;
      ctx.fillText(clipText(ctx, cell.label, cellWidth - 56, labelSize), x, labelY);

      setFont(ctx, valueSize, true);
      ctx.fillStyle = cell.color;
      ctx.fillText(clipText(ctx, cell.value, cellWidth - 56, valueSize, true), x, valueY);
    });
  }

  // ฟุตเตอร์
  setFont(ctx, 14);
  ctx.fillStyle = t.muted;
  ctx.fillText(`อัปเดต ${TH_DATETIME.format(new Date())} น.`, layout.header.x, layout.height - 20);

  return ctx.canvas.encode('png');
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

/** การ์ดสรุปรายงานประจำสัปดาห์ (Premium) — Top 5 · ใช้สีจากเลย์เอาต์เดียวกัน */
export async function renderWeeklyCard(
  input: WeeklyCardInput,
  layout: CardLayout = DEFAULT_LAYOUT,
): Promise<Buffer> {
  ensureFonts();

  const t = theme(layout);
  const ctx = createCanvas(WEEKLY_W, WEEKLY_H).getContext('2d');

  drawBackground(ctx, { ...layout, height: WEEKLY_H, width: WEEKLY_W }, t, WEEKLY_H);
  await drawWordmark(ctx, { ...layout, logo: { ...layout.logo, x: WEEKLY_W - 64 } }, t);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 13, true);
  ctx.fillStyle = t.accent;
  ctx.fillText('WEEKLY REPORT', 64, 44);
  setFont(ctx, 13);
  ctx.fillStyle = t.muted;
  ctx.fillText('VOICE LOG SUMMARY', 64, 66);

  setFont(ctx, 15);
  ctx.fillStyle = t.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`${TH_DATE.format(input.from)} – ${TH_DATE.format(input.to)}`, WEEKLY_W - 64, 72);
  ctx.textAlign = 'left';

  drawStatCard(ctx, 64, 104, 280, 140, '👥 สมาชิกที่ใช้งาน', `${input.participants} คน`, 'ในช่วง 7 วัน', t.accent, t);
  drawStatCard(ctx, 360, 104, 280, 140, '⏱️ เวลารวมทุกคน', formatVoiceDuration(input.totalMs), 'นับรวมทุกห้อง', t.accentSoft, t);
  drawStatCard(
    ctx,
    656,
    104,
    280,
    140,
    '🔊 ห้องยอดนิยม',
    input.topChannel ? clipText(ctx, input.topChannel.name, 220, 30, true) : '—',
    input.topChannel ? `เข้าห้อง ${input.topChannel.count} ครั้ง` : 'ยังไม่มีข้อมูล',
    t.gold,
    t,
  );

  setFont(ctx, 18, true);
  ctx.fillStyle = t.text;
  ctx.fillText('🏆 อันดับผู้ใช้งานห้องเสียง', 64, 292);

  setFont(ctx, 14);
  ctx.fillStyle = t.muted;
  ctx.textAlign = 'right';
  ctx.fillText('เวลารวม', WEEKLY_W - 240, 292);
  ctx.fillText('เข้าห้อง', WEEKLY_W - 64, 292);
  ctx.textAlign = 'left';

  const rows = input.rows.slice(0, 5);
  const rowHeight = 52;
  const startY = 310;

  if (rows.length === 0) {
    setFont(ctx, 18);
    ctx.fillStyle = t.muted;
    ctx.fillText('ยังไม่มีข้อมูลการใช้งานห้องเสียงในสัปดาห์นี้', 64, startY + 40);
  }

  const medal = [t.gold, SILVER, BRONZE];

  rows.forEach((row, index) => {
    const y = startY + index * rowHeight;

    roundRect(ctx, 64, y, WEEKLY_W - 128, rowHeight - 6, 14);
    ctx.fillStyle = index === 0 ? t.chipBg : t.band;
    ctx.fill();
    ctx.strokeStyle = index === 0 ? t.chipBorder : t.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(96, y + 23, 15, 0, Math.PI * 2);
    ctx.fillStyle = medal[index] ?? t.border;
    ctx.fill();
    setFont(ctx, 15, true);
    ctx.fillStyle = index < 3 ? '#2a1508' : t.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), 96, y + 24);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const name = clipText(ctx, row.username, 430, 21, true);
    setFont(ctx, 21, true);
    ctx.fillStyle = t.text;
    ctx.fillText(name, 124, y + 30);

    setFont(ctx, 20, true);
    ctx.fillStyle = index === 0 ? t.gold : t.accentSoft;
    ctx.textAlign = 'right';
    ctx.fillText(formatVoiceDuration(row.totalMs), WEEKLY_W - 240, y + 30);

    setFont(ctx, 17);
    ctx.fillStyle = t.muted;
    ctx.fillText(`${row.sessions} ครั้ง`, WEEKLY_W - 64, y + 30);
    ctx.textAlign = 'left';
  });

  const footerY = startY + Math.max(rows.length, 1) * rowHeight + 26;
  setFont(ctx, 14);
  ctx.fillStyle = t.muted;
  ctx.fillText(`${clipText(ctx, input.guildName, 420, 14)} · ข้อมูลจากฐานข้อมูล`, 64, footerY);

  ctx.textAlign = 'right';
  ctx.fillStyle = t.muted;
  ctx.fillText(`ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. • ${TH_DATETIME.format(new Date())}`, WEEKLY_W - 64, footerY);

  return ctx.canvas.encode('png');
}
