/**
 * ระบบเซสชันของแดชบอร์ด (ลงชื่อด้วย HMAC — ไม่ต้องใช้ไลบรารีเพิ่ม)
 *
 * คุกกี้ `rem_session` เก็บข้อมูลผู้ใช้ที่ login ด้วย Discord + access token
 * โดย payload ถูกเซ็นด้วย SESSION_SECRET — ปลอมแปลงไม่ได้
 * (คุกกี้เป็น httpOnly; อ่านค่าได้แค่ฝั่งเซิร์ฟเวอร์)
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rem_session";
export const OAUTH_STATE_COOKIE = "rem_oauth_state";

/** อายุเซสชัน 7 วัน (เท่าอายุ access token ของ Discord ในโหมดปกติ) */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  accessToken: string;
  exp: number;
}

function sessionSecret(): string {
  return (process.env.SESSION_SECRET ?? "").trim();
}

/** ตั้งค่า SESSION_SECRET แล้วหรือยัง (จำเป็นสำหรับ login) */
export function hasSessionSecret(): boolean {
  return sessionSecret().length > 0;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** สร้างค่า cookie ของเซสชันผู้ใช้ */
export function createSessionToken(user: Omit<SessionUser, "exp">): string {
  const body = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** ตรวจสอบ + ถอดค่า cookie ของเซสชัน (คืน null ถ้าไม่ถูกต้อง/หมดอายุ) */
export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token || !hasSessionSecret()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
    if (!data || typeof data !== "object") return null;
    if (typeof data.id !== "string" || typeof data.accessToken !== "string") return null;
    if (typeof data.exp !== "number" || data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** อ่านเซสชันปัจจุบันจากคุกกี้ (ใช้ได้ใน Server Component / Route Handler) */
export async function getSession(): Promise<SessionUser | null> {
  if (!hasSessionSecret()) return null;
  const jar = await cookies();
  return parseSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** ออปชันคุกกี้ของเซสชัน (secure = true เมื่อรันบน https) */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
