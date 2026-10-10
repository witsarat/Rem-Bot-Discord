import Link from "next/link";
import { Brand } from "./brand";

/** แถบหัวแบบเรียบ — ใช้กับหน้าข้อกำหนด/นโยบายความเป็นส่วนตัว */
export function LiteHeader() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Brand />
        </Link>
        <nav className="flex items-center gap-5 text-sm text-slate-600">
          <Link href="/" className="transition-colors hover:text-slate-900">
            หน้าแรก
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-slate-900">
            แดชบอร์ด
          </Link>
        </nav>
      </div>
    </header>
  );
}
