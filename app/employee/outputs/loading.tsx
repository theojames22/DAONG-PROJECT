import styles from "./my-outputs.module.css";

/**
 * Route-level loading state for My Outputs.
 *
 * The real header/sidebar arrive with the page; this mirrors the page's own
 * geometry so the shell does not jump when the data resolves. Every block is
 * a shimmering skeleton — no fabricated counts, titles or statuses.
 */
export default function MyOutputsLoading() {
  return (
    <div
      className={`${styles.scope} ${styles.page} min-h-screen font-sans antialiased`}
      aria-busy="true"
    >
      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 pb-14 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3">
              <span
                className={styles.skeleton}
                style={{ height: 11, width: 120, borderRadius: 6 }}
              />
              <span
                className={styles.skeleton}
                style={{ height: 34, width: 260, borderRadius: 10 }}
              />
              <span
                className={styles.skeleton}
                style={{ height: 14, width: 360, maxWidth: "70vw", borderRadius: 6 }}
              />
            </div>
            <span
              className={styles.skeleton}
              style={{ height: 46, width: 158, borderRadius: 99 }}
            />
          </div>

          <div className={styles.summaryShell}>
            <div
              className={styles.skeleton}
              style={{ flex: "1 1 290px", minHeight: 220, borderRadius: 24 }}
            />
            <div className="flex min-w-0 flex-[3_1_640px] flex-col justify-center gap-[18px] px-2.5 py-2">
              <span
                className={styles.skeleton}
                style={{ height: 18, width: 180, borderRadius: 6 }}
              />
              <span
                className={styles.skeleton}
                style={{ height: 12, width: "100%", borderRadius: 99 }}
              />
              <div className={styles.tileGrid}>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={styles.skeleton}
                    style={{ height: 116, borderRadius: 20 }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className={styles.filtersShell}>
            <div className="flex flex-col gap-3 xl:flex-row">
              <span
                className={styles.skeleton}
                style={{ height: 48, flex: 1, borderRadius: 99 }}
              />
              <span
                className={styles.skeleton}
                style={{ height: 48, width: "34rem", maxWidth: "100%", borderRadius: 14 }}
              />
            </div>
            <span
              className={styles.skeleton}
              style={{ height: 48, width: "100%", borderRadius: 12, opacity: 0.6 }}
            />
          </div>

          <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <div
                key={index}
                className="flex flex-col overflow-hidden rounded-[26px]"
                style={{ background: "var(--mo-card)", boxShadow: "var(--mo-shadow-card)" }}
              >
                <span
                  className={styles.skeleton}
                  style={{ height: 164, borderRadius: 0 }}
                />
                <div className="flex flex-col gap-3 p-5">
                  <span
                    className={styles.skeleton}
                    style={{ height: 17, width: "78%", borderRadius: 6 }}
                  />
                  <span
                    className={styles.skeleton}
                    style={{ height: 11, width: "48%", borderRadius: 5 }}
                  />
                  <span
                    className={styles.skeleton}
                    style={{ height: 14, width: "100%", borderRadius: 99, marginTop: 8 }}
                  />
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <span
                      className={styles.skeleton}
                      style={{ height: 26, width: 112, borderRadius: 99 }}
                    />
                    <span
                      className={styles.skeleton}
                      style={{ height: 34, width: 88, borderRadius: 99 }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <span className="sr-only">Loading your outputs…</span>
        </div>
      </main>
    </div>
  );
}
