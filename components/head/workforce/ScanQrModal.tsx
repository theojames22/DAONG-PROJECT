"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  ScanLine,
  UserCheck,
  X,
} from "lucide-react";
import ModalShell from "@/components/shared/ModalShell";
import { createClient } from "@/lib/supabase/client";
import type { Html5Qrcode } from "html5-qrcode";
import styles from "@/app/head/workforce/workforce.module.css";

/** Container id html5-qrcode renders its <video> into. */
const READER_ID = "workforce-qr-reader";

type Phase = "scanning" | "resolving" | "confirm" | "submitting" | "success";

interface ResolvedStaff {
  id: string;
  full_name: string | null;
  position: string | null;
}

export interface ScanQrModalProps {
  open: boolean;
  onClose: () => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Friendly copy for the usual camera failures. */
function cameraErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|denied|notallowed|NotAllowedError/i.test(msg)) {
    return "Camera access was blocked. Allow camera permission in your browser, then try again.";
  }
  if (/notfound|no camera|devices? not found|OverconstrainedError/i.test(msg)) {
    return "No usable camera was found on this device.";
  }
  if (/secure|https/i.test(msg)) {
    return "The camera needs a secure (HTTPS or localhost) connection.";
  }
  return "We couldn't start the camera. Close this window and try again.";
}

/**
 * "Scan Staff QR" — opens the device camera, reads a staff badge, resolves it
 * to an account and clocks them in/out through the existing attendance RPCs.
 *
 * Why RPCs and not direct inserts: a Head has no INSERT policy on `sessions`
 * (staff insert their own rows), so `admin_toggle_attendance` is the only
 * supported path. It runs as SECURITY DEFINER and is gated by `is_admin()`.
 */
export default function ScanQrModal({ open, onClose }: ScanQrModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [resolved, setResolved] = useState<ResolvedStaff | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const genRef = useRef(0);
  const decodedRef = useRef<(text: string) => void>(() => {});
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const stopScanner = useCallback(async () => {
    genRef.current += 1;
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) {
      runningRef.current = false;
      return;
    }
    try {
      if (runningRef.current) await scanner.stop();
    } catch {
      /* The scanner may already be stopped — ignore. */
    }
    runningRef.current = false;
    try {
      scanner.clear();
    } catch {
      /* Element already cleared — ignore. */
    }
  }, []);

  const startScanner = useCallback(async () => {
    const myGen = ++genRef.current;
    setCameraError(null);
    let created: Html5Qrcode | null = null;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (genRef.current !== myGen) return;

      // ModalShell portals its children after its own mount effect, and the
      // stage swap re-renders — wait until the reader is present AND laid out.
      let ready = false;
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const el = document.getElementById(READER_ID);
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          ready = true;
          break;
        }
        await delay(40);
        if (genRef.current !== myGen) return;
      }
      if (!ready) throw new Error("reader-unavailable");

      if (scannerRef.current) return;

      const scanner = new Html5Qrcode(READER_ID, { verbose: false });
      created = scanner;
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => decodedRef.current(text),
        () => {
          /* Per-frame misses are expected — stay quiet. */
        }
      );

      if (genRef.current !== myGen) {
        try {
          await scanner.stop();
        } catch {
          /* ignore */
        }
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
        if (scannerRef.current === scanner) scannerRef.current = null;
        return;
      }

      runningRef.current = true;
    } catch (err) {
      if (genRef.current === myGen) {
        if (created) {
          try {
            if (runningRef.current) await created.stop();
          } catch {
            /* ignore */
          }
          try {
            created.clear();
          } catch {
            /* ignore */
          }
        }
        scannerRef.current = null;
        runningRef.current = false;
        setCameraError(cameraErrorMessage(err));
      }
    }
  }, []);

  const handleDecoded = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      busyRef.current = true;

      // Release the camera while the confirmation card is shown.
      await stopScanner();
      setError(null);
      setPhase("resolving");

      try {
        const token = (text || "").trim();
        const { data, error: rpcError } = await supabase.rpc("resolve_qr_token", {
          p_token: token,
        });
        if (rpcError) throw rpcError;

        const rows = (data ?? []) as ResolvedStaff[];
        const row = Array.isArray(rows) ? rows[0] : (rows as ResolvedStaff | null);

        if (!row || !row.id) {
          setError(
            "That QR code isn't a staff badge. Ask the staff member to open My QR and try again."
          );
          setPhase("scanning");
          busyRef.current = false;
          void startScanner();
          return;
        }

        setResolved(row);
        setPhase("confirm");
      } catch {
        setError("We couldn't read that QR code. Please try again.");
        setPhase("scanning");
        busyRef.current = false;
        void startScanner();
      }
    },
    [supabase, stopScanner, startScanner]
  );

  useEffect(() => {
    decodedRef.current = (text: string) => {
      void handleDecoded(text);
    };
  }, [handleDecoded]);

  // Start the camera when the modal opens; always release it on close.
  useEffect(() => {
    if (!open) return;
    genRef.current = 0;
    busyRef.current = false;
    setPhase("scanning");
    setResolved(null);
    setSuccessMessage(null);
    setError(null);
    setCameraError(null);
    void startScanner();
    return () => {
      void stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  const handleConfirm = useCallback(async () => {
    if (!resolved) return;
    setPhase("submitting");
    setError(null);
    try {
      // An open session id resolves time-out vs already-open atomically inside
      // the RPC; selecting latest keeps duplicate scans as no-ops.
      const { data: openRow } = await supabase
        .from("sessions")
        .select("id")
        .eq("employee_id", resolved.id)
        .is("time_out", null)
        .order("time_in", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error: rpcError } = await supabase.rpc("admin_toggle_attendance", {
        p_employee_id: resolved.id,
        p_open_session_id: openRow?.id ?? null,
      });
      if (rpcError) throw rpcError;

      const result = data as { action?: string; session_id?: string } | null;
      let action = result?.action;
      const name = resolved.full_name || "Staff member";
      const timeStr = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });

      // A previous shift never closed (race between the lookup and the RPC):
      // close it on their behalf so a scan still toggles cleanly.
      if (action === "already_open") {
        const { data: followUp, error: followError } = await supabase.rpc(
          "admin_toggle_attendance",
          {
            p_employee_id: resolved.id,
            p_open_session_id: result?.session_id ?? null,
          }
        );
        if (followError) throw followError;
        action = (followUp as { action?: string } | null)?.action;
      }

      let message: string;
      switch (action) {
        case "time_in":
          message = `Clocked in ${name} at ${timeStr}.`;
          break;
        case "time_out":
          message = `Clocked out ${name} at ${timeStr}.`;
          break;
        case "not_open":
          message = `${name} had no open shift to close.`;
          break;
        default:
          message = `Recorded attendance for ${name}.`;
      }

      setSuccessMessage(message);
      setPhase("success");
      busyRef.current = true;
      router.refresh();
    } catch {
      setError("We couldn't record the attendance. Please try again.");
      setPhase("confirm");
    }
  }, [resolved, supabase, router]);

  const handleScanNext = useCallback(() => {
    setResolved(null);
    setSuccessMessage(null);
    setError(null);
    setPhase("scanning");
    busyRef.current = false;
    void startScanner();
  }, [startScanner]);

  const initial = (resolved?.full_name || "?").charAt(0).toUpperCase();

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      ariaLabelledBy="scan-qr-title"
      className={styles.modal}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <ScanLine className="h-5 w-5" />
          </span>
          <div>
            <h2 id="scan-qr-title" className="text-base font-bold text-slate-900">
              Scan Staff QR
            </h2>
            <p className="text-xs text-slate-400">
              Clock a staff member in or out with their QR badge.
            </p>
          </div>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-5 sm:px-6">
        {/* Live camera — only while scanning. The element stays mounted so
            html5-qrcode always finds its container. */}
        <div className={phase === "scanning" ? "block" : "hidden"}>
          <div
            id={READER_ID}
            className="mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 [&_video]:w-full"
          />

          {cameraError ? (
            <div className="mt-4">
              <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
              <button
                type="button"
                onClick={() => void startScanner()}
                className={`mt-3 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-bold text-white ${styles.btnPrimary}`}
              >
                Try again
              </button>
            </div>
          ) : (
            <p className="mt-3 text-center text-xs font-medium text-slate-400">
              Hold the staff QR inside the frame. The camera stays on until you
              close this window.
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-medium text-amber-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Resolving / Submitting */}
        {(phase === "resolving" || phase === "submitting") && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-slate-700">
              {phase === "resolving" ? "Checking the badge…" : "Recording attendance…"}
            </p>
          </div>
        )}

        {/* Confirm card */}
        {phase === "confirm" && resolved && (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-sm">
              {initial}
            </span>
            <h3 className="mt-3 text-lg font-bold text-slate-900">
              {resolved.full_name || "Unnamed staff"}
            </h3>
            <p className="mt-0.5 text-xs font-medium capitalize text-slate-400">
              {resolved.position || "Staff"}
            </p>

            <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-[#f4f8fe] px-4 py-3 text-xs font-medium text-slate-600">
              <UserCheck className="h-4 w-4 shrink-0 text-blue-600" />
              Confirm to clock this person in — or out if they are already on a
              shift.
            </div>

            {error && (
              <div className="mt-3 flex w-full items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-left text-xs font-medium text-rose-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-bold text-white ${styles.btnPrimary}`}
              >
                <UserCheck className="h-4 w-4" />
                Confirm attendance
              </button>
              <button
                type="button"
                onClick={handleScanNext}
                className={`flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 ${styles.btnGhost}`}
              >
                Scan another
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h3 className="mt-3 text-base font-bold text-slate-900">
              Attendance recorded
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {successMessage}
            </p>

            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handleScanNext}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-bold text-white ${styles.btnPrimary}`}
              >
                <ScanLine className="h-4 w-4" />
                Scan next
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 ${styles.btnGhost}`}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
