"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { Project, ProjectStatus } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
}

const filters: { label: string; value: ProjectStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export default function ProjectList({ projects }: ProjectListProps) {
  const [filter, setFilter] = useState<ProjectStatus | "all">("all");

  const filtered =
    filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const counts = {
    all: projects.length,
    pending: projects.filter((p) => p.status === "pending").length,
    approved: projects.filter((p) => p.status === "approved").length,
    rejected: projects.filter((p) => p.status === "rejected").length,
  };

  return (
    <div className="neu-raised rounded-neu p-4">
      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`neu-focus rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-ink-muted hover:bg-accent-soft hover:text-accent-dark"
              }`}
            >
              {f.label} ({counts[f.value]})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="px-2 py-6 text-[13.5px] text-ink-muted">
          {projects.length === 0
            ? "No project submissions yet. They'll appear here the moment staff upload one."
            : "Nothing with this status."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-base-dark/40 px-2 py-4 first:border-t-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="text-[13.5px] font-medium text-ink underline decoration-base-dark underline-offset-2 hover:text-accent-dark"
                >
                  {p.title}
                </Link>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">
                  {p.submitter?.full_name || "Unknown"}
                  {p.submitter?.position ? ` · ${p.submitter.position}` : ""} ·{" "}
                  {new Date(p.created_at).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <ProjectStatusPill status={p.status} />
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="neu-icon-btn neu-focus rounded-full px-3 py-1.5 text-[12px] text-accent-dark"
                >
                  {p.status === "pending" ? "Review" : "Open"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    pending: "bg-warning-soft text-warning",
    approved: "bg-success-soft text-success",
    rejected: "bg-danger-soft text-danger",
  };
  const labels: Record<ProjectStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold capitalize ${styles[status]}`}
    >
      {status === "pending" && <Loader2 className="h-3 w-3" />}
      {status !== "pending" && <FileText className="h-3 w-3" />}
      {labels[status]}
    </span>
  );
}
