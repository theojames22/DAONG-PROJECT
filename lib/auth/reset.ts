/**
 * Pure helpers for the password-recovery flow.
 *
 * These are deliberately free of Supabase imports so they can be unit tested
 * without a network or browser environment. The policy below mirrors the one
 * the reset form has always enforced (8–72 characters, at least one letter and
 * one number) and never loosens it.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const RESET_COOLDOWN_MS = 60_000;

export const PASSWORD_POLICY_HINT =
  "Use 8–72 characters with at least one letter and one number.";

// Deliberately forgiving: it only has to catch obvious typos before we ask the
// provider. Supabase remains the authority on whether the address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string): string {
  return value.trim();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function validateNewPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must include at least one letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  return null;
}

type ErrorFacts = {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
};

function readError(error: unknown): ErrorFacts {
  if (!error || typeof error !== "object") return {};
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  return {
    status: typeof candidate.status === "number" ? candidate.status : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    message:
      typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

/** HTTP-ish status Supabase attaches to AuthError instances, when present. */
export function authErrorStatus(error: unknown): number | undefined {
  return readError(error).status;
}

function isNetworkError({ status, name }: ErrorFacts): boolean {
  return status === 0 || name === "AuthRetryableFetchError";
}

/**
 * True when the password call had no recovery session behind it — the link was
 * already used, expired, or the cookie was cleared. The page turns this into
 * the "request a new link" state instead of showing a provider message.
 */
export function isMissingSessionError(error: unknown): boolean {
  const facts = readError(error);
  if (facts.status === 401 || facts.status === 403) return true;
  if (
    facts.name === "AuthSessionMissingError" ||
    facts.name === "AuthInvalidJwtError" ||
    facts.name === "AuthInvalidCredentialsError"
  ) {
    return true;
  }
  if (
    facts.code === "session_not_found" ||
    facts.code === "session_expired" ||
    facts.code === "bad_jwt" ||
    facts.code === "invalid_jwt" ||
    facts.code === "refresh_token_not_found" ||
    facts.code === "refresh_token_already_used"
  ) {
    return true;
  }
  return Boolean(facts.message?.toLowerCase().includes("auth session missing"));
}

/**
 * Safe, user-facing copy for a failed reset-link request. Provider messages
 * are never surfaced: they can reveal configuration details or account state.
 */
export function resetRequestMessage(error: unknown): string {
  const facts = readError(error);
  if (isNetworkError(facts)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (facts.status === 429) {
    return "Too many reset requests were made. Please wait a few minutes and try again.";
  }
  return "We couldn't process that request right now. Please try again.";
}

/** Safe, user-facing copy for a failed password update. */
export function passwordUpdateMessage(error: unknown): string {
  const facts = readError(error);
  if (isNetworkError(facts)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (facts.status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (facts.code === "same_password") {
    return "Choose a password you haven't used before.";
  }
  if (facts.status === 422 || facts.code === "weak_password") {
    return PASSWORD_POLICY_HINT;
  }
  return "We couldn't update your password. Please try again.";
}
