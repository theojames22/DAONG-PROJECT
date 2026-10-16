"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Calendar, LogOut, Menu, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/employee", label: "My dashboard", icon: Clock },
  { href: "/employee/schedule", label: "My Schedule", icon: Calendar },
];

export default function StaffSidebar({
  fullName,
  position,
  employeeId,
  avatarUrl,
}: {
  fullName: string;
  position?: string | null;
  employeeId: string;
  avatarUrl?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const shortId = employeeId ? employeeId.slice(0, 4).toUpperCase() : "8842";
  const displayRole = position || "Product Engineer";

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
      {/* Floating Hamburger Trigger — same pattern as the Head sidebar */}
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
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
              {fullName ? fullName.charAt(0).toUpperCase() : "A"}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-display truncate text-[15px] font-bold leading-tight text-ink">
              {fullName || "Alex Mercer"}
            </p>
            <p className="truncate text-[12px] text-ink-muted">
              {displayRole} • ID-{shortId}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  if (!active) router.push(href);
                }}
                className={`neu-focus relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150 text-left ${
                  active
                    ? "elev-pressed text-staff-blue-ink"
                    : "text-ink-muted hover:bg-staff-soft hover:text-staff-blue-ink"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${active ? "text-staff-blue-ink" : "text-ink-subtle"}`}
                  strokeWidth={2}
                />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <button
            onClick={handleSignOut}
            className="neu-focus flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-staff-danger-soft hover:text-staff-danger"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
