import { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="elev-1 flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="h-5 w-5 text-ink-subtle" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-[14px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
