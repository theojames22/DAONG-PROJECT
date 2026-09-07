import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function EmployeePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, position")
    .eq("id", user.id)
    .single();

  // Middleware already blocks signed-out visitors from /employee, but it
  // doesn't check role — do that here so an admin who navigates here directly
  // gets sent back to their own dashboard instead of seeing this one.
  if (profile?.role !== "employee") redirect("/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="neu-raised w-full max-w-md rounded-neu px-8 py-9 text-center">
        <p className="text-[13px] text-ink-muted">Signed in as</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          {profile?.full_name || user.email}
        </h1>
        {profile?.position && (
          <p className="mt-1 text-[13px] text-ink-muted">{profile.position}</p>
        )}
        <p className="mt-6 text-[13.5px] text-ink-muted">
          Time-in / time-out and your output log will live here.
        </p>
        <div className="mt-7">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
