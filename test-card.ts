/**
 * test-card.ts — ตรวจการ์ด PNG (ขนาด, ธีม, ชื่อผู้ใช้ยาว/อีโมจิ, ค่าขยะ)
 * รัน: npx tsx test-card.ts
 */
import fs from 'fs';
import { PROFILE_CARD_SIZE, WEEKLY_CARD_SIZE, renderProfileCard, renderWeeklyCard, type ProfileCardInput } from './src/utils/profileCard';
import { CARD_PRESETS, resolveTheme } from './src/utils/cardLayout';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const base: ProfileCardInput = {
  username: 'specialxr',
  avatarUrl: null,
  guildName: 'Ruru Community',
  joinedAt: new Date('2025-03-14T10:00:00Z'),
  rank: { place: 3, total: 24 },
  stats: { last7Ms: 4 * 3600e3 + 15 * 60e3, last7Sessions: 6, last30Ms: 30 * 3600e3, last30Sessions: 18, allMs: 120 * 3600e3, allSessions: 240, joins: 240, topChannel: 'General Voice 🔊' },
};

const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

async function main() {
  const png = await renderProfileCard(base, resolveTheme('ruru'));
  check('การ์ด /profile เป็น PNG', png.subarray(0, 4).equals(SIG));
  check('ขนาด 800×448', pngSize(png).width === PROFILE_CARD_SIZE.width && pngSize(png).height === PROFILE_CARD_SIZE.height, JSON.stringify(pngSize(png)));
  check('PROFILE_CARD_SIZE = 800×448', PROFILE_CARD_SIZE.width === 800 && PROFILE_CARD_SIZE.height === 448);

  const weekly = await renderWeeklyCard(
    {
      guildName: 'Ruru Community', from: new Date('2026-10-19'), to: new Date('2026-10-25'), participants: 18,
      totalMs: 96 * 3600e3, topChannel: { name: 'General Voice', count: 64 },
      rows: [
        { username: 'Zee ✨', totalMs: 32 * 3600e3, sessions: 14 },
        { username: 'Nana', totalMs: 21 * 3600e3, sessions: 9 },
      ],
    },
    resolveTheme('arctic'),
  );
  check('การ์ด Weekly 800×496', pngSize(weekly).width === WEEKLY_CARD_SIZE.width && pngSize(weekly).height === WEEKLY_CARD_SIZE.height, JSON.stringify(pngSize(weekly)));

  // ธีมทั้งหมดเรนเดอร์ได้ และได้ไฟล์ต่างกันจริง
  const hashes = new Set<string>();
  for (const preset of CARD_PRESETS) {
    const out = await renderProfileCard(base, preset);
    hashes.add(out.toString('base64').slice(0, 64) + out.length);
  }
  check('ทั้ง 16 ธีมเรนเดอร์ได้ และสีต่างกัน', hashes.size === CARD_PRESETS.length, `${hashes.size}/${CARD_PRESETS.length}`);

  const longName = await renderProfileCard({ ...base, username: 'a'.repeat(64) + '🎧' }, resolveTheme('ruru'));
  check('ชื่อผู้ใช้ยาว 64+ ตัวอักษรยังเรนเดอร์ได้', longName.length > 10_000);
  const weird = await renderProfileCard({ ...base, username: '<script> & "ผิดปกติ" ٩(ˊᗜˋ*)و' }, resolveTheme('midnight'));
  check('อักษรพิเศษ/อีโมจิไม่ทำให้พัง', weird.length > 10_000);

  const unknown = await renderProfileCard(base, resolveTheme('ไม่มีธีมนี้'));
  check('ธีมที่ไม่รู้จัก → ใช้ธีมเริ่มต้น', unknown.length > 10_000);

  fs.writeFileSync('/tmp/card-test-profile.png', png);
  console.log(failures === 0 ? '\n🎉 ผ่านทั้งหมด!' : `\n❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
