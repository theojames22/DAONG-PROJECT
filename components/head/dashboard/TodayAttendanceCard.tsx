import { UserCheck, UserX } from "lucide-react";
import AttendanceRing from "./AttendanceRing";

export interface TodayAttendanceCardProps {
  presentCount: number;
  absentCount: number;
  totalEmployees: number;
}

/** Card 1 — Today's Attendance with progress ring and breakdown matching Image 2 */
export default function TodayAttendanceCard({
  presentCount,
  absentCount,
  totalEmployees,
}: TodayAttendanceCardProps) {
  return (
    <section className="group relative flex flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 enter-up enter-d1">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Today&apos;s Attendance
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-600 transition-colors">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          Live
        </span>
      </div>

      {/* Main Body: Ring + Stats breakdown */}
      <div className="mt-5 flex items-center gap-5 sm:gap-6">
        <AttendanceRing
          present={presentCount}
          absent={absentCount}
          total={totalEmployees}
        />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
          {/* Row 1: Present Today */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-105 duration-300">
                <UserCheck className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                  Present Today
                </p>
                <p className="text-[12px] font-medium text-slate-500">
                  of {totalEmployees} employees
                </p>
              </div>
            </div>
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
              {presentCount}
            </span>
          </div>

          {/* Row 2: Absent Today */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 transition-transform group-hover:scale-105 duration-300">
                <UserX className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                  Absent Today
                </p>
                <p className="text-[12px] font-medium text-slate-500">
                  not clocked in yet
                </p>
              </div>
            </div>
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-500 tabular-nums">
              {absentCount}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
