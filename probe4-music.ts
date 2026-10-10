/**
 * probe4-music.ts — ทดสอบทางสตรีมผ่าน youtubei.js (หลาย client) — ลบได้หลังเช็ค
 */
import 'dotenv/config';
import { Readable } from 'node:stream';
import { Innertube } from 'youtubei.js';

const VIDEO_ID = 'aqz-KE-bpKQ';

async function readWebStream(
  rs: ReadableStream<Uint8Array>,
  target = 80_000,
  timeoutMs = 20_000,
): Promise<number> {
  const node = Readable.fromWeb(rs as never) as Readable;
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => {
      node.destroy();
      resolve();
    }, timeoutMs);
    node.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > target) {
        clearTimeout(to);
        node.destroy();
        resolve();
      }
    });
    node.on('error', (err) => {
      clearTimeout(to);
      reject(err);
    });
  });
  return bytes;
}

async function tryDownload(label: string, client?: string): Promise<boolean> {
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(VIDEO_ID);
    const options = { type: 'audio' as const, codec: 'opus' as const, ...(client ? { client: client as never } : {}) };
    const bytes = await readWebStream(await info.download(options));
    console.log(`${bytes > 0 ? '✅' : '❌'} [${label}] อ่านได้ ${Math.round(bytes / 1024)}KB`);
    return bytes > 0;
  } catch (error) {
    console.log(`❌ [${label}] ${(error as Error).message}`);
    return false;
  }
}

async function tryManual(): Promise<boolean> {
  try {
    const yt = await Innertube.create();
    const info = await yt.getInfo(VIDEO_ID);
    const format = info.chooseFormat({ type: 'audio', codec: 'opus' });
    console.log(`[manual] itag ${format.itag} | ${format.mime_type} | has url: ${Boolean(format.url)}`);
    const url = format.url || (await format.decipher(yt.session.player));
    if (!url) {
      console.log('❌ [manual] ไม่ได้ URL');
      return false;
    }
    const res = await fetch(url);
    const bytes = await readWebStream(res.body as ReadableStream<Uint8Array>);
    console.log(`${bytes > 0 ? '✅' : '❌'} [manual] fetch อ่านได้ ${Math.round(bytes / 1024)}KB`);
    return bytes > 0;
  } catch (error) {
    console.log(`❌ [manual] ${(error as Error).message}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('youtubei.js', require('youtubei.js/package.json').version);
  console.log('');
  await tryDownload('default client');
  await tryDownload('ANDROID', 'ANDROID');
  await tryDownload('IOS', 'IOS');
  await tryDownload('TV_EMBEDDED', 'TV_EMBEDDED');
  await tryManual();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
