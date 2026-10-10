import Link from "next/link";
import { Brand } from "@/components/brand";
import { CopyInvite } from "@/components/copy-invite";
import {
  IconArrowsLeftRight,
  IconCalendar,
  IconChartBar,
  IconCheck,
  IconDatabase,
  IconDiscord,
  IconLayout,
  IconMic,
} from "@/components/icons";

const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1557023021825265775&permissions=8&integration_type=0&scope=bot+applications.commands";

const GITHUB_URL = "https://github.com/witsarat/Rem-Bot-Discord";

const FEATURES = [
  {
    icon: IconMic,
    title: "บันทึกเข้า–ออก–ย้าย",
    desc: "ทุกความเคลื่อนไหวในห้องเสียงถูกบันทึกทันที — ใคร เข้าห้องไหน เมื่อไร พร้อมชื่อห้องและจำนวนสมาชิกในห้อง",
  },
  {
    icon: IconChartBar,
    title: "จัดอันดับเวลาห้องเสียง",
    desc: "คำสั่ง /top — อันดับสมาชิกที่อยู่ในห้องเสียงนานที่สุด นับรวมทุกครั้ง เลือกช่วงเวลาได้ ดึงจากฐานข้อมูลโดยตรง",
  },
  {
    icon: IconCalendar,
    title: "รายงานประจำสัปดาห์",
    desc: "/weekly — สรุปภาพรวมของเซิร์ฟเวอร์ส่งอัตโนมัติทุกวันจันทร์ 09:00 น. พร้อมจัดอันดับ Top 5",
  },
  {
    icon: IconArrowsLeftRight,
    title: "เขย่าเรียกสมาชิก",
    desc: "/shake — ย้ายสมาชิกที่หลับคาห้องไปกลับ 5 ครั้งแล้วกลับห้องเดิม (ผู้ดูแลใช้ พร้อมคูลดาวน์กันกดรัว)",
  },
  {
    icon: IconLayout,
    title: "แดชบอร์ดจัดการเอง",
    desc: "เข้าสู่ระบบด้วย Discord แล้วเลือกห้องบันทึก ดูประวัติและสถิติ — เห็นเฉพาะเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแล",
  },
  {
    icon: IconDatabase,
    title: "ข้อมูลอยู่ถาวร",
    desc: "ทุก log ถูกเก็บในฐานข้อมูล PostgreSQL — รีสตาร์ทหรือ deploy ใหม่กี่ครั้ง ประวัติก็ไม่หาย",
  },
];

const COMMANDS = [
  { cmd: "/setup", desc: "สร้างหรือเชื่อมห้อง #voice-logs และเปิดระบบบันทึกของเซิร์ฟเวอร์", access: "ผู้ดูแล" },
  { cmd: "/help", desc: "คู่มือการใช้งาน คำสั่งทั้งหมด และความหมายของสี — เห็นเฉพาะคุณ", access: "ทุกคน" },
  { cmd: "/top", desc: "อันดับเวลาอยู่ห้องเสียง — ทั้งหมด / 7 วัน / 30 วัน และดูรายคน", access: "ทุกคน" },
  { cmd: "/weekly", desc: "ตั้งค่าห้องรับรายงานประจำสัปดาห์ ปิด หรือส่งทดสอบ", access: "ผู้ดูแล" },
  { cmd: "/shake", desc: "เขย่าเรียกสมาชิกที่หลับคาห้อง ให้กลับมาว่องไว", access: "ผู้ดูแล" },
];

const STEPS = [
  {
    title: "เชิญบอทเข้าเซิร์ฟเวอร์",
    desc: "กดปุ่มเชิญ เลือกเซิร์ฟเวอร์ของคุณ แล้วกดอนุญาตสิทธิ์ — ใช้เวลาไม่ถึงหนึ่งนาที",
  },
  {
    title: "ให้ผู้ดูแลพิมพ์ /setup",
    desc: "บอทจะสร้างหรือเชื่อมห้อง #voice-logs ให้อัตโนมัติ ตั้งแต่นั้นระบบบันทึกทำงานเองทันที",
  },
  {
    title: "จัดการผ่านแดชบอร์ด",
    desc: "เข้าสู่ระบบด้วย Discord เพื่อเลือกห้อง ดูประวัติย้อนหลัง และสถิติได้ทุกเมื่อ",
  },
];

const FAQS = [
  {
    q: "บอทเก็บข้อมูลอะไรบ้าง?",
    a: "เก็บเฉพาะข้อมูลที่จำเป็นต่อระบบ voice log — ไอดีและชื่อผู้ใช้ Discord, เหตุการณ์เข้า–ออก–ย้ายห้องเสียง, ชื่อห้อง และเวลา ไม่เก็บข้อความแชท เนื้อหาเสียง หรือข้อมูลอื่น รายละเอียดทั้งหมดดูได้ในนโยบายความเป็นส่วนตัว",
  },
  {
    q: "ใช้ฟรีไหม จำกัดจำนวนเซิร์ฟเวอร์หรือเปล่า?",
    a: "ใช้ฟรีและไม่จำกัดจำนวนเซิร์ฟเวอร์ — เป็นโปรเจกต์โอเพนซอร์ส โค้ดทั้งหมดดูได้บน GitHub",
  },
  {
    q: "ทำไมบางคนมองไม่เห็นคำสั่ง?",
    a: "ให้ลองกด Ctrl+R เพื่อรีเฟรช Discord สักครั้ง และตรวจว่าเชิญบอทด้วย scope applications.commands แล้ว — หรือลองให้ผู้ดูแลรัน npm run deploy ฝั่งเซิร์ฟเวอร์อีกครั้ง",
  },
  {
    q: "เปิดไมค์ ปิดกล้อง จะถูกบันทึกไหม?",
    a: "ไม่บันทึก — ระบบนับเฉพาะการเข้า ออก และย้ายห้องเสียงเท่านั้น และการเคลื่อนไหวของบอทด้วยกันเองก็ถูกข้ามเช่นกัน",
  },
  {
    q: "ดูประวัติย้อนหลังได้ที่ไหน?",
    a: "ที่แดชบอร์ดเว็บนี้ — เข้าสู่ระบบด้วย Discord แล้วเลือกเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแล จะเห็นประวัติทั้งหมดพร้อมกรองตามประเภทเหตุการณ์",
  },
  {
    q: "Linked Roles (ยศแบบเชื่อมต่อ) ใช้ยังไง?",
    a: "ตั้งค่าเซิร์ฟเวอร์ → บทบาท → เลือกบทบาท → ลิงก์ → เพิ่มเงื่อนไข แล้วเลือก Rem จากนั้นสมาชิกกดเชื่อมต่อบัญชีเพื่อรับยศอัตโนมัติ",
  },
];

const PREVIEW_ROWS = [
  { dot: "bg-emerald-500", text: "@korn เข้าห้องเสียง #General", time: "15:02" },
  { dot: "bg-amber-400", text: "@mint ย้ายห้อง #Lounge → #Gaming", time: "15:47" },
  { dot: "bg-rose-500", text: "@korn ออกจากห้องเสียง #General", time: "16:10" },
];

function SectionHead({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold text-blue-600">{kicker}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {desc ? <p className="mt-3 text-sm leading-6 text-slate-600">{desc}</p> : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ───── Nav ───── */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <Brand />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#features" className="transition-colors hover:text-slate-900">ฟีเจอร์</a>
            <a href="#commands" className="transition-colors hover:text-slate-900">คำสั่ง</a>
            <a href="#dashboard" className="transition-colors hover:text-slate-900">แดชบอร์ด</a>
            <a href="#howto" className="transition-colors hover:text-slate-900">วิธีใช้งาน</a>
            <a href="#faq" className="transition-colors hover:text-slate-900">คำถามที่พบบ่อย</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:block">
              เข้าสู่ระบบ
            </Link>
            <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
              เพิ่มบอท
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* ───── Hero ───── */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              บอท Discord · ใช้ฟรีทุกเซิร์ฟเวอร์
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              บันทึกทุกความเคลื่อนไหว
              <br className="hidden sm:block" /> ในห้องเสียงของคุณ
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Rem เก็บทุกการเข้า–ออก–ย้ายห้องเสียงของสมาชิกเป็น log อัตโนมัติ พร้อมจัดอันดับเวลาห้องเสียง
              รายงานประจำสัปดาห์ และแดชบอร์ดสำหรับผู้ดูแล
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary">
                <IconDiscord className="h-4 w-4" />
                เพิ่มบอทเข้าเซิร์ฟเวอร์
              </a>
              <Link href="/dashboard" className="btn-secondary">
                เปิดแดชบอร์ด
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <li className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-blue-600" /> ตั้งค่าเสร็จใน 1 นาที
              </li>
              <li className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-blue-600" /> ข้อมูลเก็บถาวรในฐานข้อมูล
              </li>
              <li className="flex items-center gap-1.5">
                <IconCheck className="h-3.5 w-3.5 text-blue-600" /> ไม่ต้องเปิด Privileged Intents
              </li>
            </ul>
          </div>

          {/* ตัวอย่างหน้าจอ log */}
          <div className="card p-1.5">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="ml-2 text-xs font-medium text-slate-500"># voice-logs</span>
                <span className="ml-auto text-[11px] text-slate-400">ตัวอย่าง</span>
              </div>
              <div className="divide-y divide-slate-100">
                {PREVIEW_ROWS.map((row) => (
                  <div key={row.time} className="flex items-center gap-3 px-4 py-3.5 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
                    <span className="truncate text-slate-700">{row.text}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-slate-400">{row.time}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                <span>ประวัติเดียวกันนี้ดูย้อนหลังได้ในแดชบอร์ด</span>
                <Link href="/dashboard" className="font-medium text-blue-600 hover:text-blue-700">
                  เปิดแดชบอร์ด →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ───── Features ───── */}
        <section id="features" className="scroll-mt-20 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="ฟีเจอร์"
              title="ครบทุกอย่างที่เซิร์ฟเวอร์ต้องการ"
              desc="พร้อมใช้งานทันทีหลังเชิญ — ไม่ต้องเขียนโค้ดหรือตั้งค่าเพิ่ม"
            />
            <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="card p-6">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───── Commands ───── */}
        <section id="commands" className="scroll-mt-20 border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="คำสั่งในดิสคอร์ด"
              title="คำสั่งทั้งหมดของ Rem"
              desc="ติดตั้งอัตโนมัติให้ทุกเซิร์ฟเวอร์ที่บอทอยู่ — ขึ้นทันทีหลังเชิญ"
            />
            <div className="mt-10 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {COMMANDS.map((command, index) => (
                <div
                  key={command.cmd}
                  className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 ${index !== 0 ? "border-t border-slate-100" : ""}`}
                >
                  <code className="w-24 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-center text-sm font-medium text-blue-700">
                    {command.cmd}
                  </code>
                  <p className="min-w-0 flex-1 text-sm text-slate-600">{command.desc}</p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                      command.access === "ผู้ดูแล"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {command.access}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───── Dashboard ───── */}
        <section id="dashboard" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHead
                kicker="แดชบอร์ด"
                title="จัดการทุกอย่างได้เอง ไม่ต้องง้อคำสั่ง"
                desc="เข้าสู่ระบบด้วย Discord แล้วดูแลเซิร์ฟเวอร์ของคุณได้จากเบราว์เซอร์ — เห็นเฉพาะเซิร์ฟเวอร์ที่คุณเป็นผู้ดูแลเท่านั้น"
              />
              <ul className="mt-7 space-y-3 text-sm text-slate-600">
                {[
                  "เลือกห้องบันทึก voice log และห้องรับรายงานของแต่ละเซิร์ฟเวอร์",
                  "ดูประวัติการเข้า–ออก–ย้ายย้อนหลังทั้งหมด พร้อมกรองตามประเภท",
                  "ดูสถิติรวม — จำนวนเหตุการณ์ สมาชิก และความเคลื่อนไหวล่าสุด",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/dashboard" className="btn-primary mt-7">
                <IconDiscord className="h-4 w-4" />
                เข้าสู่ระบบด้วย Discord
              </Link>
            </div>

            <div className="card p-1.5">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-500">เซิร์ฟเวอร์ของคุณ</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> บอทออนไลน์
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                      SV
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">เซิร์ฟเวอร์ของฉัน</span>
                      <span className="text-[11px] text-emerald-700">บอทพร้อมใช้งาน</span>
                    </span>
                    <span className="text-slate-300">→</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                      SV
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">เซิร์ฟเวอร์เพื่อน</span>
                      <span className="text-[11px] text-amber-700">ยังไม่ได้เพิ่มบอท</span>
                    </span>
                    <span className="text-slate-300">→</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───── How to ───── */}
        <section id="howto" className="scroll-mt-20 border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="เริ่มใช้ใน 3 ขั้นตอน"
              title="พร้อมใช้งานในไม่ถึงหนึ่งนาที"
              desc="ไม่ต้องมีความรู้เทคนิค — เชิญบอทแล้วใช้เซิร์ฟเวอร์ตามปกติได้เลย"
            />
            <div className="mt-11 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="card p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
              <span className="font-medium text-slate-800">สีของ log:</span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> เขียว = เข้าห้อง
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> แดง = ออกจากห้อง
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> เหลือง = ย้ายห้อง
              </span>
            </div>
          </div>
        </section>

        {/* ───── FAQ ───── */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <SectionHead kicker="คำถามที่พบบ่อย" title="เรื่องที่คนถามบ่อย" />
            <div className="mt-10 space-y-3">
              {FAQS.map((faq) => (
                <details key={faq.q} className="card group overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="shrink-0 text-lg leading-none text-slate-400 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-6 text-slate-600">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───── CTA ───── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-12 text-center sm:px-12">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              พร้อมเริ่มเก็บ log แล้วหรือยัง?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
              เชิญบอท แล้วให้ผู้ดูแลพิมพ์ /setup ในเซิร์ฟเวอร์ของคุณ — ใช้เวลาไม่ถึงหนึ่งนาที
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary">
                <IconDiscord className="h-4 w-4" />
                เพิ่มบอทเข้าเซิร์ฟเวอร์
              </a>
              <CopyInvite url={INVITE_URL} />
            </div>
          </div>
        </section>
      </main>

      {/* ───── Footer ───── */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
              บอท Discord สำหรับบันทึกการเข้า–ออก–ย้ายห้องเสียง พร้อมระบบสถิติและแดชบอร์ดจัดการเซิร์ฟเวอร์
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">เมนู</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-slate-800">ฟีเจอร์</a></li>
              <li><a href="#commands" className="hover:text-slate-800">คำสั่ง</a></li>
              <li><a href="#howto" className="hover:text-slate-800">วิธีใช้งาน</a></li>
              <li><a href="#faq" className="hover:text-slate-800">คำถามที่พบบ่อย</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">ลิงก์</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link href="/dashboard" className="hover:text-slate-800">แดชบอร์ด</Link></li>
              <li><a href={INVITE_URL} target="_blank" rel="noreferrer" className="hover:text-slate-800">เพิ่มบอท</a></li>
              <li><a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-slate-800">GitHub</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">ข้อกำหนด</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-500">
              <li><Link href="/terms" className="hover:text-slate-800">ข้อกำหนดการให้บริการ</Link></li>
              <li><Link href="/privacy" className="hover:text-slate-800">นโยบายความเป็นส่วนตัว</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 py-5 text-center text-xs text-slate-400">
          © 2569 Rem — บอทบันทึกห้องเสียง Discord · โปรเจกต์โอเพนซอร์ส ไม่มีความเกี่ยวข้องกับ Discord Inc.
        </div>
      </footer>
    </div>
  );
}
