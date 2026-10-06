import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ล็อก root ของ Turbopack ไว้ที่โฟลเดอร์เว็บนี้ (กัน warning เรื่อง lockfile ซ้อนในโปรเจกต์แม่)
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
