import type { ReactNode } from "react";
import Link from "next/link";
import { DashHeader } from "@/components/dash-header";
import { LoginPrompt } from "@/components/login-prompt";
import { Note } from "@/components/note";
import { IconDiscord } from "@/components/icons";
import { loadGuildAccess } from "@/lib/auth";
import { fetchGuildTextChannels, guildIconUrl, type DiscordChannel } from "@/lib/discord";
import { getGuildSettings, getGuildStats, getVoiceLogs, type VoiceEvent, type VoiceLogRow } from "@/lib/db";
import { formatDateTimeTH, formatNumberTH } from "@/lib/format";
import { saveSettings } from "../actions";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1557023021825265775&permissions=8&integration_type=0&scope=bot+applications.commands";

const EVENT_LABELS: Record<VoiceEvent, string> = {
  join: "เข้าห้อง",
  leave: "ออกจากห้อง",
  move: "ย้ายห้อง",
};

const EVENT_BADGES: Record<VoiceEvent, string> = {
  join: "border-emerald-200 bg-emerald-50 text-emerald-700",
  leave: "border-rose-200 bg-rose-50 text-rose-700",
  move: "border-amber-200 bg-amber-50 text-amber-700",
};

const FILTERS: Array<{ key: VoiceEvent | null; label: string }> = [
  { key: null, label: "ทั้งหมด" },
  { key: "join", label: "เข้าห้อง" },
  { key: "leave", label: "ออกจากห้อง" },
  { key: "move", label: "ย้ายห้อง" },
];

const ERROR_MESSAGES: Record<string, string> = {
  auth: "เซสชันหมดอายุหรือคุณไม่มีสิทธิ์ในเซิร์ฟเวอร์นี้ — กรุณาเข้าสู่ระบบใหม่",
  invalid: "รูปแบบค่าที่ส่งมาไม่ถูกต้อง กรุณาเลือกห้องจากรายการ",
  save: "บันทึกค่าไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง",
};

function one(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function parsePage(value: string | string[] | undefined): number {
  const raw = one(value);
  const num = Number(raw ?? "1");
  return Number.isFinite(num) && num >= 1 ? Math.min(10_000, Math.floor(num)) : 1;
}

function parseEventFilter(value: string | string[] | undefined): VoiceEvent | null {
  const raw = one(value);
  return raw === "join" || raw === "leave" || raw === "move" ? raw : null;
}

function channelOptions(channels: DiscordChannel[], selected: string | null): ReactNode[] {
  const options: ReactNode[] = channels.map((channel) => (
    <option key={channel.id} value={channel.id}>
      # {channel.name}
    </option>
  ));
  if (selected && !channels.some((channel) => channel.id === selected)) {
    options.push(
      <option key={selected} value={selected}>
        # ช่องเดิม (ไม่พบในรายการปัจจุบัน)
      </option>,
    );
  }
  return options;
}

function roomText(row: VoiceLogRow): string {
  if (row.event === "move") {
    return `${row.fromChannelName ?? "?"} → ${row.toChannelName ?? "?"}`;
  }
  return row.channelName ?? "—";
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default async function GuildDetailPage(props: PageProps<"/dashboard/[guildId]">) {
  const { guildId } = await props.params;
  const searchParams = await props.searchParams;

  const access = await loadGuildAccess(guildId);

  if (!access.ok) {
    if (access.reason === "no-access") {
      return (
        <div className="min-h-screen bg-slate-50">
          <DashHeader session={null} />
          <div className="mx-auto max-w-md px-4 py-20">
            <div className="card p-8 text-center">
              <h1 className="text-lg font-semibold text-slate-900">ไม่มีสิทธิ์เข้าถึงเซิร์ฟเวอร์นี้</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                แดชบอร์ดจะแสดงเฉพาะเซิร์ฟเวอร์ที่คุณเป็นเจ้าของหรือมีสิทธิ์ผู้ดูแลเท่านั้น
              </p>
              <Link href="/dashboard" className="btn-secondary mt-6">
                กลับไปหน้าเซิร์ฟเวอร์ทั้งหมด
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50">
        <DashHeader session={null} />
        <LoginPrompt expired={access.reason === "token-expired"} />
      </div>
    );
  }

  const { session, guild, botGuildIds } = access.data;
  const botIn = botGuildIds.has(guildId);
  const icon = guildIconUrl(guild, 96);

  const page = parsePage(searchParams.page);
  const eventFilter = parseEventFilter(searchParams.type);
  const saved = one(searchParams.saved) === "1";
  const errorCode = one(searchParams.error);

  const [settings, stats, channels] = await Promise.all([
    getGuildSettings(guildId),
    getGuildStats(guildId),
    botIn ? fetchGuildTextChannels(guildId).catch(() => [] as DiscordChannel[]) : Promise.resolve([] as DiscordChannel[]),
  ]);

  let logs = await getVoiceLogs(guildId, { page, perPage: PER_PAGE, event: eventFilter });
  const totalPages = Math.max(1, Math.ceil(logs.total / PER_PAGE));
  if (page > totalPages) {
    logs = await getVoiceLogs(guildId, { page: totalPages, perPage: PER_PAGE, event: eventFilter });
  }

  const queryFor = (nextPage: number, type: VoiceEvent | null) => {
    const sp = new URLSearchParams();
    if (type) sp.set("type", type);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return `/dashboard/${guildId}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <DashHeader session={session} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link href="/dashboard" className="text-sm text-slate-500 transition-colors hover:text-slate-800">
          ← เซิร์ฟเวอร์ทั้งหมด
        </Link>

        {/* หัวเซิร์ฟเวอร์ */}
        <div className="mt-4 flex items-center gap-4">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" width={56} height={56} className="h-14 w-14 rounded-full bg-slate-100" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-base font-semibold text-blue-700">
              {guild.name.slice(0, 2)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{guild.name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>ไอดี {guild.id}</span>
              <span className={botIn ? "text-emerald-700" : "text-amber-700"}>
                {botIn ? "· บอทอยู่ในเซิร์ฟเวอร์" : "· ยังไม่ได้เพิ่มบอท"}
              </span>
            </p>
          </div>
        </div>

        {saved ? <Note tone="emerald">บันทึกการตั้งค่าเรียบร้อยแล้ว</Note> : null}
        {errorCode ? <Note tone="rose">{ERROR_MESSAGES[errorCode] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"}</Note> : null}

        {!botIn ? (
          <div className="card mt-6 p-6">
            <h2 className="text-base font-semibold text-slate-900">บอท Rem ยังไม่ได้อยู่ในเซิร์ฟเวอร์นี้</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              เพิ่มบอทก่อนเพื่อเปิดใช้ระบบบันทึก และเพื่อให้สามารถเลือกห้องจากรายการได้ —
              หลังจากเพิ่มแล้ว กลับมาที่หน้านี้ได้ทันที
            </p>
            <a
              href={`${INVITE_URL}&guild_id=${guildId}`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary mt-5"
            >
              <IconDiscord className="h-4 w-4" />
              เพิ่มบอทเข้าเซิร์ฟเวอร์นี้
            </a>
          </div>
        ) : (
          <form action={saveSettings} className="card mt-6 p-6">
            <h2 className="text-base font-semibold text-slate-900">ตั้งค่าห้องของบอท</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              เลือกห้องสำหรับบันทึก voice log และรายงานสรุปประจำสัปดาห์ — บันทึกแล้วมีผลทันที
              (ไม่ต้องรีสตาร์ทบอท)
            </p>
            <input type="hidden" name="guild_id" value={guildId} />
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="log_channel">ห้องบันทึก voice log</label>
                <select
                  id="log_channel"
                  name="log_channel"
                  defaultValue={settings?.logChannelId ?? ""}
                  className="input"
                >
                  <option value="">— ไม่ตั้งค่า —</option>
                  {channelOptions(channels, settings?.logChannelId ?? null)}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">
                  ทุกครั้งที่มีคนเข้า–ออก–ย้ายห้องเสียง ข้อความจะถูกส่งเข้าห้องนี้
                </p>
              </div>
              <div>
                <label className="label" htmlFor="weekly_channel">ห้องรับรายงานประจำสัปดาห์</label>
                <select
                  id="weekly_channel"
                  name="weekly_channel"
                  defaultValue={settings?.weeklyChannelId ?? ""}
                  className="input"
                >
                  <option value="">— ปิดรายงาน —</option>
                  {channelOptions(channels, settings?.weeklyChannelId ?? null)}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">
                  สรุปภาพรวมส่งอัตโนมัติทุกวันจันทร์ 09:00 น. (เวลาไทย)
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button type="submit" className="btn-primary">บันทึกการตั้งค่า</button>
              <p className="text-xs text-slate-400">เฉพาะผู้ดูแลเซิร์ฟเวอร์เท่านั้นที่บันทึกได้</p>
            </div>
          </form>
        )}

        {/* สถิติรวม */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="เหตุการณ์ทั้งหมด" value={formatNumberTH(stats.total)} hint="ครั้ง" />
          <StatTile label="สมาชิกที่มีข้อมูล" value={formatNumberTH(stats.members)} hint="คน" />
          <StatTile label="บันทึกล่าสุด" value={formatDateTimeTH(stats.lastAt)} />
        </div>

        {/* ประวัติ */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">ประวัติล่าสุด</h2>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
              {FILTERS.map((filter) => {
                const active = filter.key === eventFilter;
                return (
                  <Link
                    key={filter.label}
                    href={queryFor(1, filter.key)}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      active ? "bg-blue-50 font-medium text-blue-700" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {filter.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="card mt-4 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">เวลา</th>
                    <th className="px-4 py-3 font-medium">สมาชิก</th>
                    <th className="px-4 py-3 font-medium">เหตุการณ์</th>
                    <th className="px-4 py-3 font-medium">ห้อง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">
                        ยังไม่มีข้อมูลในช่วงนี้ — เมื่อมีคนเข้า–ออกห้องเสียง รายการจะขึ้นที่นี่
                      </td>
                    </tr>
                  ) : (
                    logs.rows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-slate-500">
                          {formatDateTimeTH(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.username}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              EVENT_BADGES[row.event] ?? "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {EVENT_LABELS[row.event] ?? row.event}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{roomText(row)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
                {page > 1 ? (
                  <Link href={queryFor(page - 1, eventFilter)} className="text-blue-600 hover:text-blue-700">
                    ← ก่อนหน้า
                  </Link>
                ) : (
                  <span className="text-slate-300">← ก่อนหน้า</span>
                )}
                <span className="text-xs text-slate-500">
                  หน้า {Math.min(page, totalPages)} / {totalPages} · {formatNumberTH(logs.total)} รายการ
                </span>
                {page < totalPages ? (
                  <Link href={queryFor(page + 1, eventFilter)} className="text-blue-600 hover:text-blue-700">
                    ถัดไป →
                  </Link>
                ) : (
                  <span className="text-slate-300">ถัดไป →</span>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <div className="h-10" />
      </main>
    </div>
  );
}
