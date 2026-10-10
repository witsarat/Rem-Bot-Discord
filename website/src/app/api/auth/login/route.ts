import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildLoginAuthorizeUrl, isOAuthConfigured } from "@/lib/discord";
import { hasSessionSecret, OAUTH_STATE_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เริ่มขั้นตอน login ด้วย Discord (OAuth2) */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  if (!isOAuthConfigured() || !hasSessionSecret()) {
    return NextResponse.redirect(new URL("/dashboard?login=config", url));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildLoginAuthorizeUrl(url.origin, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return res;
}
