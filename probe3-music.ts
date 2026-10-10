/**
 * probe3-music.ts — เช็ค [A] ytdl บนวิดีโอปกติแบบเดี่ยว ๆ — ลบได้หลังเช็ค
 */
import 'dotenv/config';
import ytdl from '@distube/ytdl-core';

const ID = 'aqz-KE-bpKQ';
const URL = `https://www.youtube.com/watch?v=${ID}`;

async function main(): Promise<void> {
  console.log('=== [A] ytdl บนวิดีโอปกติ (Big Buck Bunny) ===');
  try {
    const info = await ytdl.getInfo(URL);
    const audio = info.formats.filter((f) => f.hasAudio && !f.hasVideo);
    console.log('✅ getInfo OK — formats:', info.formats.length, '| audio-only:', audio.length);
    console.log('   mime ตัวอย่าง:', audio[0]?.mimeType?.slice(0, 50));
    const stream = ytdl(URL, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 22 });
    let bytes = 0;
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => {
        stream.destroy();
        resolve();
      }, 20000);
      stream.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 80_000) {
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
    console.log('   stream:', bytes > 0 ? `✅ อ่านได้ ${Math.round(bytes / 1024)}KB` : '❌ 0 bytes');
  } catch (error) {
    console.log('❌ [A] ล้มเหลว:', (error as Error).message);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
