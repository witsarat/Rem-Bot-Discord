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
    'ค่าพื้นฐานผ่านครบ',
    JSON.stringify(normalizePresence({ activityType: 'Playing', activityText: 'hello', status: 'dnd' })) ===
      JSON.stringify({
        ...DEFAULT_PRESENCE,
        activityType: 'Playing',
        activityText: 'hello',
        status: 'dnd',
      }),
  );
  check('ชนิดกิจกรรมไม่รู้จัก → Watching', normalizePresence({ activityType: 'Flying' }).activityType === 'Watching');
  check('สถานะไม่รู้จัก → online', normalizePresence({ status: 'away' }).status === 'online');
  check('ข้อความว่าง → ค่าเริ่มต้น', normalizePresence({ activityText: '   ' }).activityText === DEFAULT_PRESENCE.activityText);
  check('ข้อความยาวเกิน 128 → ถูกตัด', normalizePresence({ activityText: 'x'.repeat(300) }).activityText.length === 128);
  check(
    'รายละเอียด/สถานะ ถูกตัดที่ 128',
    normalizePresence({ details: 'd'.repeat(200), state: 's'.repeat(200) }).details.length === 128 &&
      normalizePresence({ state: 's'.repeat(200) }).state.length === 128,
  );
  check('ลิงก์ https ผ่าน', normalizePresence({ largeImage: 'https://example.com/a.png' }).largeImage === 'https://example.com/a.png');
  check('ลิงก์ http ถูกตัดทิ้ง', normalizePresence({ largeImage: 'http://example.com/a.png' }).largeImage === '');
  check(
    'ปุ่มครบคู่ → เก็บไว้',
    normalizePresence({ button1Label: 'เว็บ', button1Url: 'https://rem-bot.vercel.app' }).button1Label === 'เว็บ',
  );
  check(
    'ปุ่มไม่ครบ (ไม่มีลิงก์) → ตัดทิ้งทั้งคู่',
    normalizePresence({ button1Label: 'เว็บ', button1Url: '' }).button1Label === '' &&
      normalizePresence({ button1Label: 'เว็บ' }).button1Url === '',
  );
  check('ป้ายปุ่มยาวเกิน → ตัดที่ 32', normalizePresence({ button1Label: 'x'.repeat(60), button1Url: 'https://a.com' }).button1Label.length === 32);
  check('showElapsed กลายเป็น boolean', normalizePresence({ showElapsed: true }).showElapsed === true);
  check('null → ค่าเริ่มต้นทั้งหมด', JSON.stringify(normalizePresence(null)) === JSON.stringify(DEFAULT_PRESENCE));

  console.log('\n=== 2) ทดสอบกับ DB จริง ===');
  await initDb();
  check('เชื่อมต่อ DB + สร้าง/อัปเกรดตารางสำเร็จ', isDbReady());

  if (isDbReady()) {
    const demo = {
      activityType: 'Watching',
      activityText: 'บันทึกเสียงในดิสคอร์ด 🎧',
      status: 'online',
      details: 'กำลังทำงาน • พร้อมใช้ 24/7',
      state: 'เก็บประวัติห้องเสียงอัตโนมัติ',
      showElapsed: true,
      largeImage: 'https://example.com/large.png',
      largeText: 'Rem — Voice Log Bot',
      smallImage: '',
      smallText: '',
      button1Label: 'เพิ่มบอท',
      button1Url: 'https://discord.com/oauth2/authorize',
      button2Label: '',
      button2Url: '',
    };

    const okSave = await setBotPresenceDb(demo);
    check('บันทึกค่าทดสอบเต็มรูปแบบได้', okSave);

    const saved = await getBotPresenceDb();
    check(
      'อ่านกลับได้ครบ (details/state/elapsed/ปุ่ม)',
      saved?.details === demo.details &&
        saved?.state === demo.state &&
        saved?.showElapsed === true &&
        saved?.button1Label === 'เพิ่มบอท' &&
        saved?.largeImage === demo.largeImage,
    );

    const loaded = await loadPresence();
    check('loadPresence() เห็นค่าล่าสุด', loaded.state === demo.state && loaded.button1Label === 'เพิ่มบอท');

    const restored = await setBotPresenceDb({ ...DEFAULT_PRESENCE });
    const after = await getBotPresenceDb();
    check(
      'คืนค่าเริ่มต้นเรียบร้อย',
      restored && after?.activityText === 'บันทึก Voice Log 🔊' && after?.details === '' && after?.showElapsed === false,
    );
  }

  console.log(`\nผลรวม: ${passed}/${passed + failed} ผ่าน`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
