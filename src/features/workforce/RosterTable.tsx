"use client";

import { useState, type ReactNode } from "react";
import type { User } from "@/core/operon";
import { getRoleLabel } from "@/core/operon";
import { S } from "@/styles/sharedUi";

interface RosterTableProps {
  users:         User[];
  search:        string;
  renderStatus:  (user: User) => ReactNode;
  renderDetail:  (user: User) => ReactNode;
  emptyMessage:  string;
}

/**
 * The shared roster list behind Onboarding and Deboarding: name/email/role
 * up front (the data the office already provides when the account is
 * created), status at a glance, and an expandable row for the detail/action
 * panel instead of a separate page or modal.
 */
export function RosterTable({ users, search, renderStatus, renderDetail, emptyMessage }: RosterTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = search.trim()
    ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.trim().toLowerCase()))
    : users;

  if (filtered.length === 0) {
    return <div style={S.emptyState}>{emptyMessage}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {filtered.map((user) => {
        const expanded = expandedId === user.id;
        return (
          <div key={user.id}>
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : user.id)}
              style={{
                ...S.cardInner,
                padding:        "14px 16px",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "space-between",
                gap:            "12px",
                width:          "100%",
                textAlign:      "left",
                cursor:         "pointer",
                border:         `1px solid ${expanded ? "var(--op-border-hover)" : "var(--op-border)"}`,
                transition:     "border-color 150ms",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                    {user.email}
                  </div>
                </div>
                <span style={S.badge}>{getRoleLabel(user.roleId)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {renderStatus(user)}
                <span style={{ color: "var(--op-text-3)", fontSize: "var(--text-11)" }}>{expanded ? "Hide" : "Details"}</span>
              </div>
            </button>
            {expanded && (
              <div style={{ ...S.card, marginTop: "6px", padding: "18px" }}>
                {renderDetail(user)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
