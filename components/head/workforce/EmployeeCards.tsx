"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { QrCode, Shield, Users } from "lucide-react";
import { Profile } from "@/lib/types";
import { creditedPercent, formatHours, formatPercent } from "@/lib/attendance";
import ViewQrModal from "./ViewQrModal";
import EditEmployeeModal from "./EditEmployeeModal";
import styles from "@/app/head/workforce/workforce.module.css";

export interface EmployeeCardsProps {
  /** Employees already filtered by the search box. */
  employees: Profile[];
  creditedByEmployee: Record<string, number>;
  recordedByEmployee: Record<string, number>;
  activeEmployeeIds: string[];
  /** Used only for the "no matches" empty-state copy. */
  searchQuery: string;
}

/**
 * Card View of the Workforce page — the employee grid migrated from the
 * former Team page. Search state lives in the parent (WorkforceView) so it
 * survives switching to the attendance List View and back.
 */
export default function EmployeeCards({
  employees,
  creditedByEmployee,
  recordedByEmployee,
  activeEmployeeIds,
  searchQuery,
}: EmployeeCardsProps) {
  const activeSet = useMemo(() => new Set(activeEmployeeIds), [activeEmployeeIds]);

  // Modals
  const [selectedQrEmp, setSelectedQrEmp] = useState<Profile | null>(null);
  const [selectedEditEmp, setSelectedEditEmp] = useState<Profile | null>(null);

  if (employees.length === 0) {
    const isSearch = searchQuery.trim().length > 0;
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-3">
          <Users className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          {isSearch ? "No employees found" : "No employees yet"}
        </h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          {isSearch
            ? `No accounts match “${searchQuery}”. Try searching for another name or role.`
            : "Add your first employee to start tracking attendance."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 items-start">
        {employees.map((emp, index) => {
          const isHead = emp.role === "head";
          const isClockedIn = activeSet.has(emp.id);
          // Credited drives the ring; recorded is shown beside it so a day
          // worked without a submitted output is not mistaken for no work.
          const credited = creditedByEmployee[emp.id] ?? 0;
          const recorded = recordedByEmployee[emp.id] ?? 0;
          const required = emp.required_weekly_hours ?? (isHead ? 0 : 40);
          const pct = creditedPercent(credited, required);
          const initial = (emp.full_name || "E").charAt(0).toUpperCase();

          // Circular progress parameters (r=12 -> circumference = 2 * PI * 12 = 75.4)
          const circumference = 75.4;
          const strokeDashoffset = Math.max(
            0,
            circumference - (circumference * pct) / 100
          );

          return (
            <div
              key={emp.id}
              className={`${styles.enter} shrink-0`}
              style={{ "--wf-delay": `${0.18 + index * 0.07}s` } as CSSProperties}
            >
              <div
                className={`group relative flex flex-col justify-between w-[218px] max-w-full h-[270px] shrink-0 rounded-[20px] border border-slate-100 bg-white shadow-sm overflow-hidden ${styles.card}`}
              >
                <div>
                  {/* Decorative Header with Curved Concentric Lines */}
                  <div
                    className={`relative h-[70px] transition-colors ${
                      isHead
                        ? "bg-[#0d1b2a]"
                        : "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-500"
                    }`}
                  >
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <svg
                        className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 opacity-20"
                        viewBox="0 0 140 140"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle cx="70" cy="70" r="30" stroke="white" strokeWidth="1.5" />
                        <circle cx="70" cy="70" r="50" stroke="white" strokeWidth="1.5" />
                        <circle cx="70" cy="70" r="70" stroke="white" strokeWidth="1.5" />
                        <circle cx="70" cy="70" r="90" stroke="white" strokeWidth="1.5" />
                      </svg>
                    </div>

                    {/* Top Right Header Badge */}
                    <div className="absolute top-2.5 right-2.5">
                      {isHead ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-medium text-white border border-white/20">
                          <Shield className="h-3 w-3" />
                          Head
                        </span>
                      ) : isClockedIn ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 shadow-xs">
                          <span
                            className={`relative h-1.5 w-1.5 rounded-full bg-emerald-500 ${styles.liveDot}`}
                          />
                          On the clock
                        </span>
                      ) : null}
                    </div>

                    {/* Avatar (50px, overlapping the bottom of the header) */}
                    <div className="absolute -bottom-6 left-[17px] z-10">
                      {emp.profile_picture_url ? (
                        <img
                          src={emp.profile_picture_url}
                          alt={emp.full_name || "Employee"}
                          className="h-[50px] w-[50px] rounded-full object-cover border-[3px] border-white shadow-sm bg-white"
                        />
                      ) : (
                        <div
                          className={`flex h-[50px] w-[50px] items-center justify-center rounded-full border-[3px] border-white text-lg font-bold text-white shadow-sm ${
                            isHead ? "bg-[#0d1b2a]" : "bg-blue-600"
                          }`}
                        >
                          {initial}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Name & Position beside Avatar */}
                  <div className="pt-2 pl-[77px] pr-[17px] min-h-[46px] flex flex-col justify-center">
                    <h3 className="truncate text-[13.5px] font-bold text-slate-900 leading-tight">
                      {emp.full_name || "Unnamed"}
                    </h3>
                    <div className="mt-1">
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 truncate max-w-full leading-none">
                        {emp.position || emp.role || "Employee"}
                      </span>
                    </div>
                  </div>

                  {/* Weekly Hours Summary Card */}
                  <div className="mx-[17px] mt-2 rounded-2xl bg-[#f4f8fe] border border-blue-50/70 p-2.5 flex items-center gap-2.5">
                    {isHead ? (
                      <>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600">
                          <Shield className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-bold text-slate-900 leading-tight">
                            Manages the team
                          </p>
                          <p className="text-[9.5px] font-medium text-slate-500 mt-0.5 leading-tight">
                            0.0h / week required
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                          <svg className="h-8 w-8 -rotate-90">
                            <circle
                              cx="16"
                              cy="16"
                              r="12"
                              className="stroke-blue-200/50"
                              strokeWidth="3"
                              fill="none"
                            />
                            <circle
                              cx="16"
                              cy="16"
                              r="12"
                              className={`stroke-blue-600 ${styles.ringValue}`}
                              strokeWidth="3"
                              fill="none"
                              strokeDasharray={circumference}
                              strokeLinecap="round"
                              style={
                                {
                                  strokeDashoffset,
                                  strokeOpacity: pct > 0 ? 1 : 0,
                                  "--wf-circ": circumference,
                                  "--wf-target": strokeDashoffset,
                                } as CSSProperties
                              }
                            />
                          </svg>
                          <span className="absolute text-[8.5px] font-bold text-slate-800">
                            {formatPercent(pct)}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1">
                            <span className="text-[11.5px] font-bold text-slate-900 leading-none">
                              {formatHours(credited)}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-normal leading-none">
                              / {formatHours(required)}
                            </span>
                          </div>
                          <span className="text-[9px] font-medium text-slate-400 block mt-0.5 leading-none">
                            credited this week
                          </span>
                          <span className="text-[9.5px] font-medium text-slate-500 block mt-1 leading-none truncate">
                            {formatHours(recorded)} recorded
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Footer: Attendance Status & Action Buttons */}
                <div className="px-[17px] pb-3.5 pt-1 mt-auto">
                  {isHead ? (
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-100/80">
                        Full access
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedQrEmp(emp)}
                          title="View Attendance QR"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border border-blue-200/60 text-blue-600 ${styles.btnQr}`}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedEditEmp(emp)}
                          className={`rounded-full border border-blue-200/60 px-3 py-0.5 text-[11px] font-semibold text-blue-600 ${styles.btnGhost}`}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div>
                        {isClockedIn ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-100/80">
                            <span
                              className={`relative h-1.5 w-1.5 rounded-full bg-emerald-500 ${styles.liveDot}`}
                            />
                            Active On-Shift
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200/60">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Not Clocked In
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedQrEmp(emp)}
                          title="View Attendance QR"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border border-blue-200/60 text-blue-600 ${styles.btnQr}`}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedEditEmp(emp)}
                          className={`rounded-full border border-blue-200/60 px-3 py-0.5 text-[11px] font-semibold text-blue-600 ${styles.btnGhost}`}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* QR Modal */}
      <ViewQrModal
        open={!!selectedQrEmp}
        onClose={() => setSelectedQrEmp(null)}
        employee={selectedQrEmp}
      />

      {/* Edit Modal */}
      <EditEmployeeModal
        open={!!selectedEditEmp}
        onClose={() => setSelectedEditEmp(null)}
        employee={selectedEditEmp}
      />
    </>
  );
}
