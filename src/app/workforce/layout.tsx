"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/auth/useSession";
import {
  canSubmitProbationReview,
  canDecideProbationReview,
  canAccessWorkforce,
  canAccessPeopleModule,
} from "@/security/permissions";
import { capabilitiesFor } from "@/lib/workforce/capabilities";
import { DashboardRouteShell } from "@/components/DashboardRouteShell";
import { S } from "@/styles/sharedUi";

const ALL_TABS = [
  { id: "lifecycle",  label: "People",      href: "/workforce/lifecycle" },
  { id: "calendar",   label: "Calendar",    href: "/workforce/calendar" },
  { id: "probation",  label: "Probation",   href: "/workforce/probation" },
  { id: "signups",    label: "Sign-ins",    href: "/workforce/signups" },
];

// Deliberately bypasses permissions.ts's legacy canManageOnboarding() (which
// still checks the deprecated HR_ONLY_ROLES/FOUNDER_TIER_ROLES collapse) in
// favor of the rebuild's 3-tier HR role model directly — this tab/route is
// new and should never depend on the legacy role system.
function canManageOnboardingCapability(user: { id: string; roleName?: string; roleId: string; supervisorId?: string }): boolean {
  return capabilitiesFor({ id: user.id, roleName: user.roleName ?? user.roleId, managerUserId: user.supervisorId }).canManageOnboarding;
}

export default function WorkforceLayout({ children }: { children: React.ReactNode }) {
  const { user, loaded } = useSession();
  const router    = useRouter();
  const pathname  = usePathname();

  useEffect(() => {
    if (!loaded) return;
    if (!user) { router.replace("/"); return; }
    if (!canAccessWorkforce(user)) { router.replace("/"); return; }
    // Team members / Interns land on lifecycle or probation routes → redirect to calendar
    const isLifecycleRoute = pathname?.startsWith("/workforce/lifecycle")
      || pathname?.startsWith("/workforce/onboarding")
      || pathname?.startsWith("/workforce/deboarding");
    const isProbationRoute = pathname?.startsWith("/workforce/probation");
    const isSignupsRoute = pathname?.startsWith("/workforce/signups");
    if (isLifecycleRoute && !canAccessPeopleModule(user)) router.replace("/workforce/calendar");
    if (isProbationRoute && !canSubmitProbationReview(user) && !canDecideProbationReview(user)) router.replace("/workforce/calendar");
    if (isSignupsRoute && !canManageOnboardingCapability(user)) router.replace("/workforce/calendar");
  }, [loaded, user, router, pathname]);

  if (!loaded) return null;
  if (!user)   return null;

  const showLifecycle = canAccessPeopleModule(user);
  const showProbation = canSubmitProbationReview(user) || canDecideProbationReview(user);
  const showSignups = canManageOnboardingCapability(user);

  const tabs = ALL_TABS.filter((tab) => {
    if (tab.id === "lifecycle") return showLifecycle;
    if (tab.id === "probation") return showProbation;
    if (tab.id === "signups") return showSignups;
    return true;
  });

  const activeTabId = pathname?.startsWith("/workforce/onboarding") || pathname?.startsWith("/workforce/deboarding")
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
