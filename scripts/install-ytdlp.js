/**
 * scripts/install-ytdlp.js
 * ดาวน์โหลด yt-dlp standalone ลงโฟลเดอร์ bin/ ตอน `npm install` (ข้ามถ้ามีอยู่แล้ว)
 * ใช้ไฟล์นี้เป็น postinstall ของโปรเจกต์ — ห้ามทำให้ npm install ล้มเหลว
 */
const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, '..', 'bin');
const isWindows = process.platform === 'win32';
const target = path.join(binDir, isWindows ? 'yt-dlp.exe' : 'yt-dlp');

if (fs.existsSync(target)) {
  console.log('[ytdlp] มีไฟล์อยู่แล้ว ข้ามการดาวน์โหลด:', target);
  process.exit(0);
}

const asset =
  process.platform === 'linux'
    ? 'yt-dlp_linux'
    : process.platform === 'darwin'
      ? 'yt-dlp_macos'
      : isWindows
        ? 'yt-dlp.exe'
        : null;

if (!asset) {
  console.log('[ytdlp] แพลตฟอร์มนี้ยังไม่รองรับการติดตั้งอัตโนมัติ — ข้าม');
  process.exit(0);
}

const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
console.log('[ytdlp] กำลังดาวน์โหลด', url);

(async () => {
  fs.mkdirSync(binDir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(`${target}.part`, buffer);
  fs.renameSync(`${target}.part`, target);
  if (!isWindows) fs.chmodSync(target, 0o755);
  console.log('[ytdlp] ติดตั้งสำเร็จ:', target);
})().catch((error) => {
  // ไม่ throw — บอทมีระบบดาวน์โหลดอัตโนมัติตอนรันเป็นตัวสำรองอยู่แล้ว
  console.warn('[ytdlp] ดาวน์โหลดไม่สำเร็จ (จะลองใหม่ตอนบอทเริ่มเล่นเพลง):', error.message ?? error);
});
