import { IconSpinner } from "./icons";

/** หน้าจอกำลังโหลด (ใช้ร่วมกับ loading.tsx ของแต่ละ route) */
export function PageLoading({ label = "กำลังโหลด…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <IconSpinner className="h-5 w-5 animate-spin text-blue-600 motion-reduce:animate-none" />
        {label}
      </div>
    </div>
  );
}
