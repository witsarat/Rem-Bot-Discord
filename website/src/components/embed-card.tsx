import type { ReactNode } from "react";

export type EmbedTone = "join" | "leave" | "move";

const TONES: Record<EmbedTone, { color: string; title: string; icon: string }> = {
  join: { color: "#57f287", title: "เข้าห้องเสียง (Join)", icon: "🟢" },
  leave: { color: "#ed4245", title: "ออกจากห้องเสียง (Leave)", icon: "🔴" },
  move: { color: "#fee75c", title: "ย้ายห้องเสียง (Move)", icon: "🟡" },
};

export function EmbedCard(props: {
  tone: EmbedTone;
  description: ReactNode;
  fields: { label: string; value: string }[];
  time: string;
  className?: string;
}) {
  const tone = TONES[props.tone];

  return (
    <div
      className={`rounded-lg bg-[#131a2b] p-4 shadow-2xl shadow-black/50 ring-1 ring-white/5 ${props.className ?? ""}`}
      style={{ borderLeft: `4px solid ${tone.color}` }}
    >
      <div className="flex items-center gap-2">
        <span className="grad-avatar flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-[#06263b]">
          S
        </span>
        <span className="text-sm font-medium text-rem-ice">SpecialXR</span>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[15px] font-semibold text-rem-ice">
        <span>{tone.icon}</span> {tone.title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-rem-mist">{props.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {props.fields.map((field) => (
          <div key={field.label} className="rounded-md bg-white/5 px-2.5 py-2">
            <div className="text-[11px] text-rem-mist">{field.label}</div>
            <div className="mt-0.5 text-[13px] text-rem-ice">{field.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-rem-mist/80">
        <span>Voice Log • MasterDarkMD</span>
        <span>{props.time}</span>
      </div>
    </div>
  );
}
