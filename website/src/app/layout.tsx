import type { Metadata, Viewport } from "next";
import "@fontsource/prompt/300.css";
import "@fontsource/prompt/400.css";
import "@fontsource/prompt/500.css";
import "@fontsource/prompt/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rem — บอทบันทึกห้องเสียง Discord",
    template: "%s · Rem",
  },
  description:
    "บันทึกการเข้า–ออก–ย้ายห้องเสียงของสมาชิกเป็น log อัตโนมัติ พร้อมอันดับเวลาห้องเสียง รายงานประจำสัปดาห์ และแดชบอร์ดจัดการเซิร์ฟเวอร์ — ใช้ฟรีทุกเซิร์ฟเวอร์",
  openGraph: {
    title: "Rem — บอทบันทึกห้องเสียง Discord",
    description: "ระบบ voice log ครบวงจรสำหรับเซิร์ฟเวอร์ Discord",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
