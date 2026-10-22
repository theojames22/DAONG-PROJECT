"use client";

import { Lock, FileCheck, Check, Clock, XCircle } from "lucide-react";
import { Output } from "@/lib/types";
import SubmissionAction from "@/components/shared/SubmissionAction";

const TYPE_LABEL: Record<Output["attachment_type"], string> = {
  written: "Written output",
  file: "File",
  image: "Image",
  link: "Link",
};

interface AuditTrailPanelProps {
  outputs: Output[];
}

export default function AuditTrailPanel({ outputs }: AuditTrailPanelProps) {
  const totalCount = outputs.length;
  const approvedCount = outputs.filter((o) => o.status === "done").length;
  const inReviewCount = outputs.filter(
    (o) => o.status === "pending" || o.status === "checking"
  ).length;

  return (
    <div className="bg-white rounded-[20px] border border-staff-border p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,27,61,0.04),0_10px_30px_rgba(37,99,235,0.06)] flex flex-col gap-4 enter-up enter-d4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileCheck className="h-4 w-4 text-staff-blue-ink" />
          <h3 className="text-base sm:text-[17px] font-bold text-staff-ink tracking-tight">
            My submissions
          </h3>
        </div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-staff-chip text-staff-body">
          Read-only
        </span>
      </div>

      {/* Lock Notice */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-staff-warning-soft border border-staff-warning-border text-xs text-staff-warning">
        <Lock className="h-3.5 w-3.5 shrink-0 text-staff-warning" />
        <span className="font-medium">
          Submitted work is locked. Only Heads can change it.
        </span>
      </div>

      {/* 3 Metric Counters */}
      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-[14px] bg-staff-card-2 border border-staff-border p-2.5">
          <p className="text-lg font-extrabold text-staff-ink leading-none">
            {totalCount}
          </p>
          <p className="text-[11px] font-semibold text-staff-body mt-1">
            Total
          </p>
        </div>
        <div className="rounded-[14px] bg-staff-card-2 border border-staff-border p-2.5">
          <p className="text-lg font-extrabold text-staff-success leading-none">
            {approvedCount}
          </p>
          <p className="text-[11px] font-semibold text-staff-body mt-1">
            Approved
          </p>
        </div>
        <div className="rounded-[14px] bg-staff-card-2 border border-staff-border p-2.5">
          <p className="text-lg font-extrabold text-staff-warning leading-none">
            {inReviewCount}
          </p>
          <p className="text-[11px] font-semibold text-staff-body mt-1">
            In review
          </p>
        </div>
      </div>

      {/* Submissions List */}
      <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-0.5">
        {outputs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-staff-border py-8 text-center text-xs text-staff-body font-medium">
            No work submitted yet
          </div>
        ) : (
          outputs.map((out) => {
            const isApproved = out.status === "done";
            const isChecking = out.status === "checking";
            const isRejected = out.status === "rejected";

            return (
              <div
                key={out.id}
                className="group relative rounded-2xl border border-staff-border bg-white p-3.5 hover:border-staff-blue/30 transition-all flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-[13px] font-bold text-staff-ink truncate">
                      {out.title || "Deliverable submission"}
                    </p>
                    <p className="text-[11px] text-staff-body mt-0.5">
                      <span>{TYPE_LABEL[out.attachment_type] ?? "Output"}</span> • {out.date}
                      {out.attachment_type === "written" && (
                        <>
                          {" · "}
                          <SubmissionAction
                            type="written"
                            title={out.title || "Written output"}
                            content={out.content}
                            outputId={out.id}
                            date={out.date}
                            variant="inline"
                            label="Read"
                            className="text-[11px] font-bold text-staff-blue-ink underline-offset-2 hover:underline"
                          />
                        </>
                      )}
                    </p>
                  </div>
                  <Lock className="h-3.5 w-3.5 text-staff-muted shrink-0" />
                </div>

                {/* Status chip & Note footer */}
                <div className="flex items-center justify-between gap-2 border-t border-staff-border pt-2">
                  {isApproved ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-staff-success-soft px-2.5 py-0.5 text-[11px] font-bold text-staff-success">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                      <span>Approved</span>
                    </span>
                  ) : isChecking ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-staff-soft px-2.5 py-0.5 text-[11px] font-bold text-staff-blue-ink">
                      <Clock className="h-3 w-3" />
                      <span>Checking</span>
                    </span>
                  ) : isRejected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-staff-danger-soft px-2.5 py-0.5 text-[11px] font-bold text-staff-danger">
                      <XCircle className="h-3 w-3" />
                      <span>Rejected</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-staff-warning-soft px-2.5 py-0.5 text-[11px] font-bold text-staff-warning">
                      <span className="h-1.5 w-1.5 rounded-full bg-staff-warning" />
                      <span>In review</span>
                    </span>
                  )}

                  {out.reviewer_notes ? (
                    <span className="text-[11px] font-medium text-staff-body truncate max-w-[150px]" title={out.reviewer_notes}>
                      Note: {out.reviewer_notes}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-staff-body">
                      Locked
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
