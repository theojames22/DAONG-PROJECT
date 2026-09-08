export default function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="animate-fade-up">
      <h1 className="text-[26px] font-bold leading-tight text-ink sm:text-[30px]">
        {title}
      </h1>
      {description && (
        <p className="mt-1.5 text-[14px] text-ink-muted">{description}</p>
      )}
    </div>
  );
}
