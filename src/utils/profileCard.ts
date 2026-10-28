/**
 * src/utils/profileCard.ts
 * เรนเดอร์ "การ์ดสมาชิก" เป็นรูป PNG (ไม่ต้องใช้ canvas/native build tools)
 *
 * วิธีทำ: สร้าง SVG ด้วยข้อความ + รูปโปรไฟล์ (base64) แล้วเรนเดอร์เป็น PNG ด้วย @resvg/resvg-js
 *  - ฟอนต์ไทย (Sarabun) ฝังมาใน repo ที่ assets/fonts → เครื่อง Render ไม่ต้องติดตั้งฟอนต์เอง
 *  - ใช้ได้ทั้งบน macOS/Linux (resvg มี prebuilt binary)
 */
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import { formatVoiceDuration } from './voiceStats';

/** ขนาดการ์ด (px) — แนวตั้งกำลังดีใน Discord */
const CARD_WIDTH = 1000;
const CARD_HEIGHT = 620;

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Sarabun-Bold.ttf');

const COLOR = {
  bgFrom: '#0a0f1e',
  bgTo: '#141d33',
  card: '#161f36',
  cardBorder: '#27324d',
  accent: '#5865f2',
  accentSoft: '#7c8cff',
  gold: '#fee75c',
  text: '#f8fafc',
  muted: '#94a3b8',
  dim: '#64748b',
} as const;

/** สถิติที่ใช้บนการ์ด */
export interface ProfileCardStats {
  last7Ms: number;
  last7Sessions: number;
  last30Ms: number;
  last30Sessions: number;
  allMs: number;
  allSessions: number;
  joins: number;
  topChannel: string | null;
}

export interface ProfileCardInput {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  guildName: string;
  joinedAt: Date | null;
  premium: boolean;
  rank: { place: number; total: number } | null;
  stats: ProfileCardStats;
}

/** escape ข้อความสำหรับ XML (กันชื่อผู้ใช้ที่มี < > & ทำให้ SVG พัง) */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** ตัดข้อความยาวเกินกำหนด (นับตาม code point เพื่อไม่ให้ตัดกลางตัวอักษรไทย) */
function clip(value: string, max: number): string {
  const chars = [...value];
  if (chars.length <= max) return value;
  return `${chars.slice(0, Math.max(1, max - 1)).join('')}…`;
}

/** สระ/วรรณยุกต์ไทยที่ไม่กินความกว้าง (วางซ้อนบนพยัญชนะ) */
function isThaiMark(code: number): boolean {
  return (
    code === 0x0e31 ||
    (code >= 0x0e34 && code <= 0x0e3a) ||
    (code >= 0x0e47 && code <= 0x0e4e)
  );
}

/**
 * ประมาณความกว้างข้อความ (px) จากอัตราส่วนตัวอักษร — ใช้กันข้อความล้นการ์ด
 * ไม่ต้องโหลด font metrics ใน runtime (เพียงพอสำหรับตัดข้อความ)
 */
function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isThaiMark(code)) continue;
    if (code === 0x20) em += 0.26;
    else if (char >= 'A' && char <= 'Z') em += 0.75;
    else if (char >= '0' && char <= '9') em += 0.55;
    else if ('.,:;!|\'’'.includes(char)) em += 0.25;
    else if (code >= 0x0e00 && code <= 0x0e7f) em += 0.5;
    else em += 0.54;
  }
  return em * fontSize;
}

/** ตัดข้อความให้พอดีความกว้างที่กำหนด (เติม … ถ้าต้องตัด) */
function clipToWidth(value: string, maxWidth: number, fontSize: number): string {
  if (estimateWidth(value, fontSize) <= maxWidth) return value;
  const chars = [...value];
  let current = '';
  for (const char of chars) {
    const next = current + char;
    if (estimateWidth(`${next}…`, fontSize) > maxWidth) break;
    current = next;
  }
  return `${current.trimEnd()}…`;
}

/** เลือกขนาดตัวอักษรที่ใหญ่ที่สุดที่ยังพอดีความกว้าง (คืนขนาด + ข้อความที่ตัดแล้ว) */
function fitValue(value: string, maxWidth: number): { text: string; size: number } {
  for (const size of [42, 36, 30, 26, 22]) {
    if (estimateWidth(value, size) <= maxWidth) return { text: value, size };
  }
  return { text: clipToWidth(value, maxWidth, 22), size: 22 };
}

const TH_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

function thaiDate(date: Date | null): string {
  if (!date) return '—';
  return TH_DATE.format(date);
}

/** ดึงรูปโปรไฟล์แล้วแปลงเป็น data URI (คืน null ถ้าดึงไม่ได้) */
async function avatarDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 4_000_000) return null;
    const type = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/** ไอคอนกุญแจ (วาดเอง — ฟอนต์อีโมจิไม่ต้องใช้) */
function lockIcon(x: number, y: number, color: string): string {
  return `
    <g transform="translate(${x}, ${y})" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round">
      <rect x="0" y="11" width="22" height="16" rx="4" />
      <path d="M5 11 V8 a6 6 0 0 1 12 0 v3" />
    </g>`;
}

/** การ์ดสถิติ 1 ใบ */
function statCard(options: {
  x: number;
  label: string;
  value: string;
  hint: string;
  accent: string;
  locked?: boolean;
}): string {
  const { x, label, value, hint, accent, locked } = options;
  const width = 280;
  const height = 176;
  const y = 248;
  const fitted = fitValue(value, width - 48);

  if (locked) {
    return `
      <g>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20"
              fill="${COLOR.card}" stroke="${COLOR.cardBorder}" stroke-dasharray="8 7" />
        ${lockIcon(x + 24, y + 30, COLOR.dim)}
        <text x="${x + 56}" y="${y + 46}" font-family="Sarabun" font-size="19" fill="${COLOR.muted}">${esc(label)}</text>
        <text x="${x + 24}" y="${y + 108}" font-family="Sarabun" font-size="30" font-weight="700" fill="${COLOR.dim}">Premium</text>
        <text x="${x + 24}" y="${y + 142}" font-family="Sarabun" font-size="18" fill="${COLOR.dim}">ปลดล็อกด้วย 29 บาท/เดือน</text>
      </g>`;
  }

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${COLOR.card}" stroke="${COLOR.cardBorder}" />
      <rect x="${x}" y="${y}" width="5" height="${height}" rx="2.5" fill="${accent}" />
      <text x="${x + 24}" y="${y + 46}" font-family="Sarabun" font-size="19" fill="${COLOR.muted}">${esc(label)}</text>
      <text x="${x + 24}" y="${y + 108}" font-family="Sarabun" font-size="${fitted.size}" font-weight="700" fill="${COLOR.text}">${esc(fitted.text)}</text>
      <text x="${x + 24}" y="${y + 142}" font-family="Sarabun" font-size="18" fill="${COLOR.dim}">${esc(hint)}</text>
    </g>`;
}

/** สร้าง SVG ทั้งใบ */
function buildSvg(input: ProfileCardInput, avatar: string | null): string {
  const { displayName, username, guildName, joinedAt, premium, rank, stats } = input;
  const rankText = rank ? `#${rank.place} จาก ${rank.total} คน` : 'ยังไม่ถูกจัดอันดับ';
  const guildLine = `${clipToWidth(guildName, 430, 18)} · เข้าร่วม ${thaiDate(joinedAt)}`;

  const avatarBlock = avatar
    ? `<image href="${avatar}" x="56" y="52" width="148" height="148" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<text x="130" y="152" text-anchor="middle" font-family="Sarabun" font-size="56" font-weight="700" fill="${COLOR.accentSoft}">${esc([...displayName][0] ?? '?')}</text>`;

  const premiumPill = premium
    ? `<g>
         <rect x="${CARD_WIDTH - 64 - 150}" y="72" width="150" height="40" rx="20" fill="${COLOR.accent}" />
         <text x="${CARD_WIDTH - 64 - 75}" y="99" text-anchor="middle" font-family="Sarabun" font-size="19" font-weight="700" fill="#ffffff">PREMIUM</text>
       </g>`
    : `<g>
         <rect x="${CARD_WIDTH - 64 - 110}" y="72" width="110" height="40" rx="20" fill="none" stroke="${COLOR.cardBorder}" />
         <text x="${CARD_WIDTH - 64 - 55}" y="99" text-anchor="middle" font-family="Sarabun" font-size="18" font-weight="700" fill="${COLOR.muted}">FREE</text>
       </g>`;

  const thirdCard = premium
    ? statCard({
        x: 656,
        label: 'ตลอดกาล',
        value: formatVoiceDuration(stats.allMs),
        hint: `เข้าห้อง ${stats.allSessions} ครั้ง`,
        accent: COLOR.gold,
      })
    : statCard({ x: 656, label: 'ตลอดกาล', value: '', hint: '', accent: COLOR.gold, locked: true });

  const rankLine = premium
    ? `<g>
         <text x="64" y="482" font-family="Sarabun" font-size="22" fill="${COLOR.muted}">อันดับในเซิร์ฟเวอร์</text>
         <text x="300" y="482" font-family="Sarabun" font-size="24" font-weight="700" fill="${COLOR.gold}">${esc(clipToWidth(rankText, 180, 24))}</text>
         <text x="560" y="482" font-family="Sarabun" font-size="22" fill="${COLOR.muted}">ห้องยอดนิยม</text>
         <text x="740" y="482" font-family="Sarabun" font-size="24" font-weight="700" fill="${COLOR.text}">${esc(clipToWidth(stats.topChannel ?? '—', 196, 24))}</text>
       </g>`
    : `<g>
         ${lockIcon(64, 462, COLOR.dim)}
         <text x="96" y="482" font-family="Sarabun" font-size="22" fill="${COLOR.muted}">อันดับ เวลาตลอดกาล และห้องยอดนิยม ปลดล็อกด้วย Premium 29 บาท/เดือน</text>
       </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLOR.bgFrom}" />
        <stop offset="100%" stop-color="${COLOR.bgTo}" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${COLOR.accent}" stop-opacity="0.35" />
        <stop offset="100%" stop-color="${COLOR.accent}" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLOR.accentSoft}" />
        <stop offset="100%" stop-color="${COLOR.accent}" />
      </linearGradient>
      <clipPath id="avatarClip">
        <circle cx="130" cy="126" r="72" />
      </clipPath>
    </defs>

    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)" />
    <circle cx="880" cy="60" r="260" fill="url(#glow)" />
    <circle cx="80" cy="600" r="240" fill="url(#glow)" opacity="0.6" />

    <!-- หัวการ์ด -->
    <text x="64" y="30" font-family="Sarabun" font-size="15" letter-spacing="3" fill="${COLOR.dim}">REM · MEMBER CARD</text>

    <circle cx="130" cy="126" r="80" fill="none" stroke="url(#ring)" stroke-width="4" opacity="0.9" />
    <circle cx="130" cy="126" r="72" fill="#0f1729" />
    ${avatarBlock}

    <text x="232" y="112" font-family="Sarabun" font-size="44" font-weight="700" fill="${COLOR.text}">${esc(clipToWidth(displayName, 520, 44))}</text>
    <text x="232" y="148" font-family="Sarabun" font-size="21" fill="${COLOR.muted}">@${esc(clipToWidth(username, 534, 21))}</text>
    <text x="232" y="182" font-family="Sarabun" font-size="18" fill="${COLOR.dim}">${esc(guildLine)}</text>

    ${premiumPill}

    <line x1="64" y1="224" x2="${CARD_WIDTH - 64}" y2="224" stroke="${COLOR.cardBorder}" />

    <!-- สถิติ -->
    ${statCard({
      x: 64,
      label: '7 วันล่าสุด',
      value: formatVoiceDuration(stats.last7Ms),
      hint: `เข้าห้อง ${stats.last7Sessions} ครั้ง`,
      accent: COLOR.accent,
    })}
    ${statCard({
      x: 360,
      label: '30 วันล่าสุด',
      value: formatVoiceDuration(stats.last30Ms),
      hint: `เข้าห้อง ${stats.last30Sessions} ครั้ง`,
      accent: COLOR.accentSoft,
    })}
    ${thirdCard}

    ${rankLine}

    <!-- ท้ายการ์ด -->
    <line x1="64" y1="536" x2="${CARD_WIDTH - 64}" y2="536" stroke="${COLOR.cardBorder}" />
    <text x="64" y="576" font-family="Sarabun" font-size="18" fill="${COLOR.dim}">เข้าห้องเสียงทั้งหมด ${stats.joins} ครั้ง · ข้อมูลจากฐานข้อมูล</text>
    <text x="${CARD_WIDTH - 64}" y="576" text-anchor="end" font-family="Sarabun" font-size="18" fill="${COLOR.dim}">rem-bot.vercel.app</text>
  </svg>`;
}

/** เรนเดอร์การ์ดเป็น PNG — คืน Buffer พร้อมส่งเป็นไฟล์ใน Discord */
export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer> {
  const avatar = await avatarDataUri(input.avatarUrl);
  const svg = buildSvg(input, avatar);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
    font: {
      fontFiles: [FONT_REGULAR, FONT_BOLD].filter((file) => fs.existsSync(file)),
      loadSystemFonts: false,
      defaultFontFamily: 'Sarabun',
    },
    background: COLOR.bgFrom,
  });

  return resvg.render().asPng();
}
