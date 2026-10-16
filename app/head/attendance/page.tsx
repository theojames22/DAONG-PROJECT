import { redirect } from "next/navigation";

/**
 * The Attendance page is now the List View of /head/workforce. Any ?date= is
 * carried over so an old link opens the same day in the attendance table.
 */
export default function AttendancePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const params = new URLSearchParams({ view: "list" });
  if (searchParams.date) {
    params.set("date", searchParams.date);
  }
  redirect(`/head/workforce?${params.toString()}`);
}
