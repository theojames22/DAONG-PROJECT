# Daong — Attendance Tracker

Login page scaffold. Neumorphic UI, Next.js 14 (App Router) + TypeScript + Tailwind.

## Run it

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` — it redirects to `/login`.

## File structure

```
daong-attendance-tracker/
├── app/
│   ├── layout.tsx        # Loads Fraunces + Manrope, sets page metadata
│   ├── page.tsx           # Redirects "/" to "/login"
│   ├── globals.css        # Neumorphic shadow utilities (.neu-raised, .neu-pressed, etc.)
│   └── login/
│       └── page.tsx       # The login screen (client component)
├── components/
│   └── Logo.tsx            # "Daong" wordmark + embossed icon mark
├── tailwind.config.ts      # Color tokens, font families, border radius
├── postcss.config.js
├── next.config.js
├── tsconfig.json
└── package.json
```

## Design tokens

| Token | Value | Use |
|---|---|---|
| `base` | `#E6EBF2` | Page + surface background |
| `base-light` | `#FFFFFF` | Light-side shadow (raised/pressed) |
| `base-dark` | `#B7C1D1` | Dark-side shadow (raised/pressed) |
| `ink` | `#2B3542` | Primary text |
| `ink-muted` | `#71798A` | Labels, secondary text |
| `accent` | `#B8862E` | Icon mark, active states, button label |

Fonts: **Fraunces** for the "Daong" wordmark only, **Manrope** for all UI text.

## What's next

- Wire `handleSubmit` in `app/login/page.tsx` to your auth provider (e.g. Supabase
  `auth.signInWithPassword`). Currently it's a stub with a fake delay.
- The role toggle (Employee / Admin) currently just sets local state — once auth is
  wired, use it to route to `/employee` or `/admin` after a successful sign-in, or
  drop it and derive the role from the user's record instead.
- Add a real "Forgot password?" flow.
- Reuse `.neu-raised`, `.neu-pressed`, `.neu-button`, `.neu-track`, `.neu-icon-btn`
  from `globals.css` for the dashboard components (table rows, status pills, the
  time-in/out buttons) so the whole app stays visually consistent.
