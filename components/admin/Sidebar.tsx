"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Clock, BarChart3, Users, FileCheck2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/attendance", label: "Attendance", icon: Clock },
  { href: "/admin/compliance", label: "Weekly Compliance", icon: BarChart3 },
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/review", label: "Output Review", icon: FileCheck2 },
];

export default function Sidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const initials = adminName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="elev-3 flex h-fit w-full flex-col gap-1 rounded-container p-4 sm:sticky sm:top-6 sm:w-64">
      <div className="mb-4 flex items-center gap-3 px-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12.5px] font-bold text-accent-dark">
          {initials || "D"}
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-bold leading-tight text-ink">Daong</p>
          <p className="truncate text-[12px] text-ink-muted">{adminName}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`neu-focus relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                active
                  ? "elev-pressed text-accent-dark"
                  : "text-ink-muted hover:bg-accent-soft/60 hover:text-ink"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent" />
              )}
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${active ? "text-accent" : "text-ink-subtle"}`}
                strokeWidth={2}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-border pt-3">
        <button
          onClick={handleSignOut}
          className="neu-focus flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
