"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  ScanLine,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful stamp so the parent can refresh rows. */
  onStamped: () => void;
}

interface ScannedEmployee {
  id: string;
  full_name: string | null;
  position: string | null;
  hasOpenSession: boolean;
}

type Phase = "scanning" | "confirm" | "stamping" | "done";

export default function QrScannerModal({ open, onClose, onStamped }: QrScannerModalProps) {
  const supabase = createClient();
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastScanRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [employee, setEmployee] = useState<ScannedEmployee | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0); // remounts the reader element

  // ---- Scan resolution -----------------------------------------------------

  const resolveEmployee = useCallback(
    async (token: string) => {
      setPhase("stamping");
      try {
        const { data, error } = await supabase.rpc("resolve_qr_token", { p_token: token });
        if (error) throw error;

        const match = Array.isArray(data) ? data[0] : data;
        if (!match) {
          setResultMessage("This QR code doesn't match any staff account.");
          setPhase("done");
          return;
        }

        const { data: openSessions } = await supabase
          .from("sessions")
          .select("id")
          .eq("employee_id", match.id)
          .is("time_out", null)
          .order("time_in", { ascending: false })
          .limit(1);

        setEmployee({
          id: match.id,
          full_name: match.full_name,
          position: match.position,
          hasOpenSession: (openSessions ?? []).length > 0,
        });
        setPhase("confirm");
      } catch (err) {
        setResultMessage(err instanceof Error ? err.message : "Could not read this QR code.");
        setPhase("done");
      }
    },
    [supabase]
  );

  // ---- Camera lifecycle ----------------------------------------------------

  const stopCamera = useCallback(async () => {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      // Camera already stopped — safe to ignore.
    }
    scannerRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("scanning");
    setEmployee(null);
    setCameraError(null);
    setResultMessage(null);
    lastScanRef.current = null;

    await stopCamera();
    // Remount a fresh reader element so html5-qrcode can re-bind cleanly.
    setScanCount((c) => c + 1);
    await new Promise((r) => setTimeout(r, 80));

    try {
      // Dynamic import keeps the scanner out of the server bundle.
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-scanner-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" }, // rear camera on laptops/phones
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText: string) => {
          if (lastScanRef.current === decodedText) return; // debounce repeats
          lastScanRef.current = decodedText;
          await stopCamera();
          await resolveEmployee(decodedText);
        },
        () => {
          // Per-frame scan miss — silent, the camera keeps running.
        }
      );
    } catch (err) {
      setCameraError(
        "Camera unavailable. Check browser permissions and that a camera is connected (browsers only allow camera access on localhost or HTTPS)."
      );
    }
  }, [stopCamera, resolveEmployee]);

  useEffect(() => {
    if (open) void startCamera();
    return () => {
      void stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  // ---- Stamping ------------------------------------------------------------

  async function stampAttendance() {
    if (!employee) return;
    setPhase("stamping");

    try {
      let openSessionId: string | null = null;
      if (employee.hasOpenSession) {
        const { data } = await supabase
          .from("sessions")
          .select("id")
          .eq("employee_id", employee.id)
          .is("time_out", null)
          .order("time_in", { ascending: false })
          .limit(1);
        openSessionId = data?.[0]?.id ?? null;
      }

      const { data, error } = await supabase.rpc("admin_toggle_attendance", {
        p_employee_id: employee.id,
        p_open_session_id: openSessionId,
      });
      if (error) throw error;

      const result = data as { action?: string; session_id?: string } | null;
      const name = employee.full_name || "Employee";

      if (result?.action === "time_in") {
        setResultMessage(`${name} clocked in.`);
      } else if (result?.action === "time_out") {
        setResultMessage(`${name} clocked out.`);
      } else if (result?.action === "already_open") {
        // Their previous session never closed — close it on their behalf.
        await supabase.rpc("admin_toggle_attendance", {
          p_employee_id: employee.id,
          p_open_session_id: result.session_id ?? null,
        });
        setResultMessage(`${name} clocked out.`);
      } else {
        setResultMessage("Nothing to do — that session was already closed.");
      }

      setPhase("done");
      onStamped();
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : "Could not stamp attendance.");
      setPhase("done");
    }
  }

  function handleClose() {
    void stopCamera();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={handleClose} aria-hidden />

      <div className="neu-raised relative z-10 flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-container bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-accent" />
            <h2 className="font-display text-[15px] font-bold text-ink">Scan staff QR</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close scanner"
            className="neu-focus rounded-lg p-1.5 text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Camera viewport (hidden unless actively scanning) */}
          <div
            key={scanCount}
            id="qr-scanner-reader"
            className={`overflow-hidden rounded-xl border-2 border-dashed border-border ${
              phase === "scanning" && !cameraError ? "block" : "hidden"
            }`}
          />

          {cameraError && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CameraOff className="h-8 w-8 text-danger" />
              <p className="text-[13px] text-ink-muted">{cameraError}</p>
            </div>
          )}

          {phase === "stamping" && !employee && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <p className="text-[13px] text-ink-muted">Reading QR code…</p>
            </div>
          )}

          {/* Confirm card — the scan succeeded, admin confirms before stamping */}
          {phase === "confirm" && employee && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 text-2xl font-bold text-white">
                {(employee.full_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[16px] font-bold text-ink">{employee.full_name || "Employee"}</p>
                <p className="text-[12.5px] text-ink-muted">{employee.position || "—"}</p>
              </div>
              <p className="text-[13px] text-ink-muted">
                {employee.hasOpenSession
                  ? "This employee is currently clocked in. Stamp their time out?"
                  : "Stamp this employee's time in for today?"}
              </p>
              <button onClick={stampAttendance} className="btn-primary neu-focus w-full justify-center">
                {employee.hasOpenSession ? (
                  <>
                    <LogOut className="h-4 w-4" strokeWidth={2.5} />
                    Clock out
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" strokeWidth={2.5} />
                    Clock in
                  </>
                )}
              </button>
              <button
                onClick={() => void startCamera()}
                className="neu-focus rounded-xl px-4 py-2 text-[12.5px] text-ink-muted hover:text-ink"
              >
                Scan a different code
              </button>
            </div>
          )}

          {/* Result */}
          {phase === "done" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {resultMessage?.includes("clocked") ? (
                <CheckCircle2 className="h-10 w-10 text-success" />
              ) : (
                <CameraOff className="h-10 w-10 text-ink-subtle" />
              )}
              <p className="text-[13.5px] font-semibold text-ink">{resultMessage}</p>
              <div className="flex gap-3">
                <button onClick={() => void startCamera()} className="btn-secondary neu-focus">
                  <Camera className="h-3.5 w-3.5" />
                  Scan next
                </button>
                <button
                  onClick={handleClose}
                  className="neu-focus rounded-xl px-4 py-2.5 text-[13px] text-ink-muted hover:text-ink"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {phase === "scanning" && !cameraError && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-ink-muted">
              <Camera className="h-3.5 w-3.5" />
              Point the camera at the employee's QR code
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
