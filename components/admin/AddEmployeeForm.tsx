"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AddEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState("");
  const [requiredHours, setRequiredHours] = useState("40");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        email,
        password,
        position,
        required_weekly_hours: Number(requiredHours),
      }),
    });

    const body = await res.json();
    setIsSubmitting(false);

    if (!res.ok) {
      setError(body.error || "Something went wrong.");
      return;
    }

    setFullName("");
    setEmail("");
    setPassword("");
    setPosition("");
    setRequiredHours("40");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="neu-button neu-focus rounded-2xl px-5 py-2.5 text-[13.5px] font-semibold text-accent-dark"
      >
        Add employee
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="neu-raised flex w-full max-w-md flex-col gap-3 rounded-neu p-5"
    >
      <p className="text-[14px] font-semibold text-ink">New employee</p>

      <input
        required
        placeholder="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="neu-pressed neu-focus rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
      />
      <input
        required
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="neu-pressed neu-focus rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
      />
      <input
        required
        type="text"
        placeholder="Temporary password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="neu-pressed neu-focus rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
      />
      <input
        placeholder="Position (optional)"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        className="neu-pressed neu-focus rounded-xl px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-[13px] text-ink-muted">Required hrs/week</label>
        <input
          type="number"
          min={0}
          value={requiredHours}
          onChange={(e) => setRequiredHours(e.target.value)}
          className="neu-pressed neu-focus w-20 rounded-xl px-3 py-2 text-[13.5px] text-ink outline-none"
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <p className="text-[12px] text-ink-muted">
        They'll sign in with this email and temporary password — share it with them
        directly, and ask them to change it after their first login.
      </p>

      <div className="mt-1 flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="neu-button neu-focus flex-1 rounded-xl py-2.5 text-[13.5px] font-semibold text-accent-dark disabled:opacity-60"
        >
          {isSubmitting ? "Creating…" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="neu-focus rounded-xl px-4 py-2.5 text-[13.5px] text-ink-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
