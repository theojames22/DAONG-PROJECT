import { LucideIcon } from "lucide-react";

type Tone = "default" | "success" | "warning" | "danger";

const toneStyles: Record<Tone, { icon: string; iconBg: string; value: string }> = {
  default: { icon: "text-accent-dark", iconBg: "bg-accent-soft", value: "text-ink" },
  success: { icon: "text-success", iconBg: "bg-success-soft", value: "text-ink" },
  warning: { icon: "text-warning", iconBg: "bg-warning-soft", value: "text-ink" },
  danger: { icon: "text-danger", iconBg: "bg-danger-soft", value: "text-ink" },
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  tone = "default",
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  tone?: Tone;
  delay?: number;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className="elev-2 neu-hover animate-fade-up rounded-card px-5 py-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[12.5px] font-medium uppercase tracking-wide text-ink-subtle">
          {label}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}
        >
          <Icon className={`h-[18px] w-[18px] ${styles.icon}`} strokeWidth={2} />
        </span>
      </div>
      <p className={`mt-2 text-[26px] font-bold leading-none ${styles.value}`}>{value}</p>
      {trend && <p className="mt-2 text-[12.5px] text-ink-muted">{trend}</p>}
    </div>
  );
}
