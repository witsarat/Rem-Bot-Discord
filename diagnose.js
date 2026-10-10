/**
 * diagnose.js — ตรวจสุขภาพบอท Voice Log
 * ใช้เมื่อ: พิมพ์ /command แล้วคำสั่งไม่ขึ้น / บอทไม่ทำงาน
 * รันด้วย:  npm run diagnose
 */
require('dotenv/config');
const { REST } = require('discord.js');

const token = (process.env.DISCORD_TOKEN || '').trim();
const clientId = (process.env.CLIENT_ID || '').trim();
const guildIds = (process.env.GUILD_ID || '')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.endsWith('_HERE'));

const notSet = (v) => !v || v.endsWith('_HERE');

async function main() {
  console.log('━━━ [1] ค่าใน .env ━━━');
  console.log(
    'DISCORD_TOKEN :',
    notSet(token)
      ? '❌ ยังไม่ได้ตั้งค่า'
      : `✅ ตั้งค่าแล้ว (len=${token.length})` + (/^["'].*["']$/.test(token) ? ' ⚠️ มี quote ครอบ (ควรลบ)' : ''),
  );
  console.log('CLIENT_ID     :', notSet(clientId) ? '❌ ยังไม่ได้ตั้งค่า' : `✅ ${clientId}`);
  console.log(
    'GUILD_ID      :',
    guildIds.length
      ? `✅ ${guildIds.length} เซิร์ฟเวอร์ (${guildIds.join(', ')})`
      : '➖ ไม่ได้ใส่ (ใช้โหมด Global อย่างเดียว)',
  );

  if (notSet(token) || notSet(clientId)) {
    console.log('\n👉 เปิดไฟล์ .env แล้วใส่ค่าจริงก่อน แล้วรัน npm run diagnose อีกครั้ง');
    process.exitCode = 1;
    return;
  }

  const rest = new REST().setToken(token);

  console.log('\n━━━ [2] ตรวจสอบ Token กับ Discord ━━━');
  let app;
  try {
    app = await rest.get('/applications/@me');
    console.log('✅ Token ใช้ได้ — บอทชื่อ:', app.name, '(App ID:', app.id + ')');
  } catch (err) {
    console.log('❌ Token ใช้งานไม่ได้:', err.message || err);
    console.log('👉 หน้า Developer Portal → เมนู Bot → Reset Token → เอา token ใหม่ไปใส่ .env');
    process.exitCode = 1;
    return;
  }

  if (app.id !== clientId) {
    console.log(`⚠️ CLIENT_ID ใน .env (${clientId}) ไม่ตรงกับ App ID ของ Token (${app.id}) → deploy จะไปลงผิดแอป!`);
  }

  // รายชื่อเซิร์ฟเวอร์ที่บอทอยู่ (ใช้ตรวจ GUILD_ID ด้วย)
  let botGuilds = [];
  try {
    botGuilds = await rest.get('/users/@me/guilds');
  } catch (err) {
    console.log('⚠️ ดึงรายการเซิร์ฟเวอร์ของบอทไม่สำเร็จ:', err.message || err);
  }

  console.log('\n━━━ [3] Slash Commands ที่ลงทะเบียนไว้ ━━━');
  try {
    const globalCmds = await rest.get(`/applications/${app.id}/commands`);
    console.log(
      'Global (ทุกเซิร์ฟเวอร์) :',
      globalCmds.length
        ? `✅ ${globalCmds.length} คำสั่ง (${globalCmds.map((c) => '/' + c.name).join(', ')})`
        : '❌ ยังไม่มี → รัน npm run deploy',
    );
  } catch (err) {
    console.log('Global (ทุกเซิร์ฟเวอร์) : ⚠️ ดึงข้อมูลไม่สำเร็จ:', err.message || err);
  }
  for (const gid of guildIds) {
    const inGuild = botGuilds.some((g) => g.id === gid);
    if (!inGuild) {
      console.log(
        `เซิร์ฟเวอร์ ${gid} : ⚠️ บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้ → deploy จะขึ้น Missing Access (ให้เชิญบอทก่อน หรือแก้ GUILD_ID)`,
      );
      continue;
    }
    try {
      const gc = await rest.get(`/applications/${app.id}/guilds/${gid}/commands`);
      console.log(
        `เซิร์ฟเวอร์ ${gid} :`,
        gc.length ? `✅ ${gc.length} คำสั่ง (ขึ้นทันที)` : '❌ ยังไม่มี (รัน npm run deploy)',
      );
    } catch (err) {
      console.log(`เซิร์ฟเวอร์ ${gid} : ⚠️ ดึงไม่ได้:`, err.message || err);
    }
  }

  console.log('\n━━━ [4] เซิร์ฟเวอร์ที่บอทอยู่ ━━━');
  if (!botGuilds.length) {
    console.log('❌ บอทยังไม่ได้อยู่เซิร์ฟเวอร์ไหน → เชิญบอทด้วยลิงก์ใน README (ต้องมี scope applications.commands)');
  } else {
    for (const g of botGuilds) console.log('•', g.name, `(${g.id})`);
    if (!guildIds.length) {
      console.log('\n💡 ถ้าอยากให้คำสั่งขึ้นทันทีในเซิร์ฟเวอร์ด้านบน: ใส่ ID ต่อท้าย GUILD_ID (คั่นด้วย ,) แล้วรัน npm run deploy');
    }
  }

  console.log('\n━━━ [5] ฐานข้อมูลออนไลน์ (DATABASE_URL) ━━━');
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    console.log('➖ ไม่ได้ตั้งค่า — เก็บค่าในไฟล์ config.json (บน Render จะหายเมื่อ deploy ใหม่)');
    console.log('   → วิธีตั้งค่า Supabase ดูใน README หัวข้อ "ฐานข้อมูลออนไลน์"');
  } else {
    let dbHost = '(อ่าน host ไม่ได้)';
    try {
      dbHost = new URL(dbUrl).hostname;
    } catch {}
    console.log('ตั้งค่าแล้ว (host: ' + dbHost + ')');
    try {
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      const gs = await pool.query('SELECT count(*)::int AS n FROM guild_settings');
      const vl = await pool.query('SELECT count(*)::int AS n FROM voice_logs');
      console.log('✅ เชื่อมต่อได้ — เซิร์ฟเวอร์ที่ตั้งค่าห้อง:', gs.rows[0].n, '| ประวัติ log:', vl.rows[0].n, 'รายการ');
      try {
        const wk = await pool.query('SELECT count(*)::int AS n FROM guild_settings WHERE weekly_channel_id IS NOT NULL');
        console.log('🗓️ เซิร์ฟเวอร์ที่ตั้งห้องรายงานประจำสัปดาห์:', wk.rows[0].n);
      } catch {
        console.log('🗓️ ยังไม่มีคอลัมน์รายงานประจำสัปดาห์ — บอทจะอัปเดตโครงสร้างให้อัตโนมัติเมื่อรันเวอร์ชันใหม่');
      }
      const recent = await pool.query(
        'SELECT event, username, channel_name, from_channel_name, to_channel_name, created_at FROM voice_logs ORDER BY id DESC LIMIT 3',
      );
      for (const r of recent.rows) {
        const detail = r.event === 'move' ? r.from_channel_name + ' → ' + r.to_channel_name : r.channel_name;
        console.log('  •', new Date(r.created_at).toISOString(), '[' + r.event + ']', r.username, detail ? '(' + detail + ')' : '');
      }
      await pool.end();
    } catch (err) {
      console.log('❌ เชื่อมต่อไม่สำเร็จ:', err.message || err);
      console.log('   → ตรวจว่าใช้ Connection pooling URI (ไม่ใช่ Direct/IPv6) และรหัสผ่านถูกต้อง');
    }
  }

  console.log('\n━━━ สรุปวิธีแก้ "คำสั่งไม่ขึ้น" ━━━');
  console.log('1) ยังไม่เคยรัน:            npm run deploy');
  console.log('2) ลงแล้วแต่ไม่เห็นในดิส:   กด Ctrl+R ที่ตัว Discord; ตรวจว่าลิงก์เชิญมี scope applications.commands');
  console.log('3) เซิร์ฟเวอร์ใหม่ (Global): รอได้ถึง ~1 ชม. → รัน npm run deploy เพื่อให้ขึ้นทันทีอัตโนมัติ (ลงให้ทุกดิสที่บอทอยู่)');
  console.log('4) ขึ้น Missing Access:     GUILD_ID ชี้เซิร์ฟเวอร์ที่บอทไม่ได้อยู่ → เชิญบอทเข้าเซิร์ฟเวอร์นั้นก่อน');
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาด:', err);
  process.exitCode = 1;
});
