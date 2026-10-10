/**
 * ตัวตรวจสอบสิทธิ์การเข้าถึงแดชบอร์ด
 * - ใช้เซสชัน (cookie) + รายชื่อเซิร์ฟเวอร์ของผู้ใช้จาก Discord
 * - ผู้ใช้จัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองเป็นเจ้าของ/มีสิทธิ์ผู้ดูแล
 */
import { getSession, type SessionUser } from "./session";
import { fetchBotGuildIds, fetchUserGuilds, isAdminGuild, type DiscordGuild } from "./discord";

export type { SessionUser };

export type AccessResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "no-session" | "token-expired" | "no-access" };

export interface AdminGuildsData {
  session: SessionUser;
  adminGuilds: DiscordGuild[];
  botGuildIds: Set<string>;
}

/** โหลดรายชื่อเซิร์ฟเวอร์ที่ผู้ใช้ login เป็นผู้ดูแล */
export async function loadAdminGuilds(): Promise<AccessResult<AdminGuildsData>> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "no-session" };

  try {
    const [guilds, botGuildIds] = await Promise.all([
      fetchUserGuilds(session.accessToken),
      fetchBotGuildIds().catch(() => new Set<string>()),
    ]);
    const adminGuilds = guilds
      .filter(isAdminGuild)
      .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, "th"));
    return { ok: true, data: { session, adminGuilds, botGuildIds } };
  } catch {
    return { ok: false, reason: "token-expired" };
  }
}

export interface GuildAccessData {
  session: SessionUser;
  guild: DiscordGuild;
  botGuildIds: Set<string>;
}

/** โหลดเซิร์ฟเวอร์เดียว + ตรวจสิทธิ์ผู้ดูแล (ใช้ทั้งหน้าเพจและตอนบันทึกค่า) */
export async function loadGuildAccess(guildId: string): Promise<AccessResult<GuildAccessData>> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "no-session" };

  try {
    const guilds = await fetchUserGuilds(session.accessToken);
    const guild = guilds.find((item) => item.id === guildId);
    if (!guild || !isAdminGuild(guild)) return { ok: false, reason: "no-access" };

    const botGuildIds = await fetchBotGuildIds().catch(() => new Set<string>());
    return { ok: true, data: { session, guild, botGuildIds } };
  } catch {
    return { ok: false, reason: "token-expired" };
  }
}
