/**
 * src/utils/profileCard.ts
 * เรนเดอร์ "การ์ดสมาชิก" เป็นรูป PNG (ไม่ใช้ embed)
 *
 * วิธีทำ: สร้าง SVG (ข้อความ + รูปโปรไฟล์ base64) แล้วเรนเดอร์เป็น PNG ด้วย @resvg/resvg-js
 *  - ฟอนต์: Anuphan (ฟอนต์ชุดเดียวกับเว็บ) ฝังใน repo ที่ assets/fonts
 *  - โทนสี: ส้ม–น้ำตาลอุ่น (orange accent)
 *  - ไม่มีส่วน Premium แล้ว — ทุกคนเห็นสถิติเต็ม
 */
import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import { formatVoiceDuration } from './voiceStats';

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 560;

const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Anuphan-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'Anuphan-Bold.ttf');
const FONT_FAMILY = 'Anuphan';

const COLOR = {
  bgFrom: '#1b1310',
  bgTo: '#2b1a12',
  card: '#241712',
  cardBorder: '#3d2a20',
  band: '#2a1a13',
  accent: '#ff8c42',
  accentSoft: '#ffb37a',
  gold: '#ffd166',
  text: '#fff4ec',
  muted: '#d0b3a3',
  dim: '#96796b',
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

/** สระ/วรรณยุกต์ไทยที่ไม่กินความกว้าง (วางซ้อนบนพยัญชนะ) */
function isThaiMark(code: number): boolean {
  return code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
}

/** ประมาณความกว้างข้อความ (px) — Anuphan ค่อนข้างแคบ ใช้กันข้อความล้นการ์ด */
function estimateWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isThaiMark(code)) continue;
    if (code === 0x20) em += 0.24;
    else if (char >= 'A' && char <= 'Z') em += 0.66;
    else if (char >= 'a' && char <= 'z') em += 0.54;
    else if (char >= '0' && char <= '9') em += 0.56;
    else if ('.,:;!|\'’'.includes(char)) em += 0.25;
    else if (code >= 0x0e00 && code <= 0x0e7f) em += 0.5;
    else em += 0.56;
  }
  return em * fontSize;
}

/** ตัดข้อความให้พอดีความกว้างที่กำหนด (เติม … ถ้าต้องตัด) */
function clipToWidth(value: string, maxWidth: number, fontSize: number): string {
  if (estimateWidth(value, fontSize) <= maxWidth) return value;
  const chars = [...value];
  let current = '';
  for (const char of chars) {
    if (estimateWidth(`${current}${char}…`, fontSize) > maxWidth) break;
    current += char;
  }
  return `${current.trimEnd()}…`;
}

/** เลือกขนาดตัวอักษรใหญ่สุดที่ยังพอดีความกว้าง (คืนขนาด + ข้อความที่ตัดแล้ว) */
function fitValue(value: string, maxWidth: number): { text: string; size: number } {
  for (const size of [36, 32, 28, 24, 20]) {
    if (estimateWidth(value, size) <= maxWidth) return { text: value, size };
  }
  return { text: clipToWidth(value, maxWidth, 20), size: 20 };
}

const TH_DATE = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

const TH_DATETIME = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
});

function thaiDate(date: Date | null): string {
  return date ? TH_DATE.format(date) : '—';
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

/** การ์ดสถิติ 1 ใบ (พื้นเข้ม + แถบสีส้มด้านซ้าย) */
function statCard(options: { x: number; label: string; value: string; hint: string; accent: string }): string {
  const { x, label, value, hint, accent } = options;
  const y = 248;
  const width = 280;
  const height = 160;
  const fitted = fitValue(value, width - 52);

  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22"
            fill="${COLOR.card}" stroke="${COLOR.cardBorder}" />
      <rect x="${x}" y="${y + 26}" width="5" height="${height - 52}" rx="2.5" fill="${accent}" />
      <text x="${x + 26}" y="${y + 46}" font-family="${FONT_FAMILY}" font-size="18"
            fill="${COLOR.muted}">${esc(label)}</text>
      <text x="${x + 26}" y="${y + 104}" font-family="${FONT_FAMILY}" font-size="${fitted.size}"
            font-weight="700" fill="${COLOR.text}">${esc(fitted.text)}</text>
      <text x="${x + 26}" y="${y + 136}" font-family="${FONT_FAMILY}" font-size="17"
            fill="${COLOR.dim}">${esc(hint)}</text>
    </g>`;
}

/** สร้าง SVG ทั้งใบ */
function buildSvg(input: ProfileCardInput, avatar: string | null): string {
  const { displayName, username, guildName, joinedAt, rank, stats } = input;

  const rankText = rank ? `#${rank.place} จาก ${rank.total} คน` : 'ยังไม่ถูกจัดอันดับ';
  const guildLine = `${clipToWidth(guildName, 420, 17)} · เข้าร่วม ${thaiDate(joinedAt)}`;
  const channelText = stats.topChannel ? clipToWidth(stats.topChannel, 190, 24) : '—';

  const avatarBlock = avatar
    ? `<image href="${avatar}" x="54" y="58" width="148" height="148"
              clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<text x="128" y="160" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="58"
             font-weight="700" fill="${COLOR.accentSoft}">${esc([...displayName][0] ?? '?')}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLOR.bgFrom}" />
        <stop offset="100%" stop-color="${COLOR.bgTo}" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${COLOR.accent}" stop-opacity="0.30" />
        <stop offset="100%" stop-color="${COLOR.accent}" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${COLOR.accentSoft}" />
        <stop offset="60%" stop-color="${COLOR.accent}" />
        <stop offset="100%" stop-color="#c2561f" />
      </linearGradient>
      <clipPath id="avatarClip">
        <circle cx="128" cy="132" r="74" />
      </clipPath>
    </defs>

    <!-- พื้นหลัง -->
    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)" />
    <circle cx="905" cy="30" r="300" fill="url(#glow)" />
    <circle cx="40" cy="560" r="240" fill="url(#glow)" opacity="0.45" />

    <!-- แถบสีส้มบางด้านบน (เอกลักษณ์การ์ด) -->
    <rect x="0" y="0" width="${CARD_WIDTH}" height="4" fill="url(#ring)" />

    <!-- หัวการ์ด -->
    <text x="64" y="40" font-family="${FONT_FAMILY}" font-size="13" letter-spacing="3.4"
          fill="${COLOR.accent}">RURU · MEMBER CARD</text>
    <text x="64" y="64" font-family="${FONT_FAMILY}" font-size="13" letter-spacing="2.6"
          fill="${COLOR.dim}">VOICE LOG PROFILE</text>

    <!-- รูปโปรไฟล์ + ขอบไล่สี -->
    <circle cx="128" cy="132" r="82" fill="none" stroke="url(#ring)" stroke-width="4" opacity="0.95" />
    <circle cx="128" cy="132" r="74" fill="#221510" />
    ${avatarBlock}

    <!-- ชื่อ / @username / เซิร์ฟเวอร์ + วันที่เข้าร่วม -->
    <text x="232" y="118" font-family="${FONT_FAMILY}" font-size="44" font-weight="700"
          fill="${COLOR.text}">${esc(clipToWidth(displayName, 540, 44))}</text>
    <text x="232" y="152" font-family="${FONT_FAMILY}" font-size="20"
          fill="${COLOR.accentSoft}">@${esc(clipToWidth(username, 520, 20))}</text>
    <text x="232" y="184" font-family="${FONT_FAMILY}" font-size="17"
          fill="${COLOR.muted}">${esc(guildLine)}</text>

    <line x1="64" y1="222" x2="${CARD_WIDTH - 64}" y2="222" stroke="${COLOR.cardBorder}" />

    <!-- สถิติ 3 ช่วง -->
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
    ${statCard({
      x: 656,
      label: 'ตลอดกาล',
      value: formatVoiceDuration(stats.allMs),
      hint: `เข้าห้อง ${stats.allSessions} ครั้ง`,
      accent: COLOR.gold,
    })}

    <!-- แถบอันดับ + ห้องยอดนิยม -->
    <rect x="64" y="428" width="${CARD_WIDTH - 128}" height="76" rx="20"
          fill="${COLOR.band}" stroke="${COLOR.cardBorder}" />

    <text x="92" y="456" font-family="${FONT_FAMILY}" font-size="16" fill="${COLOR.dim}">อันดับในเซิร์ฟเวอร์</text>
    <text x="92" y="484" font-family="${FONT_FAMILY}" font-size="24" font-weight="700"
          fill="${COLOR.gold}">${esc(rankText)}</text>

    <line x1="380" y1="444" x2="380" y2="488" stroke="${COLOR.cardBorder}" />
    <text x="408" y="456" font-family="${FONT_FAMILY}" font-size="16" fill="${COLOR.dim}">ห้องยอดนิยม</text>
    <text x="408" y="484" font-family="${FONT_FAMILY}" font-size="24" font-weight="700"
          fill="${COLOR.text}">${esc(channelText)}</text>

    <line x1="700" y1="444" x2="700" y2="488" stroke="${COLOR.cardBorder}" />
    <text x="728" y="456" font-family="${FONT_FAMILY}" font-size="16" fill="${COLOR.dim}">เข้าห้องทั้งหมด</text>
    <text x="728" y="484" font-family="${FONT_FAMILY}" font-size="24" font-weight="700"
          fill="${COLOR.accentSoft}">${stats.joins} ครั้ง</text>

    <!-- ท้ายการ์ด -->
    <text x="64" y="540" font-family="${FONT_FAMILY}" font-size="14"
          fill="${COLOR.dim}">อัปเดต ${esc(TH_DATETIME.format(new Date()))} น.</text>
    <text x="${CARD_WIDTH - 64}" y="540" text-anchor="end" font-family="${FONT_FAMILY}"
          font-size="15" font-weight="700" letter-spacing="2" fill="${COLOR.accent}">RURU</text>
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
      defaultFontFamily: FONT_FAMILY,
    },
    background: COLOR.bgFrom,
  });

  return resvg.render().asPng();
}

/** วันที่แบบเต็มสำหรับข้อความ fallback (ใช้เมื่อเรนเดอร์รูปไม่สำเร็จ) */
export function profileFallbackDate(date: Date | null): string {
  return thaiDate(date);
}
