import SignOutButton from "@/components/SignOutButton";

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage:
          "linear-gradient(rgba(245,249,255,0.90), rgba(245,249,255,0.90)), url('/images/dashboardbg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 pt-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-dark">
            D
          </span>
          <p className="font-display text-[15px] font-bold text-ink">Daong</p>
        </div>
        <SignOutButton />
      </div>
      {children}
    </div>
  );
}
