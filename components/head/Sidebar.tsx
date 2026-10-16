"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BarChart3, Users, FolderKanban, Wrench, CalendarDays, FileBarChart2, LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const links = [
  { href: "/head", label: "Overview", icon: LayoutGrid },
  { href: "/head/workforce", label: "Workforce", icon: Users },
  { href: "/head/compliance", label: "Weekly Compliance", icon: BarChart3 },
  { href: "/head/projects", label: "Projects", icon: FolderKanban },
  { href: "/head/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/head/equipment", label: "Equipment usage log", icon: Wrench },
  { href: "/head/reports", label: "Reports", icon: FileBarChart2 },
];

export default function Sidebar({
  headName,
  headPosition,
  headAvatarUrl,
}: {
  headName: string;
  headPosition?: string | null;
  headAvatarUrl?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Floating Hamburger Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-110 active:scale-95 elev-3"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar Panel */}
      <div
        ref={menuRef}
        className={`fixed left-4 top-16 bottom-4 z-50 flex w-64 flex-col gap-1 rounded-container p-3 transition-all duration-300 ease-in-out elev-3 overflow-hidden bg-surface ${
          isOpen
            ? "translate-x-0 opacity-100 pointer-events-auto"
            : "-translate-x-72 opacity-0 pointer-events-none"
        }`}
      >
        <div className="mb-6 flex items-center gap-3 px-2">
          {headAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headAvatarUrl}
              alt={headName}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
              D
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display truncate text-[15px] font-bold leading-tight text-ink">
              {headPosition || "Daong"}
            </p>
            <p className="truncate text-[12px] text-ink-muted">{headName}</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/head" ? pathname === "/head" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
                className={`neu-focus relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                  active
                    ? "elev-pressed text-blue-600"
                    : "text-ink-muted hover:bg-blue-50 hover:text-blue-600"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-600" : "text-ink-subtle"}`}
                  strokeWidth={2}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <button
            onClick={handleSignOut}
            className="neu-focus flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}