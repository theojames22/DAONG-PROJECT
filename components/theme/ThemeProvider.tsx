"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_APPEARANCE,
  appearanceToCssVars,
  cloneAppearance,
  sanitizeAppearancePreferences,
  type AppearancePreferences,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/appearance";

/** Kept for the many components that only pass a mode around. */
export type Theme = ThemeMode;

export interface AppearanceSaveResult {
  ok: boolean;
  error?: string;
  preferences?: AppearancePreferences;
}

interface ThemeContextValue {
  /** Concrete light/dark currently on screen (system already resolved). */
  theme: ResolvedTheme;
  /** Saved preference, which may be "system". */
  mode: ThemeMode;
  preferences: AppearancePreferences;
  saving: boolean;
  setTheme: (mode: ThemeMode) => Promise<AppearanceSaveResult>;
  setMode: (mode: ThemeMode) => Promise<AppearanceSaveResult>;
  savePreferences: (
    next: AppearancePreferences
  ) => Promise<AppearanceSaveResult>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "light",
  preferences: DEFAULT_APPEARANCE,
  saving: false,
  setTheme: async () => ({ ok: false, error: "Theme provider is not ready." }),
  setMode: async () => ({ ok: false, error: "Theme provider is not ready." }),
  savePreferences: async () => ({
    ok: false,
    error: "Theme provider is not ready.",
  }),
});

function applyToDocument(
  preferences: AppearancePreferences,
  resolved: ResolvedTheme
) {
  const root = document.documentElement;
  const vars = appearanceToCssVars(preferences, resolved);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.appearance = "advanced";
  root.dataset.density = preferences.options.density;
  root.dataset.radius = preferences.options.radius;
  root.dataset.cardStyle = preferences.options.cardStyle;
  root.dataset.sidebarStyle = preferences.options.sidebarStyle;
  root.dataset.motion = preferences.options.motion;
  root.dataset.autoText = preferences.options.autoAdjustText ? "true" : "false";
}

export function ThemeProvider({
  children,
  initialPreferences = DEFAULT_APPEARANCE,
  initialUserId,
}: {
  children: ReactNode;
  /** Server-resolved saved preferences. Applied before paint by the inline
   *  bootstrap script in the root layout. */
  initialPreferences?: AppearancePreferences;
  /** Used only to detect an account swap in the same tab. Never sent to the
   *  server as an identity. */
  initialUserId?: string | null;
}) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() =>
    sanitizeAppearancePreferences(initialPreferences)
  );
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);

  const resolvedTheme: ResolvedTheme =
    preferences.mode === "system"
      ? systemDark
        ? "dark"
        : "light"
      : preferences.mode;

  // Track the OS appearance only while System Mode is selected.
  useEffect(() => {
    if (preferences.mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.mode]);

  // The single source of truth for the document's theme tokens.
  useEffect(() => {
    applyToDocument(preferences, resolvedTheme);
  }, [preferences, resolvedTheme]);

  const savePreferences = useCallback(
    async (next: AppearancePreferences): Promise<AppearanceSaveResult> => {
      const requestId = ++requestRef.current;
      setSaving(true);
      try {
        const response = await fetch("/api/settings/appearance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(next),
        });
        const body = (await response.json().catch(() => null)) as
          | {
              preferences?: unknown;
              error?: string;
              errors?: string[];
            }
          | null;

        if (!response.ok) {
          const detail =
            body?.error ||
            (Array.isArray(body?.errors) ? body.errors[0] : null) ||
            "Could not save appearance.";
          return { ok: false, error: detail };
        }
        if (!body?.preferences) {
          return {
            ok: false,
            error: "The server did not confirm the saved appearance.",
          };
        }

        // Ignore a stale response if the user saved again while this was in
        // flight. The latest request owns the state.
        if (requestId !== requestRef.current) {
          return { ok: true };
        }

        const saved = sanitizeAppearancePreferences(body.preferences);
        setPreferences(saved);
        return { ok: true, preferences: saved };
      } catch {
        return {
          ok: false,
          error: "Network error — appearance was not saved. Please try again.",
        };
      } finally {
        if (requestId === requestRef.current) setSaving(false);
      }
    },
    []
  );

  const setMode = useCallback(
    async (mode: ThemeMode) => {
      if (mode === preferences.mode) return { ok: true };
      return savePreferences({ ...cloneAppearance(preferences), mode });
    },
    [preferences, savePreferences]
  );

  // Clear account-specific in-memory state on sign-out and force a fresh
  // document if a different account signs in within the same tab.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setPreferences(cloneAppearance(DEFAULT_APPEARANCE));
        setSystemDark(false);
        return;
      }
      if (
        event === "SIGNED_IN" &&
        initialUserId &&
        session.user?.id &&
        session.user.id !== initialUserId
      ) {
        // The new identity must load its own server-resolved palette. A full
        // reload also guarantees no previous React state can leak across.
        window.location.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, [initialUserId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      mode: preferences.mode,
      preferences,
      saving,
      setTheme: setMode,
      setMode,
      savePreferences,
    }),
    [resolvedTheme, preferences, saving, setMode, savePreferences]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
