/**
 * check-top.ts — เช็คข้อมูลจริงของ /top แบบอ่านอย่างเดียว (ไม่เขียน DB)
 * รันด้วย: npx tsx check-top.ts   (ลบได้หลังเช็ค)
 */
import 'dotenv/config';
import { getPool, initDb } from './src/utils/db';
import { formatVoiceDuration, getVoiceLeaderboard } from './src/utils/voiceStats';

async function main(): Promise<void> {
  await initDb();
  for (const [gid, label] of [
    ['908695995808878612', 'REALFRI4ND'],
    ['1067052518238072842', 'MasterDarkMD'],
  ] as const) {
    const board = await getVoiceLeaderboard(gid, null, undefined);
    console.log('');
    console.log(`=== ${label} (${gid}) ===`);
    if (!board) {
      console.log('(null — DB ไม่พร้อม)');
      continue;
    }
    console.log(
      `ผู้ร่วม: ${board.participants} คน | เวลารวมทุกคน: ${formatVoiceDuration(board.totalMs)} | ห้องยอดนิยม: ${board.topChannel?.name ?? '-'} (${board.topChannel?.count ?? 0} ครั้ง)`,
    );
    board.rows.slice(0, 8).forEach((row, index) => {
      console.log(
        `${index + 1}. ${row.username} — รวม ${formatVoiceDuration(row.totalMs)} (${row.sessions} ครั้ง)`,
      );
    });
  }
  await getPool()?.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
