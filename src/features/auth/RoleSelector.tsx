"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { RoleId } from "@/core/operon";
import { useState } from "react";

interface RoleOption {
  id: RoleId;
  label: string;
  description: string;
  icon: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    id: "role_cofounder",
    label: "Co-Founder",
    description: "Full platform access",
    icon: "👑",
  },
  {
    id: "role_hr",
    label: "HR Manager",
    description: "Onboarding and policies",
    icon: "👥",
  },
  {
    id: "role_finance",
    label: "Finance Manager",
    description: "SOPs and reporting",
    icon: "💰",
  },
  {
    id: "role_im_team_lead",
    label: "IM Team Lead",
    description: "IM documentation and SOPs",
    icon: "📈",
  },
  {
    id: "role_tm_team_lead",
    label: "TM Team Lead",
    description: "TM documentation and SOPs",
    icon: "📋",
  },
  {
    id: "role_creator",
    label: "Content Creator",
    description: "Marketing and brand assets",
    icon: "✨",
  },
  {
    id: "role_employee",
    label: "Employee",
    description: "Team-based read-only access",
    icon: "📚",
  },
  {
    id: "role_intern",
    label: "Intern",
    description: "Restricted training materials",
    icon: "🚀",
  },
];

interface RoleSelectorProps {
  onSelect: (roleId: RoleId) => void;
  loading?: boolean;
}

export function RoleSelector({ onSelect, loading = false }: RoleSelectorProps) {
  const [selectedRole, setSelectedRole] = useState<RoleId | null>(null);

  const handleSelect = (roleId: RoleId) => {
    setSelectedRole(roleId);
    onSelect(roleId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col gap-8"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-4xl font-semibold text-white tracking-tight">
          Select Your Role
        </h2>
        <p className="text-base text-[rgba(255,255,255,0.6)]">
          Choose your role to access relevant documents and features
        </p>
      </div>

      <div className="grid grid-cols-auto-fill gap-6">
        <AnimatePresence mode="wait">
          {ROLE_OPTIONS.map((role, index) => (
            <motion.button
              key={role.id}
              onClick={() => handleSelect(role.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                ease: "easeOut",
                delay: index * 0.03,
              }}
              disabled={loading}
              className="role-card group"
            >
              <div className="flex items-start justify-between">
                <motion.div
                  className="role-card-icon"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  {role.icon}
                </motion.div>

                <AnimatePresence>
                  {selectedRole === role.id && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{
                        duration: 0.25,
                        ease: "easeOut",
                      }}
                      className="role-card-check"
                    >
                      ✓
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col gap-1 text-left">
                <h3 className="role-card-label">{role.label}</h3>
                <p className="role-card-description">{role.description}</p>
              </div>

              <motion.div
                className="absolute inset-0 rounded-[var(--radius-xl)] pointer-events-none"
                whileHover={{ opacity: 0.08 }}
                transition={{ duration: 0.2 }}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  zIndex: -1,
                }}
              />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <p className="text-xs text-[rgba(255,255,255,0.4)] text-center">
        You can change your role anytime in settings
      </p>
    </motion.div>
  );
}
