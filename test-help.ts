/**
 * test-help.ts — ตรวจโครงสร้างเมนู /help (ไม่ต้องต่อ Discord)
 * รัน: npx tsx test-help.ts
 */
import { HELP_PAGE_COUNT, buildHelpPage } from './src/commands/help';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

function rows(page: ReturnType<typeof buildHelpPage>) {
  return page.components.map((row) => row.toJSON());
}

function main() {
  check('มี 5 หมวด', HELP_PAGE_COUNT === 5);

  const titles = new Set<string>();
  for (let i = 0; i < HELP_PAGE_COUNT; i++) {
    const page = buildHelpPage(i);
    const json = page.embed.toJSON();
    titles.add(String(json.title));

    check(`หน้า ${i + 1} มีหัวข้อและคำอธิบาย`, Boolean(json.title && json.description));
    check(`หน้า ${i + 1} มีฟิลด์`, (json.fields?.length ?? 0) > 0, `${json.fields?.length ?? 0} ฟิลด์`);

    const ui = rows(page);
    const select = ui[0];
    const buttons = ui[1];
    check(`หน้า ${i + 1} มีเมนูเลือกหมวด 5 ตัวเลือก`, select.components[0].type === 3 && (select.components[0] as any).options.length === 5);
    check(`หน้า ${i + 1} มีปุ่ม 3 ปุ่ม`, buttons.components.length === 3);

    const [prev, next, close] = buttons.components as any[];
    check(`หน้า ${i + 1}: prev ${i === 0 ? 'ถูกปิด' : 'กดได้'}`, prev.disabled === (i === 0));
    check(`หน้า ${i + 1}: next ${i === HELP_PAGE_COUNT - 1 ? 'ถูกปิด' : 'กดได้'}`, next.disabled === (i === HELP_PAGE_COUNT - 1));
    check(`หน้า ${i + 1}: มีปุ่มปิด`, close.style === 4);

    const selected = (select.components[0] as any).options.findIndex((o: any) => o.default);
    check(`หน้า ${i + 1}: ไฮไลต์หมวดปัจจุบัน`, selected === i, `default index ${selected}`);

    const hasImage = Boolean(json.image?.url);
    check(`หน้า ${i + 1}: ${i === 0 ? 'มีภาพแบนเนอร์' : 'ไม่มีภาพ'}`, hasImage === (i === 0), json.image?.url ?? '-');
    check(`หน้า ${i + 1}: ไฟล์แนบ ${i === 0 ? '1' : '0'}`, page.files.length === (i === 0 ? 1 : 0));
  }

  check('หัวข้อทั้ง 5 หน้าไม่ซ้ำกัน', titles.size === HELP_PAGE_COUNT, [...titles].join(' | '));

  const clampedLow = buildHelpPage(-5);
  const clampedHigh = buildHelpPage(99);
  check('index ติดลบถูก clamp เป็นหน้าแรก', clampedLow.page === 0);
  check('index เกินถูก clamp เป็นหน้าสุดท้าย', clampedHigh.page === HELP_PAGE_COUNT - 1);

  console.log(failures === 0 ? '\n🎉 ผ่านทั้งหมด!' : `\n❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
