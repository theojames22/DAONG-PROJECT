export default function Logo() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="neu-raised flex h-20 w-20 items-center justify-center rounded-full overflow-hidden">
        <img
          src="/images/logo.png"
          alt="Daong Logo"
          className="h-full w-full object-contain"
        />
      </div>

      <div className="text-center">
        <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight text-ink">
          DAONG
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Ang Bawat Oras sa Paglalayag ng The FISHERMAN Group of Publications
        </p>
      </div>
    </div>
  );
}
