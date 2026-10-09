import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/admin/Sidebar";
import AdminTopBar from "@/components/admin/AdminTopBar";
import type { Theme } from "@/components/theme/ThemeProvider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, position, email, profile_picture_url, theme_preference")
    .eq("id", user.id)
    .single();

  const adminName = profile?.full_name ?? user.email ?? "Admin";

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundImage:
          "linear-gradient(var(--bg-overlay), var(--bg-overlay)), url('/images/dashboardbg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <AdminTopBar
        adminId={user.id}
        adminName={adminName}
        adminEmail={profile?.email ?? user.email ?? null}
        adminAvatarUrl={profile?.profile_picture_url ?? null}
        initialTheme={(profile?.theme_preference as Theme) ?? "light"}
      />
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-6 p-4 sm:p-6 lg:px-4 lg:pt-20 lg:pb-8">
        <Sidebar
          adminName={adminName}
          adminPosition={profile?.position ?? null}
          adminAvatarUrl={profile?.profile_picture_url ?? null}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
