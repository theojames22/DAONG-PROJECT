import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { getAuthenticatedProfile } from "@/lib/auth-utils";
import { ThemeProvider, type Theme } from "@/components/theme/ThemeProvider";
import LoadingScreen from "@/components/LoadingScreen";
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
  // Resolve the signed-in user's saved theme so the correct palette is on
  // <html> from the very first paint (no flash of the wrong theme).
  // getAuthenticatedProfile is request-cached, so this shares the section
  // layout's verification and profile row instead of querying them again.
  let initialTheme: Theme = "light";
  try {
    const { profile } = await getAuthenticatedProfile();
    if (profile.theme_preference === "dark") {
      initialTheme = "dark";
    }
  } catch {
    // Anonymous / no profile yet — keep the light default.
  }

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable}${
        initialTheme === "dark" ? " dark" : ""
      }`}
    >
      <body className="font-sans text-ink antialiased">
        <LoadingScreen />
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
