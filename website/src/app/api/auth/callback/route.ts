import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { displayName, exchangeCode, fetchMe } from "@/lib/discord";
import {
  createSessionToken,
  hasSessionSecret,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รับ code จาก Discord → แลก token → สร้างเซสชัน → เข้าแดชบอร์ด */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const savedState = jar.get(OAUTH_STATE_COOKIE)?.value;

  const fail = () => {
    const res = NextResponse.redirect(new URL("/dashboard?login=failed", url));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  if (!code || !state || !savedState || state !== savedState || !hasSessionSecret()) {
    return fail();
  }

  try {
    const accessToken = await exchangeCode(`${url.origin}/api/auth/callback`, code);
    const me = await fetchMe(accessToken);

    const sessionToken = createSessionToken({
      id: me.id,
      username: me.username,
      displayName: displayName(me),
      avatar: me.avatar,
      accessToken,
    });

    const res = NextResponse.redirect(new URL("/dashboard", url));
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(url.protocol === "https:"));
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  } catch (error) {
    console.error("[auth] callback ไม่สำเร็จ:", error);
    return fail();
  }
}
