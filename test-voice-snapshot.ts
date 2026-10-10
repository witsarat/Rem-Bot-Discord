/**
 * test-voice-snapshot.ts — ทดสอบตาราง voice_snapshot (เขียน/อ่าน/ลบ)
 * รัน: npx tsx test-voice-snapshot.ts
 */
import 'dotenv/config';
import { initDb, isDbReady, getPool, setVoiceSnapshotDb, deleteVoiceSnapshotDb } from './src/utils/db';

const GUILD = '1067052518238072842'; // MasterDarkMD (ใช้ทดสอบแล้วลบทิ้ง — บอทจะเขียนของจริงทับ)

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
  await initDb();
  check('เชื่อมต่อ DB + สร้างตาราง voice_snapshot สำเร็จ', isDbReady());

  const demo = {
    channels: [{ id: '1', name: 'General', position: 0, userLimit: null }],
    occupants: [{ userId: '123', displayName: 'ทดสอบระบบ', avatar: null, channelId: '1' }],
  };

  check('เขียน snapshot ลง DB ได้', await setVoiceSnapshotDb(GUILD, demo));

  const client = getPool();
  if (client) {
    const read = await client.query<{ data: { channels: unknown[]; occupants: { displayName: string }[] } }>(
      'SELECT data FROM voice_snapshot WHERE guild_id = $1',
      [GUILD],
    );
    check(
      'อ่านกลับได้โครงสร้างถูกต้อง',
      read.rows.length === 1 &&
        read.rows[0].data.channels.length === 1 &&
        read.rows[0].data.occupants[0]?.displayName === 'ทดสอบระบบ',
    );

    await deleteVoiceSnapshotDb(GUILD);
    const after = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM voice_snapshot WHERE guild_id = $1',
      [GUILD],
    );
    check('ลบ snapshot ได้', after.rows[0]?.n === 0);
  }

  console.log(`\nผลรวม: ${passed}/${passed + failed} ผ่าน`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
