import type { ReactNode } from "react";

const TONES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

/** แบนเนอร์แจ้งเตือนแบบสั้น ๆ (สำเร็จ / ผิดพลาด / ข้อมูล) */
export function Note({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <div className={`mt-6 rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}
