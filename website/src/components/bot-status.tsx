import { isBotOnline } from "@/lib/discord";

/** ชิปสถานะบอท (ใช้ใน Suspense — โหลดทีหลังไม่ให้บล็อกหน้า) */
export async function BotStatus() {
  const online = await isBotOnline();
  const label = online === true ? "บอทออนไลน์" : online === false ? "บอทออฟไลน์" : "ตรวจสอบสถานะไม่ได้";
  const dot = online === true ? "bg-emerald-500" : online === false ? "bg-slate-400" : "bg-amber-400";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function BotStatusFallback() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
      กำลังตรวจสอบสถานะ…
    </span>
  );
}
