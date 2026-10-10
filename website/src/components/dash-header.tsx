import Link from "next/link";
import { Brand } from "./brand";
import { avatarUrl } from "@/lib/discord";
import type { SessionUser } from "@/lib/session";

/** แถบหัวของหน้าแดชบอร์ด — โลโก้ + ผู้ใช้ปัจจุบัน (หรือลิงก์หน้าแรกถ้ายังไม่ login) */
export function DashHeader({ session }: { session: SessionUser | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center">
          <Brand />
        </Link>

        {session ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl(session, 64)}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full bg-slate-100"
            />
            <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 sm:block">
              {session.displayName}
            </span>
            <a href="/api/auth/logout" className="text-sm text-slate-500 transition-colors hover:text-slate-800">
              ออกจากระบบ
            </a>
          </div>
        ) : (
          <Link href="/" className="text-sm text-slate-500 transition-colors hover:text-slate-800">
            กลับหน้าแรก
          </Link>
        )}
      </div>
    </header>
  );
}
