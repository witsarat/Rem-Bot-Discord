/**
 * test-presence.ts — ทดสอบระบบ Rich Presence (normalize + อ่าน/เขียน DB จริง)
 * รัน: npx tsx test-presence.ts
 */
import 'dotenv/config';
import { initDb, getBotPresenceDb, setBotPresenceDb, isDbReady } from './src/utils/db';
import { normalizePresence, loadPresence, DEFAULT_PRESENCE } from './src/utils/presence';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`);
  }
}

async function main(): Promise<void> {
  console.log('=== 1) ทดสอบ normalize ===');
  check(
    'ค่าปกติผ่านครบ',
    JSON.stringify(normalizePresence({ activityType: 'Playing', activityText: 'hello', status: 'dnd' })) ===
      JSON.stringify({ activityType: 'Playing', activityText: 'hello', status: 'dnd' }),
  );
  check('ชนิดกิจกรรมไม่รู้จัก → Watching', normalizePresence({ activityType: 'Flying' }).activityType === 'Watching');
  check('สถานะไม่รู้จัก → online', normalizePresence({ status: 'away' }).status === 'online');
  check('ข้อความว่าง → ค่าเริ่มต้น', normalizePresence({ activityText: '   ' }).activityText === DEFAULT_PRESENCE.activityText);
  check('ข้อความยาวเกิน 128 → ถูกตัด', normalizePresence({ activityText: 'x'.repeat(300) }).activityText.length === 128);
  check('null → ค่าเริ่มต้นทั้งหมด', JSON.stringify(normalizePresence(null)) === JSON.stringify(DEFAULT_PRESENCE));

  console.log('\n=== 2) ทดสอบกับ DB จริง ===');
  await initDb();
  check('เชื่อมต่อ DB + สร้างตารางสำเร็จ', isDbReady());

  if (isDbReady()) {
    const before = await getBotPresenceDb();
    console.log('ค่าใน DB ก่อนเริ่ม:', JSON.stringify(before));

    const okSave = await setBotPresenceDb({ activityType: 'Listening', activityText: 'ทดสอบระบบ ✨', status: 'idle' });
    check('บันทึกค่าทดสอบลง DB ได้', okSave);

    const saved = await getBotPresenceDb();
    check(
      'อ่านกลับได้ตรงกับที่บันทึก',
      saved?.activityType === 'Listening' && saved?.activityText === 'ทดสอบระบบ ✨' && saved?.status === 'idle',
    );

    const loaded = await loadPresence();
    check('loadPresence() เห็นค่าล่าสุด', loaded.activityText === 'ทดสอบระบบ ✨' && loaded.status === 'idle');

    const restored = await setBotPresenceDb({ ...DEFAULT_PRESENCE });
    const after = await getBotPresenceDb();
    check(
      'คืนค่าเริ่มต้นเรียบร้อย',
      restored && after?.activityType === 'Watching' && after?.activityText === 'บันทึก Voice Log 🔊' && after?.status === 'online',
    );
  }

  console.log(`\nผลรวม: ${passed}/${passed + failed} ผ่าน`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
