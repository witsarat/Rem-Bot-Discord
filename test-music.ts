/**
 * test-music.ts — ทดสอบระบบเพลงส่วนที่ไม่ใช่เสียง (ค้นหา/ดึงข้อมูล/สตรีม + Spotify)
 * รันด้วย: npx tsx test-music.ts
 */
import 'dotenv/config';
import { isSpotifyConfigured, parseSpotifyUrl } from './src/utils/spotify';
import { ensureYtDlp, getVideoInfo, searchYouTube, spawnAudioStream } from './src/utils/ytdlp';
import { formatTrackDuration } from './src/utils/music';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  // ── 1) yt-dlp binary ──
  const bin = await ensureYtDlp();
  check('หา/ติดตั้ง yt-dlp ได้', Boolean(bin), bin);

  // ── 2) ค้นหา YouTube ──
  const results = await searchYouTube('lofi hip hop relax', 3);
  check('ค้นหา YouTube ได้ผลลัพธ์', results.length > 0, `${results.length} รายการ`);
  check('ผลลัพธ์มี id/title/url ครบ', Boolean(results[0]?.id && results[0]?.title && results[0]?.url), results[0]?.title?.slice(0, 40));

  // ── 3) ดึงข้อมูลจากลิงก์ตรง ──
  const info = await getVideoInfo('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  check('ดึงข้อมูลวิดีโอจากลิงก์ได้', Boolean(info?.title), info?.title?.slice(0, 40));

  // ── 4) สตรีมจริง — ต้องเป็น WebM (EBML magic 1A 45 DF A3) เพื่อ passthrough ──
  const { child, stream } = await spawnAudioStream('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  const first = await new Promise<Buffer | null>((resolve) => {
    stream.once('data', (chunk: Buffer) => resolve(chunk));
    stream.once('error', () => resolve(null));
    stream.once('end', () => resolve(null));
    setTimeout(() => resolve(null), 25_000);
  });
  child.kill('SIGKILL');
  const isWebm =
    first !== null && first.length >= 4 && first[0] === 0x1a && first[1] === 0x45 && first[2] === 0xdf && first[3] === 0xa3;
  check('สตรีมเสียงได้ + เป็น WebM/Opus (passthrough ได้)', first !== null && first.length > 0 && isWebm, `${first?.length ?? 0} bytes`);

  // ── 5) แกะลิงก์ Spotify ──
  check(
    'แยก track URL',
    parseSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')?.type === 'track',
  );
  check(
    'แยก playlist URL (มี /intl-xx/)',
    parseSpotifyUrl('https://open.spotify.com/intl-th/playlist/37i9dQZF1DXcBWIGoYBM5M')?.type === 'playlist',
  );
  check('แยก album URL', parseSpotifyUrl('https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX')?.type === 'album');
  check('ลิงก์อื่นไม่ใช่ Spotify → null', parseSpotifyUrl('https://youtu.be/abc123') === null);
  check('ตรวจสถานะการตั้งค่า Spotify ได้', typeof isSpotifyConfigured() === 'boolean', `ตอนนี้: ${isSpotifyConfigured() ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}`);

  // ── 6) ฟอร์แมตเวลา ──
  check('formatTrackDuration(225) = "3:45"', formatTrackDuration(225) === '3:45');
  check('formatTrackDuration(3725) = "1:02:05"', formatTrackDuration(3725) === '1:02:05');
  check('formatTrackDuration(45) = "0:45"', formatTrackDuration(45) === '0:45');

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาด:', error);
  process.exit(1);
});
