import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  LINKED_ROLES_PATH,
  buildLinkedRolesAuthorizeUrl,
  displayName,
  exchangeCode,
  fetchMe,
  getClientId,
  updateRoleConnection,
} from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "rem_lr_state";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlPage(options: {
  title: string;
  heading: string;
  body: string;
  button?: { href: string; label: string };
  status?: number;
}): NextResponse {
  const { title, heading, body, button, status = 200 } = options;
  const buttonHtml = button ? `<a class="btn" href="${button.href}">${button.label}</a>` : "";
  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — Rem</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
         font-family: "Prompt", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", sans-serif;
         background: #f8fafc; color: #0f172a; }
  .card { width: 100%; max-width: 440px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
  h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
  p { margin: 0; font-size: 14px; line-height: 1.7; color: #475569; }
  .btn { display: inline-block; margin-top: 20px; background: #2563eb; color: #ffffff; text-decoration: none;
         font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 8px; }
  .btn:hover { background: #1d4ed8; }
  .muted { margin-top: 20px; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${body}</p>
    ${buttonHtml}
    <p class="muted">Rem — บอทบันทึกห้องเสียง Discord</p>
  </main>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/**
 * URL ยืนยันบทบาทที่เชื่อมโยง (Linked Roles) — กรอกใน Developer Portal ช่อง
 * "Linked Roles Verification URL" และต้องเพิ่ม URL นี้ใน OAuth2 → Redirects ด้วย
 *
 * ขั้นตอน:
 * 1) ผู้ใช้กด "เชื่อมต่อ" ในหน้าตั้งค่ายศของ Discord → เปิดหน้านี้ (ไม่มี code)
 *    → เด้งต่อไปหน้า consent ของ Discord (scope: role_connections.write identify)
 * 2) Discord ส่ง code กลับมาที่หน้านี้ → แลก token → อัปเดต metadata ว่าผู้ใช้เชื่อมต่อแล้ว
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const discordError = url.searchParams.get("error");

  if (discordError) {
    return htmlPage({
      title: "ยกเลิกการเชื่อมต่อ",
      heading: "การเชื่อมต่อถูกยกเลิก",
      body: "คุณปิดหรือปฏิเสธหน้าต่างยืนยันก่อนการเชื่อมต่อสำเร็จ — กลับไปที่ Discord แล้วกดเชื่อมต่อบทบาทใหม่อีกครั้ง",
      button: { href: "https://discord.com/app", label: "กลับไปที่ Discord" },
    });
  }

  // ยังไม่มี code → เริ่มขั้นตอน OAuth2 (ผู้ใช้กด "เชื่อมต่อ" จากฝั่ง Discord)
  if (!code) {
    if (!getClientId()) {
      return htmlPage({
        title: "ยังตั้งค่าไม่ครบ",
        heading: "ยังตั้งค่าไม่ครบ",
        body: "เว็บไซต์นี้ยังไม่ได้ตั้งค่า DISCORD_CLIENT_ID — ผู้ดูแลระบบสามารถตั้งค่าได้ใน Vercel → Environment Variables",
        status: 500,
      });
    }
    const newState = crypto.randomBytes(16).toString("hex");
    const res = NextResponse.redirect(buildLinkedRolesAuthorizeUrl(url.origin, newState));
    res.cookies.set(STATE_COOKIE, newState, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  // กลับจากหน้า consent ของ Discord → ตรวจ state กัน CSRF
  const jar = await cookies();
  const savedState = jar.get(STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return htmlPage({
      title: "คำขอไม่ถูกต้อง",
      heading: "คำขอไม่ถูกต้อง",
      body: "สถานะการยืนยันไม่ตรงกัน — กลับไปที่ Discord แล้วเริ่มเชื่อมต่อบทบาทใหม่อีกครั้ง",
      button: { href: "https://discord.com/app", label: "กลับไปที่ Discord" },
      status: 400,
    });
  }

  try {
    const accessToken = await exchangeCode(`${url.origin}${LINKED_ROLES_PATH}`, code);
    const me = await fetchMe(accessToken);
    await updateRoleConnection(accessToken, {
      platformName: "Rem",
      platformUsername: displayName(me),
      metadata: { connected: "1" },
    });

    const res = htmlPage({
      title: "เชื่อมต่อสำเร็จ",
      heading: "เชื่อมต่อสำเร็จ",
      body: `บัญชี <strong>${escapeHtml(displayName(me))}</strong> เชื่อมต่อกับ Rem เรียบร้อยแล้ว — กลับไปที่ Discord เพื่อรับบทบาทของคุณได้เลย`,
      button: { href: "https://discord.com/app", label: "กลับไปที่ Discord" },
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (error) {
    console.error("[linked-roles] เชื่อมต่อไม่สำเร็จ:", error);
    return htmlPage({
      title: "เชื่อมต่อไม่สำเร็จ",
      heading: "เชื่อมต่อไม่สำเร็จ",
      body: "เกิดข้อผิดพลาดระหว่างเชื่อมต่อกับ Discord — ลองใหม่อีกครั้ง หรือเริ่มจาก Discord อีกครั้งในอีกสักครู่",
      button: { href: "https://discord.com/app", label: "กลับไปที่ Discord" },
      status: 500,
    });
  }
}
