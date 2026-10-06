import type { Metadata, Viewport } from "next";
import "@fontsource/prompt/300.css";
import "@fontsource/prompt/400.css";
import "@fontsource/prompt/500.css";
import "@fontsource/prompt/600.css";
import "@fontsource/mitr/400.css";
import "@fontsource/mitr/500.css";
import "@fontsource/mitr/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rem — Discord Voice Log Bot",
  description:
    "บอท Discord สำหรับบันทึกการเข้า–ออก–ย้ายห้องเสียงของสมาชิก ส่งเป็น Embed สีสวยงามเข้าห้อง log อัตโนมัติ — ใช้ฟรีทุกเซิร์ฟเวอร์",
  openGraph: {
    title: "Rem — Discord Voice Log Bot",
    description:
      "บันทึกการเข้า–ออก–ย้ายห้องเสียงของสมาชิกเป็น Embed สีสวยงาม — ใช้ฟรีทุกเซิร์ฟเวอร์",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a111f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
