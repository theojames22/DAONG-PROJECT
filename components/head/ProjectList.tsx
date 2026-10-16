"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, FileText, Loader2, Inbox, ArrowRight } from "lucide-react";
import { Project, ProjectStatus } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
}

const filters: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Checking", value: "checking" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export default function ProjectList({ projects }: ProjectListProps) {
  const [filter, setFilter] = useState<ProjectStatus | "all">("all");

  const filtered =
    filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const counts: Record<ProjectStatus | "all", number> = {
    all: projects.length,
    pending: projects.filter((p) => p.status === "pending").length,
    checking: projects.filter((p) => p.status === "checking").length,
    approved: projects.filter((p) => p.status === "approved").length,
    rejected: projects.filter((p) => p.status === "rejected").length,
  };

  return (
    <div className="w-full min-h-[260px] rounded-[20px] border border-slate-100/90 bg-white p-5 sm:p-6 shadow-sm flex flex-col transition-all animate-fade-in">
      {/* Top Filter Tabs Row: aligned to the left */}
      <div className="flex items-center justify-start">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#f1f5f9] p-1 border border-slate-200/50">
          {filters.map((f) => {
            const active = filter === f.value;
            const count = counts[f.value];
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs sm:text-[13px] transition-all duration-200 ${
                  active
                    ? "bg-white font-semibold text-slate-900 shadow-sm"
                    : "font-medium text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] transition-colors ${
                    active
                      ? "bg-blue-600 font-bold text-white"
                      : "bg-slate-200/75 font-semibold text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Centered Empty State or Submissions List */}
      {filtered.length === 0 ? (
        <div className="my-auto flex flex-1 flex-col items-center justify-center py-8 text-center animate-fade-in">
          {/* Gentle Floating Icon */}
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-blue-600 border border-blue-100/60 shadow-xs animate-float-gentle">
            <Inbox className="h-6 w-6 stroke-[1.8]" />
          </div>

          <h3 className="mt-3.5 text-sm sm:text-[15px] font-bold text-slate-900 tracking-tight">
            {projects.length === 0
              ? "No project submissions yet"
              : `No ${filter} project submissions`}
          </h3>
          <p className="mt-1 text-xs sm:text-[13px] font-normal text-slate-500 max-w-sm">
            {projects.length === 0
              ? "They'll appear here the moment staff upload one."
              : `There are currently no projects with the "${filter}" status.`}
          </p>
        </div>
      ) : (
        /* Project Submissions List */
        <div className="mt-5 divide-y divide-slate-100">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="group flex flex-wrap items-center justify-between gap-4 py-3.5 px-2 hover:bg-slate-50/80 rounded-xl transition-colors"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/head/projects/${p.id}`}
                  className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors truncate block"
                >
                  {p.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  <span className="font-medium text-slate-600">
                    {p.submitter?.full_name || "Unknown"}
                  </span>
                  {p.submitter?.position && ` · ${p.submitter.position}`}
                  {" · "}
                  {new Date(p.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <ProjectStatusPill status={p.status} />
                <Link
                  href={`/head/projects/${p.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-xs active:scale-95"
                >
                  {p.status === "pending" ? "Review" : "Open"}
                  <ArrowRight className="h-3 w-3 stroke-[2.2]" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    pending: "bg-amber-50 text-amber-700 border border-amber-200/60",
    checking: "bg-blue-50 text-blue-700 border border-blue-200/60",
    approved: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    rejected: "bg-rose-50 text-rose-700 border border-rose-200/60",
  };
  const labels: Record<ProjectStatus, string> = {
    pending: "Pending",
    checking: "Checking",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[status]}`}
    >
      {status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "checking" && <Clock3 className="h-3 w-3" />}
      {status !== "pending" && status !== "checking" && <FileText className="h-3 w-3" />}
      {labels[status]}
    </span>
  );
}
