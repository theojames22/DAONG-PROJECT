import { redirect } from "next/navigation";

/**
 * The Attendance page is now the List View of /head/workforce. Any ?date= is
 * carried over so an old link opens the same day in the attendance table.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams({ view: "list" });
  if (resolvedSearchParams.date) {
    params.set(
      "date",
      Array.isArray(resolvedSearchParams.date)
        ? resolvedSearchParams.date[0]
        : resolvedSearchParams.date
    );
  }
  redirect(`/head/workforce?${params.toString()}`);
}
