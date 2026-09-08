import { DayStatus, OutputStatus } from "@/lib/types";

const dayStyles: Record<DayStatus, string> = {
  present: "bg-success-soft text-success",
  unverified: "bg-warning-soft text-warning",
  incomplete: "bg-warning-soft text-warning",
  absent: "bg-danger-soft text-danger",
};

const dayLabel: Record<DayStatus, string> = {
  present: "Present",
  unverified: "No output",
  incomplete: "Missing time-out",
  absent: "Absent",
};

const outputStyles: Record<OutputStatus, string> = {
  done: "bg-success-soft text-success",
  checking: "bg-warning-soft text-warning",
  pending: "bg-accent-soft text-accent-dark",
};

const outputLabel: Record<OutputStatus, string> = {
  done: "Done",
  checking: "Checking",
  pending: "Pending",
};

export function DayStatusPill({ status }: { status: DayStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${dayStyles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {dayLabel[status]}
    </span>
  );
}

export function OutputStatusPill({ status }: { status: OutputStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${outputStyles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {outputLabel[status]}
    </span>
  );
}
