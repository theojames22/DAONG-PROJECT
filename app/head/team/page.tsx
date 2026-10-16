import { redirect } from "next/navigation";

/**
 * The Team page is now the Card View of /head/workforce. Kept as a server
 * redirect so existing links and bookmarks keep working.
 */
export default function TeamPage() {
  redirect("/head/workforce");
}
