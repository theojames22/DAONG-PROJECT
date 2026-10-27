"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, ScanLine } from "lucide-react";
import NotificationBell from "@/components/shared/NotificationBell";
import SettingsModal from "@/components/shared/SettingsModal";
import AddEmployeeModal from "./AddEmployeeModal";
import ScanQrModal from "./ScanQrModal";
import styles from "@/app/head/workforce/workforce.module.css";

export interface WorkforceHeaderProps {
  adminId: string;
  adminName: string;
  adminEmail: string | null;
  adminAvatarUrl: string | null;
  initialTheme: "light" | "dark";
  adminPosition?: string | null;
}

/**
 * Shared Workforce header. Rendered once above both the Card View and the
 * List View, so Add employee / Scan Staff QR / notifications / settings are
 * always available without navigating away.
 */
export default function WorkforceHeader({
  adminId,
  adminName,
  adminEmail,
  adminAvatarUrl,
  initialTheme,
  adminPosition,
}: WorkforceHeaderProps) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative z-30 flex flex-wrap items-center justify-between gap-4">
      {/* Title & Count */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Workforce
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500">
          Manage your team, track attendance, and monitor daily work activity.
        </p>
      </div>

      {/* Action Cluster: Scan QR + Add Employee + Notification Bell + Settings */}
      <div className="relative z-40 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setScanModalOpen(true)}
          className={`flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-blue-600 ${styles.btnQr}`}
        >
          <ScanLine className="h-4 w-4" />
          Scan Staff QR
        </button>

        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className={`flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white ${styles.btnPrimary}`}
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          Add Member
        </button>

        {/* Notification Bell matching reference (shared — only wrapped) */}
        <span className={styles.iconBtnScope}>
          <NotificationBell
            userId={adminId}
            userName={adminName}
            role="head"
            variant="flat"
          />
        </span>

        {/* Settings button matching reference */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 ${styles.iconBtn}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Add Employee Modal */}
      <AddEmployeeModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />

      {/* Scan Staff QR Modal */}
      <ScanQrModal open={scanModalOpen} onClose={() => setScanModalOpen(false)} />

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={adminId}
        userName={adminName}
        userEmail={adminEmail}
        userAvatarUrl={adminAvatarUrl}
        initialTheme={initialTheme}
        position={adminPosition}
      />
    </div>
  );
}
