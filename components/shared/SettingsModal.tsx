"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Lock, Moon, ShieldCheck, Sun, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import IdCardTab from "./IdCardTab";
import ModalShell from "./ModalShell";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string | null;
  userAvatarUrl: string | null;
  initialTheme: Theme;
  /**
   * The signed-in account's position. The "QR Code ID" tab is only shown
   * to accounts that clock in/out (Staff). Heads are administrators and
   * have no QR code of their own.
   */
  position?: string | null;
}

type Feedback = { type: "success" | "error"; text: string } | null;

export default function SettingsModal({
  open,
  onClose,
  userId,
  userName,
  userEmail,
  userAvatarUrl,
  initialTheme,
  position,
}: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"personal" | "id">("personal");

  // Heads don't clock in/out, so they have no QR code to show.
  const showQrTab = position !== "head";

  // Profile section state
  const [name, setName] = useState(userName);
  const [profilePosition, setProfilePosition] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(userAvatarUrl ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);

  // Email section state
  const [email, setEmail] = useState(userEmail ?? "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);

  // Password section state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);

  // Load the current position + avatar whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("position, profile_picture_url")
        .eq("id", userId)
        .single();
      if (cancelled || !data) return;
      setProfilePosition(data.position ?? "");
      setAvatarUrl(data.profile_picture_url ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, supabase]);

  // Close on Escape.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // ---- Profile -------------------------------------------------------------

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    setProfileFeedback(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ profile_picture_url: urlData.publicUrl })
        .eq("id", userId);
      if (updateError) throw updateError;

      setAvatarUrl(urlData.publicUrl);
      setProfileFeedback({ type: "success", text: "Profile picture updated." });
      router.refresh();
    } catch (err) {
      setProfileFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed.",
      });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileFeedback(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim() || null,
          position: profilePosition.trim() || null,
        })
        .eq("id", userId);
      if (error) throw error;
      setProfileFeedback({ type: "success", text: "Profile saved." });
      router.refresh();
    } catch (err) {
      setProfileFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not save profile.",
      });
    } finally {
      setProfileSaving(false);
    }
  }

  // ---- Email (needs the service-role server route) -------------------------

  async function saveEmail() {
    const target = email.trim().toLowerCase();
    if (!target) {
      setEmailFeedback({ type: "error", text: "Email cannot be empty." });
      return;
    }
    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not update email.");
      setEmailFeedback({ type: "success", text: "Email updated." });
    } catch (err) {
      setEmailFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not update email.",
      });
    } finally {
      setEmailSaving(false);
    }
  }

  // ---- Password (verify current identity first) -----------------------------

  async function savePassword() {
    setPasswordFeedback(null);
    if (newPassword.length < 6) {
      setPasswordFeedback({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", text: "New passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    try {
      // Verify the current password before changing it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userEmail ?? "",
        password: currentPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setPasswordFeedback({ type: "success", text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Could not update password.",
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  // ---- Theme (persist to profile) ------------------------------------------

  async function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await supabase
      .from("profiles")
      .update({ theme_preference: next })
      .eq("id", userId);
  }

  // ---- Render --------------------------------------------------------------

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-[560px]"
      ariaLabelledBy="settings-modal-title"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <h2 id="settings-modal-title" className="font-display text-[16px] font-bold text-ink">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="neu-focus rounded-lg p-1.5 text-ink-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-5">
          <button
            type="button"
            onClick={() => setTab("personal")}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === "personal"
                ? "border-accent text-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Personal Info
          </button>
          {showQrTab && (
            <button
              type="button"
              onClick={() => setTab("id")}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                tab === "id"
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              QR Code ID
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "id" ? (
            <div className="px-5 py-5">
              <IdCardTab
                userId={userId}
                userName={userName}
                position={profilePosition}
                avatarUrl={avatarUrl}
                shortId={userId.slice(0, 4).toUpperCase()}
              />
            </div>
          ) : (
            <>
              {/* ============ PROFILE ============ */}
          <section className="border-b border-border px-5 py-5">
            <div className="mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-accent" />
              <h3 className="text-[13.5px] font-bold text-ink">Profile</h3>
            </div>

            {/* Avatar */}
            <div className="mb-5 flex items-center gap-4">
              <div className="relative">
                <div className="neu-raised flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-xl font-bold text-accent-dark">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (name || userName).charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Upload profile picture"
                  className="neu-icon-btn absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">Profile picture</p>
                <p className="text-[11.5px] text-ink-muted">
                  PNG or JPG. Uploads to your private folder.
                </p>
              </div>
            </div>

            {/* Name & Position */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  Position
                </span>
                <input
                  value={profilePosition}
                  onChange={(e) => setProfilePosition(e.target.value)}
                  placeholder="e.g. System Administrator"
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={saveProfile}
                disabled={profileSaving}
                className="btn-primary neu-focus"
              >
                {profileSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save profile
              </button>
              {profileFeedback && (
                <p
                  className={`text-[12px] font-semibold ${
                    profileFeedback.type === "success" ? "text-success" : "text-danger"
                  }`}
                >
                  {profileFeedback.text}
                </p>
              )}
            </div>
          </section>

          {/* ============ GMAIL ============ */}
          <section className="border-b border-border px-5 py-5">
            <div className="mb-3 flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <h3 className="text-[13.5px] font-bold text-ink">Gmail</h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  Email address
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
              </label>
              <button
                type="button"
                onClick={saveEmail}
                disabled={emailSaving}
                className="btn-primary neu-focus sm:mb-0"
              >
                {emailSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Update email
              </button>
            </div>
            {emailFeedback && (
              <p
                className={`mt-2 text-[12px] font-semibold ${
                  emailFeedback.type === "success" ? "text-success" : "text-danger"
                }`}
              >
                {emailFeedback.text}
              </p>
            )}
          </section>

          {/* ============ PASSWORD ============ */}
          <section className="border-b border-border px-5 py-5">
            <div className="mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-accent" />
              <h3 className="text-[13.5px] font-bold text-ink">Password</h3>
            </div>
            <div className="grid gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  autoComplete="new-password"
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={savePassword}
                disabled={passwordSaving}
                className="btn-primary neu-focus"
              >
                {passwordSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Update password
              </button>
              {passwordFeedback && (
                <p
                  className={`text-[12px] font-semibold ${
                    passwordFeedback.type === "success" ? "text-success" : "text-danger"
                  }`}
                >
                  {passwordFeedback.text}
                </p>
              )}
            </div>
          </section>

          {/* ============ APPEARANCE ============ */}
          <section className="px-5 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13.5px] font-bold text-ink">Appearance</h3>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">
                  Switches instantly and is saved to your profile.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                role="switch"
                aria-checked={theme === "dark"}
                aria-label="Toggle dark mode"
                className={`neu-icon-btn neu-focus relative flex h-8 w-14 items-center rounded-full transition-colors ${
                  theme === "dark" ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute flex h-6 w-6 items-center justify-center rounded-full bg-white shadow transition-all duration-200 ${
                    theme === "dark" ? "left-7" : "left-1"
                  }`}
                >
                  {theme === "dark" ? (
                    <Moon className="h-3 w-3 text-blue-600" />
                  ) : (
                    <Sun className="h-3 w-3 text-amber-500" />
                  )}
                </span>
              </button>
            </div>
          </section>
            </>
          )}
        </div>
    </ModalShell>
  );
}
