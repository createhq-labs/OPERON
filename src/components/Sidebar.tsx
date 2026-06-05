"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { User } from "@/core/operon";

const SECTION_ICONS: Record<string, string> = {
  home: "H",
  library: "📄",
  resources: "🔗",
  activity: "⚡",
  finance: "💰",
  team: "👥",
  roles: "⚙️",
  drive: "☁️",
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
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  const handleSelect = (section: string) => {
    onSelect(section);
    onClose?.();
  };

  return (
    <aside className="fixed left-4 top-4 bottom-4 w-72 flex flex-col glass-hero hover:shadow-glow transition-shadow hidden xl:flex">
      {/* Header */}
      <div className="p-6 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center font-semibold text-sm">
            O
          </div>
          <div>
            <div className="font-600 text-sm text-white">Operon</div>
            <div className="text-xs text-white/40">Workspace</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {sections.map((section) => {
          const active = selectedSection === section;
          return (
            <button
              key={section}
              type="button"
              onClick={() => handleSelect(section)}
              className={`group w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                active
                  ? "bg-white/15 text-white border border-white/15"
                  : "text-white/60 hover:text-white hover:bg-white/8 border border-transparent"
              }`}
            >
              <span className="text-lg">{SECTION_ICONS[section]}</span>
              <span className="text-sm font-500">{SECTION_LABELS[section]}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/8 space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-600 overflow-hidden">
            {user.avatar ? (
              <Image
                src={user.avatar}
                alt={user.name}
                width={32}
                height={32}
                className="h-8 w-8 object-cover"
                unoptimized
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-600 text-white truncate">{user.name}</div>
            <div className="text-xs text-white/40 truncate">{roleLabel}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
