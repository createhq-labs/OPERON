"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/auth/useSession";
import {
  canSubmitProbationReview,
  canDecideProbationReview,
  canAccessWorkforce,
  canAccessPeopleModule,
  canApproveCreatorDeboarding,
  canInitiateEmployeeDeboarding,
  canSubmitCreatorDeboarding,
  canViewAllHrRecords,
} from "@/security/permissions";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { S } from "@/styles/sharedUi";

const ALL_TABS = [
  { id: "lifecycle",   label: "People",      href: "/workforce/lifecycle" },
  { id: "calendar",    label: "Calendar",    href: "/workforce/calendar" },
  { id: "probation",   label: "Probation",   href: "/workforce/probation" },
  { id: "deboarding",  label: "Deboarding",  href: "/workforce/deboarding" },
];

export default function WorkforceLayout({ children }: { children: React.ReactNode }) {
  const { user, loaded } = useSession();
  const router    = useRouter();
  const pathname  = usePathname();

  useEffect(() => {
    if (!loaded) return;
    if (!user) { router.replace("/"); return; }
    if (!canAccessWorkforce(user)) { router.replace("/"); return; }
    // Team members / Interns land on lifecycle/probation/deboarding routes → redirect to calendar
    const isLifecycleRoute = pathname?.startsWith("/workforce/lifecycle") || pathname?.startsWith("/workforce/onboarding");
    const isProbationRoute = pathname?.startsWith("/workforce/probation");
    const isDeboardingRoute = pathname?.startsWith("/workforce/deboarding");
    if (isLifecycleRoute && !canAccessPeopleModule(user)) router.replace("/workforce/calendar");
    if (isProbationRoute && !canSubmitProbationReview(user) && !canDecideProbationReview(user)) router.replace("/workforce/calendar");
    if (
      isDeboardingRoute &&
      !canViewAllHrRecords(user) &&
      !canInitiateEmployeeDeboarding(user) &&
      !canSubmitCreatorDeboarding(user) &&
      !canApproveCreatorDeboarding(user)
    ) {
      router.replace("/workforce/calendar");
    }
  }, [loaded, user, router, pathname]);

  if (!loaded) return null;
  if (!user)   return null;

  const showLifecycle = canAccessPeopleModule(user);
  const showProbation = canSubmitProbationReview(user) || canDecideProbationReview(user);
  const showDeboarding =
    canViewAllHrRecords(user) ||
    canInitiateEmployeeDeboarding(user) ||
    canSubmitCreatorDeboarding(user) ||
    canApproveCreatorDeboarding(user);

  const tabs = ALL_TABS.filter((tab) => {
    if (tab.id === "lifecycle") return showLifecycle;
    if (tab.id === "probation") return showProbation;
    if (tab.id === "deboarding") return showDeboarding;
    return true;
  });

  const activeTabId = pathname?.startsWith("/workforce/onboarding")
    ? "lifecycle"
    : pathname?.startsWith("/workforce/attendance") || pathname?.startsWith("/workforce/leave")
    ? "calendar"
    : tabs.find((t) => pathname?.startsWith(t.href))?.id;

  return (
    <DashboardRouteShell
      user={user}
      title="Workforce"
      activeSection="workforce"
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            style={S.pill(activeTabId === tab.id) as React.CSSProperties}
          >
            {tab.label}
          </a>
        ))}
      </div>
      {children}
    </DashboardRouteShell>
  );
}
