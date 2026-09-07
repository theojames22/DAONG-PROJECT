"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="neu-button neu-focus rounded-2xl px-5 py-2.5 text-[13.5px] font-semibold text-accent-dark"
    >
      Sign out
    </button>
  );
}
