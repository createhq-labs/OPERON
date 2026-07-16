"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Bell, CalendarClock, ShieldAlert, UserMinus, FileText, UserPlus, ArrowUpRight } from "lucide-react";
import type { Notification, User } from "@/core/operon";
import { getNotificationsForUser, markNotificationRead, formatRelativeTime } from "@/core/operon";
import { subscribeToDataUpdates } from "@/services/api";
import { openFloatingLayer, subscribeFloatingLayerClose } from "@/lib/floatingLayers";
import { listItem, listStagger, motionPreset } from "@/styles/motionPresets";
import { S } from "@/styles/sharedUi";

function notificationHref(n: Notification): string | null {
  switch (n.entityType) {
    case "leave":      return "/workforce/calendar";
    case "probation":  return "/workforce/probation";
    case "deboarding": return "/workforce/lifecycle";
    case "document":   return "/";
    default:           return null;
  }
}

const ENTITY_META: Record<string, { icon: LucideIcon; fg: string; bg: string }> = {
  leave:      { icon: CalendarClock, fg: "#60a5fa", bg: "rgba(96,165,250,0.14)" },
  probation:  { icon: ShieldAlert,   fg: "#fbbf24", bg: "rgba(251,191,36,0.14)" },
  deboarding: { icon: UserMinus,     fg: "#e5484d", bg: "rgba(229,72,77,0.14)" },
  document:   { icon: FileText,     fg: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  user:       { icon: UserPlus,     fg: "#4ade80", bg: "rgba(74,222,128,0.14)" },
};
const DEFAULT_ENTITY_META = { icon: Bell, fg: "var(--op-text-3)", bg: "var(--op-surface-3)" };

// Named rather than a magic number, so future floating layers in this app
// can be placed relative to it instead of guessing.
const NOTIFICATION_PANEL_Z_INDEX = 110;

export function NotificationBell({ user }: { user: User }) {
  const router  = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeToDataUpdates(() => setVersion((n) => n + 1));
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` forces recompute on data-store changes
  const notifications = useMemo(() => getNotificationsForUser(user), [user, version]);
  const unreadCount = notifications.filter((n) => (n.unreadBy ?? []).includes(user.id)).length;

  useEffect(() => {
    if (!isOpen) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-notification-bell]")) setIsOpen(false);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return subscribeFloatingLayerClose("notification", () => setIsOpen(false));
  }, []);

  function handleClick(notification: Notification) {
    markNotificationRead(user, notification.id);
    setVersion((n) => n + 1);
    const href = notificationHref(notification);
    if (href) {
      setIsOpen(false);
      router.push(href);
    }
  }

  return (
    <div data-notification-bell style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => {
          const willOpen = !isOpen;
          if (willOpen) openFloatingLayer("notification");
          setIsOpen(willOpen);
        }}
        style={{
          position:       "relative",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          width:          "36px",
          height:         "36px",
          borderRadius:   "var(--r-full)",
          border:         "1px solid var(--op-border)",
          background:     "var(--op-surface-2)",
          cursor:         "pointer",
          color:          "var(--op-text-3)",
          fontFamily:     "var(--font-ui)",
          fontSize:       "var(--text-13)",
        }}
      >
        <Bell size={17} strokeWidth={1.8} aria-hidden="true" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              position:       "absolute",
              top:            "-2px",
              right:          "-2px",
              minWidth:       "16px",
              height:         "16px",
              borderRadius:   "var(--r-full)",
              background:     "#e5484d",
              color:          "#fff",
              fontSize:       "10px",
              fontWeight:     700,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              padding:        "0 3px",
            }}
          >
            {unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ ...motionPreset.fadeScale.initial, y: -8 }}
            animate={{ ...motionPreset.fadeScale.animate, y: 0 }}
            exit={{ ...motionPreset.fadeScale.exit, y: -8 }}
            transition={motionPreset.fadeScale.transition}
            style={{
              position:  "absolute",
              top:       "44px",
              right:     0,
              width:     "min(340px, calc(100vw - 32px))",
              maxHeight: "400px",
              overflowY: "auto",
              padding:   "8px",
              zIndex:    NOTIFICATION_PANEL_Z_INDEX,
              ...S.floatingPanel,
            }}
          >
            <div style={{ padding: "6px 12px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 700, color: "var(--op-text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", color: "#e5484d", fontWeight: 600 }}>
                  {unreadCount} unread
                </span>
              )}
            </div>

            {notifications.length === 0 ? (
              <div style={{ ...S.emptyState, padding: "28px 16px" }}>
                <div style={S.emptyIcon}>
                  <Bell size={16} aria-hidden="true" />
                </div>
                <div style={S.emptyTitle}>No notifications</div>
                <p style={S.emptyDesc}>Updates and approvals will appear here.</p>
              </div>
            ) : (
              <motion.div variants={listStagger} initial="hidden" animate="show" style={{ display: "grid", gap: "3px" }}>
                {notifications.map((notification) => {
                  const unread = (notification.unreadBy ?? []).includes(user.id);
                  const href   = notificationHref(notification);
                  const meta   = (notification.entityType && ENTITY_META[notification.entityType]) || DEFAULT_ENTITY_META;
                  const Icon   = meta.icon;
                  return (
                    <motion.button
                      key={notification.id}
                      variants={listItem}
                      type="button"
                      className="op-row-interactive"
                      onClick={() => handleClick(notification)}
                      style={{
                        display:      "block",
                        width:        "100%",
                        textAlign:    "left",
                        padding:      "10px 12px",
                        borderRadius: "var(--r-md)",
                        border:       "none",
                        borderLeft:   unread ? `2px solid ${meta.fg}` : "2px solid transparent",
                        background:   unread ? "var(--op-surface-2)" : "transparent",
                        cursor:       "pointer",
                        position:     "relative",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div
                          style={{
                            width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: meta.bg, color: meta.fg, marginTop: "1px",
                          }}
                        >
                          <Icon size={13} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: unread ? 700 : 500, color: "var(--op-text)" }}>
                              {notification.title}
                            </span>
                            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-10)", color: "var(--op-text-3)", flexShrink: 0 }}>
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", lineHeight: 1.4, marginTop: "2px" }}>
                            {notification.body}
                          </div>
                          {href && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", color: meta.fg, fontWeight: 600, marginTop: "6px" }}>
                              View <ArrowUpRight size={11} />
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
