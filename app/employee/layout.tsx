export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-base"
      data-dashboard
      style={{
        backgroundImage:
          "linear-gradient(var(--bg-overlay), var(--bg-overlay)), url('/images/dashboardbg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      {children}
    </div>
  );
}
