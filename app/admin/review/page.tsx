import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedProfile, ProfileMissingError } from "@/lib/auth-utils";
import { USER_ROLES } from "@/lib/constants";
import { Profile, Output } from "@/lib/types";
import ReviewList from "@/components/admin/ReviewList";

export default async function ReviewPage() {
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

  const [{ data: outputs }, { data: profiles }] = await Promise.all([
    supabase
      .from("outputs")
      .select("id, employee_id, date, title, attachment_type, attachment_url, status, reviewer_notes")
      .neq("status", "done")
      .order("date", { ascending: false }),
    supabase.from("profiles").select("id, full_name, position, role, required_weekly_hours"),
  ]);

  const nameById = new Map(
    ((profiles ?? []) as Profile[]).map((p) => [p.id, p.full_name || "—"])
  );

  const items = ((outputs ?? []) as Output[]).map((o) => ({
    ...o,
    employeeName: nameById.get(o.employee_id) || "—",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Output Review</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {items.length} {items.length === 1 ? "item" : "items"} waiting on you.
        </p>
      </div>

      <div className="neu-raised rounded-neu p-4">
        <ReviewList items={items} />
      </div>
    </div>
  );
}
