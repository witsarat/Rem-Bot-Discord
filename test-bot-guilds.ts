/**
 * test-bot-guilds.ts — ทดสอบตาราง bot_guilds (ซิงก์รายชื่อดิสที่บอทอยู่ลง DB)
 * รัน: npx tsx test-bot-guilds.ts
 */
import 'dotenv/config';
import { initDb, isDbReady, getPool, syncBotGuilds } from './src/utils/db';

const GUILD_A = '1067052518238072842'; // MasterDarkMD
const GUILD_B = '908695995808878612'; // REALFRI4ND

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

async function rowCount(): Promise<number> {
  const client = getPool();
  if (!client) return -1;
  const result = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM bot_guilds');
  return result.rows[0]?.n ?? -1;
}

async function main(): Promise<void> {
  await initDb();
  check('เชื่อมต่อ DB + สร้างตาราง bot_guilds สำเร็จ', isDbReady());

  await syncBotGuilds([GUILD_A]);
  check('ซิงก์ 1 ดิส → ได้ 1 แถว', (await rowCount()) === 1);

  await syncBotGuilds([GUILD_A, GUILD_B]);
  check('ซิงก์ 2 ดิส → ได้ 2 แถว', (await rowCount()) === 2);

  await syncBotGuilds([GUILD_B]);
  check('ลดเหลือ 1 ดิส → แถวส่วนเกินถูกลบ', (await rowCount()) === 1);

  await syncBotGuilds([GUILD_A, GUILD_B]);
  check('คืนค่า 2 ดิสจริง (MasterDarkMD + REALFRI4ND)', (await rowCount()) === 2);

  const client = getPool();
  if (client) {
    const rows = await client.query<{ guild_id: string }>('SELECT guild_id FROM bot_guilds ORDER BY guild_id');
    console.log('แถวปัจจุบัน:', rows.rows.map((row) => row.guild_id).join(', '));
  }

  console.log(`\nผลรวม: ${passed}/${passed + failed} ผ่าน`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
