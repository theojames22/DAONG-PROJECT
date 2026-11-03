"use client";

import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Info,
  LayoutDashboard,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import {
  appearanceToCssVars,
  type AppearancePreferences,
  type ResolvedTheme,
} from "@/lib/appearance";

/**
 * A self-contained, token-scoped preview. Setting the resolved custom
 * properties on this wrapper means the preview updates instantly without
 * touching the saved application theme.
 */
export default function AppearancePreview({
  preferences,
  mode,
}: {
  preferences: AppearancePreferences;
  mode: ResolvedTheme;
}) {
  const vars = appearanceToCssVars(preferences, mode);
  const options = preferences.options;

  return (
    <div
      className="appearance-preview overflow-hidden rounded-[var(--radius-card)] border border-border bg-[var(--page-bg)] text-[var(--text-on-background)] shadow-[var(--card-shadow)]"
      style={vars as unknown as CSSProperties}
      data-density={options.density}
      data-radius={options.radius}
      data-card-style={options.cardStyle}
      data-sidebar-style={options.sidebarStyle}
      data-motion={options.motion}
      aria-label={`Live ${mode} appearance preview`}
    >
      <div className="flex items-center justify-between border-b border-border bg-[var(--card-bg)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary-text)]">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11.5px] font-bold leading-none text-ink">Daong</p>
            <p className="mt-1 text-[9.5px] leading-none text-ink-muted">
              Live preview · {mode === "dark" ? "Dark" : "Light"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-border bg-[var(--card-bg)]">
            <Bell className="h-3 w-3 text-ink-muted" aria-hidden="true" />
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--danger-solid)] ring-2 ring-[var(--card-bg)]"
              aria-hidden="true"
            />
            <span className="sr-only">Unread notification</span>
          </span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-bold text-[var(--on-primary)]">
            DA
          </span>
        </div>
      </div>

      <div className="flex min-h-[350px]">
        {/* Sidebar */}
        <aside
          data-sidebar-panel
          className="hidden w-[118px] shrink-0 border-r border-border p-2 sm:block"
        >
          <p className="mb-2 px-1.5 text-[8.5px] font-bold uppercase tracking-wider text-ink-subtle">
            Workspace
          </p>
          <nav className="space-y-1 text-[10px]">
            <span className="flex items-center gap-1.5 rounded-md bg-[var(--primary-soft)] px-1.5 py-1.5 font-semibold text-[var(--primary-text)]">
              <LayoutDashboard className="h-3 w-3" aria-hidden="true" />
              Overview
            </span>
            <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-ink-muted">
              <Users className="h-3 w-3" aria-hidden="true" />
              Workforce
            </span>
            <span className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-ink-muted">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Compliance
            </span>
          </nav>
          <div className="mt-3 rounded-md border border-border bg-[var(--surface-2)] p-1.5">
            <p className="text-[8.5px] font-semibold text-ink">Storage</p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--border-color)]">
              <div className="h-full w-2/3 rounded-full bg-[var(--primary)]" />
            </div>
          </div>
        </aside>

        {/* Main preview surface */}
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12px] font-extrabold tracking-tight text-ink">
                Dashboard
              </p>
              <p className="text-[9.5px] text-ink-muted">
                A representative look at your customized interface.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[8.5px] font-bold text-[var(--primary-text)]">
              <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
              Saved look
            </span>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="card p-2.5">
              <p className="text-[8.5px] font-bold uppercase tracking-wide text-ink-muted">
                Present today
              </p>
              <p className="mt-1 text-[18px] font-black leading-none text-ink">24</p>
              <p className="mt-1 text-[8.5px] text-success">+3 from yesterday</p>
            </div>
            <div className="card p-2.5">
              <p className="text-[8.5px] font-bold uppercase tracking-wide text-ink-muted">
                Needs attention
              </p>
              <p className="mt-1 text-[18px] font-black leading-none text-[var(--warning)]">6</p>
              <p className="mt-1 text-[8.5px] text-ink-subtle">Unverified days</p>
            </div>
          </div>

          {/* Buttons and input */}
          <div className="card space-y-2 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                className="btn-primary !px-2.5 !py-1.5 !text-[10px]"
              >
                Apply changes
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="btn-secondary !px-2.5 !py-1.5 !text-[10px]"
              >
                Cancel
              </button>
              <button
                type="button"
                tabIndex={-1}
                disabled
                className="btn-primary !px-2.5 !py-1.5 !text-[10px]"
              >
                Disabled
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block">
                <span className="mb-1 block text-[8.5px] font-semibold text-ink-muted">
                  Search
                </span>
                <span className="flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-1.5 py-1.5">
                  <Search className="h-2.5 w-2.5 text-ink-subtle" aria-hidden="true" />
                  <span className="text-[9px] text-ink-subtle">Search staff…</span>
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[8.5px] font-semibold text-ink-muted">
                  Filter
                </span>
                <span className="flex items-center justify-between rounded-md border border-[var(--border-color)] bg-[var(--card-bg)] px-1.5 py-1.5 text-[9px] text-ink">
                  All staff
                  <ChevronDown className="h-2.5 w-2.5 text-ink-subtle" aria-hidden="true" />
                </span>
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-left text-[9px]">
              <thead>
                <tr className="bg-[var(--surface-2)] text-ink-muted">
                  <th className="px-2 py-1.5 font-bold">Staff</th>
                  <th className="px-2 py-1.5 font-bold">Status</th>
                  <th className="px-2 py-1.5 text-right font-bold">Hours</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-ink">Ana Cruz</td>
                  <td className="px-2 py-1.5">
                    <span className="chip bg-[var(--success-soft)] !px-1.5 !py-0.5 !text-[8px] text-success">
                      <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                      Approved
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-ink-muted">38.5</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-2 py-1.5 text-ink">Ben Reyes</td>
                  <td className="px-2 py-1.5">
                    <span className="chip bg-[var(--warning-soft)] !px-1.5 !py-0.5 !text-[8px] text-warning">
                      <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                      Pending
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right text-ink-muted">31.0</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Badges + elevated surface */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-wrap content-start gap-1">
              <span className="chip bg-[var(--success-soft)] text-[9px] text-success">
                <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" /> Success
              </span>
              <span className="chip bg-[var(--warning-soft)] text-[9px] text-warning">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" /> Warning
              </span>
              <span className="chip bg-[var(--danger-soft)] text-[9px] text-danger">
                <XCircle className="h-2.5 w-2.5" aria-hidden="true" /> Danger
              </span>
              <span className="chip bg-[var(--info-soft)] text-[9px] text-info">
                <Info className="h-2.5 w-2.5" aria-hidden="true" /> Info
              </span>
            </div>
            <div
              data-surface="elevated"
              className="rounded-[var(--radius-md)] border border-border p-2 shadow-[var(--card-shadow-soft)]"
            >
              <p className="text-[9px] font-bold text-ink">Dialog surface</p>
              <p className="mt-0.5 text-[8px] leading-relaxed text-ink-muted">
                Dropdowns, drawers and modals use the elevated palette.
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-semibold text-[var(--primary-text)]">
                Focus ring
                <span className="h-2 w-2 rounded-full border-2 border-[var(--focus-ring)]" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
