"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err: any) {
      console.error("Sign out error:", err);
      alert("Failed to sign out. Please try again.");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className="btn-secondary neu-focus">
      Sign out
    </button>
  );
}
