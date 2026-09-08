"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Output, OutputStatus } from "@/lib/types";
import { OutputStatusPill } from "@/components/StatusPill";

interface ReviewItem extends Output {
  employeeName: string;
}

export default function ReviewList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const supabase = createClient();

  async function setStatus(id: string, status: OutputStatus) {
    await supabase.from("outputs").update({ status }).eq("id", id);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <p className="px-2 py-6 text-[13.5px] text-ink-muted">
        Nothing waiting on review.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((o) => (
        <li
          key={o.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-base-dark/40 px-2 py-4 first:border-t-0"
        >
          <div>
            <a
              href={o.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="text-[13.5px] font-medium text-ink underline decoration-base-dark underline-offset-2 hover:text-accent-dark"
            >
              {o.title || o.attachment_type}
            </a>
            <p className="text-[12.5px] text-ink-muted">
              {o.employeeName} · {o.date}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <OutputStatusPill status={o.status} />
            {o.status !== "checking" && (
              <button
                onClick={() => setStatus(o.id, "checking")}
                className="neu-icon-btn neu-focus rounded-full px-3 py-1.5 text-[12px] text-ink-muted"
              >
                Mark checking
              </button>
            )}
            {o.status !== "done" && (
              <button
                onClick={() => setStatus(o.id, "done")}
                className="neu-icon-btn neu-focus rounded-full px-3 py-1.5 text-[12px] text-accent-dark"
              >
                Mark done
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
