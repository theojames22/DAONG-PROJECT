import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/employee");

  return (
    <main className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="neu-raised w-full max-w-md rounded-neu px-8 py-9 text-center">
        <p className="text-[13px] text-ink-muted">Signed in as admin</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
          {profile?.full_name || user.email}
        </h1>
        <p className="mt-6 text-[13.5px] text-ink-muted">
          The team attendance table and weekly compliance view will live here.
        </p>
        <div className="mt-7">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
