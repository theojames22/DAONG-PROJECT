"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  Loader2,
  Lock,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import AdvancedAppearanceSettings from "@/components/appearance/AdvancedAppearanceSettings";
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

const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const APPEARANCE_MODES = [
  { value: "light" as const, label: "Light", hint: "Bright surfaces", Icon: Sun },
  { value: "dark" as const, label: "Dark", hint: "Low-light surfaces", Icon: Moon },
  { value: "system" as const, label: "System", hint: "Follow this device", Icon: Monitor },
];

export default function SettingsModal({
  open,
  onClose,
  userId,
  userName,
  userEmail,
  userAvatarUrl,
  position,
}: SettingsModalProps) {
  const router = useRouter();
  const supabase = createClient();
  const { mode, setMode, saving: themeSaving } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"personal" | "id">("personal");
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [modeFeedback, setModeFeedback] = useState<Feedback>(null);

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
  const [emailPassword, setEmailPassword] = useState("");
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
      if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
      }
      if (file.size > MAX_AVATAR_BYTES) {
        throw new Error("Profile pictures must be 5 MB or smaller.");
      }

      // Derive the extension from the validated MIME type, not the original
      // filename, so a crafted name cannot add path segments to the object key.
      const ext =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type.split("/")[1].replace(/[^a-z0-9]/gi, "") || "png";
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
        .update({ full_name: name.trim() || null })
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
    if (!emailPassword) {
      setEmailFeedback({
        type: "error",
        text: "Enter your current password to change your email.",
      });
      return;
    }
    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, password: emailPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not update email.");
      setEmailPassword("");
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
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordFeedback({
        type: "error",
        text: "New password must contain at least one letter and one number.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", text: "New passwords do not match." });
      return;
    }
    setPasswordSaving(true);
    try {
      // Verify the current password before changing it. Read the email from
      // the auth session because the user may have just changed it in this
      // same modal (the server prop would still hold the old address).
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const authEmail = authUser?.email ?? userEmail ?? "";
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: authEmail,
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

  // ---- Appearance mode (persisted through the authenticated API) -----------

  async function chooseMode(next: Theme) {
    if (next === mode) return;
    setModeFeedback(null);
    const result = await setMode(next);
    if (result.ok) {
      setModeFeedback({ type: "success", text: "Appearance mode saved." });
    } else {
      setModeFeedback({
        type: "error",
        text: result.error ?? "Could not save the appearance mode.",
      });
    }
  }

  // ---- Render --------------------------------------------------------------

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass={appearanceExpanded ? "max-w-[1120px]" : "max-w-[560px]"}
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
                  accept="image/png,image/jpeg,image/webp,image/gif"
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
              <div className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  Position
                </span>
                <div className="elev-pressed flex min-h-[38px] items-center rounded-xl px-3 py-2 text-[13px] text-ink-muted">
                  {profilePosition.trim() || "Not assigned"}
                </div>
                <span className="text-[10.5px] text-ink-subtle">
                  Position and role are managed by a Head.
                </span>
              </div>
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
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                Current password
              </span>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Confirm with your current password"
                autoComplete="current-password"
                maxLength={72}
                className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
              />
            </label>
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
                  minLength={8}
                  maxLength={72}
                  className="elev-pressed neu-focus rounded-xl px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle outline-none"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
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
          <section className="py-5">
            <div className="px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13.5px] font-bold text-ink">Appearance</h3>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    Saved to your account only. Each mode keeps its own customized palette.
                  </p>
                </div>
                {themeSaving && (
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold text-ink-muted">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Saving…
                  </span>
                )}
              </div>

              <div
                className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-[var(--surface-2)] p-1"
                role="radiogroup"
                aria-label="Appearance mode"
              >
                {APPEARANCE_MODES.map(({ value, label, hint, Icon }, index) => {
                  const selected = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${label} mode — ${hint}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => chooseMode(value)}
                      onKeyDown={(event) => {
                        const keys = [
                          "ArrowRight",
                          "ArrowDown",
                          "ArrowLeft",
                          "ArrowUp",
                          "Home",
                          "End",
                        ];
                        if (!keys.includes(event.key)) return;
                        event.preventDefault();
                        const radios = Array.from(
                          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                            '[role="radio"]'
                          ) ?? []
                        );
                        if (radios.length === 0) return;
                        let nextIndex = index;
                        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                          nextIndex = (index + 1) % radios.length;
                        } else if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowUp"
                        ) {
                          nextIndex = (index - 1 + radios.length) % radios.length;
                        } else if (event.key === "Home") {
                          nextIndex = 0;
                        } else {
                          nextIndex = radios.length - 1;
                        }
                        radios[nextIndex]?.focus();
                        chooseMode(APPEARANCE_MODES[nextIndex].value);
                      }}
                      disabled={themeSaving}
                      className={`neu-focus flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-all disabled:cursor-wait disabled:opacity-70 ${
                        selected
                          ? "bg-[var(--card-bg)] text-ink shadow-sm ring-1 ring-[var(--primary-border)]"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          selected ? "text-[var(--primary-text)]" : ""
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-[10.5px] font-bold">{label}</span>
                      <span className="text-[9px] leading-none text-ink-subtle">
                        {hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              {modeFeedback && (
                <p
                  role={modeFeedback.type === "error" ? "alert" : "status"}
                  className={`mt-2 text-[10.5px] font-semibold ${
                    modeFeedback.type === "success" ? "text-success" : "text-danger"
                  }`}
                >
                  {modeFeedback.text}
                </p>
              )}
            </div>

            <div className="mt-4">
              <AdvancedAppearanceSettings
                onExpandedChange={setAppearanceExpanded}
              />
            </div>
          </section>
            </>
          )}
        </div>
    </ModalShell>
  );
}
