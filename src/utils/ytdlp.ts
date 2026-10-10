/**
 * src/utils/ytdlp.ts
 * ตัวช่วยรัน yt-dlp (standalone binary) — ค้นหา / ดึงข้อมูล / สตรีมเสียง YouTube
 *
 * หา binary ตามลำดับ:
 *   1) ตัวแปรแวดล้อม YTDLP_PATH (ถ้าตั้ง)
 *   2) โฟลเดอร์ bin/ ของโปรเจกต์ (ติดตั้งอัตโนมัติตอน npm install)
 *   3) จาก PATH ของระบบ (which yt-dlp)
 *   4) ดาวน์โหลด standalone ให้อัตโนมัติ (Linux/macOS) — เผื่อกรณี bin/ หาย
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const PROJECT_BIN = path.join(
  __dirname,
  '..',
  '..',
  'bin',
  process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
);

let resolvedPath: string | null = null;
let resolving: Promise<string> | null = null;

/** ชื่อไฟล์ release ของ yt-dlp ตามระบบปฏิบัติการ */
function releaseAsset(): string | null {
  if (process.platform === 'linux') return 'yt-dlp_linux';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  if (process.platform === 'win32') return 'yt-dlp.exe';
  return null;
}

/** หา (หรือติดตั้ง) ที่อยู่ของ yt-dlp */
export async function ensureYtDlp(): Promise<string> {
  if (resolvedPath) return resolvedPath;
  if (resolving) return resolving;

  resolving = (async () => {
    const candidates = [(process.env.YTDLP_PATH ?? '').trim(), PROJECT_BIN].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
        return candidate;
      }
    }

    const fromPath = await whichYtDlp();
    if (fromPath) {
      resolvedPath = fromPath;
      return fromPath;
    }

    const asset = releaseAsset();
    if (!asset) throw new Error('ระบบปฏิบัติการนี้ยังไม่รองรับ yt-dlp อัตโนมัติ');
    const target = path.join(os.tmpdir(), `yt-dlp-${process.platform}`);
    if (!fs.existsSync(target)) {
      console.log('[music] กำลังดาวน์โหลด yt-dlp (ครั้งแรกเท่านั้น)...');
      const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`);
      if (!res.ok || !res.body) throw new Error(`ดาวน์โหลด yt-dlp ไม่สำเร็จ (HTTP ${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(`${target}.part`, buffer);
      fs.renameSync(`${target}.part`, target);
      fs.chmodSync(target, 0o755);
    }
    resolvedPath = target;
    return target;
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

/** หา yt-dlp จาก PATH ของระบบ */
function whichYtDlp(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', ['yt-dlp']);
    let out = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('close', (code) => {
      const first = out.trim().split('\n')[0];
      resolve(code === 0 && first ? first : null);
    });
    child.on('error', () => resolve(null));
  });
}

/** ผลลัพธ์วิดีโอ YouTube 1 รายการ */
export interface YtVideo {
  id: string;
  title: string;
  durationSec: number;
  url: string;
}

const PRINT_FORMAT = '%(id)s\t%(title)s\t%(duration)s';

function toVideo(line: string): YtVideo | null {
  const [id, title, duration] = line.split('\t');
  if (!id || !title) return null;
  const durationSec = Number(duration);
  return {
    id,
    title,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : 0,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

/** ค้นหา YouTube (ytsearch) — คืนผลลัพธ์สูงสุด `limit` รายการ */
export async function searchYouTube(query: string, limit = 1): Promise<YtVideo[]> {
  const output = await runCollect(
    ['--no-warnings', '--quiet', '--flat-playlist', '--print', PRINT_FORMAT, `ytsearch${limit}:${query}`],
    45_000,
  );
  return output
    .split('\n')
    .filter(Boolean)
    .map(toVideo)
    .filter((video): video is YtVideo => video !== null);
}

/** ดึงข้อมูลวิดีโอจากลิงก์ YouTube โดยตรง */
export async function getVideoInfo(url: string): Promise<YtVideo | null> {
  const output = await runCollect(['--no-warnings', '--quiet', '--no-playlist', '--print', PRINT_FORMAT, url], 45_000);
  const line = output.split('\n').find(Boolean) ?? '';
  return toVideo(line);
}

/** สตรีมเสียงของวิดีโอ (WebM/Opus เป็นหลัก) — คืนทั้ง process และ stream */
export async function spawnAudioStream(url: string): Promise<{
  child: ChildProcessWithoutNullStreams;
  stream: Readable;
}> {
  const bin = await ensureYtDlp();
  const child = spawn(bin, [
    url,
    '-o',
    '-',
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--no-progress',
    '-f',
    'bestaudio[acodec=opus][ext=webm]/bestaudio[acodec=opus]/bestaudio/best',
    '--retries',
    '3',
    '--socket-timeout',
    '20',
  ]);
  return { child, stream: child.stdout as Readable };
}

/** รันคำสั่งแล้วรวบ stdout ทั้งหมด (ใช้กับงานสั้น เช่น ค้นหา/ดึงข้อมูล) */
async function runCollect(args: string[], timeoutMs: number): Promise<string> {
  const bin = await ensureYtDlp();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args);
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('yt-dlp ใช้เวลานานเกินไป'));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(out.trim());
        return;
      }
      const errorLine = err
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('ERROR'));
      reject(new Error(errorLine ?? `yt-dlp ออกด้วยรหัส ${code}`));
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
