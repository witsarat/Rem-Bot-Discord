/**
 * src/utils/healthServer.ts
 * HTTP server ขนาดจิ๋วสำหรับโฮสต์บน Render (หรือ PaaS อื่น ๆ)
 * Render Web Service ต้องให้แอป "เปิดพอร์ต" จึงจะถือว่า deploy สำเร็จ
 *
 * เส้นทาง:
 *   GET /                    → health JSON
 *   GET /preview/profile?layout=<base64url> → PNG การ์ดตัวอย่าง (ใช้ในหน้า Card Studio)
 *   GET /preview/weekly?layout=<base64url>  → PNG การ์ดรายงานตัวอย่าง
 *
 * พรีวิวใช้ข้อมูลตัวอย่างคงที่ — ไม่แตะข้อมูลจริง และจำกัดอัตราการเรียกต่อ IP
 */
import http from 'http';
import { isDbConfigured, isDbReady } from './db';
import { botOwnerCount } from './premium';
import { decodeLayout } from './cardLayout';
import { renderProfileCard, renderWeeklyCard } from './profileCard';

/** จำกัดการเรียกพรีวิว: 120 ครั้ง/นาที ต่อ IP (ลากปรับการ์ดต่อเนื่องได้) */
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) hits.clear();
  return recent.length <= RATE_LIMIT;
}

/** ข้อมูลตัวอย่างสำหรับพรีวิวการ์ด */
const DEMO_PROFILE = {
  displayName: 'Zee ✨🎧',
  username: 'zee_special',
  avatarUrl: null as string | null,
  guildName: 'Witsarat Community 🏠',
  joinedAt: new Date('2025-11-03T10:00:00Z'),
  rank: { place: 3, total: 42 },
  stats: {
    last7Ms: 3 * 3_600_000 + 12 * 60_000,
    last7Sessions: 6,
    last30Ms: 26 * 3_600_000,
    last30Sessions: 21,
    allMs: 3 * 86_400_000 + 5 * 3_600_000,
    allSessions: 148,
    joins: 148,
    topChannel: 'General Voice 🔊',
  },
};

const DEMO_WEEKLY = {
  guildName: 'Witsarat Community 🏠',
  from: new Date(Date.now() - 7 * 86_400_000),
  to: new Date(),
  participants: 12,
  totalMs: 40 * 3_600_000,
  topChannel: { name: 'General Voice 🔊', count: 34 },
  rows: [
    { username: 'zeenLZP 🎮', totalMs: 13 * 3_600_000, sessions: 22 },
    { username: 'Ram ✨', totalMs: 5 * 3_600_000, sessions: 19 },
    { username: 'Dewwy 🎧', totalMs: 4 * 3_600_000, sessions: 15 },
    { username: 'SpecialXR', totalMs: 2 * 3_600_000, sessions: 4 },
    { username: 'สมาชิกชื่อยาวมากเป็นพิเศษ 🚀', totalMs: 3_600_000, sessions: 2 },
  ],
};

/** เริ่ม health server (ถ้ามีการตั้งค่า PORT) */
export function startHealthServer(): void {
  const rawPort = process.env.PORT;
  if (!rawPort) return; // ไม่ได้รันบน Render → ไม่ต้องเปิด

  const port = Number(rawPort) || 3000;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (url.pathname === '/preview/profile' || url.pathname === '/preview/weekly') {
      if (!allow(ip)) {
        res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('เรียกพรีวิวถี่เกินไป — ลองใหม่อีกครั้งในอีกสักครู่');
        return;
      }

      try {
        const layout = decodeLayout(url.searchParams.get('layout'));
        const png =
          url.pathname === '/preview/profile'
            ? await renderProfileCard(DEMO_PROFILE, layout)
            : await renderWeeklyCard(DEMO_WEEKLY, layout);

        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': png.length,
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(png);
      } catch (error) {
        console.error('[health] เรนเดอร์พรีวิวไม่สำเร็จ:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('เรนเดอร์พรีวิวไม่สำเร็จ');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'ok',
        bot: 'Ruru — Voice Log Bot',
        db: isDbReady() ? 'connected' : isDbConfigured() ? 'error' : 'off',
        owners: botOwnerCount(),
        uptime: Math.floor(process.uptime()),
        time: new Date().toISOString(),
      }),
    );
  });

  server.on('error', (error) => {
    console.error('[health] เปิดพอร์ตไม่สำเร็จ:', error);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Health server พร้อมที่พอร์ต ${port} (สำหรับ Render)`);
  });
}
