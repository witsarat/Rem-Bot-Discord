/**
 * probe5-music.ts — ยิงทดสอบ 2 แนวทางสุดท้าย — ลบได้หลังเช็ค
 *   [youtubei] เลือก audio format จาก streaming_data โดยตรง
 *   [yt-dlp]   สตรีมผ่าน yt-dlp (binary)
 */
import 'dotenv/config';
import { Readable } from 'node:stream';
import { Innertube } from 'youtubei.js';
import youtubeDl from 'youtube-dl-exec';

const VIDEO_ID = 'aqz-KE-bpKQ';
const URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

async function readNode(stream: Readable, target = 80_000, timeoutMs = 25_000): Promise<number> {
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => {
      stream.destroy();
      resolve();
    }, timeoutMs);
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > target) {
        clearTimeout(to);
        stream.destroy();
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

async function testYoutubeiBest(): Promise<void> {
  console.log('=== [youtubei] เลือก audio format จาก streaming_data ===');
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(VIDEO_ID);
    const adaptive = (info.streaming_data?.adaptive_formats ?? []) as Array<{
      has_audio?: boolean;
      has_video?: boolean;
      itag: number;
      mime_type?: string;
      bitrate?: number;
      url?: string;
      decipher: (player?: unknown) => Promise<string>;
    }>;
    const audio = adaptive
      .filter((f) => f.has_audio && !f.has_video)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    console.log(
      '    audio formats:',
      audio.length,
      '→',
      audio
        .slice(0, 3)
        .map((f) => `${f.itag}:${(f.mime_type ?? '').split(';')[0]}`)
        .join(', '),
    );
    const format = audio[0];
    if (!format) throw new Error('ไม่พบ format เสียง');
    const url = format.url || (await format.decipher(yt.session.player));
    if (!url) throw new Error('ไม่ได้ URL');
    const res = await fetch(url);
    const bytes = await readNode(Readable.fromWeb(res.body as never) as Readable);
    console.log(bytes > 0 ? `✅ [youtubei] อ่านได้ ${Math.round(bytes / 1024)}KB` : '❌ [youtubei] 0 bytes');
  } catch (error) {
    console.log('❌ [youtubei]', (error as Error).message);
  }
}

async function testYtDlp(): Promise<void> {
  console.log('');
  console.log('=== [yt-dlp] สตรีมผ่าน yt-dlp binary ===');
  try {
    const sub = youtubeDl.exec(URL, {
      output: '-',
      format: 'bestaudio[acodec=opus]/bestaudio/best',
      quiet: true,
      noWarnings: true,
    } as never);
    if (!sub.stdout) throw new Error('ไม่มี stdout');
    const bytes = await readNode(sub.stdout as Readable);
    console.log(bytes > 0 ? `✅ [yt-dlp] อ่านได้ ${Math.round(bytes / 1024)}KB` : '❌ [yt-dlp] 0 bytes');
    sub.kill();
  } catch (error) {
    console.log('❌ [yt-dlp]', (error as Error).message);
  }
}

async function main(): Promise<void> {
  await testYoutubeiBest();
  await testYtDlp();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
