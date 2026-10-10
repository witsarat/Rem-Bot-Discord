"use client";

import { useFormStatus } from "react-dom";
import { IconSpinner } from "./icons";

/**
 * ปุ่ม submit ที่โชว์สถานะกำลังทำงาน (วงล้อหมุน) ระหว่างรอ server action
 * ใช้: วางใน <form action={serverAction}> ได้เลย
 */
export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <IconSpinner className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {pendingLabel ?? "กำลังบันทึก…"}
        </>
      ) : (
        label
      )}
    </button>
  );
}
