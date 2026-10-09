export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="neu-raised rounded-card p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="elev-1 rounded-xl px-4 py-5">
            <div className="flex items-start justify-between">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
            <div className="skeleton mt-4 h-7 w-12" />
            <div className="skeleton mt-3 h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-3">
          <div className="flex flex-col gap-2">
            <div className="skeleton h-3.5 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
