"use client";

import { Bell, Shield, Settings, ChevronDown } from "lucide-react";

interface TopNavbarProps {
  fullName: string;
  position?: string | null;
  employeeId: string;
}

export default function TopNavbar({ fullName, position, employeeId }: TopNavbarProps) {
  const shortId = employeeId ? employeeId.slice(0, 4).toUpperCase() : "8842";
  const displayRole = position || "Core Team";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="mx-auto flex h-14 max-w-[1720px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Branding */}
        <img
          src="/images/logo2.png"
          alt="Daong"
          className="h-9 w-auto object-contain"
        />

        {/* Cleaned Middle: Search box & telemetry status pill completely removed */}
        <div className="flex-1" />

        {/* Right: Quick Actions & Staff Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Action icon buttons */}
          <button
            type="button"
            title="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>

          <button
            type="button"
            title="Security Policy"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Shield className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="Workstation Settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <Settings className="h-4 w-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* User Profile Info Badge (Submit Output button completely removed) */}
          <div className="flex items-center gap-2.5 rounded-xl py-1 px-1.5 transition-colors">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 text-white font-bold text-xs shadow-sm">
              {fullName ? fullName.charAt(0).toUpperCase() : "A"}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-[12.5px] font-bold leading-tight text-slate-900">
                {fullName || "Alex Mercer"}
              </p>
              <p className="text-[10.5px] font-medium text-slate-500 leading-tight">
                {displayRole} • ID-{shortId}
              </p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
          </div>
        </div>
      </div>
    </header>
  );
}
