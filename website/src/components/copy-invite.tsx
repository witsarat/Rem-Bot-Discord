"use client";

import { useState } from "react";

export function CopyInvite({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("คัดลอกลิงก์นี้ได้เลย:", url);
    }
  }

  return (
    <button type="button" onClick={copy} className={`btn-ghost ${className ?? ""}`}>
      {copied ? "✅ คัดลอกลิงก์แล้ว!" : "🔗 คัดลอกลิงก์เชิญ"}
    </button>
  );
}
