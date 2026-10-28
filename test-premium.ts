/**
 * test-premium.ts — ทดสอบระบบ Premium (29 บาท/เดือน) + การ์ด /profile
 * รันด้วย: PGSSLMODE=disable DATABASE_URL=postgres://localhost/rem_bot_test npx tsx test-premium.ts
 * (ต้องมีฐานข้อมูลว่างสำหรับทดสอบ — ไฟล์นี้จะสร้างตารางเองและล้างข้อมูลทดสอบทิ้ง)
 */
import 'dotenv/config';
import { getPool, getWeeklyTargets, initDb, isDbReady, markWeeklySent, setWeeklyChannelDb } from './src/utils/db';
import {
  grantPremium,
  isBotOwner,
  isPremium,
  getPremiumState,
  PREMIUM_PRICE_THB,
  revokePremium,
} from './src/utils/premium';
import { getUserVoiceStats } from './src/utils/voiceStats';

const TEST_GUILD = '999900000000000777';
const DAY = 86_400_000;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function near(actual: number, expected: number, toleranceMs = 60_000): boolean {
  return Math.abs(actual - expected) <= toleranceMs;
}

async function main(): Promise<void> {
  await initDb();
  check('DB เชื่อมต่อ + สร้างตาราง guild_subscriptions สำเร็จ', isDbReady());

  const pool = getPool();
  if (!pool || !isDbReady()) {
    console.log('❌ DB ไม่พร้อม — หยุดทดสอบ');
    process.exit(1);
  }

  // ตรวจว่าตารางมีจริง
  const table = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM information_schema.tables
      WHERE table_name = 'guild_subscriptions'`,
  );
  check('ตาราง guild_subscriptions มีอยู่ในฐานข้อมูล', table.rows[0]?.count === '1');

  // ล้างข้อมูลทดสอบเก่า
  await pool.query('DELETE FROM guild_subscriptions WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM guild_settings WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM voice_logs WHERE guild_id = $1', [TEST_GUILD]);

  // ── 1) ยังไม่สมัคร = ฟรี ─────────────────────────────────────
  check('ยังไม่สมัคร → ไม่ใช่ Premium', (await isPremium(TEST_GUILD)) === false);

  // ── 2) เปิดใช้ 30 วัน ───────────────────────────────────────
  const first = await grantPremium({ guildId: TEST_GUILD, grantedBy: 'owner-1', note: 'ทดสอบ' });
  check('grantPremium สำเร็จ', first !== null);
  const state1 = await getPremiumState(TEST_GUILD, { skipCache: true });
  check('เปิดใช้แล้ว → เป็น Premium', state1.premium);
  check(`ราคาที่บันทึก = ${PREMIUM_PRICE_THB} บาท`, state1.priceThb === PREMIUM_PRICE_THB, `ได้ ${state1.priceThb}`);
  check('เหลือ ~30 วัน', state1.daysLeft === 30 || state1.daysLeft === 29, `ได้ ${state1.daysLeft}`);
  check('บันทึกผู้เปิดใช้ (granted_by)', state1.subscription?.grantedBy === 'owner-1');
  check('สถานะ = active', state1.subscription?.status === 'active');

  // ── 3) ต่ออายุซ้ำ → ต่อจากวันเดิม ไม่ทับของเก่า ───────────────
  const second = await grantPremium({ guildId: TEST_GUILD, days: 30 });
  const end1 = first?.currentPeriodEnd ? new Date(first.currentPeriodEnd).getTime() : 0;
  const end2 = second?.currentPeriodEnd ? new Date(second.currentPeriodEnd).getTime() : 0;
  check('ต่ออายุแล้ววันหมดอายุเพิ่มขึ้น ~30 วัน', near(end2 - end1, 30 * DAY), `${(end2 - end1) / DAY} วัน`);

  // ── 4) หมดอายุเอง → กลับเป็นฟรี ──────────────────────────────
  await pool.query(
    `UPDATE guild_subscriptions SET current_period_end = now() - interval '1 day' WHERE guild_id = $1`,
    [TEST_GUILD],
  );
  check('เลยวันหมดอายุ → ไม่ใช่ Premium (อัตโนมัติ)', (await isPremium(TEST_GUILD)) === false);
  check(
    'สถานะยังเป็น active แต่หมดอายุ (ข้อมูลไม่ถูกลบ)',
    (await getPremiumState(TEST_GUILD, { skipCache: true })).subscription?.status === 'active',
  );

  // ── 5) ต่ออายุหลังหมดอายุ → นับจากตอนนี้ ──────────────────────
  const renewed = await grantPremium({ guildId: TEST_GUILD, days: 30 });
  const renewedMs = renewed?.currentPeriodEnd ? new Date(renewed.currentPeriodEnd).getTime() : 0;
  check('ต่ออายุหลังหมดอายุ → ~30 วันจากนี้', near(renewedMs - Date.now(), 30 * DAY), `${((renewedMs - Date.now()) / DAY).toFixed(2)} วัน`);

  // ── 6) รายงานประจำสัปดาห์เห็นสถานะ Premium ──────────────────
  await setWeeklyChannelDb(TEST_GUILD, '123456789012345678');
  await markWeeklySent(TEST_GUILD);
  let target = (await getWeeklyTargets()).find((row) => row.guildId === TEST_GUILD);
  check('เซิร์ฟเวอร์ Premium → target.premium = true', target?.premium === true, JSON.stringify(target));

  // ── 7) ยกเลิก → ฟรีทันที + target.premium = false ────────────
  check('revokePremium สำเร็จ', (await revokePremium(TEST_GUILD)) === true);
  check('ยกเลิกแล้ว → ไม่ใช่ Premium', (await isPremium(TEST_GUILD)) === false);
  check(
    'สถานะ = revoked',
    (await getPremiumState(TEST_GUILD, { skipCache: true })).subscription?.status === 'revoked',
  );
  target = (await getWeeklyTargets()).find((row) => row.guildId === TEST_GUILD);
  check('เซิร์ฟเวอร์ฟรี → target.premium = false', target?.premium === false, JSON.stringify(target));
  check('revoke ซ้ำยังคืน true (มีแถวอยู่)', (await revokePremium(TEST_GUILD)) === true);

  // ── 8) เจ้าของบอท (OWNER_ID) ───────────────────────────────
  const previousOwner = process.env.OWNER_ID;
  process.env.OWNER_ID = '111111111111111111,222222222222222222';
  check('OWNER_ID ตรง → เป็นเจ้าของบอท', isBotOwner('222222222222222222'));
  check('OWNER_ID ไม่ตรง → ไม่ใช่เจ้าของบอท', isBotOwner('333333333333333333') === false);
  process.env.OWNER_ID = previousOwner;

  // ── 9) สถิติการ์ด /profile: 7 วัน / 30 วัน / ทั้งหมด ──────────
  const now = Date.now();
  const rows: Array<[string, string, Date]> = [
    ['userP', 'A', new Date(now - 40 * DAY)], // เข้า 40 วันก่อน
    ['userP', 'A', new Date(now - 39 * DAY)], // ออก 39 วันก่อน → 1 วัน (เฉพาะทั้งหมด)
    ['userP', 'B', new Date(now - 20 * DAY)], // เข้า 20 วันก่อน
    ['userP', 'B', new Date(now - 19 * DAY)], // ออก 19 วันก่อน → 1 วัน (30 วัน + ทั้งหมด)
    ['userP', 'A', new Date(now - 3 * DAY)], // เข้า 3 วันก่อน
    ['userP', 'A', new Date(now - 2 * DAY)], // ออก 2 วันก่อน → 1 วัน (7/30/ทั้งหมด)
  ];

  let cursor = 0;
  for (const [userId, channel, createdAt] of rows) {
    const event = cursor % 2 === 0 ? 'join' : 'leave';
    await pool.query(
      `INSERT INTO voice_logs (guild_id, user_id, username, event, channel_id, channel_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [TEST_GUILD, userId, 'Poom', event, `chan-${channel}`, channel, createdAt],
    );
    cursor += 1;
  }

  const stats = await getUserVoiceStats(TEST_GUILD, 'userP');
  check('getUserVoiceStats คืนค่าได้', stats !== null);
  if (stats) {
    check('7 วัน ≈ 1 วัน', near(stats.last7.totalMs, DAY) && stats.last7.sessions === 1, JSON.stringify(stats.last7));
    check('30 วัน ≈ 2 วัน', near(stats.last30.totalMs, 2 * DAY) && stats.last30.sessions === 2, JSON.stringify(stats.last30));
    check('ทั้งหมด ≈ 3 วัน', near(stats.all.totalMs, 3 * DAY) && stats.all.sessions === 3, JSON.stringify(stats.all));
    check('จำนวนครั้งที่เข้าห้อง = 3', stats.joins === 3, `ได้ ${stats.joins}`);
    check('ห้องยอดนิยม = A (2 ครั้ง)', stats.topChannel?.name === 'A' && stats.topChannel?.count === 2, JSON.stringify(stats.topChannel));
  }

  // ── เก็บกวาด ────────────────────────────────────────────────
  await pool.query('DELETE FROM voice_logs WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM guild_settings WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM guild_subscriptions WHERE guild_id = $1', [TEST_GUILD]);
  await pool.end();

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาดระหว่างทดสอบ:', error);
  process.exit(1);
});
