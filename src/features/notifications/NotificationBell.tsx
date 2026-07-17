"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import type { User } from "@/core/operon";
import { EmptyState, IconButton, Popover, Button } from "@/components/ui";
import { markAllNotificationsRead, markNotificationRead, myNotifications, unreadNotificationCount } from "@/lib/workforce/notifications";
import type { WorkforceNotification } from "@/lib/workforce/types";
import { openFloatingLayer, subscribeFloatingLayerClose } from "@/lib/floatingLayers";
import { Sp, T } from "@/styles/sharedUi";

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

export function NotificationBell({ user: _user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkforceNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      const [notifications, count] = await Promise.all([myNotifications(false, 30, 0), unreadNotificationCount()]);
      setItems(notifications ?? []); setUnread(Number(count ?? 0));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Notifications could not be loaded."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); return subscribeFloatingLayerClose("notification", () => setOpen(false)); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [open]);

  async function activate(item: WorkforceNotification) {
    if (!item.read_at) { await markNotificationRead(item.notification_id); setUnread((value) => Math.max(0, value - 1)); }
    if (item.target_path) { setOpen(false); router.push(item.target_path); }
    setItems((current) => current.map((entry) => entry.notification_id === item.notification_id ? { ...entry, read_at: entry.read_at ?? new Date().toISOString() } : entry));
  }

  return <div data-notification-bell style={{ position: "relative" }}>
    <IconButton label="Notifications" aria-expanded={open} onClick={() => { if (!open) { openFloatingLayer("notification"); void refresh(); } setOpen(!open); }}>
      <Bell size={17} />
      {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 99, background: "var(--op-danger)", color: "white", display: "grid", placeItems: "center", fontSize: 10, padding: "0 3px" }}>{unread}</span>}
    </IconButton>
    {open && <Popover style={{ position: "absolute", top: 44, right: 0, width: "min(380px, calc(100vw - 32px))", maxHeight: 460, overflowY: "auto", zIndex: 110 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: Sp["2"] }}>
        <strong style={T.cardTitle}>Notifications</strong>
        {unread > 0 && <Button variant="ghost" onClick={() => void markAllNotificationsRead().then(() => { setUnread(0); setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))); })}><CheckCheck size={14} /> Mark all read</Button>}
      </div>
      {error ? <EmptyState title="Notifications unavailable" description={error} /> : loading && items.length === 0 ? <EmptyState title="Loading notifications…" /> : items.length === 0 ? <EmptyState icon={Bell} title="No notifications" description="Updates and approvals will appear here." /> :
        <div>{items.map((item) => <button key={item.notification_id} type="button" onClick={() => void activate(item)} style={{ width: "100%", border: 0, borderTop: "1px solid var(--op-border)", background: item.read_at ? "transparent" : "var(--op-surface-2)", color: "inherit", textAlign: "left", padding: Sp["3"], cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: Sp["3"] }}><span style={T.cardTitle}>{item.title}</span><span style={T.caption}>{relativeTime(item.created_at)}</span></div>
          <p style={{ ...T.bodySmall, marginTop: Sp["1"] }}>{item.message}</p>
        </button>)}</div>}
    </Popover>}
  </div>;
}
