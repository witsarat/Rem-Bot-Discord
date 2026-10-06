import { CopyInvite } from "@/components/copy-invite";
import { EmbedCard } from "@/components/embed-card";
import { RemLogo } from "@/components/rem-logo";

/** 🔗 ลิงก์เชิญบอท (ใช้ทุกปุ่มในเว็บ) */
const INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1557023021825265775&permissions=8&integration_type=0&scope=bot+applications.commands";

const GITHUB_URL = "https://github.com/witsarat/Rem-Bot-Discord";

const FEATURES = [
  {
    icon: "🟢",
    title: "บันทึกเข้าห้องเสียง",
    desc: "รู้ทันทีว่าใครเข้าห้องไหน — Embed สีเขียว พร้อมชื่อสมาชิก ชื่อห้อง และจำนวนคนในห้อง",
  },
  {
    icon: "🔴",
    title: "บันทึกออกจากห้องเสียง",
    desc: "ออกกลางดึกก็จับได้หมด — Embed สีแดง พร้อมจำนวนสมาชิกที่ยังเหลืออยู่ในห้อง",
  },
  {
    icon: "🟡",
    title: "บันทึกย้ายห้องเสียง",
    desc: "ตามรอยการย้ายห้องได้ครบ — Embed สีเหลือง ระบุชัดเจนว่าจากห้องไหน ไปห้องไหน",
  },
  {
    icon: "⚙️",
    title: "ตั้งค่าด้วย /setup",
    desc: "ผู้ดูแลรันครั้งเดียว — บอทสร้างห้อง #voice-logs ให้อัตโนมัติ (ถ้ามีอยู่แล้วใช้ห้องเดิม) และจำค่าแยกตามเซิร์ฟเวอร์",
  },
  {
    icon: "🌍",
    title: "ใช้ได้ทุกเซิร์ฟเวอร์",
    desc: "เชิญบอทแล้วใช้ได้เลยกับทุกเซิร์ฟเวอร์ที่บอทอยู่ — ไม่จำกัดจำนวน ไม่มีค่าใช้จ่าย",
  },
  {
    icon: "🧹",
    title: "สะอาด ไม่รก",
    desc: "ไม่บันทึกการเคลื่อนไหวของบอท และการเปิด/ปิดไมค์–กล้องไม่นับเป็นเข้า-ออก — log ของคุณมีแต่เรื่องจริง",
  },
];

const STEPS = [
  {
    num: "01",
    icon: "🌊",
    title: "เชิญ Rem เข้าเซิร์ฟเวอร์",
    desc: "กดปุ่มเชิญ เลือกเซิร์ฟเวอร์ของคุณ แล้วกดอนุญาตสิทธิ์ — ไม่ต้องตั้งค่าอะไรเพิ่ม",
  },
  {
    num: "02",
    icon: "⚙️",
    title: "ผู้ดูแลรัน /setup ครั้งเดียว",
    desc: "บอทจะสร้างห้อง #voice-logs ให้เอง — ตั้งแต่นี้ระบบพร้อมบันทึกอัตโนมัติทันที",
  },
  {
    num: "03",
    icon: "🎧",
    title: "เข้า–ออก–ย้ายห้องเสียงได้เลย",
    desc: "ทุกความเคลื่อนไหวจะกลายเป็นข้อความ log สวย ๆ ในห้อง #voice-logs ทันที",
  },
];

const FAQS = [
  {
    q: "บอทเก็บข้อมูลอะไรบ้าง?",
    a: "เก็บเฉพาะ Channel ID ของห้อง #voice-logs ของแต่ละเซิร์ฟเวอร์ (เพื่อรู้ว่า log จะส่งไปที่ไหน) — ไม่เก็บข้อความ ไม่เก็บข้อมูลส่วนตัว และไม่ส่งข้อมูลไปที่อื่น",
  },
  {
    q: "ต้องตั้งค่าอะไรก่อนใช้ไหม?",
    a: "ไม่ต้องเลย — เชิญบอท ให้สิทธิ์ แล้วให้ผู้ดูแลพิมพ์ /setup ครั้งเดียว หลังจากนั้นระบบทำงานอัตโนมัติ 100%",
  },
  {
    q: "ใช้ได้กี่เซิร์ฟเวอร์? คิดเงินไหม?",
    a: "ไม่จำกัดจำนวนเซิร์ฟเวอร์ และใช้ฟรี — เป็นโปรเจกต์โอเพนซอร์ส ดูโค้ดทั้งหมดได้บน GitHub",
  },
  {
    q: "ทำไมบางคนมองไม่เห็นคำสั่ง /setup?",
    a: "คำสั่ง /setup แสดงเฉพาะผู้ดูแลเซิร์ฟเวอร์ (Administrator) — ถ้าเพิ่งเชิญบอทแล้วยังไม่เห็น ให้กด Ctrl+R เพื่อรีเฟรช Discord สักครั้ง",
  },
  {
    q: "เปิดไมค์ / ปิดกล้อง จะถูก log ด้วยไหม?",
    a: "ไม่ครับ — บอทจะบันทึกเฉพาะการเข้า–ออก–ย้ายห้องเสียงเท่านั้น (และไม่บันทึกการเคลื่อนไหวของบอทด้วยกันเอง)",
  },
];

const COLORS = [
  { color: "#57f287", name: "เขียว", desc: "เข้าห้อง (Join)" },
  { color: "#ed4245", name: "แดง", desc: "ออกจากห้อง (Leave)" },
  { color: "#fee75c", name: "เหลือง", desc: "ย้ายห้อง (Move)" },
];

function SectionHead({ kicker, title, desc }: { kicker: string; title: string; desc?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rem-sky/80">{kicker}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-rem-ice sm:text-4xl">{title}</h2>
      {desc ? <p className="mt-3 leading-relaxed text-rem-mist">{desc}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <div id="top" className="bg-scene relative min-h-screen overflow-x-clip">
      {/* ───────────────── Navbar ───────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-rem-900/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <RemLogo className="h-9 w-9" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-semibold text-rem-ice">Rem</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-rem-sky/80">
                Voice Log Bot
              </span>
            </span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-rem-mist md:flex">
            <a href="#features" className="transition-colors hover:text-rem-sky">
              ฟีเจอร์
            </a>
            <a href="#commands" className="transition-colors hover:text-rem-sky">
              คำสั่ง
            </a>
            <a href="#howto" className="transition-colors hover:text-rem-sky">
              วิธีใช้งาน
            </a>
            <a href="#faq" className="transition-colors hover:text-rem-sky">
              คำถามที่พบบ่อย
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-rem-sky"
            >
              GitHub
            </a>
          </div>
          <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
            เชิญ Rem ↗
          </a>
        </nav>
      </header>

      <main>
        {/* ───────────────── Hero ───────────────── */}
        <section className="relative">
          <div className="mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
            <div>
              <div className="chip">
                <span className="h-2 w-2 rounded-full bg-status-join" /> Discord Voice Log Bot ·
                discord.js v14
              </div>
              <h1 className="mt-6 font-display text-4xl font-semibold leading-tight text-rem-ice sm:text-5xl lg:text-6xl">
                ให้ <span className="text-grad">Rem</span> ช่วยเฝ้า
                <br className="hidden sm:block" /> ห้องเสียงของคุณ
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-rem-mist sm:text-lg">
                บันทึกทุกการเข้า–ออก–ย้ายห้องเสียงของสมาชิก ส่งเป็นข้อความ Embed สีสวยงามเข้าห้อง log
                อัตโนมัติ — ไม่พลาดแม้แต่คนเดียว
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary">
                  🌊 เชิญ Rem เข้าเซิร์ฟเวอร์
                </a>
                <a href="#commands" className="btn-ghost">
                  ดูคำสั่งทั้งหมด
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-rem-mist/90">
                <li>✓ ใช้ฟรี ไม่จำกัดเซิร์ฟเวอร์</li>
                <li>✓ ตั้งค่าเสร็จใน 30 วินาที</li>
                <li>✓ ไม่ต้องเปิด Privileged Intents</li>
              </ul>
            </div>

            <div className="relative">
              <div className="glow -z-10 left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 bg-rem-deep/25" />
              <span className="floaty absolute -left-3 top-10 h-2 w-2 rounded-full bg-rem-sky/80" />
              <span className="floaty-slow absolute -right-2 top-1/3 h-1.5 w-1.5 rounded-full bg-rem-ice/70" />
              <span className="floaty absolute bottom-8 left-8 h-1.5 w-1.5 rounded-full bg-rem-sky/60" />

              <div className="space-y-4">
                <EmbedCard
                  tone="join"
                  className="lg:-rotate-1 transition-transform duration-300 hover:rotate-0"
                  time="เมื่อสักครู่"
                  description={
                    <>
                      ➡️ <span className="text-rem-sky">@SpecialXR</span> เข้าห้องเสียง{" "}
                      <span className="font-semibold text-rem-ice">General</span>
                    </>
                  }
                  fields={[
                    { label: "🔊 ห้องเสียง", value: "General" },
                    { label: "👥 สมาชิกในห้อง", value: "4 คน" },
                  ]}
                />
                <EmbedCard
                  tone="leave"
                  className="transition-transform duration-300 hover:rotate-0"
                  time="2 นาทีที่แล้ว"
                  description={
                    <>
                      ⬅️ <span className="text-rem-sky">@SpecialXR</span> ออกจากห้องเสียง{" "}
                      <span className="font-semibold text-rem-ice">General</span>
                    </>
                  }
                  fields={[
                    { label: "🔊 ห้องเสียง", value: "General" },
                    { label: "👥 สมาชิกคงเหลือ", value: "3 คน" },
                  ]}
                />
                <EmbedCard
                  tone="move"
                  className="lg:rotate-1 transition-transform duration-300 hover:rotate-0"
                  time="5 นาทีที่แล้ว"
                  description={
                    <>
                      🔄 <span className="text-rem-sky">@SpecialXR</span> ย้ายห้องเสียง
                    </>
                  }
                  fields={[
                    { label: "📤 จากห้อง", value: "General" },
                    { label: "📥 ไปห้อง", value: "Gaming" },
                  ]}
                />
              </div>
              <p className="mt-4 text-center text-xs text-rem-mist/70">
                ตัวอย่างข้อความที่ Rem ส่งเข้าห้อง #voice-logs จริง ๆ
              </p>
            </div>
          </div>
        </section>

        <div className="lace mx-auto max-w-4xl" aria-hidden />

        {/* ───────────────── Features ───────────────── */}
        <section id="features" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="ทำอะไรได้บ้าง"
              title="ฟีเจอร์ทั้งหมด"
              desc="ทุกอย่างที่เซิร์ฟเวอร์ต้องการสำหรับเฝ้าห้องเสียง — พร้อมใช้ทันทีหลังเชิญ"
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="card p-6">
                  <div className="text-3xl">{feature.icon}</div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-rem-ice">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-rem-mist">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────── Commands ───────────────── */}
        <section id="commands" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="คำสั่งในดิสคอร์ด"
              title="คำสั่งทั้งหมดของ Rem"
              desc="เรียบง่าย จำง่าย — มีแค่สองคำสั่งก็ครบทุกอย่าง"
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <div className="card p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-base text-rem-sky">
                    /setup
                  </code>
                  <span className="chip chip-amber">ผู้ดูแลเท่านั้น</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-rem-ice">
                  ตั้งค่าห้องบันทึกอัตโนมัติ
                </h3>
                <p className="mt-2 leading-relaxed text-rem-mist">
                  สร้างหรือเชื่อมห้อง <span className="text-rem-sky">#voice-logs</span> ของเซิร์ฟเวอร์นี้
                  — ถ้ามีห้องอยู่แล้วจะใช้ห้องเดิม และจำค่าของแต่ละเซิร์ฟเวอร์แยกกัน (รันครั้งเดียวจบ)
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-rem-mist">
                  <li>• เช็คสิทธิ์ Administrator ให้อัตโนมัติ</li>
                  <li>• สร้างห้องไม่สำเร็จ จะแจ้งสาเหตุตรงจุด</li>
                </ul>
              </div>
              <div className="card p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-base text-rem-sky">
                    /help
                  </code>
                  <span className="chip">ทุกคนใช้ได้</span>
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold text-rem-ice">
                  คู่มือฉบับพกพา
                </h3>
                <p className="mt-2 leading-relaxed text-rem-mist">
                  แสดงคู่มือการใช้งาน คำสั่งทั้งหมด และความหมายของสี — เป็นข้อความ
                  <span className="text-rem-sky"> ความลับ เห็นเฉพาะคุณคนเดียว</span> (ephemeral)
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-rem-mist">
                  <li>• ไม่รบกวนคนอื่นในเซิร์ฟเวอร์</li>
                  <li>• เปิดดูได้ทุกเมื่อที่อยากเช็ค</li>
                </ul>
              </div>
            </div>
            <p className="mt-8 text-center text-sm text-rem-mist">
              💡 คำสั่งถูกติดตั้งแบบ <span className="text-rem-sky">Global</span> — ใช้ได้ทุกเซิร์ฟเวอร์ที่บอทอยู่
              ทันทีที่ถูกเชิญ
            </p>
          </div>
        </section>

        <div className="lace mx-auto max-w-4xl" aria-hidden />

        {/* ───────────────── How-to ───────────────── */}
        <section id="howto" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <SectionHead
              kicker="เริ่มใช้ใน 3 ขั้นตอน"
              title="พร้อมใช้ในไม่ถึงหนึ่งนาที"
              desc="ไม่ต้องมีความรู้เทคนิค — แค่เชิญบอทแล้วพูดคุยกันในเซิร์ฟเวอร์ตามปกติ"
            />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.num} className="card p-6">
                  <div className="font-display text-4xl font-semibold text-rem-sky/50">{step.num}</div>
                  <div className="mt-5 text-2xl">{step.icon}</div>
                  <h3 className="mt-2 font-display text-lg font-semibold text-rem-ice">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-rem-mist">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* ความหมายของสี */}
            <div className="card mt-10 flex flex-col items-center gap-4 px-6 py-7 sm:flex-row sm:justify-between">
              <h3 className="font-display text-lg font-semibold text-rem-ice">🎨 ความหมายของสี</h3>
              <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-rem-mist">
                {COLORS.map((item) => (
                  <span key={item.name} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: item.color, boxShadow: `0 0 12px ${item.color}88` }}
                    />
                    <span>
                      <b className="font-semibold text-rem-ice">{item.name}</b> = {item.desc}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────── FAQ ───────────────── */}
        <section id="faq" className="scroll-mt-24">
          <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
            <SectionHead kicker="ข้อสงสัยยอดนิยม" title="คำถามที่พบบ่อย" />
            <div className="mt-10 space-y-3">
              {FAQS.map((faq) => (
                <details key={faq.q} className="faq">
                  <summary>{faq.q}</summary>
                  <div className="faq-body">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────────── CTA ───────────────── */}
        <section>
          <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
            <div className="card relative overflow-hidden px-6 py-14 text-center sm:px-12">
              <div className="glow -z-10 left-1/2 top-0 h-64 w-120 -translate-x-1/2 -translate-y-1/2 bg-rem-deep/30" />
              <h2 className="font-display text-3xl font-semibold text-rem-ice sm:text-4xl">
                พร้อมแล้วหรือยัง? ให้ <span className="text-grad">Rem</span> เริ่มงานได้เลย
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-rem-mist">
                ใช้เวลาไม่ถึงนาที — เชิญบอท แล้วให้ผู้ดูแลพิมพ์ <span className="text-rem-sky">/setup</span>{" "}
                ในเซิร์ฟเวอร์ของคุณ
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={INVITE_URL} target="_blank" rel="noreferrer" className="btn-primary">
                  🌊 เชิญ Rem เข้าเซิร์ฟเวอร์
                </a>
                <CopyInvite url={INVITE_URL} />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────────── Footer ───────────────── */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <RemLogo className="h-9 w-9" />
            <div>
              <p className="font-display font-semibold text-rem-ice">Rem — Voice Log Bot</p>
              <p className="text-xs text-rem-mist/70">
                สร้างด้วย discord.js v14 · TypeScript · Next.js · Tailwind CSS
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-rem-mist">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-rem-sky">
              GitHub
            </a>
            <a href={INVITE_URL} target="_blank" rel="noreferrer" className="hover:text-rem-sky">
              เชิญบอท
            </a>
            <a href="#commands" className="hover:text-rem-sky">
              คำสั่ง
            </a>
          </div>
        </div>
        <div className="border-t border-white/5 py-4 text-center text-xs text-rem-mist/50">
          ธีมสีได้แรงบันดาลใจจาก Rem (Re:Zero) — โปรเจกต์แฟนเมด ไม่ได้เกี่ยวข้องกับเจ้าของลิขสิทธิ์ · © 2026
        </div>
      </footer>
    </div>
  );
}
