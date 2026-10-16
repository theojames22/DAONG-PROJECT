"use client";

import { useEffect, useState, useRef } from "react";
import { X, QrCode, Download, Printer, Loader2 } from "lucide-react";
import { Profile } from "@/lib/types";
import ModalShell from "@/components/shared/ModalShell";
import styles from "@/app/head/workforce/workforce.module.css";

export interface ViewQrModalProps {
  open: boolean;
  onClose: () => void;
  employee: Profile | null;
}

export default function ViewQrModal({ open, onClose, employee }: ViewQrModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog when it opens (there is no input field here).
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || !employee) {
      setQrUrl(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        // In the database, qr_token is stored on profiles, or fallback to employee.id
        // When scanned, resolve_qr_token looks up p.qr_token
        const token = (employee as any).qr_token || employee.id;
        const dataUrl = await QRCode.toDataURL(token, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });

        if (isMounted) {
          setQrUrl(dataUrl);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to generate QR code.");
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [open, employee]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !employee) return null;

  const handleDownload = () => {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `${(employee.full_name || "staff").replace(/\s+/g, "_")}_qr.png`;
    link.click();
  };

  const handlePrint = () => {
    if (!qrUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Attendance QR - ${employee.full_name || "Employee"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 40px; }
            .card { border: 2px solid #e2e8f0; border-radius: 16px; padding: 24px; max-width: 320px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            h2 { margin: 12px 0 4px; font-size: 20px; color: #0f172a; }
            p { margin: 0 0 16px; font-size: 14px; color: #64748b; text-transform: capitalize; }
            img { width: 240px; height: 240px; border-radius: 12px; }
            .footer { margin-top: 16px; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>${employee.full_name || "Employee"}</h2>
            <p>${employee.position || employee.role || "Staff"}</p>
            <img src="${qrUrl}" alt="QR Code" />
            <div class="footer">Scan at attendance desk</div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-sm"
      ariaLabelledBy="qr-modal-title"
      className={`p-6 sm:p-7 ${styles.modal}`}
    >
      <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <QrCode className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 id="qr-modal-title" className="text-base font-bold text-slate-900 leading-tight">
                Attendance QR
              </h2>
              <p className="text-xs text-slate-400 capitalize">
                {employee.full_name || "Employee"} · {employee.position || employee.role || "Staff"}
              </p>
            </div>
          </div>

          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="my-6 flex flex-col items-center justify-center">
          <div className="relative flex h-56 w-56 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            {loading && <Loader2 className="h-8 w-8 animate-spin text-blue-600" />}
            {error && <p className="text-center text-xs font-semibold text-rose-600">{error}</p>}
            {!loading && qrUrl && (
              <img
                src={qrUrl}
                alt={`QR code for ${employee.full_name}`}
                className="h-full w-full rounded-xl object-contain bg-white p-2 shadow-sm"
              />
            )}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Staff scan it at the desk to clock in and out.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!qrUrl || loading}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!qrUrl || loading}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
    </ModalShell>
  );
}
