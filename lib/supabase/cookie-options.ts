/**
 * Shared auth-cookie policy for the browser, server and middleware clients.
 *
 * Keep the session cookie Secure whenever the canonical site URL is HTTPS.
 * Local `http://localhost` previews stay usable; a production deploy must set
 * NEXT_PUBLIC_SITE_URL to its HTTPS origin.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

export const authCookieOptions = {
  secure: siteUrl.startsWith("https://"),
};
