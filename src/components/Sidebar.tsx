"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { User } from "@/core/operon";

const SECTION_ICONS: Record<string, string> = {
  home: "⌂",
  library: "◇",
  resources: "✦",
  activity: "◆",
  finance: "$",
  team: "👥",
  roles: "⚙",
  drive: "☁",
};

const SECTION_LABELS: Record<string, string> = {
  home: "Home",
  library: "Library",
  resources: "Resources",
  activity: "Activity",
  finance: "Finance",
  team: "Team",
  roles: "Roles",
  drive: "Drive",
};

interface SidebarProps {
  user: User;
  roleLabel: string;
  sections: string[];
  selectedSection: string;
  onSelect: (section: string) => void;
  onClose?: () => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Sidebar({ user, roleLabel, sections, selectedSection, onSelect, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  const handleSelect = (section: string) => {
    onSelect(section);
    onClose?.();
  };

  return (
    <aside
      className={`flex flex-col overflow-hidden bg-bg-secondary transition-all duration-300 h-full ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-content-primary text-sm font-bold text-bg-primary">
            O
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-content-primary">Operon</div>
            </div>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {sections.map((section) => {
          const active = selectedSection === section;
          return (
            <button
              key={section}
              type="button"
              onClick={() => handleSelect(section)}
              title={SECTION_LABELS[section] ?? section}
              className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-content-primary text-bg-primary"
                  : "text-content-secondary hover:bg-bg-primary hover:text-content-primary"
              }`}
            >
              <span className="shrink-0 w-5 text-center">
                {SECTION_ICONS[section] ?? "◆"}
              </span>
              {!collapsed ? <span className="truncate">{SECTION_LABELS[section] ?? section}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border/50 p-3">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden xl:flex w-full h-10 items-center justify-center rounded-[10px] border border-border/50 text-xs text-content-secondary hover:text-content-primary transition"
        >
          {collapsed ? "▶" : "◀"}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2.5 mt-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-bg-primary text-xs font-semibold text-content-primary">
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.name}
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                  unoptimized
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-content-primary">{user.name}</div>
              <div className="truncate text-xs text-content-tertiary">{roleLabel}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
