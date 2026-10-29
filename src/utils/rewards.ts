/**
 * src/utils/rewards.ts
 * Role rewards แบบ voice-only (ไม่ต้องใช้ Message Content intent)
 *
 * หลักการ:
 *  - คิด "ชั่วโมงสะสมในห้องเสียง" จากตาราง voice_logs (จับคู่ join → leave)
 *    + เซสชันที่ยังเปิดอยู่ของคนที่อยู่ในห้องตอนนี้
 *  - ให้ยศอัตโนมัติเมื่อถึงเกณฑ์ — ฟรีจำกัด 1 เกณฑ์, Premium ไม่จำกัด
 *  - ประกาศลงห้องที่ตั้งไว้ (ถ้าไม่มีสิทธิ์/ห้องหาย จะข้ามการประกาศ แต่ยังให้ยศ)
 *  - ทำงานเป็นรอบทุก 10 นาที (กันรันซ้อน) — ตั้งใจให้ช้า ๆ พอ ไม่กิน CPU
 */
import { ChannelType, Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getPool, isDbReady } from './db';
import { isPremium } from './premium';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 45 * 1000;
const MAX_ANNOUNCEMENTS_PER_RUN = 10;

/** จำนวนเกณฑ์ให้ยศที่ใช้ได้ในแพ็กเกจฟรี (Premium = ไม่จำกัด) */
export const FREE_ROLE_REWARD_LIMIT = 1;

export type RetentionMode = 'all' | 'highest';

export interface RewardConfig {
  announceChannelId: string | null;
  rewardsEnabled: boolean;
  retention: RetentionMode;
}

export interface RoleReward {
  id: string;
  thresholdSeconds: number;
  roleId: string;
}

export interface VoiceTotal {
  userId: string;
  seconds: number;
}

const EMPTY_CONFIG: RewardConfig = {
  announceChannelId: null,
  rewardsEnabled: false,
  retention: 'all',
};

/** ชั่วโมงสะสมของทุกคนในเซิร์ฟเวอร์ (closed sessions + session ที่ยังเปิดอยู่) */
export async function getVoiceTotals(guildId: string): Promise<VoiceTotal[]> {
  const pool = getPool();
  if (!pool || !isDbReady()) return [];

  try {
    const result = await pool.query<{ user_id: string; closed_seconds: string; open_seconds: string }>(
      `WITH ev AS (
         SELECT user_id, event, created_at,
                LAG(event) OVER w AS prev_event,
                LAG(created_at) OVER w AS prev_at,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
           FROM voice_logs
          WHERE guild_id = $1 AND event IN ('join', 'leave')
         WINDOW w AS (PARTITION BY user_id ORDER BY created_at, id)
       )
       SELECT user_id,
              COALESCE(SUM(CASE WHEN event = 'leave' AND prev_event = 'join'
                                THEN EXTRACT(EPOCH FROM (created_at - prev_at)) END), 0)::bigint AS closed_seconds,
              COALESCE(MAX(CASE WHEN rn = 1 AND event = 'join'
                                THEN EXTRACT(EPOCH FROM (now() - created_at)) END), 0)::bigint AS open_seconds
         FROM ev
        GROUP BY user_id`,
      [guildId],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      seconds: Number(row.closed_seconds) + Number(row.open_seconds),
    }));
  } catch (error) {
    console.error('[rewards] คำนวณชั่วโมงสะสมไม่สำเร็จ:', error);
    return [];
  }
}

/** อ่านค่าตั้งโมดูล (ไม่มีแถว = ปิด) */
export async function getRewardConfig(guildId: string): Promise<RewardConfig> {
  const pool = getPool();
  if (!pool || !isDbReady()) return { ...EMPTY_CONFIG };

  try {
    const result = await pool.query<{
      announce_channel_id: string | null;
      rewards_enabled: boolean;
      retention: RetentionMode;
    }>(
      `SELECT announce_channel_id, rewards_enabled, retention
         FROM guild_reward_config WHERE guild_id = $1`,
      [guildId],
    );
    const row = result.rows[0];
    if (!row) return { ...EMPTY_CONFIG };
    return {
      announceChannelId: row.announce_channel_id,
      rewardsEnabled: row.rewards_enabled,
      retention: row.retention === 'highest' ? 'highest' : 'all',
    };
  } catch (error) {
    console.error('[rewards] อ่านค่าตั้งไม่สำเร็จ:', error);
    return { ...EMPTY_CONFIG };
  }
}

/** เกณฑ์ให้ยศ (เรียงจากน้อยไปมาก) */
export async function getRoleRewards(guildId: string): Promise<RoleReward[]> {
  const pool = getPool();
  if (!pool || !isDbReady()) return [];

  try {
    const result = await pool.query<{ id: string; threshold_seconds: string; role_id: string }>(
      `SELECT id::text AS id, threshold_seconds, role_id
         FROM guild_role_rewards
        WHERE guild_id = $1 AND kind = $2
        ORDER BY threshold_seconds ASC`,
      [guildId, 'voice'],
    );
    return result.rows.map((row) => ({
      id: row.id,
      thresholdSeconds: Number(row.threshold_seconds),
      roleId: row.role_id,
    }));
  } catch (error) {
    console.error('[rewards] อ่านเกณฑ์ยศไม่สำเร็จ:', error);
    return [];
  }
}

/** เกณฑ์ที่ "มีผลจริง" ตามแพ็กเกจ — ฟรีใช้ได้เฉพาะเกณฑ์ที่ต่ำที่สุด 1 เกณฑ์ */
export async function getActiveRoleRewards(guildId: string): Promise<{ rewards: RoleReward[]; premium: boolean }> {
  const [rewards, premium] = await Promise.all([getRoleRewards(guildId), isPremium(guildId)]);
  return {
    rewards: premium ? rewards : rewards.slice(0, FREE_ROLE_REWARD_LIMIT),
    premium,
  };
}

async function getAwardedRoles(guildId: string): Promise<Set<string>> {
  const pool = getPool();
  if (!pool || !isDbReady()) return new Set();

  try {
    const result = await pool.query<{ user_id: string; role_id: string }>(
      'SELECT user_id, role_id FROM member_role_awards WHERE guild_id = $1',
      [guildId],
    );
    return new Set(result.rows.map((row) => `${row.user_id}:${row.role_id}`));
  } catch {
    return new Set();
  }
}

/** เลือกยศที่ยังไม่เคยให้ และถึงเกณฑ์แล้ว (pure — ใช้ทดสอบได้) */
export function selectNewRoleRewards(
  totals: VoiceTotal[],
  rewards: RoleReward[],
  awarded: Set<string>,
): Array<{ userId: string; roleId: string; thresholdSeconds: number; seconds: number }> {
  const out: Array<{ userId: string; roleId: string; thresholdSeconds: number; seconds: number }> = [];
  for (const total of totals) {
    for (const reward of rewards) {
      if (total.seconds < reward.thresholdSeconds) continue;
      if (awarded.has(`${total.userId}:${reward.roleId}`)) continue;
      out.push({ userId: total.userId, roleId: reward.roleId, thresholdSeconds: reward.thresholdSeconds, seconds: total.seconds });
    }
  }
  return out;
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return Number.isInteger(hours) ? `${hours} ชม.` : `${hours.toFixed(1)} ชม.`;
}

/** ประกาศผลลงห้อง (ถ้าตั้งไว้) */
async function announce(client: Client, guildId: string, channelId: string | null, embed: EmbedBuilder): Promise<void> {
  if (!channelId) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel =
    guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await (channel as TextChannel).send({ embeds: [embed] }).catch((error) => {
    console.warn(`[rewards] ประกาศไม่สำเร็จ (${guildId}):`, error instanceof Error ? error.message : error);
  });
}

/** ตรวจเซิร์ฟเวอร์เดียว: ให้ยศที่ถึงเกณฑ์ แล้วบันทึก/ประกาศ */
export async function evaluateGuild(client: Client, guildId: string): Promise<{ roles: number }> {
  const config = await getRewardConfig(guildId);
  if (!config.rewardsEnabled) return { roles: 0 };

  const guild = client.guilds.cache.get(guildId);
  const pool = getPool();
  if (!guild || !pool || !isDbReady()) return { roles: 0 };

  const { rewards } = await getActiveRoleRewards(guildId);
  if (!rewards.length) return { roles: 0 };

  const totals = await getVoiceTotals(guildId);
  if (!totals.length) return { roles: 0 };

  const awardedRoles = await getAwardedRoles(guildId);
  const pending = selectNewRoleRewards(totals, rewards, awardedRoles);

  let roles = 0;
  let announcements = 0;

  for (const item of pending) {
    const member = await guild.members.fetch(item.userId).catch(() => null);
    if (!member) continue;

    if (member.roles.cache.has(item.roleId)) {
      // มียศอยู่แล้ว (ให้ด้วยมือ) → บันทึกว่าให้แล้ว ไม่ต้องประกาศซ้ำ
      await pool
        .query(
          `INSERT INTO member_role_awards (guild_id, user_id, role_id, threshold_seconds)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [guildId, item.userId, item.roleId, item.thresholdSeconds],
        )
        .catch(() => null);
      continue;
    }

    const added = await member.roles
      .add(item.roleId, `Ruru: ถึงเกณฑ์ ${formatHours(item.thresholdSeconds)} ในห้องเสียง`)
      .then(() => true)
      .catch((error) => {
        console.warn(`[rewards] ให้ยศไม่สำเร็จ (${guildId}/${item.userId}):`, error instanceof Error ? error.message : error);
        return false;
      });

    if (!added) continue;
    roles += 1;

    await pool
      .query(
        `INSERT INTO member_role_awards (guild_id, user_id, role_id, threshold_seconds)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [guildId, item.userId, item.roleId, item.thresholdSeconds],
      )
      .catch((error) => console.error('[rewards] บันทึกยศไม่สำเร็จ:', error));

    // โหมด "เก็บเฉพาะยศสูงสุด": ถอดยศเก่าที่เบ่ากว่า (เฉพาะที่ตั้งไว้ในโมดูลนี้)
    if (config.retention === 'highest') {
      const lower = rewards.filter((reward) => reward.thresholdSeconds < item.thresholdSeconds);
      for (const reward of lower) {
        if (!member.roles.cache.has(reward.roleId)) continue;
        await member.roles
          .remove(reward.roleId, 'Ruru: ได้ยศที่สูงกว่าแล้ว (retention = highest)')
          .catch(() => null);
      }
    }

    if (announcements < MAX_ANNOUNCEMENTS_PER_RUN) {
      const embed = new EmbedBuilder()
        .setColor(0xffd166)
        .setTitle('🏅 ได้รับยศจากเวลาในห้องเสียง')
        .setDescription(
          `<@${item.userId}> ถึงเกณฑ์ **${formatHours(item.thresholdSeconds)}** แล้ว ได้รับ <@&${item.roleId}>`,
        )
        .setTimestamp();

      await announce(client, guildId, config.announceChannelId, embed);
      announcements += 1;
    }
  }

  return { roles };
}

/** ตรวจทุกเซิร์ฟเวอร์ที่เปิดโมดูลไว้ (เรียกทุก 10 นาที) */
async function runAll(client: Client): Promise<void> {
  const pool = getPool();
  if (!pool || !isDbReady()) return;

  const result = await pool.query<{ guild_id: string }>(
    'SELECT guild_id FROM guild_reward_config WHERE rewards_enabled',
  );

  for (const row of result.rows) {
    try {
      const outcome = await evaluateGuild(client, row.guild_id);
      if (outcome.roles) {
        console.log(`[rewards] ${row.guild_id}: ให้ยศใหม่ ${outcome.roles} รายการ`);
      }
    } catch (error) {
      console.error(`[rewards] ตรวจเซิร์ฟเวอร์ ${row.guild_id} ไม่สำเร็จ:`, error);
    }
  }
}

/** เริ่มตัวจ่ายรางวัล (เรียกครั้งเดียวตอนบอทออนไลน์) */
export function startRewardsScheduler(client: Client): void {
  let running = false;

  const tick = (): void => {
    if (running) return;
    running = true;
    runAll(client)
      .catch((error) => console.error('[rewards] รอบตรวจผิดพลาด:', error))
      .finally(() => {
        running = false;
      });
  };

  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log('🏅 ระบบ Role rewards พร้อมแล้ว — ตรวจทุก 10 นาที');
}
