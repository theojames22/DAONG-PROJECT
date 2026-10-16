"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types";

interface NotificationBellProps {
  userId: string;
  userName: string;
  /** "head" deep-links project alerts to their approval page;
   *  "staff" shows a compose box for messaging an administrator. */
  role: "head" | "staff";
  /** "flat" matches the redesigned head top bar (no embossed surfaces);
   *  "neu" keeps the original neumorphic styling for the employee side. */
  variant?: "flat" | "neu";
}

const PAGE_SIZE = 25;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell({ userId, userName, role, variant = "neu" }: NotificationBellProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // Compose state (employee → admin)
  const [composing, setComposing] = useState(false);
  const [admins, setAdmins] = useState<{ id: string; full_name: string | null }[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [composeTarget, setComposeTarget] = useState("");
  const [composeDraft, setComposeDraft] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Per-instance id used to namespace the realtime channel.
  const instanceId = useId();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ---- Data ----------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, sender_id, receiver_id, message, project_id, is_read, created_at, sender:profiles!notifications_sender_id_fkey(full_name), project:projects!notifications_project_id_fkey(id, title, status)"
      )
      .eq("receiver_id", userId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) {
      setNotifications(data as unknown as Notification[]);
    }
    setLoading(false);
  }, [supabase, userId]);

  // Initial load + realtime subscription for live alerts.
  useEffect(() => {
    fetchNotifications();

    // Unique topic per subscription: if two bells ever render on the
    // same page, the second must not reuse the first's already-subscribed
    // channel (Supabase throws on that and takes the page down).
    const channel = supabase
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `receiver_id=eq.${userId}`,
        },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchNotifications]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // ---- Actions -------------------------------------------------------------

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("receiver_id", userId);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("receiver_id", userId)
      .eq("is_read", false);
  }

  async function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id).eq("receiver_id", userId);
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.is_read) await markRead(n.id);
    // Only Heads deep-link project alerts to the approval page.
    if (role === "head" && n.project_id) {
      setOpen(false);
      router.push(`/head/projects/${n.project_id}`);
    }
  }

  async function sendReply(n: Notification) {
    const text = (replyDrafts[n.id] ?? "").trim();
    if (!text) return;

    setSendingTo(n.id);
    const { error } = await supabase.from("notifications").insert({
      sender_id: userId,
      receiver_id: n.sender_id,
      message: text,
      project_id: n.project_id, // keeps the reply in the same project thread
    });
    setSendingTo(null);

    if (error) return;

    setReplyDrafts((prev) => ({ ...prev, [n.id]: "" }));
    fetchNotifications();
  }

  // ---- Compose (employee → admin) ------------------------------------------

  async function openCompose() {
    setComposing(true);
    if (admins.length > 0) return;
    setAdminsLoading(true);
    const { data, error } = await supabase.rpc("get_admin_recipients");
    setAdminsLoading(false);
    if (!error && data) {
      const list = data as { id: string; full_name: string | null }[];
      setAdmins(list);
      if (list.length > 0) setComposeTarget(list[0].id);
    }
  }

  async function sendCompose() {
    const text = composeDraft.trim();
    if (!text || !composeTarget) return;
    setComposeSending(true);
    const { error } = await supabase.from("notifications").insert({
      sender_id: userId,
      receiver_id: composeTarget,
      message: text,
    });
    setComposeSending(false);
    if (error) return;
    setComposeDraft("");
    setComposing(false);
    fetchNotifications();
  }

  // ---- Render --------------------------------------------------------------

  // The admin top bar uses the flat, modern treatment so the bell and the
  // settings gear beside it match; the employee dashboard keeps the
  // original neumorphic look.
  const flat = variant === "flat";
  const triggerClass = flat
    ? "focus-ring relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-accent/30 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300"
    : "neu-icon-btn neu-focus relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 transition-colors hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300";
  const panelClass = flat
    ? "card absolute right-0 top-12 z-[100] flex max-h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl border border-slate-200/90"
    : "neu-raised absolute right-0 top-12 z-[100] flex max-h-[520px] w-[360px] flex-col overflow-hidden rounded-container bg-white dark:bg-slate-800 shadow-2xl";
  const inputClass = flat
    ? "focus-ring w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
    : "elev-pressed neu-focus rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink outline-none";

  return (
    <div className={`relative ${open ? "z-[100]" : "z-10"}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        className={triggerClass}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={panelClass}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-[13.5px] font-bold text-ink">Notifications</p>
              <p className="text-[11.5px] text-ink-muted">
                {role === "head" ? `Signed in as ${userName}` : "Messages from your administrator"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {role === "staff" && (
                <button
                  type="button"
                  onClick={openCompose}
                  className="neu-focus inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-accent-dark hover:bg-accent-soft"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Message
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="neu-focus inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-accent-dark hover:bg-accent-soft"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* Compose box — employee → admin */}
          {composing && role === "staff" && (
            <div className="border-b border-border bg-accent-soft/30 px-4 py-3">
              {adminsLoading ? (
                <div className="flex items-center gap-2 py-2 text-[12.5px] text-ink-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading administrators…
                </div>
              ) : admins.length === 0 ? (
                <p className="text-[12.5px] text-ink-muted">
                  No administrator is available to message right now.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <select
                    value={composeTarget}
                    onChange={(e) => setComposeTarget(e.target.value)}
                    className={`${inputClass} rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink outline-none`}
                  >
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name || "Administrator"}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      value={composeDraft}
                      onChange={(e) => setComposeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendCompose();
                      }}
                      placeholder="Write a message to your administrator…"
                      className={`${inputClass} min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle outline-none`}
                    />
                    <button
                      type="button"
                      onClick={sendCompose}
                      disabled={composeSending || !composeDraft.trim()}
                      aria-label="Send message"
                      className="neu-icon-btn neu-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent-dark disabled:opacity-50"
                    >
                      {composeSending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feed */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-ink-subtle" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <MessageSquare className="mx-auto mb-2 h-7 w-7 text-ink-subtle" />
                <p className="text-[13px] text-ink-muted">
                  {role === "head"
                    ? "No notifications yet. Alerts appear here when staff submit projects."
                    : "Nothing yet. You'll see your output approvals and messages here."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const senderName = n.sender?.full_name || "Administrator";
                  const isProject = Boolean(n.project_id);
                  return (
                    <li
                      key={n.id}
                      className={`px-4 py-3 transition-colors ${
                        n.is_read ? "bg-transparent" : "bg-accent-soft/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleNotificationClick(n)}
                          className="neu-focus min-w-0 flex-1 rounded-lg text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 text-[11px] font-bold text-white">
                              {senderName.charAt(0).toUpperCase()}
                            </span>
                            <p className="text-[12.5px] font-semibold text-ink">
                              {senderName}
                            </p>
                          </div>

                          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                            {n.message}
                          </p>

                          {isProject && n.project && role === "head" && (
                            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                              View “{n.project.title}” · {n.project.status}
                            </p>
                          )}
                          {n.project && role === "staff" && (
                            <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                              {n.project.title} · {n.project.status}
                            </p>
                          )}
                        </button>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[11px] text-ink-subtle">
                            {relativeTime(n.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() => dismiss(n.id)}
                            aria-label="Dismiss notification"
                            className="neu-focus rounded-md p-1 text-ink-subtle hover:text-danger"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Quick reply — back to whoever sent this message */}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={replyDrafts[n.id] ?? ""}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [n.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendReply(n);
                          }}
                          placeholder={`Reply to ${senderName.split(" ")[0]}…`}
                          className={`${inputClass} min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle outline-none`}
                        />
                        <button
                          type="button"
                          onClick={() => sendReply(n)}
                          disabled={sendingTo === n.id || !(replyDrafts[n.id] ?? "").trim()}
                          aria-label={`Send reply to ${senderName}`}
                          className="neu-icon-btn neu-focus flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent-dark disabled:opacity-50"
                        >
                          {sendingTo === n.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
