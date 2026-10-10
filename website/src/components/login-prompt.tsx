import Link from "next/link";
import { IconDiscord } from "./icons";

type PromptVariant = "login" | "expired" | "temporary";

/** การ์ดแจ้งสถานะเข้าสู่ระบบ (ยังไม่ login / เซสชันหมดอายุ / เชื่อมต่อ Discord ไม่ได้ชั่วคราว) */
export function LoginPrompt({ variant = "login" }: { variant?: PromptVariant }) {
  const title =
    variant === "expired"
      ? "เซสชันหมดอายุ"
      : variant === "temporary"
        ? "เชื่อมต่อ Discord ไม่ได้ชั่วคราว"
        : "เข้าสู่แดชบอร์ด";

  const description =
    variant === "expired"
      ? "การเชื่อมต่อกับ Discord หมดอายุลง กรุณาเข้าสู่ระบบอีกครั้งเพื่อจัดการเซิร์ฟเวอร์ของคุณ"
      : variant === "temporary"
        ? "ระบบดึงข้อมูลจาก Discord ไม่สำเร็จชั่วคราว (อาจเป็นตอน Discord ตอบช้า) — กดลองอีกครั้งได้เลย โดยไม่ต้องเข้าสู่ระบบใหม่"
        : "เข้าสู่ระบบด้วยบัญชี Discord เพื่อจัดการบอทในเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแล — ตั้งค่าห้อง ดูประวัติ และดูสถิติได้จากที่นี่";

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="card p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

        {variant === "temporary" ? (
          <Link href="/dashboard" className="btn-primary mt-6 w-full">
            ลองอีกครั้ง
          </Link>
        ) : (
          <a href="/api/auth/login" className="btn-primary mt-6 w-full">
            <IconDiscord className="h-4 w-4" />
            เข้าสู่ระบบด้วย Discord
          </a>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-400">
          {variant === "temporary"
            ? "ถ้ายังไม่หาย ลองรีเฟรชหน้าอีกครั้ง หรือรอสักครู่แล้วลองใหม่"
            : "ขอสิทธิ์เพียงดูข้อมูลพื้นฐาน (ชื่อผู้ใช้ + รายชื่อเซิร์ฟเวอร์ของคุณ) — ไม่มีการโพสต์หรือแก้ไขแทนคุณ"}
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
