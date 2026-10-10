/**
 * probe-music.ts — ทดสอบแกนระบบเพลง (ค้นหา + ดึงข้อมูล + สตรีม) — ลบได้หลังเช็ค
 */
import 'dotenv/config';
import ytdl from '@distube/ytdl-core';
import { Innertube } from 'youtubei.js';

async function main(): Promise<void> {
  console.log('=== [1] ค้นหา YouTube (youtubei.js) ===');
  const yt = await Innertube.create();
  const res = await yt.search('lofi hip hop radio', { type: 'video' });
  const videos = (res as unknown as { videos?: unknown[] }).videos ?? [];
  console.log('ได้ผลลัพธ์:', videos.length, 'รายการ');
  const first = (videos.find((v) => (v as { type?: string }).type === 'Video') ?? videos[0]) as
    | Record<string, unknown>
    | undefined;
  if (!first) throw new Error('ค้นหาไม่เจอผลลัพธ์');
  console.log('คีย์ที่มี:', Object.keys(first).slice(0, 25).join(', '));
  const videoId = (first.video_id ?? first.id) as string;
  const title = String((first.title as { toString?: () => string })?.toString?.() ?? first.title ?? '');
  const duration = first.duration as { seconds?: number } | number | undefined;
  const durationSec =
    typeof duration === 'number' ? duration : (duration as { seconds?: number } | undefined)?.seconds;
  console.log('ตัวอย่าง:', { videoId, title: title.slice(0, 60), durationSec });

  console.log('');
  console.log('=== [2] ดึงข้อมูลวิดีโอ (ytdl getInfo) ===');
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const info = await ytdl.getInfo(url);
  console.log('✅ สำเร็จ:', info.videoDetails.title.slice(0, 60));
  console.log('   ความยาว:', info.videoDetails.lengthSeconds, 'วิ');
  const audioOnly = info.formats.filter((f) => f.hasAudio && !f.hasVideo);
  console.log('   format เสียงล้วน:', audioOnly.length, 'แบบ | ตัวอย่าง:', audioOnly[0]?.mimeType?.slice(0, 45));

  console.log('');
  console.log('=== [3] เปิดสตรีมเสียง อ่านจริง 100KB แรก ===');
  const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 });
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      stream.destroy();
      resolve();
    }, 25000);
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 100_000) {
        clearTimeout(timeout);
        stream.destroy();
        resolve();
      }
    });
    stream.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
  console.log(bytes > 0 ? `✅ สตรีมได้! อ่านไป ${Math.round(bytes / 1024)} KB` : '❌ สตรีมไม่ได้ (0 bytes)');

  console.log('');
  console.log('🎉 probe ผ่านทั้งหมด');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ PROBE ล้มเหลว:', error);
  process.exit(1);
});
