"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/auth/authContext";
import { ROLE_SELECTION_OPTIONS } from "@/core/roles";

export function MVPAccessMode() {
  const { loaded, selectRole } = useAuth();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

  const handleContinue = useCallback(async () => {
    if (!selectedRoleId) return;
    const role = ROLE_SELECTION_OPTIONS.find((option) => option.id === selectedRoleId);
    if (!role) return;

    setPendingRoleId(selectedRoleId);
    try {
      await selectRole(selectedRoleId, role.title);
    } finally {
      setPendingRoleId(null);
    }
  }, [selectRole, selectedRoleId]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8 bg-black">
        <div className="glass-card px-6 py-3 text-sm text-white/60">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8 py-12 bg-black">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-16 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl mb-8">
            <span className="text-2xl font-semibold">O</span>
          </div>
          <h1 className="text-5xl font-300 tracking-tight mb-3">
            Operon
          </h1>
          <p className="text-white/50 text-base">
            Select your workspace
          </p>
        </div>

        {/* Role Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {ROLE_SELECTION_OPTIONS.map((role) => {
            const isSelected = role.id === selectedRoleId;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                disabled={Boolean(pendingRoleId)}
                className={`group relative p-6 rounded-2xl transition-all duration-300 border ${
                  isSelected
                    ? "glass-hero border-white/20 bg-white/10 shadow-lg"
                    : "glass-card border-white/8 hover:border-white/15 hover:bg-white/6"
                }`}
              >
                {/* Background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/0 rounded-2xl opacity-0 group-hover:opacity-50 transition-opacity" />

                <div className="relative">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-600 text-white">
                      {role.title}
                    </h3>
                    <div
                      className={`h-5 w-5 rounded-full border-2 transition-all ${
                        isSelected
                          ? "border-white bg-white"
                          : "border-white/30 bg-transparent group-hover:border-white/50"
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Continue Button */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedRoleId || Boolean(pendingRoleId)}
          className="w-full btn-premium h-12 font-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pendingRoleId ? "Continuing…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
