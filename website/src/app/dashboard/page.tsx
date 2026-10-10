import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { BotStatus, BotStatusFallback } from "@/components/bot-status";
import { DashHeader } from "@/components/dash-header";
import { LoginPrompt } from "@/components/login-prompt";
import { Note } from "@/components/note";
import { IconArrowRight, IconDiscord } from "@/components/icons";
import { loadAdminGuilds } from "@/lib/auth";
import { guildIconUrl } from "@/lib/discord";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "แดชบอร์ด",
};

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1557023021825265775&permissions=8&integration_type=0&scope=bot+applications.commands";

function Badge({ tone, children }: { tone: "green" | "amber" | "slate"; children: ReactNode }) {
  const styles = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const searchParams = await props.searchParams;
  const loginState = Array.isArray(searchParams.login) ? searchParams.login[0] : searchParams.login;

  const result = await loadAdminGuilds();

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-slate-50">
        <DashHeader session={null} />
        {loginState === "config" ? (
          <div className="mx-auto mt-8 max-w-md px-4">
            <Note tone="amber">
              ยังตั้งค่าการเข้าสู่ระบบไม่ครบ — ต้องกำหนดค่า <code>DISCORD_CLIENT_ID</code>,{" "}
              <code>DISCORD_CLIENT_SECRET</code> และ <code>SESSION_SECRET</code> ใน Environment Variables ก่อน
              (ดูวิธีตั้งค่าใน README ของโปรเจกต์)
            </Note>
          </div>
        ) : loginState === "failed" ? (
          <div className="mx-auto mt-8 max-w-md px-4">
            <Note tone="rose">เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง</Note>
          </div>
        ) : null}
        <LoginPrompt expired={result.reason === "token-expired"} />
      </div>
    );
  }

  const { session, adminGuilds, botGuildIds } = result.data;

  return (
    <div className="min-h-screen bg-slate-50">
      <DashHeader session={session} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">เซิร์ฟเวอร์ของคุณ</h1>
            <p className="mt-1 text-sm text-slate-500">
              เลือกเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแลเพื่อจัดการบอทและดูประวัติ
            </p>
          </div>
          <Suspense fallback={<BotStatusFallback />}>
            <BotStatus />
          </Suspense>
        </div>

        {loginState === "failed" ? <Note tone="rose">เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง</Note> : null}

        {adminGuilds.length === 0 ? (
          <div className="card mt-8 p-10 text-center">
            <p className="text-sm leading-6 text-slate-600">
              ยังไม่พบเซิร์ฟเวอร์ที่คุณมีสิทธิ์ผู้ดูแล
              <br />
              เชิญบอทเข้าเซิร์ฟเวอร์ก่อน แล้วกลับมาที่หน้านี้อีกครั้ง
            </p>
            <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary mt-6">
              <IconDiscord className="h-4 w-4" />
              เพิ่มบอทเข้าเซิร์ฟเวอร์
            </a>
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {adminGuilds.map((guild) => {
              const icon = guildIconUrl(guild, 64);
              const botIn = botGuildIds.has(guild.id);
              return (
                <li key={guild.id}>
                  <Link
                    href={`/dashboard/${guild.id}`}
                    className="card flex items-center gap-4 p-4 transition-colors hover:border-blue-300"
                  >
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" width={44} height={44} className="h-11 w-11 rounded-full bg-slate-100" />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                        {guild.name.slice(0, 2)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{guild.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {guild.owner ? <Badge tone="slate">เจ้าของ</Badge> : null}
                        {botIn ? (
                          <Badge tone="green">บอทอยู่ในเซิร์ฟเวอร์</Badge>
                        ) : (
                          <Badge tone="amber">ยังไม่ได้เพิ่มบอท</Badge>
                        )}
                      </span>
                    </span>
                    <IconArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-center text-xs text-slate-400">
          แดชบอร์ดแสดงเฉพาะเซิร์ฟเวอร์ที่คุณเป็นเจ้าของหรือมีสิทธิ์ผู้ดูแล (Administrator / Manage Server)
        </p>
      </main>
    </div>
  );
}
