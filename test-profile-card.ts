/**
 * test-profile-card.ts — ทดสอบการเรนเดอร์การ์ดสมาชิก (/profile) เป็นรูป PNG
 * รันด้วย: npx tsx test-profile-card.ts   (ไม่ต้องใช้ฐานข้อมูล/โทเคน)
 * ไฟล์ผลลัพธ์: .data/profile-card-premium.png, .data/profile-card-free.png
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { renderProfileCard, type ProfileCardInput } from './src/utils/profileCard';

const OUT_DIR = path.join(process.cwd(), '.data');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const base: ProfileCardInput = {
  displayName: 'SpecialXR',
  username: 'specialxr',
  avatarUrl: null,
  guildName: 'Rem Community',
  joinedAt: new Date('2025-03-14T10:00:00Z'),
  premium: true,
  rank: { place: 3, total: 24 },
  stats: {
    last7Ms: 4 * 3_600_000 + 15 * 60_000,
    last7Sessions: 6,
    last30Ms: 26 * 3_600_000,
    last30Sessions: 18,
    allMs: 122 * 3_600_000,
    allSessions: 96,
    joins: 112,
    topChannel: 'General',
  },
};

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const hash = (buffer: Buffer): string => crypto.createHash('sha1').update(buffer).digest('hex');

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── 1) การ์ด Premium ─────────────────────────────────────────
  const premiumPng = await renderProfileCard(base);
  fs.writeFileSync(path.join(OUT_DIR, 'profile-card-premium.png'), premiumPng);

  check('ได้ไฟล์ PNG ที่ถูกต้อง (signature)', premiumPng.subarray(0, 8).equals(PNG_SIGNATURE));
  const size = pngSize(premiumPng);
  check('ขนาด 1000 × 620 px', size.width === 1000 && size.height === 620, `${size.width}×${size.height}`);
  check('ไฟล์มีเนื้อหา (มากกว่า 20 KB)', premiumPng.length > 20_000, `${(premiumPng.length / 1024).toFixed(1)} KB`);

  // ── 2) การ์ดแพ็กเกจฟรี (บล็อกตลอดกาล) ต้องต่างจาก Premium ──────
  const freePng = await renderProfileCard({ ...base, premium: false, rank: null });
  fs.writeFileSync(path.join(OUT_DIR, 'profile-card-free.png'), freePng);
  check('การ์ดฟรีเรนเดอร์ได้', freePng.subarray(0, 8).equals(PNG_SIGNATURE));
  check('การ์ดฟรี ≠ การ์ด Premium (มีส่วนล็อก)', hash(freePng) !== hash(premiumPng));

  // ── 3) ชื่อที่มีอักขระ XML ต้องไม่ทำให้พัง ─────────────────────
  let escapedOk = true;
  let escapedDetail = '';
  try {
    const weird = await renderProfileCard({
      ...base,
      displayName: '<script> & "ผิดปกติ"',
      username: 'a&b<c>',
      guildName: 'เซิร์ฟเวอร์ <ทดสอบ> & Co.',
      joinedAt: null,
      rank: null,
      stats: { ...base.stats, topChannel: null },
    });
    escapedOk = weird.length > 10_000;
    escapedDetail = `${(weird.length / 1024).toFixed(1)} KB`;
  } catch (error) {
    escapedOk = false;
    escapedDetail = error instanceof Error ? error.message : String(error);
  }
  check('escape ชื่อผู้ใช้/ชื่อเซิร์ฟเวอร์ได้ (ไม่ทำให้ SVG พัง)', escapedOk, escapedDetail);

  // ── 4) ข้อความยาวมากต้องถูกตัด ไม่ล้นการ์ด ─────────────────────
  const longPng = await renderProfileCard({
    ...base,
    displayName: 'ชื่อยาวมาก'.repeat(8),
    username: 'x'.repeat(40),
    guildName: 'เซิร์ฟเวอร์ที่ชื่อยาวมาก '.repeat(6),
    stats: { ...base.stats, allMs: 999 * 86_400_000, topChannel: 'ห้องเสียงชื่อยาวมากๆ' },
  });
  check('ชื่อ/ข้อความยาวเกินถูกตัดและยังเรนเดอร์ได้', longPng.length > 20_000);

  // ── 5) ไม่มีข้อมูลเลย (สมาชิกใหม่) ────────────────────────────
  const emptyPng = await renderProfileCard({
    ...base,
    premium: false,
    rank: null,
    joinedAt: null,
    stats: { last7Ms: 0, last7Sessions: 0, last30Ms: 0, last30Sessions: 0, allMs: 0, allSessions: 0, joins: 0, topChannel: null },
  });
  check('สมาชิกที่ยังไม่มีข้อมูล เรนเดอร์ได้ (0 วิ)', emptyPng.length > 15_000);

  console.log('');
  console.log(`ตัวอย่างรูป: ${path.join(OUT_DIR, 'profile-card-premium.png')}`);
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาดระหว่างทดสอบ:', error);
  process.exit(1);
});
