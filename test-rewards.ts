/**
 * test-rewards.ts — ทดสอบ Role rewards (voice-only) + เพดานแพ็กเกจฟรี
 * รันด้วย: PGSSLMODE=disable DATABASE_URL=postgres://localhost/rem_bot_test npx tsx test-rewards.ts
 */
import 'dotenv/config';
import type { Pool } from 'pg';
import { invalidatePremiumCache } from './src/utils/premium';
import { getPool, initDb, isDbReady } from './src/utils/db';
import {
  FREE_ROLE_REWARD_LIMIT,
  getActiveRoleRewards,
  getRewardConfig,
  getRoleRewards,
  getVoiceTotals,
  selectNewRoleRewards,
} from './src/utils/rewards';

const GUILD = '999900000000000555';
const PREMIUM_GUILD = '999900000000000777';
const HOUR = 3600;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function cleanup(pool: Pool, guildId: string): Promise<void> {
  for (const table of [
    'voice_logs',
    'guild_reward_config',
    'guild_role_rewards',
    'member_role_awards',
    'guild_subscriptions',
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE guild_id = $1`, [guildId]).catch(() => null);
  }
}

async function main(): Promise<void> {
  await initDb();
  const pool = getPool();
  if (!pool || !isDbReady()) {
    console.log('❌ DB ไม่พร้อม');
    process.exit(1);
  }

  await cleanup(pool, GUILD);
  await cleanup(pool, PREMIUM_GUILD);

  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR * 1000);

  const seed = async (guildId: string): Promise<void> => {
    // userA: 5 ชม. (3+2) • userB: 12 ชม. • userC: เปิดค้าง 2 ชม.
    const rows: Array<[string, string, Date]> = [
      ['userA', 'join', at(10)], ['userA', 'leave', at(7)],
      ['userA', 'join', at(6)], ['userA', 'leave', at(4)],
      ['userB', 'join', at(20)], ['userB', 'leave', at(8)],
      ['userC', 'join', at(2)],
    ];
    for (const [userId, event, createdAt] of rows) {
      await pool.query(
        `INSERT INTO voice_logs (guild_id, user_id, username, event, channel_id, channel_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [guildId, userId, userId.toUpperCase(), event, 'chan-1', 'General', createdAt],
      );
    }
  };

  await seed(GUILD);
  await seed(PREMIUM_GUILD);

  // ── 1) ชั่วโมงสะสม ───────────────────────────────────────────
  const totals = await getVoiceTotals(GUILD);
  const byUser = new Map(totals.map((t) => [t.userId, t.seconds]));
  check('userA = 5 ชม.', Math.abs((byUser.get('userA') ?? 0) - 5 * HOUR) < 90, `${(byUser.get('userA') ?? 0) / HOUR} ชม.`);
  check('userB = 12 ชม.', Math.abs((byUser.get('userB') ?? 0) - 12 * HOUR) < 90, `${(byUser.get('userB') ?? 0) / HOUR} ชม.`);
  check('userC (เปิดค้าง) ≈ 2 ชม.', Math.abs((byUser.get('userC') ?? 0) - 2 * HOUR) < 120, `${(byUser.get('userC') ?? 0) / HOUR} ชม.`);

  // ── 2) ค่าเริ่มต้น: ปิดโมดูล ─────────────────────────────────
  const cfg0 = await getRewardConfig(GUILD);
  check('ยังไม่ตั้งค่า → ปิดโมดูล', !cfg0.rewardsEnabled && cfg0.retention === 'all');

  // ── 3) บันทึกค่าตั้ง + เกณฑ์ยศ 3 เกณฑ์ ───────────────────────
  for (const guildId of [GUILD, PREMIUM_GUILD]) {
    await pool.query(
      `INSERT INTO guild_reward_config (guild_id, announce_channel_id, rewards_enabled, retention)
       VALUES ($1, $2, true, 'highest')`,
      [guildId, '123456789012345678'],
    );
    await pool.query(
      `INSERT INTO guild_role_rewards (guild_id, kind, threshold_seconds, role_id) VALUES
         ($1,'voice',3600,'role-1'), ($1,'voice',10800,'role-2'), ($1,'voice',36000,'role-3')`,
      [guildId],
    );
  }

  const cfg = await getRewardConfig(GUILD);
  check('อ่านค่าตั้งได้ (announce + highest)', cfg.announceChannelId === '123456789012345678' && cfg.retention === 'highest');

  const rewards = await getRoleRewards(GUILD);
  check('เกณฑ์ยศ 3 รายการ เรียงจากน้อยไปมาก', rewards.length === 3 && rewards[2].roleId === 'role-3');

  // ── 4) เพดานแพ็กเกจฟรี = 1 เกณฑ์ ────────────────────────────
  const freeActive = await getActiveRoleRewards(GUILD);
  check(`ฟรี: เกณฑ์ที่มีผล = ${FREE_ROLE_REWARD_LIMIT}`, freeActive.rewards.length === FREE_ROLE_REWARD_LIMIT && !freeActive.premium);
  check('ฟรี: ใช้เกณฑ์ที่ต่ำที่สุด (1 ชม.)', freeActive.rewards[0].roleId === 'role-1');

  await pool.query(
    `INSERT INTO guild_subscriptions (guild_id, status, current_period_end)
     VALUES ($1, 'active', now() + interval '20 days')`,
    [PREMIUM_GUILD],
  );
  const premiumActive = await getActiveRoleRewards(PREMIUM_GUILD);
  check('Premium: ใช้ได้ทั้ง 3 เกณฑ์', premiumActive.premium && premiumActive.rewards.length === 3);

  // ── 5) เลือกผู้ที่ถึงเกณฑ์ ───────────────────────────────────
  const freePending = selectNewRoleRewards(totals, freeActive.rewards, new Set());
  check('ฟรี: แจกยศ 3 คน (A/B/C ถึง 1 ชม. ทุกคน)', freePending.length === 3, JSON.stringify(freePending.map((p) => p.userId)));

  const premiumPending = selectNewRoleRewards(totals, premiumActive.rewards, new Set());
  check('Premium: A ได้ 2 เกณฑ์, B ได้ 3, C ได้ 1 → 6 รายการ', premiumPending.length === 6, String(premiumPending.length));

  const secondRun = selectNewRoleRewards(totals, premiumActive.rewards, new Set(['userA:role-1', 'userB:role-2']));
  check('ให้ซ้ำไม่ได้: userA:role-1 หายจากรอบสอง', !secondRun.some((p) => p.userId === 'userA' && p.roleId === 'role-1'));

  // ── 6) กันซ้ำระดับ DB (PK) ──────────────────────────────────
  await pool.query(
    `INSERT INTO member_role_awards (guild_id, user_id, role_id, threshold_seconds)
     VALUES ($1,'userA','role-1',3600) ON CONFLICT DO NOTHING`,
    [GUILD],
  );
  const dup = await pool.query(
    `INSERT INTO member_role_awards (guild_id, user_id, role_id, threshold_seconds)
     VALUES ($1,'userA','role-1',3600) ON CONFLICT DO NOTHING`,
    [GUILD],
  );
  check('insert ยศซ้ำไม่เกิดแถวใหม่', dup.rowCount === 0);

  // ── 7) subscription หมดอายุ = ฟรี ───────────────────────────
  await pool.query(
    `UPDATE guild_subscriptions SET current_period_end = now() - interval '1 day' WHERE guild_id = $1`,
    [PREMIUM_GUILD],
  );
  invalidatePremiumCache(PREMIUM_GUILD); // แคช Premium มี TTL 60 วิ — ล้างเพื่อทดสอบทันที
  const expired = await getActiveRoleRewards(PREMIUM_GUILD);
  check('Premium หมดอายุ → กลับเป็นฟรี 1 เกณฑ์', !expired.premium && expired.rewards.length === FREE_ROLE_REWARD_LIMIT);

  // ── เก็บกวาด ────────────────────────────────────────────────
  await cleanup(pool, GUILD);
  await cleanup(pool, PREMIUM_GUILD);
  await pool.end();

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาดระหว่างทดสอบ:', error);
  process.exit(1);
});
