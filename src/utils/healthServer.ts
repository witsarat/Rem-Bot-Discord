/**
 * src/utils/healthServer.ts
 * HTTP server ขนาดจิ๋วสำหรับโฮสต์บน Render (หรือ PaaS อื่น ๆ)
 * Render Web Service ต้องให้แอป "เปิดพอร์ต" จึงจะถือว่า deploy สำเร็จ
 * - จะเริ่มทำงานเฉพาะเมื่อมีตัวแปรสภาพแวดล้อม PORT (Render ตั้งให้อัตโนมัติ)
 * - บนเครื่องตัวเอง (npm run dev) จะข้ามไป ไม่กินพอร์ตทิ้ง
 */
import http from 'http';

/** เริ่ม health server (ถ้ามีการตั้งค่า PORT) */
export function startHealthServer(): void {
  const rawPort = process.env.PORT;
  if (!rawPort) return; // ไม่ได้รันบน Render → ไม่ต้องเปิด

  const port = Number(rawPort) || 3000;

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        status: 'ok',
        bot: 'Rem — Voice Log Bot',
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
