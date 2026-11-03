import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { getAuthenticatedProfile } from "@/lib/auth-utils";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import LoadingScreen from "@/components/LoadingScreen";
import {
  DEFAULT_APPEARANCE,
  appearanceToCssVars,
  sanitizeAppearancePreferences,
  type AppearancePreferences,
  type ResolvedTheme,
} from "@/lib/appearance";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Daong — Attendance Tracker",
  description: "Sign in to Daong to log your time and submit your work.",
  icons: {
    icon: "/images/logo.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the signed-in user's saved appearance so the correct palette is
  // present in the very first HTML response (no flash of another account's
  // theme, no flash of light before dark).
  let initialPreferences: AppearancePreferences = DEFAULT_APPEARANCE;
  let initialUserId: string | null = null;
  try {
    const { profile, user } = await getAuthenticatedProfile();
    initialPreferences = sanitizeAppearancePreferences(
      profile.appearance_preferences,
      profile.theme_preference
    );
    initialUserId = user.id;
  } catch {
    // Anonymous / no profile yet — use the sensible application defaults.
  }

  const lightVars = appearanceToCssVars(initialPreferences, "light");
  const darkVars = appearanceToCssVars(initialPreferences, "dark");
  const serverResolved: ResolvedTheme =
    initialPreferences.mode === "dark" ? "dark" : "light";
  const initialVars = serverResolved === "dark" ? darkVars : lightVars;

  // This tiny inline script runs before the body paints. It resolves System
  // Mode against the OS and swaps in the matching pre-computed token set. The
  // same values are already present on <html> for the non-system case, so
  // JavaScript being disabled still leaves a correct, readable first paint.
  const bootstrap = `(function(){try{
var p=${JSON.stringify(initialPreferences)};
var L=${JSON.stringify(lightVars)};
var D=${JSON.stringify(darkVars)};
var d=p.mode==='dark'||(p.mode==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
var v=d?D:L;
var e=document.documentElement;
e.classList.toggle('dark',!!d);
for(var k in v){e.style.setProperty(k,v[k]);}
e.dataset.appearance='advanced';
e.dataset.density=p.options.density;
e.dataset.radius=p.options.radius;
e.dataset.cardStyle=p.options.cardStyle;
e.dataset.sidebarStyle=p.options.sidebarStyle;
e.dataset.motion=p.options.motion;
e.dataset.autoText=p.options.autoAdjustText?'true':'false';
}catch(e){}})();`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${manrope.variable}${
        serverResolved === "dark" ? " dark" : ""
      }`}
      style={initialVars as unknown as CSSProperties}
      data-appearance="advanced"
      data-density={initialPreferences.options.density}
      data-radius={initialPreferences.options.radius}
      data-card-style={initialPreferences.options.cardStyle}
      data-sidebar-style={initialPreferences.options.sidebarStyle}
      data-motion={initialPreferences.options.motion}
      data-auto-text={initialPreferences.options.autoAdjustText ? "true" : "false"}
    >
      <head>
        <script
          id="appearance-bootstrap"
          dangerouslySetInnerHTML={{ __html: bootstrap }}
        />
      </head>
      <body className="font-sans text-ink antialiased">
        <LoadingScreen />
        <ThemeProvider
          initialPreferences={initialPreferences}
          initialUserId={initialUserId}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
