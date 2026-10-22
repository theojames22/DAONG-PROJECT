/* The shared Daong loading visual.
   ---------------------------------------------------------------------
   `LoadingScreen` renders the full-screen overlay on every full page
   load, and the login page renders the same thing as its post-submit
   bridge, so opening the site and signing in read as one continuous
   experience instead of two unrelated spinners.

   Two variants share one language:
     · "intro"  — the cinematic opening (blue field, light, waves, boat).
     · "loader" — the calm loader used everywhere else, dark-theme aware.

   Styling lives in app/globals.css. */

export type BrandLoaderVariant = "intro" | "loader";

/* The atmosphere behind the mark. On the intro it is a blue studio light;
   on the loader it is faint water. Both are purely decorative, so the whole
   layer is hidden from assistive tech. */
export function BrandLoaderBackdrop({
  variant,
}: {
  variant?: BrandLoaderVariant | null;
}) {
  const showBlobs = variant !== "loader";
  const showLines = variant !== "intro";

  return (
    <div className="loading-backdrop" aria-hidden="true">
      <span className="loading-field" />
      {showBlobs && (
        <>
          <span className="loading-blob loading-blob-1" />
          <span className="loading-blob loading-blob-2" />
        </>
      )}
      {showLines && (
        <span className="loading-lines">
          <svg viewBox="0 0 1440 360" preserveAspectRatio="none">
            {[0, 28, 56, 84, 112, 140, 168, 196].map((dy, i) => (
              <path
                key={dy}
                transform={`translate(0 ${dy})`}
                d="M0 90C220 20 380 160 620 100S1020 20 1240 90S1400 140 1440 110"
                opacity={0.55 - i * 0.05}
              />
            ))}
          </svg>
        </span>
      )}
    </div>
  );
}

export interface BrandLoaderProps {
  variant: BrandLoaderVariant;
  label?: string;
}

/** The fisherman's boat: hull, sail, oar and a pair of settling ripples. */
function Boat() {
  return (
    <svg viewBox="0 0 250 190" fill="none">
      <path d="M124 14v118" stroke="#0F1B33" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M124 20 124 120 52 120Z" fill="#FFFFFF" stroke="#BFD0F0" strokeWidth="2" strokeLinejoin="round" />
      <path d="M132 34 132 120 196 120Z" fill="#E1EBFF" stroke="#BFD0F0" strokeWidth="2" strokeLinejoin="round" />
      <path d="M124 14 148 22 124 30Z" fill="#2563EB" />
      <path d="M24 124H226C220 158 196 170 166 172H84C54 170 30 158 24 124Z" fill="#1D4FD8" />
      <path d="M30 140H220C216 148 210 154 202 158H48C40 154 34 148 30 140Z" fill="#FFFFFF" opacity=".92" />
      <path d="M24 124H226" stroke="#0F1B33" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      <circle cx="76" cy="146" r="4" fill="#1D4FD8" />
      <circle cx="104" cy="146" r="4" fill="#1D4FD8" />
      <circle cx="132" cy="146" r="4" fill="#1D4FD8" />
    </svg>
  );
}

/** One tier of water: an outer band for the exit fade, an inner wrapper
 *  for the entrance, and the SVG itself for the endless drift. */
function Wave({ tier, d }: { tier: 1 | 2 | 3; d: string }) {
  return (
    <div className={`loading-wave loading-wave-${tier}`} aria-hidden="true">
      <div className="loading-wave-in">
        <svg
          className="loading-wave-drift"
          viewBox="0 0 1440 200"
          preserveAspectRatio="none"
        >
          <path d={d} />
        </svg>
      </div>
    </div>
  );
}

/** The brand mark: the boat-and-clock emblem, cropped out of logo.png, in a
 *  white/ice tile. Decorative — the wordmark beside it carries the name. */
function Tile() {
  return (
    <span className="loading-tile">
      <img src="/images/logo.png" alt="" decoding="async" />
    </span>
  );
}

export default function BrandLoader({
  variant,
  label = "Preparing your workspace…",
}: BrandLoaderProps) {
  if (variant === "intro") {
    return (
      <div className="loading-stage is-intro">
        <Wave
          tier={1}
          d="M0 70C180 20 360 120 540 70S900 20 1080 70S1320 110 1440 60L1440 200L0 200Z"
        />

        <div className="loading-lockup">
          <div className="loading-lockup-exit">
            <div className="loading-lockup-in">
              <span className="loading-glow" aria-hidden="true" />
              <div className="loading-lockup-clip">
                <Tile />
                <div className="loading-lockup-copy">
                  <span className="loading-brandname">Daong</span>
                  <p className="loading-tagline">
                    <span>Ang Bawat Oras sa Paglalayag ng</span>
                    <span>The FISHERMAN Group of Publications</span>
                  </p>
                </div>
                <span className="loading-sweep" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className="loading-boat" aria-hidden="true">
          <div className="loading-boat-exit">
            <div className="loading-boat-rise">
              <div className="loading-boat-bob">
                <Boat />
                <span className="loading-ripples">
                  <span className="loading-ripple" />
                  <span className="loading-ripple loading-ripple-2" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <Wave
          tier={2}
          d="M0 90C200 40 380 130 600 90S960 40 1160 90S1340 120 1440 80L1440 200L0 200Z"
        />
        <Wave
          tier={3}
          d="M0 120C220 80 420 150 640 118S1000 80 1200 120S1380 140 1440 112L1440 200L0 200Z"
        />
      </div>
    );
  }

  return (
    <div className="loading-stage is-loader">
      <span className="loading-loader-glow" aria-hidden="true" />
      <div className="loading-loader-mark">
        <Tile />
        <span className="loading-brandname">Daong</span>
      </div>

      <div className="loading-progress">
        {/* Indeterminate on purpose: the app cannot honestly measure
            server rendering, auth hydration and asset readiness as a
            percentage, so no fabricated value is ever shown. */}
        <div className="loading-track" role="progressbar" aria-label={label}>
          <span className="loading-shuttle" />
        </div>
        <p className="loading-label">{label}</p>
      </div>
    </div>
  );
}
