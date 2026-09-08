"use client";

import { useRouter } from "next/navigation";

export default function DatePicker({ date }: { date: string }) {
  const router = useRouter();

  return (
    <div className="neu-pressed flex items-center gap-2 rounded-xl px-3 py-2">
      <label htmlFor="date" className="text-[12.5px] text-ink-muted">
        Date
      </label>
      <input
        id="date"
        type="date"
        defaultValue={date}
        onChange={(e) => router.push(`?date=${e.target.value}`)}
        className="neu-focus bg-transparent text-[13px] text-ink outline-none"
      />
    </div>
  );
}
