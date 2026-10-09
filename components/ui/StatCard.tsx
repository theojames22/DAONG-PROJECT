import { TrendingUp, type LucideIcon } from "lucide-react";

type Tone = "default" | "success" | "warning" | "danger";

const toneStyles: Record<Tone, { icon: string; iconBg: string }> = {
  default: { icon: "text-accent-dark", iconBg: "bg-accent-soft" },
  success: { icon: "text-success", iconBg: "bg-success-soft" },
  warning: { icon: "text-warning", iconBg: "bg-warning-soft" },
  danger: { icon: "text-danger", iconBg: "bg-danger-soft" },
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
      className="elev-1 neu-hover animate-fade-up rounded-xl px-4 py-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
        </p>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}
        >
          <Icon className={`h-[17px] w-[17px] ${styles.icon}`} strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3.5 text-[28px] font-black leading-none text-ink">{value}</p>
      {trend && (
        <p className="mt-2 flex items-center gap-1 text-[12px] text-ink-subtle">
          <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          {trend}
        </p>
      )}
    </div>
  );
}
