import Link from "next/link";
import { IconDiscord } from "./icons";

/** การ์ดเชิญให้เข้าสู่ระบบด้วย Discord (ใช้เมื่อยังไม่ login หรือเซสชันหมดอายุ) */
export function LoginPrompt({ expired = false }: { expired?: boolean }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {expired ? "เซสชันหมดอายุ" : "เข้าสู่แดชบอร์ด"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {expired
            ? "การเชื่อมต่อกับ Discord หมดอายุลง กรุณาเข้าสู่ระบบอีกครั้งเพื่อจัดการเซิร์ฟเวอร์ของคุณ"
            : "เข้าสู่ระบบด้วยบัญชี Discord เพื่อจัดการบอทในเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแล — ตั้งค่าห้อง ดูประวัติ และดูสถิติได้จากที่นี่"}
        </p>
        <a href="/api/auth/login" className="btn-primary mt-6 w-full">
          <IconDiscord className="h-4 w-4" />
          เข้าสู่ระบบด้วย Discord
        </a>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          ขอสิทธิ์เพียงดูข้อมูลพื้นฐาน (ชื่อผู้ใช้ + รายชื่อเซิร์ฟเวอร์ของคุณ) — ไม่มีการโพสต์หรือแก้ไขแทนคุณ
        </p>
      </div>
      <p className="mt-6 text-center text-sm">
        <Link href="/" className="link">
          ← กลับไปหน้าแรก
        </Link>
      </p>
    </div>
  );
}
