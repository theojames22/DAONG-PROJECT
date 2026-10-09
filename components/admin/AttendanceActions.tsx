"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import QrScannerModal from "./QrScannerModal";

export default function AttendanceActions() {
  const router = useRouter();
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setScanOpen(true)}
        className="btn-primary neu-focus"
      >
        <ScanLine className="h-4 w-4" strokeWidth={2.4} />
        Scan staff QR
      </button>

      <QrScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onStamped={() => router.refresh()}
      />
    </>
  );
}
