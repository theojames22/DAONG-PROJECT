import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Profile } from "@/lib/types";
import { formatHours } from "@/lib/attendance";
import AddEmployeeForm from "@/components/admin/AddEmployeeForm";

export default async function TeamPage() {
  let profile;
  try {
    const { profile: p } = await getAuthenticatedProfile();
    profile = p;
  } catch (error) {
    if (error instanceof ProfileMissingError) {
      redirect("/login?error=profile_missing");
    }
    redirect("/login");
  }

  if (profile.role !== USER_ROLES.ADMIN) {
    redirect("/employee");
  }

  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, position, role, required_weekly_hours")
    .order("full_name");

  const employees = (profiles ?? []) as Profile[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Team</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {employees.length} {employees.length === 1 ? "account" : "accounts"}
          </p>
        </div>
        <AddEmployeeForm />
      </div>

      <div className="neu-raised rounded-neu p-4">
        {employees.length === 0 ? (
          <p className="px-2 py-6 text-[13.5px] text-ink-muted">
            No one here yet — add your first employee above.
          </p>
        ) : (
          <ul className="flex flex-col">
            {employees.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between border-t border-base-dark/40 px-2 py-3.5 first:border-t-0"
              >
                <div>
                  <p className="text-[13.5px] font-medium text-ink">
                    {e.full_name || "—"}
                    {e.role === "admin" && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-dark">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-[12.5px] text-ink-muted">{e.position || "—"}</p>
                </div>
                <p className="text-[13px] text-ink-muted">
                  {formatHours(e.required_weekly_hours)} / week required
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
