/**
 * ตัวช่วยเรียก Discord API (REST v10)
 * - OAuth2: login แดชบอร์ด (identify + guilds) และ Linked Roles (role_connections.write)
 * - Bot token: ดึงรายชื่อเซิร์ฟเวอร์/ห้อง ในเซิร์ฟเวอร์ที่บอทอยู่
 */

const API_BASE = "https://discord.com/api/v10";

/** path ของ endpoint ยืนยัน Linked Roles (ต้องตรงกับ URL ที่กรอกใน Developer Portal) */
export const LINKED_ROLES_PATH = "/api/linked-roles/verify";

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

export function getClientId(): string {
  return (process.env.DISCORD_CLIENT_ID ?? "").trim();
}

export function getClientSecret(): string {
  return (process.env.DISCORD_CLIENT_SECRET ?? "").trim();
}

export function getBotToken(): string {
  return (process.env.DISCORD_TOKEN ?? "").trim();
}

/** ตั้งค่า OAuth2 ครบหรือยัง (ใช้กับปุ่ม login / linked roles) */
export function isOAuthConfigured(): boolean {
  return Boolean(getClientId() && getClientSecret());
}

/** error ที่มีรหัส HTTP จาก Discord (ใช้แยกว่าเป็น 401 จริงหรือปัญหาชั่วคราว) */
export class DiscordApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
  }
}

/** เรียก Discord API พร้อม retry อัตโนมัติ 1 ครั้ง สำหรับ error ชั่วคราว (5xx / 429 / network) */
async function fetchDiscord(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (res.status >= 500 || res.status === 429) {
        lastError = new DiscordApiError(res.status, `Discord ตอบสถานะ ${res.status}`);
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("เชื่อมต่อ Discord ไม่ได้");
}

// ───────────────────────── OAuth2: login แดชบอร์ด ─────────────────────────

export function buildLoginAuthorizeUrl(origin: string, state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * แลก authorization code เป็น access token
 * @param redirectUri ต้องเป็น URL เดียวกันเป๊ะกับตอนเริ่ม authorize
 */
export async function exchangeCode(redirectUri: string, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordApiError(res.status, `แลก token ไม่สำเร็จ (${res.status}) ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("ไม่ได้รับ access token จาก Discord");
  return data.access_token;
}

export async function fetchMe(accessToken: string): Promise<DiscordUser> {
  const res = await fetchDiscord(`${API_BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new DiscordApiError(res.status, `ดึงข้อมูลผู้ใช้ไม่สำเร็จ (${res.status})`);
  return (await res.json()) as DiscordUser;
}

export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetchDiscord(`${API_BASE}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new DiscordApiError(res.status, `ดึงรายชื่อเซิร์ฟเวอร์ไม่สำเร็จ (${res.status})`);
  return (await res.json()) as DiscordGuild[];
}

// ───────────────────────── Bot token ─────────────────────────

export async function fetchBotGuildIds(): Promise<Set<string>> {
  const token = getBotToken();
  if (!token) return new Set();
  const res = await fetchDiscord(`${API_BASE}/users/@me/guilds`, {
    headers: { authorization: `Bot ${token}` },
  });
  if (!res.ok) throw new DiscordApiError(res.status, `ดึงรายชื่อเซิร์ฟเวอร์ของบอทไม่สำเร็จ (${res.status})`);
  const guilds = (await res.json()) as Array<{ id: string }>;
  return new Set(guilds.map((guild) => guild.id));
}

/** รายชื่อห้องข้อความ (text + announcement) ของเซิร์ฟเวอร์ — ใช้ทำ dropdown ตั้งค่า */
export async function fetchGuildTextChannels(guildId: string): Promise<DiscordChannel[]> {
  const token = getBotToken();
  if (!token) return [];
  const res = await fetchDiscord(`${API_BASE}/guilds/${guildId}/channels`, {
    headers: { authorization: `Bot ${token}` },
  });
  if (!res.ok) throw new DiscordApiError(res.status, `ดึงรายชื่อห้องไม่สำเร็จ (${res.status})`);
  const channels = (await res.json()) as DiscordChannel[];
  return channels.filter((channel) => channel.type === 0 || channel.type === 5).sort((a, b) => a.position - b.position);
}

// ───────────────────────── สิทธิ์ ─────────────────────────

const ADMINISTRATOR = 8n;
const MANAGE_GUILD = 32n;

/** ผู้ใช้จัดการเซิร์ฟเวอร์นี้ได้ไหม (เจ้าของ / Administrator / Manage Server) */
export function isAdminGuild(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  try {
    const perms = BigInt(guild.permissions || "0");
    return (perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n;
  } catch {
    return false;
  }
}

// ───────────────────────── รูปโปรไฟล์ ─────────────────────────

export function avatarUrl(user: { id: string; avatar: string | null }, size = 64): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
  }
  try {
    const index = Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export function guildIconUrl(guild: { id: string; icon: string | null }, size = 64): string | null {
  return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=${size}` : null;
}

export function displayName(user: DiscordUser): string {
  return user.global_name?.trim() || user.username;
}

// ───────────────────────── Linked Roles ─────────────────────────

/** URL เริ่ม OAuth2 ของ Linked Roles (scope: role_connections.write + identify) */
export function buildLinkedRolesAuthorizeUrl(origin: string, state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("redirect_uri", `${origin}${LINKED_ROLES_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "role_connections.write identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

/** อัปเดตการเชื่อมต่อบัญชีผู้ใช้กับแอป (ต้องใช้ token จาก scope role_connections.write) */
export async function updateRoleConnection(
  accessToken: string,
  params: { platformName: string; platformUsername: string; metadata: Record<string, string> },
): Promise<void> {
  const res = await fetch(`${API_BASE}/users/@me/applications/${getClientId()}/role-connection`, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      platform_name: params.platformName,
      platform_username: params.platformUsername,
      metadata: params.metadata,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordApiError(res.status, `อัปเดตการเชื่อมต่อไม่สำเร็จ (${res.status}) ${text.slice(0, 200)}`);
  }
}

// ───────────────────────── สถานะบอท ─────────────────────────

/** เช็คว่าบอท (Render) ตอบสนองอยู่ไหม — null = ติดต่อไม่ได้ */
export async function isBotOnline(): Promise<boolean | null> {
  try {
    const res = await fetch("https://rem-bot-discord.onrender.com/", {
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return null;
  }
}
