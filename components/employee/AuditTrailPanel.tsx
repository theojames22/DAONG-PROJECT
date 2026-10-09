"use client";

import { Lock, FileCheck2, Check, Clock } from "lucide-react";
import { Output } from "@/lib/types";

interface AuditTrailPanelProps {
  outputs: Output[];
}

export default function AuditTrailPanel({ outputs }: AuditTrailPanelProps) {
  const totalCount = outputs.length;
  const approvedCount = outputs.filter((o) => o.status === "done").length;
  const inReviewCount = outputs.filter((o) => o.status !== "done").length;

  return (
    <div className="flex h-full flex-col justify-between neu-raised rounded-neu p-5">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-accent" />
            <h2 className="text-[14px] font-bold text-ink">Audit Trail</h2>
          </div>
          <span className="elev-pressed rounded-full px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
            Read-Only
          </span>
        </div>

        {/* Lock Compliance Alert Box */}
        <div className="flex items-start gap-2.5 rounded-xl bg-warning-soft p-3">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[11px] font-medium leading-relaxed text-ink">
            All submissions are permanently locked and read-only to guarantee audit trail
            compliance. Employees cannot edit or delete submitted outputs.
          </p>
        </div>

        {/* 3 Dynamic Metric Counters */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="elev-pressed rounded-xl p-2">
            <p className="text-base font-black text-ink leading-none">
              {totalCount}
            </p>
            <p className="text-[10px] font-semibold text-ink-subtle mt-1 uppercase tracking-wide">
              Total
            </p>
          </div>
          <div className="elev-pressed rounded-xl p-2">
            <p className="text-base font-black text-success leading-none">
              {approvedCount}
            </p>
            <p className="text-[10px] font-semibold text-ink-subtle mt-1 uppercase tracking-wide">
              Approved
            </p>
          </div>
          <div className="elev-pressed rounded-xl p-2">
            <p className="text-base font-black text-warning leading-none">
              {inReviewCount}
            </p>
            <p className="text-[10px] font-semibold text-ink-subtle mt-1 uppercase tracking-wide">
              In Review
            </p>
          </div>
        </div>

        {/* Submissions List — 100% Dynamic from database */}
        <div className="flex flex-col gap-2.5">
          {outputs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-ink-subtle font-medium">
              No records found for this date
            </div>
          ) : (
            outputs.map((out) => {
              const isApproved = out.status === "done";
              const isChecking = out.status === "checking";

              return (
                <div
                  key={out.id}
                  className={`relative elev-1 rounded-xl p-3 transition-all ${
                    isApproved
                      ? "border-l-4 border-l-success"
                      : isChecking
                      ? "border-l-4 border-l-accent"
                      : "border-l-4 border-l-warning"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs font-bold text-ink">
                      {out.title || "Deliverable Submission"}
                    </p>
                    <Lock className="h-3 w-3 shrink-0 text-ink-subtle" />
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-subtle">
                    <span className="capitalize">{out.attachment_type} Artifact</span>
                    <span>•</span>
                    <span>{out.date}</span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2">
                    {isApproved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                        <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                        <span>Admin Approved</span>
                      </span>
                    ) : isChecking ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-dark">
                        <Clock className="h-2.5 w-2.5" />
                        <span>Checking</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warning">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        <span>Pending Admin Review</span>
                      </span>
                    )}

                    <span className="text-[10px] font-semibold text-ink-muted truncate max-w-[120px]">
                      {out.reviewer_notes || (isApproved ? "100/100" : "Reviewer Assigned")}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
