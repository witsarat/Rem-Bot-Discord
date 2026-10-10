/**
 * probe2-music.ts — ทดสอบทางเลือกสตรีมเสียง — ลบได้หลังเช็ค
 */
import 'dotenv/config';
import ytdl from '@distube/ytdl-core';
import { Innertube } from 'youtubei.js';

const REGULAR_ID = 'aqz-KE-bpKQ'; // Big Buck Bunny (วิดีโอทดสอบมาตรฐาน)
const REGULAR = `https://www.youtube.com/watch?v=${REGULAR_ID}`;
const LIVE = 'https://www.youtube.com/watch?v=rFZHOHl-L8A'; // lofi radio (ไลฟ์)

async function readStream(stream: NodeJS.ReadableStream, target = 80_000, timeoutMs = 20_000): Promise<number> {
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => {
      (stream as unknown as { destroy?: () => void }).destroy?.();
      resolve();
    }, timeoutMs);
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > target) {
        clearTimeout(to);
        (stream as unknown as { destroy?: () => void }).destroy?.();
        resolve();
      }
    });
    stream.on('error', (err) => {
      clearTimeout(to);
      reject(err);
    });
  });
  return bytes;
}

async function main(): Promise<void> {
  console.log(
    'เวอร์ชัน: youtubei.js',
    require('youtubei.js/package.json').version,
    '| @distube/ytdl-core',
    require('@distube/ytdl-core/package.json').version,
  );

  console.log('');
  console.log('=== [A] ytdl บนวิดีโอปกติ ===');
  try {
    const info = await ytdl.getInfo(REGULAR);
    const audio = info.formats.filter((f) => f.hasAudio && !f.hasVideo);
    console.log('✅ getInfo ok — audio-only:', audio.length, '| mime:', audio[0]?.mimeType?.slice(0, 45));
    const bytes = await readStream(ytdl(REGULAR, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 22 }));
    console.log('   stream:', bytes > 0 ? `✅ ${Math.round(bytes / 1024)}KB` : '❌ 0 bytes');
  } catch (error) {
    console.log('❌ ytdl:', (error as Error).message);
  }

  console.log('');
  console.log('=== [B] youtubei.js streaming บนวิดีโอปกติ ===');
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(REGULAR_ID);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    console.log('✅ chose format:', format.mime_type, '| itag:', format.itag);
    const stream = await format.download();
    const bytes = await readStream(stream as unknown as NodeJS.ReadableStream);
    console.log('   stream:', bytes > 0 ? `✅ ${Math.round(bytes / 1024)}KB` : '❌ 0 bytes');
  } catch (error) {
    console.log('❌ youtubei (chooseFormat):', (error as Error).message);
    try {
      const yt = await Innertube.create();
      const info = await yt.getInfo(REGULAR_ID);
      const stream = await info.download({ type: 'audio', quality: 'best' });
      const bytes = await readStream(stream as unknown as NodeJS.ReadableStream);
      console.log('   (fallback download()) stream:', bytes > 0 ? `✅ ${Math.round(bytes / 1024)}KB` : '❌ 0 bytes');
    } catch (error2) {
      console.log('❌ youtubei (download):', (error2 as Error).message);
    }
  }

  console.log('');
  console.log('=== [C] ytdl บนไลฟ์สตรีม (เช็คว่า fail เฉพาะไลฟ์ไหม) ===');
  try {
    const info = await ytdl.getInfo(LIVE);
    console.log('✅ ytdl live getInfo ok — formats:', info.formats.length);
  } catch (error) {
    console.log('❌ ytdl live:', (error as Error).message);
  }

  console.log('');
  console.log('จบการทดสอบ');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
