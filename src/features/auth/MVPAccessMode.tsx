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
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="rounded-[12px] border border-border bg-bg-secondary px-6 py-3 text-sm text-content-secondary">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8 py-8">
      <div className="w-full max-w-[440px]">
        <div className="mb-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[12px] bg-content-primary text-xl font-semibold text-bg-primary shadow-soft">
            O
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-content-primary">
            Operon
          </h1>
        </div>

        <div className="space-y-3">
          {ROLE_SELECTION_OPTIONS.map((role) => {
            const isSelected = role.id === selectedRoleId;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedRoleId(role.id)}
                className={`group flex w-full items-center justify-between rounded-[12px] border px-4 py-3 text-left transition-all ${
                  isSelected
                    ? "border-content-primary bg-content-primary/5 text-content-primary"
                    : "border-border/50 text-content-primary hover:border-border/80"
                } ${pendingRoleId ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                disabled={Boolean(pendingRoleId)}
              >
                <span className="font-medium">{role.title}</span>
                <span
                  className={`h-2.5 w-2.5 rounded-full border transition-all ${
                    isSelected
                      ? "border-content-primary bg-content-primary"
                      : "border-border bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="mt-8 h-11 w-full rounded-[12px] bg-content-primary px-6 text-sm font-semibold text-bg-primary transition hover:bg-content-primary/90 disabled:opacity-50"
          disabled={!selectedRoleId || Boolean(pendingRoleId)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
