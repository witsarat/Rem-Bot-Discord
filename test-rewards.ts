/**
 * test-rewards.ts — ทดสอบ Achievements + Role rewards (voice-only)
 * รันด้วย: PGSSLMODE=disable DATABASE_URL=postgres://localhost/rem_bot_test npx tsx test-rewards.ts
 */
import 'dotenv/config';
import { getPool, initDb, isDbReady } from './src/utils/db';
import {
  DEFAULT_TIERS,
  getAchievementTiers,
  getRewardConfig,
  getRoleRewards,
  getVoiceTotals,
  selectNewAchievements,
  selectNewRoleRewards,
} from './src/utils/rewards';

const GUILD = '999900000000000555';
const HOUR = 3600;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  await initDb();
  const pool = getPool();
  if (!pool || !isDbReady()) {
    console.log('❌ DB ไม่พร้อม');
    process.exit(1);
  }

  await pool.query('DELETE FROM voice_logs WHERE guild_id = $1', [GUILD]);
  await pool.query('DELETE FROM guild_reward_config WHERE guild_id = $1', [GUILD]);
  await pool.query('DELETE FROM guild_achievements WHERE guild_id = $1', [GUILD]);
  await pool.query('DELETE FROM guild_role_rewards WHERE guild_id = $1', [GUILD]);
  await pool.query('DELETE FROM member_achievements WHERE guild_id = $1', [GUILD]);
  await pool.query('DELETE FROM member_role_awards WHERE guild_id = $1', [GUILD]);

  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR * 1000);

  // userA: 5 ชม. ปิดแล้ว (3+2) • userB: 12 ชม. ครั้งเดียว • userC: เปิดค้างไว้ 2 ชม.
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
      [GUILD, userId, userId.toUpperCase(), event, 'chan-1', 'General', createdAt],
    );
  }

  // ── 1) ชั่วโมงสะสม ───────────────────────────────────────────
  const totals = await getVoiceTotals(GUILD);
  const byUser = new Map(totals.map((t) => [t.userId, t.seconds]));
  check('userA = 5 ชม.', Math.abs((byUser.get('userA') ?? 0) - 5 * HOUR) < 90, `${(byUser.get('userA') ?? 0) / HOUR} ชม.`);
  check('userB = 12 ชม.', Math.abs((byUser.get('userB') ?? 0) - 12 * HOUR) < 90, `${(byUser.get('userB') ?? 0) / HOUR} ชม.`);
  check('userC (เปิดค้าง) ≈ 2 ชม.', Math.abs((byUser.get('userC') ?? 0) - 2 * HOUR) < 120, `${(byUser.get('userC') ?? 0) / HOUR} ชม.`);

  // ── 2) ค่าเริ่มต้น: ปิดทุกโมดูล ──────────────────────────────
  const cfg0 = await getRewardConfig(GUILD);
  check('ยังไม่ตั้งค่า → โมดูลปิดทั้งหมด', !cfg0.achievementsEnabled && !cfg0.rewardsEnabled);

  // ── 3) บันทึกค่าตั้ง + เกณฑ์ ─────────────────────────────────
  await pool.query(
    `INSERT INTO guild_reward_config (guild_id, announce_channel_id, achievements_enabled, rewards_enabled, retention)
     VALUES ($1, $2, true, true, 'highest')`,
    [GUILD, '123456789012345678'],
  );
  await pool.query(
    `INSERT INTO guild_achievements (guild_id, kind, tier, threshold_seconds) VALUES
       ($1,'voice','copper',3600), ($1,'voice','bronze',10800), ($1,'voice','silver',36000)`,
    [GUILD],
  );
  await pool.query(
    `INSERT INTO guild_role_rewards (guild_id, kind, threshold_seconds, role_id) VALUES
       ($1,'voice',3600,'role-1'), ($1,'voice',10800,'role-2')`,
    [GUILD],
  );

  const cfg = await getRewardConfig(GUILD);
  check('อ่านค่าตั้งได้ (announce + highest)', cfg.announceChannelId === '123456789012345678' && cfg.retention === 'highest');

  const tiers = await getAchievementTiers(GUILD);
  check('เกณฑ์ achievement เรียงจากน้อยไปมาก (3 ระดับ)', tiers.length === 3 && tiers[0].thresholdSeconds === 3600, JSON.stringify(tiers));
  check('เซิร์ฟเวอร์ใหม่ได้เกณฑ์มาตรฐาน 4 ระดับ', (await getAchievementTiers('999900000000000999')).length === DEFAULT_TIERS.length);

  const rewards = await getRoleRewards(GUILD);
  check('เกณฑ์ยศ 2 รายการ เรียงถูก', rewards.length === 2 && rewards[1].roleId === 'role-2');

  // ── 4) เลือกผู้ที่ถึงเกณฑ์ (ยังไม่เคยได้) ─────────────────────
  const newAchievements = selectNewAchievements(totals, tiers, new Set());
  check(
    'achievement ที่ต้องให้ = 6 รายการ (A 5 ชม.→2, B 12 ชม.→3, C 2 ชม.→1)',
    newAchievements.length === 6,
    JSON.stringify(newAchievements.map((a) => `${a.userId}:${a.tier}`)),
  );
  check('userA ได้ copper', newAchievements.some((a) => a.userId === 'userA' && a.tier === 'copper'));
  check('userA ไม่ได้ silver (5 ชม. < 10 ชม.)', !newAchievements.some((a) => a.userId === 'userA' && a.tier === 'silver'));
  check('userB ได้ทั้ง 3 ระดับ', newAchievements.filter((a) => a.userId === 'userB').length === 3);

  const afterAward = new Set(['userA:copper', 'userB:bronze']);
  const second = selectNewAchievements(totals, tiers, afterAward);
  check('ให้ซ้ำไม่ได้: userA:copper หายจากรอบสอง', !second.some((a) => a.userId === 'userA' && a.tier === 'copper'));

  const newRoles = selectNewRoleRewards(totals, rewards, new Set());
  check('ยศที่ต้องให้ = 5 รายการ (A 2, B 2, C 1)', newRoles.length === 5, JSON.stringify(newRoles.map((r) => `${r.userId}:${r.roleId}`)));
  check(
    'โหมด highest: B ได้ role-2 (3 ชม.)',
    newRoles.some((r) => r.userId === 'userB' && r.roleId === 'role-2'),
  );

  // ── 5) กันซ้ำระดับ DB (PK) ──────────────────────────────────
  await pool.query(
    `INSERT INTO member_achievements (guild_id, user_id, kind, tier, threshold_seconds)
     VALUES ($1,'userA','voice','copper',3600) ON CONFLICT DO NOTHING`,
    [GUILD],
  );
  const dup = await pool.query(
    `INSERT INTO member_achievements (guild_id, user_id, kind, tier, threshold_seconds)
     VALUES ($1,'userA','voice','copper',3600) ON CONFLICT DO NOTHING`,
    [GUILD],
  );
  check('insert achievement ซ้ำไม่เกิดแถวใหม่', dup.rowCount === 0);

  const awardedCount = await pool.query('SELECT count(*)::int AS n FROM member_achievements WHERE guild_id = $1', [GUILD]);
  check('มี achievement ที่บันทึก 1 แถว', awardedCount.rows[0].n === 1);

  // ── เก็บกวาด ────────────────────────────────────────────────
  for (const table of ['voice_logs', 'guild_reward_config', 'guild_achievements', 'guild_role_rewards', 'member_achievements', 'member_role_awards']) {
    await pool.query(`DELETE FROM ${table} WHERE guild_id = $1`, [GUILD]);
  }
  await pool.end();

  console.log('');
  console.log(failures === 0 ? '🎉 ผ่านทั้งหมด!' : `❌ ล้มเหลว ${failures} รายการ`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('เกิดข้อผิดพลาดระหว่างทดสอบ:', error);
  process.exit(1);
});
