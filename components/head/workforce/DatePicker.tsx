"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

export default function DatePicker({
  date,
  view = "list",
}: {
  date: string;
  /** Preserved in the URL so changing the date keeps the same Workforce view. */
  view?: "card" | "list";
}) {
  const router = useRouter();

  // Format YYYY-MM-DD into MM/DD/YYYY to match reference: "DATE 10/12/2026"
  const formattedDate = (() => {
    try {
      const parts = date.split("-");
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${m}/${d}/${y}`;
      }
    } catch {
      // fallback
    }
    return date;
  })();

  return (
    <div className="relative flex items-center rounded-full border border-slate-200/80 bg-white px-4 py-2 shadow-sm transition-all hover:border-slate-300 hover:shadow">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-2 select-none">
        Date
      </span>
      <span className="text-xs sm:text-sm font-semibold text-slate-900 select-none tabular-nums">
        {formattedDate}
      </span>
      <Calendar className="ml-2 h-4 w-4 text-slate-400" />

      {/* Invisible date input overlaid across the entire pill to trigger native picker */}
      <input
        id="attendance-date"
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) {
            router.push(`?view=${view}&date=${e.target.value}`);
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        title="Change date"
        aria-label="Select attendance date"
      />
    </div>
  );
}
