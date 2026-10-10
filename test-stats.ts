/**
 * test-stats.ts — ทดสอบชั่วคราว: ระบบสถิติ (/top) + กำหนดการรายงานประจำสัปดาห์
 * รันด้วย: npx tsx test-stats.ts   (ไฟล์นี้ใช้ทดสอบเท่านั้น — ลบได้หลังตรวจเสร็จ)
 */
import 'dotenv/config';
import {
  getPool,
  getWeeklyTargets,
  initDb,
  isDbReady,
  markWeeklySent,
  setWeeklyChannelDb,
} from './src/utils/db';
import { formatVoiceDuration, getVoiceLeaderboard } from './src/utils/voiceStats';
import { nextWeeklyReportAt } from './src/utils/weeklyReport';

const TEST_GUILD = '999900000000000001';
const MIN = 60_000;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  await initDb();
  check('DB เชื่อมต่อ + อัปเดตโครงสร้างสำเร็จ', isDbReady());
  const pool = getPool();
  if (!pool || !isDbReady()) {
    console.log('❌ DB ไม่พร้อม — หยุดทดสอบ');
    process.exit(1);
  }

  // ล้างข้อมูลทดสอบเก่า (ถ้ามี)
  await pool.query('DELETE FROM voice_logs WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM guild_settings WHERE guild_id = $1', [TEST_GUILD]);

  const now = Date.now();
  const t = (minAgo: number): Date => new Date(now - minAgo * MIN);

  // ── ข้อมูลจำลอง ──
  //  userA: อยู่ 3 ชม.ก่อน→2 ชม.ก่อน (60 น.) + 1.5 ชม.ก่อน→1 ชม.ก่อน (30 น.) = 90 น. / 2 ครั้ง
  //  userB: เข้า 45 น.ก่อน (ยังอยู่จริง — อยู่ใน openNow) = ~45 น. / 1 ครั้ง
  //  userC: เข้า 10 น.ก่อน → ออก 5 น.ก่อน = 5 น. / 1 ครั้ง
  //  userD: มีแค่ leave (ไม่มี join) → ต้องถูกข้าม
  //  userE: มีแค่ move → ต้องถูกข้าม
  //  userF: join ค้าง 20 น.ก่อน แต่ไม่ได้อยู่ในห้องจริง → ต้องไม่ถูกนับ
  const rows: Array<[string, string, string, string | null, Date]> = [
    ['userA', 'Alice', 'join', 'General 1', t(180)],
    ['userA', 'Alice', 'leave', 'General 1', t(120)],
    ['userA', 'Alice', 'join', 'General 1', t(90)],
    ['userA', 'Alice', 'leave', 'General 1', t(60)],
    ['userB', 'Bob', 'join', 'General 1', t(45)],
    ['userC', 'Champ', 'join', 'General 2', t(10)],
    ['userC', 'Champ', 'leave', 'General 2', t(5)],
    ['userD', 'Dang', 'leave', 'General 1', t(30)],
    ['userE', 'Ek', 'move', null, t(30)],
    ['userF', 'Fah', 'join', 'General 2', t(20)],
  ];
  for (const [userId, username, event, channelName, createdAt] of rows) {
    await pool.query(
      `INSERT INTO voice_logs (guild_id, user_id, username, event, channel_id, channel_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [TEST_GUILD, userId, username, event, channelName ? `chan-${channelName}` : null, channelName, createdAt],
    );
  }

  // ── ทดสอบ 1: อันดับทั้งหมด (openNow = {B}) ──
  const board = await getVoiceLeaderboard(TEST_GUILD, null, new Set(['userB']));
  check('ดึงสถิติได้ไม่เป็น null', board !== null);
  if (board) {
    const byId = new Map(board.rows.map((r) => [r.userId, r]));
    const a = byId.get('userA');
    const b = byId.get('userB');
    const c = byId.get('userC');
    check('userA = 90 น. / 2 ครั้ง', a?.totalMs === 90 * MIN && a?.sessions === 2, `ได้ ${a?.totalMs}ms / ${a?.sessions} ครั้ง`);
    check(
      'userB = ~45 น. / 1 ครั้ง (เซสชันเปิดนับถึงตอนนี้)',
      Boolean(b) && Math.abs((b?.totalMs ?? 0) - 45 * MIN) < 10_000 && b?.sessions === 1,
      `ได้ ${b?.totalMs}ms / ${b?.sessions} ครั้ง`,
    );
    check('userC = 5 น. / 1 ครั้ง', c?.totalMs === 5 * MIN && c?.sessions === 1, `ได้ ${c?.totalMs}ms / ${c?.sessions} ครั้ง`);
    check('ไม่มี userD (leave ลอย ไม่มี join)', !byId.has('userD'));
    check('ไม่มี userE (move ล้วน)', !byId.has('userE'));
    check('ไม่มี userF (join ค้างแต่ไม่ได้อยู่ในห้องจริง)', !byId.has('userF'));
    check('อันดับ 1 = userA', board.rows[0]?.userId === 'userA');
    check(
      'ผู้ร่วม 3 คน • รวม ~140 น.',
      board.participants === 3 && Math.abs(board.totalMs - 140 * MIN) < 10_000,
      `participants=${board.participants} total=${board.totalMs}ms`,
    );
    check(
      'ห้องยอดนิยม = General 1 (3 ครั้ง)',
      board.topChannel?.name === 'General 1' && board.topChannel?.count === 3,
      JSON.stringify(board.topChannel),
    );
  }

  // ── ทดสอบ 2: หน้าต่าง 60 นาทีล่าสุด ──
  const win = await getVoiceLeaderboard(TEST_GUILD, 60 * MIN, new Set(['userB']));
  if (win) {
    const byId = new Map(win.rows.map((r) => [r.userId, r]));
    check('หน้าต่าง 60 น.: userB = ~45 น.', Math.abs((byId.get('userB')?.totalMs ?? 0) - 45 * MIN) < 10_000);
    check('หน้าต่าง 60 น.: userC = 5 น.', byId.get('userC')?.totalMs === 5 * MIN);
    check('หน้าต่าง 60 น.: userA หลุดขอบ (เซสชันจบก่อน cutoff)', !byId.has('userA'));
  }

  // ── ทดสอบ 3: เวลาส่งรายงานถัดไป — จันทร์ 09:00 ไทย = จันทร์ 02:00 UTC ──
  const MON = Date.UTC(2026, 9, 12, 2, 0, 0); // จันทร์ 12 ต.ค. 2026 02:00 UTC
  check('จาก พ. 7 ต.ค. 03:00 → จ. 12 ต.ค. 02:00', nextWeeklyReportAt(Date.UTC(2026, 9, 7, 3, 0, 0)) === MON);
  check('จาก จ. 12 ต.ค. 01:00 → วันเดียวกัน 02:00', nextWeeklyReportAt(MON - 3_600_000) === MON);
  check('จาก จ. 12 ต.ค. 03:00 → จ. 19 ต.ค. 02:00', nextWeeklyReportAt(MON + 3_600_000) === Date.UTC(2026, 9, 19, 2, 0, 0));
  check('จุดที่ได้เป็นวันจันทร์ 02:00 UTC จริง', new Date(MON).getUTCDay() === 1 && new Date(MON).getUTCHours() === 2);

  // ── ทดสอบ 4: ฟอร์แมตเวลาไทย ──
  check('formatVoiceDuration(90 น.) = "1 ชม. 30 น."', formatVoiceDuration(90 * MIN) === '1 ชม. 30 น.');
  check('formatVoiceDuration(26 ชม.) = "1 วัน 2 ชม."', formatVoiceDuration(26 * 3_600_000) === '1 วัน 2 ชม.');
  check('formatVoiceDuration(45 วิ) = "45 วิ"', formatVoiceDuration(45_000) === '45 วิ');

  // ── ทดสอบ 5: เก็บ/อ่านค่าห้องรายงานประจำสัปดาห์ ──
  await setWeeklyChannelDb(TEST_GUILD, '123456789012345678');
  let mine = (await getWeeklyTargets()).find((x) => x.guildId === TEST_GUILD);
  check(
    'ตั้งห้องรายงาน → ปรากฏในเป้าหมาย (lastSent ว่าง)',
    mine?.channelId === '123456789012345678' && !mine?.lastSent,
    JSON.stringify(mine),
  );
  await markWeeklySent(TEST_GUILD);
  mine = (await getWeeklyTargets()).find((x) => x.guildId === TEST_GUILD);
  check('บันทึกเวลาส่งแล้ว → lastSent มีค่า', Boolean(mine?.lastSent), JSON.stringify(mine));
  await setWeeklyChannelDb(TEST_GUILD, null);
  mine = (await getWeeklyTargets()).find((x) => x.guildId === TEST_GUILD);
  check('ปิดรายงาน (null) → หลุดจากเป้าหมาย', !mine);

  // ── เก็บกวาดข้อมูลทดสอบ ──
  await pool.query('DELETE FROM voice_logs WHERE guild_id = $1', [TEST_GUILD]);
  await pool.query('DELETE FROM guild_settings WHERE guild_id = $1', [TEST_GUILD]);
  await pool.end();

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาดระหว่างทดสอบ:', error);
  process.exit(1);
});
