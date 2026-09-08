import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/admin/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const adminName = profile?.full_name ?? user.email ?? "Admin";

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
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-6 p-4 sm:flex-row sm:p-6 lg:p-8">
        <Sidebar adminName={adminName} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
