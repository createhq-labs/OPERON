"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { UserPlus2, UserRound, Briefcase, Users, ShieldCheck, CircleAlert } from "lucide-react";
import type { DeboardingRecord, DeptId, OnboardingRecord, User, UserStatus } from "@/core/operon";
import { useSession } from "@/auth/useSession";
import {
  acknowledgeOnboarding,
  approveCreatorDeboarding,
  completeCreatorDeboarding,
  completeOnboarding,
  getDeboardingRecords,
  getDepartments,
  getMyDirectReports,
  getOnboardingRecords,
  getUserById,
  getUsers,
  rejectOnboarding,
  submitCreatorDeboarding,
  updateRosterMemberDetails,
} from "@/core/operon";
import {
  canApproveCreatorDeboarding,
  canManageOnboarding,
  canManagePeople,
  canSubmitCreatorDeboarding,
  canViewAllHrRecords,
} from "@/security/permissions";
import { StatusPill } from "@/features/workforce/StatusPill";
import { EmployeeProfilePanel } from "@/features/workforce/EmployeeProfilePanel";
import {
  createWorkforceEmployee,
  getWorkforceDirectoryOptions,
  generateTemporaryPassword,
  listWorkforceEmployees,
  type WorkforceDirectoryOptions,
  type WorkforceEmployee,
} from "@/services/workforceEmployees";
import { S, T } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";

const CREATOR_CHECKLIST = [
  { id: "groups", label: "Removed from groups" },
  { id: "docs", label: "Removed from shared docs" },
  { id: "comms", label: "Removed from communication channels" },
  { id: "lists", label: "Removed from creator lists" },
  { id: "recovery", label: "Access/data taken back" },
] as const;

const EMPLOYEE_CHECKLIST = [
  { id: "email", label: "Email access removed" },
  { id: "drive", label: "Drive access removed" },
  { id: "docs", label: "Docs access removed" },
  { id: "groups", label: "Groups removed" },
  { id: "accounts", label: "Company accounts removed" },
  { id: "assets", label: "Assets/data taken back" },
] as const;

type Tab = "onboarding" | "employees" | "creators";
type ChecklistDef = ReadonlyArray<{ id: string; label: string }>;

function effectiveStatus(person: User, deboard?: DeboardingRecord): string {
  if (deboard && deboard.status !== "offboarded") return deboard.status;
  return person.status;
}

export default function PeoplePage() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("employees");
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [, forceRefresh] = useState(0);
  const [realEmployees, setRealEmployees] = useState<WorkforceEmployee[]>([]);
  const [employeesError, setEmployeesError] = useState("");
  const [employeesVersion, setEmployeesVersion] = useState(0);

  const isHrTier = user ? canViewAllHrRecords(user) : false;
  const canSubmitCreator = user ? canSubmitCreatorDeboarding(user) : false;
  const canApproveDeboard = user ? canApproveCreatorDeboarding(user) : false;
  const canEditPeople = user ? canManagePeople(user) : false;
  const canRunOnboarding = user ? canManageOnboarding(user) : false;

  const directReportIds = useMemo(
    () => new Set(user ? getMyDirectReports(user).map((u) => u.id) : []),
    [user],
  );

  const deboardingByUserId = useMemo(() => {
    if (!user) return new Map<string, DeboardingRecord>();
    const map = new Map<string, DeboardingRecord>();
    for (const r of getDeboardingRecords(user)) {
      if (!map.has(r.userId) || r.createdAt > (map.get(r.userId)?.createdAt ?? "")) {
        map.set(r.userId, r);
      }
    }
    return map;
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    listWorkforceEmployees()
      .then((rows) => { if (!cancelled) { setRealEmployees(rows); setEmployeesError(""); } })
      .catch((err) => { if (!cancelled) setEmployeesError(err instanceof Error ? err.message : "Failed to load employees."); });
    return () => { cancelled = true; };
  }, [employeesVersion]);

  if (!user) return null;

  function refresh() {
    forceRefresh((n) => n + 1);
  }

  const allUsers = getUsers();
  const departments = getDepartments();
  const managerOptions = allUsers.filter((u) => u.status !== "disabled" && u.userType === "employee");

  // Employees tab is sourced from the real global.users roster (see
  // src/services/workforceEmployees.ts) — the backend already scopes rows
  // to direct reports for a non-HR-tier caller, so no client-side filtering
  // by directReportIds is needed here (unlike the Creators tab below, which
  // still runs on the legacy in-memory engine).
  const employees: User[] = realEmployees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    avatar: "",
    userType: "employee",
    roleId: e.roleId,
    roleName: e.roleName,
    departmentId: e.departmentId,
    departmentName: e.departmentName,
    designationId: e.designationId,
    designationName: e.designationName,
    supervisorId: e.supervisorId,
    permissionIds: [],
    createdById: "",
    status: e.status as UserStatus,
    dateJoined: e.dateJoined,
  }));

  const creatorPool = allUsers.filter((u) => u.userType === "creator");
  const creators = (canApproveDeboard || isHrTier) ? creatorPool : creatorPool.filter((u) => directReportIds.has(u.id));

  const onboardingRecords = canRunOnboarding || isHrTier ? getOnboardingRecords(user) : [];
  const q = search.trim().toLowerCase();
  const filteredEmployees = q ? employees.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : employees;
  const filteredCreators = q ? creators.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q)) : creators;
  const filteredOnboarding = q
    ? onboardingRecords.filter((r) => {
        const person = getUserById(r.userId);
        return `${person?.name ?? ""} ${person?.email ?? ""}`.toLowerCase().includes(q);
      })
    : onboardingRecords;

  const visibleTabs: Array<{ id: Tab; label: string; count: number }> = [
    ...(canRunOnboarding || isHrTier ? [{ id: "onboarding" as const, label: "Onboarding", count: filteredOnboarding.length }] : []),
    { id: "employees", label: "Employees", count: filteredEmployees.length },
    { id: "creators", label: "Creators", count: filteredCreators.length },
  ];
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id ?? "employees";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h2 style={S.sectionTitle}>People</h2>
            <p style={S.sectionDesc}>Onboarding, roster updates, and deboarding.</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email..."
              style={{ ...S.input, width: "min(100%, 240px)" }}
            />
            {canEditPeople && (
              <button type="button" style={S.btnPrimary} onClick={() => setShowCreateForm((v) => !v)}>
                {showCreateForm ? "Cancel" : "New Employee"}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "18px" }}>
          {visibleTabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={S.pill(activeTab === t.id) as React.CSSProperties}>
              {t.label}
              <span style={{ marginLeft: "6px", fontVariantNumeric: "tabular-nums", opacity: 0.6, fontSize: "var(--text-11)" }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {showCreateForm && canEditPeople && (
        <CreateEmployeeForm
          onCreated={() => setEmployeesVersion((v) => v + 1)}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {activeTab === "onboarding" && (
        <OnboardingList
          records={filteredOnboarding}
          onAcknowledge={(recordId) => {
            acknowledgeOnboarding(user, recordId);
            refresh();
          }}
          onComplete={(recordId) => {
            completeOnboarding(user, recordId);
            refresh();
          }}
          onReject={(recordId, reason) => {
            rejectOnboarding(user, recordId, reason);
            refresh();
          }}
        />
      )}

      {activeTab === "employees" && (
        <PeopleList
          actor={user}
          people={filteredEmployees}
          emptyMessage={employeesError || "No employees found."}
          deboardingByUserId={deboardingByUserId}
          renderColumns={(person) => (
            <>
              <InfoCell label="Department" value={person.departmentName ?? "-"} />
              <InfoCell label="Role" value={person.roleName ?? "-"} />
              <InfoCell label="Manager" value={person.supervisorId ? (person.supervisorId === user.id ? user.name : realEmployees.find((e) => e.id === person.supervisorId)?.name ?? "-") : "-"} />
            </>
          )}
          checklistItems={EMPLOYEE_CHECKLIST}
          canEditPerson={false}
          departments={departments}
          managerOptions={managerOptions}
          canInitiate={() => false}
          canApprove={() => false}
          canComplete={() => false}
          onSavePerson={() => {}}
          onInitiate={() => {}}
          onApprove={() => {}}
          onComplete={() => {}}
        />
      )}

      {activeTab === "creators" && (
        <PeopleList
          actor={user}
          people={filteredCreators}
          emptyMessage="No creators found."
          deboardingByUserId={deboardingByUserId}
          renderColumns={(person) => (
            <InfoCell label="Manager" value={person.supervisorId ? (getUserById(person.supervisorId)?.name ?? "-") : "-"} />
          )}
          checklistItems={CREATOR_CHECKLIST}
          canEditPerson={canEditPeople}
          departments={departments}
          managerOptions={managerOptions}
          canInitiate={(person, deboard) => canSubmitCreator && !deboard && person.status !== "disabled"}
          canApprove={(_, deboard) => canApproveDeboard && deboard?.status === "pending_lead_approval"}
          canComplete={(_, deboard) => canApproveDeboard && deboard?.status === "data_recovery_pending"}
          onSavePerson={(person, updates) => {
            updateRosterMemberDetails(user, person.id, updates);
            refresh();
          }}
          onInitiate={(person, reason) => {
            submitCreatorDeboarding(user, person.id, reason || undefined);
            refresh();
          }}
          onApprove={(_, deboardId) => {
            approveCreatorDeboarding(user, deboardId);
            refresh();
          }}
          onComplete={(_, deboardId, checklist) => {
            completeCreatorDeboarding(user, deboardId, checklist);
            refresh();
          }}
        />
      )}

      <style>{`
        .people-row { transition: border-color 120ms; }
        .people-row:hover { border-color: rgba(255,255,255,0.18) !important; }
        @media (max-width: 860px) {
          .people-cols { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function OnboardingList({
  records,
  onAcknowledge,
  onComplete,
  onReject,
}: {
  records: OnboardingRecord[];
  onAcknowledge: (recordId: string) => void;
  onComplete: (recordId: string) => void;
  onReject: (recordId: string, reason: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={S.emptyState}>No onboarding records found.</div>
      </div>
    );
  }

  return (
    <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)", display: "flex", flexDirection: "column", gap: "8px" }}>
      {records.map((record) => {
        const person = getUserById(record.userId);
        const isExpanded = expandedId === record.id;
        return (
          <div key={record.id}>
            <div
              className="people-row"
              style={{
                ...S.cardInner,
                border: `1px solid ${isExpanded ? "rgba(245,166,35,0.3)" : "var(--op-border)"}`,
                padding: "13px 16px",
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1fr) auto auto",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person?.name ?? "Unknown user"}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person?.email ?? record.userId}</div>
              </div>
              <StatusPill status={record.status} />
              <button type="button" onClick={() => setExpandedId(isExpanded ? null : record.id)} style={{ ...S.btnGhost, height: "30px", padding: "0 12px", fontSize: "var(--text-12)" }}>
                Review
              </button>
            </div>
            {isExpanded && (
              <OnboardingPanel
                record={record}
                onAcknowledge={() => {
                  onAcknowledge(record.id);
                  setExpandedId(null);
                }}
                onComplete={() => {
                  onComplete(record.id);
                  setExpandedId(null);
                }}
                onReject={(reason) => {
                  onReject(record.id, reason);
                  setExpandedId(null);
                }}
                onCancel={() => setExpandedId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OnboardingPanel({
  record,
  onAcknowledge,
  onComplete,
  onReject,
  onCancel,
}: {
  record: OnboardingRecord;
  onAcknowledge: () => void;
  onComplete: () => void;
  onReject: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const entries = [
    ...Object.entries(record.onboardingData ?? {}).map(([key, value]) => ({ key, value, group: "Onboarding" })),
    ...Object.entries(record.complianceData ?? {}).map(([key, value]) => ({ key, value, group: "Compliance" })),
  ];

  function reject() {
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    onReject(reason.trim());
  }

  return (
    <div style={{ ...S.card, marginTop: "6px", padding: "18px 20px", border: "1px solid rgba(245,166,35,0.18)", display: "grid", gap: "14px" }}>
      {entries.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          {entries.map((entry) => (
            <div key={`${entry.group}-${entry.key}`} style={S.cardInner}>
              <div style={{ padding: "10px 12px" }}>
                <div style={S.label}>{entry.group}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginBottom: "3px" }}>{entry.key}</div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text)" }}>{entry.value || "-"}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)" }}>No submitted form data.</div>
      )}

      {record.rejectionReason && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "#fb923c" }}>Last send-back reason: {record.rejectionReason}</div>
      )}

      {record.status === "submitted" && (
        <div style={{ display: "grid", gap: "8px" }}>
          <label style={S.label}>Send back reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should be corrected?" style={S.input} />
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {record.status === "submitted" && (
          <>
            <button type="button" style={S.btnPrimary} onClick={onAcknowledge}>Acknowledge</button>
            <button type="button" style={S.btnDanger} onClick={reject}>Send Back</button>
          </>
        )}
        {record.status === "acknowledged" && (
          <button type="button" style={S.btnPrimary} onClick={onComplete}>Complete Onboarding</button>
        )}
        <button type="button" style={S.btnGhost} onClick={onCancel}>Cancel</button>
        {error && <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "#e5484d" }}>{error}</span>}
      </div>
    </div>
  );
}

function PeopleList({
  actor,
  people,
  emptyMessage,
  deboardingByUserId,
  renderColumns,
  checklistItems,
  canEditPerson,
  departments,
  managerOptions,
  canInitiate,
  canApprove,
  canComplete,
  onSavePerson,
  onInitiate,
  onApprove,
  onComplete,
}: {
  actor: User;
  people: User[];
  emptyMessage: string;
  deboardingByUserId: Map<string, DeboardingRecord>;
  renderColumns: (person: User) => React.ReactNode;
  checklistItems: ChecklistDef;
  canEditPerson: boolean;
  departments: Array<{ id: DeptId; name: string }>;
  managerOptions: User[];
  canInitiate: (person: User, deboard?: DeboardingRecord) => boolean;
  canApprove: (person: User, deboard?: DeboardingRecord) => boolean;
  canComplete: (person: User, deboard?: DeboardingRecord) => boolean;
  onSavePerson: (person: User, updates: { departmentId?: DeptId; supervisorId?: string; status?: UserStatus }) => void;
  onInitiate: (person: User, reason: string) => void;
  onApprove: (person: User, deboardId: string) => void;
  onComplete: (person: User, deboardId: string, checklist: Record<string, boolean>) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (people.length === 0) {
    return (
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={S.emptyState}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)", display: "flex", flexDirection: "column", gap: "8px" }}>
      {people.map((person) => {
        const deboard = deboardingByUserId.get(person.id);
        const isExpanded = expandedId === person.id;
        const isEditing = editingId === person.id;
        const showInit = canInitiate(person, deboard);
        const showApprove = canApprove(person, deboard);
        const showComplete = canComplete(person, deboard);
        const hasDeboardingAction = showInit || showApprove || showComplete;
        const btnLabel = showInit ? "Initiate" : showApprove ? "Approve" : showComplete ? "Checklist" : null;

        return (
          <div key={person.id}>
            <div
              className="people-row"
              style={{
                ...S.cardInner,
                border: `1px solid ${isExpanded || isEditing ? "rgba(229,72,77,0.3)" : "var(--op-border)"}`,
                padding: "13px 16px",
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1.4fr) auto 1fr auto",
                gap: "12px",
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => { setViewingId(viewingId === person.id ? null : person.id); setEditingId(null); setExpandedId(null); }}
                  style={{ all: "unset", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                >
                  {person.name}
                </button>
                <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.email}</div>
              </div>
              <StatusPill status={effectiveStatus(person, deboard)} />
              <div className="people-cols" style={{ display: "flex", gap: "24px", alignItems: "center" }}>{renderColumns(person)}</div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                {canEditPerson && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(isEditing ? null : person.id);
                      setExpandedId(null);
                      setViewingId(null);
                    }}
                    style={{ ...S.btnGhost, height: "30px", padding: "0 12px", fontSize: "var(--text-12)" }}
                  >
                    Edit
                  </button>
                )}
                {hasDeboardingAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : person.id);
                      setEditingId(null);
                      setViewingId(null);
                    }}
                    style={{ ...S.btnGhost, height: "30px", padding: "0 12px", fontSize: "var(--text-12)", color: isExpanded ? "#e5484d" : "var(--op-text-2)", borderColor: isExpanded ? "rgba(229,72,77,0.4)" : "var(--op-border)" }}
                  >
                    {btnLabel}
                  </button>
                )}
              </div>
            </div>

            {viewingId === person.id && (
              <EmployeeProfilePanel person={person} actor={actor} onClose={() => setViewingId(null)} />
            )}

            {isEditing && (
              <RosterEditPanel
                person={person}
                departments={departments}
                managerOptions={managerOptions}
                onSave={(updates) => {
                  onSavePerson(person, updates);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            )}

            {isExpanded && (
              <DeboardingPanel
                person={person}
                deboard={deboard}
                checklistItems={checklistItems}
                showInitiate={showInit}
                showApprove={showApprove}
                showComplete={showComplete}
                onInitiate={(reason) => {
                  onInitiate(person, reason);
                  setExpandedId(null);
                }}
                onApprove={() => {
                  if (deboard) {
                    onApprove(person, deboard.id);
                    setExpandedId(null);
                  }
                }}
                onComplete={(checklist) => {
                  if (deboard) {
                    onComplete(person, deboard.id, checklist);
                    setExpandedId(null);
                  }
                }}
                onCancel={() => setExpandedId(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateEmployeeForm({
  onCreated,
  onCancel,
}: {
  onCreated: (employee: WorkforceEmployee) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<WorkforceDirectoryOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [joinedAt, setJoinedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successPassword, setSuccessPassword] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkforceDirectoryOptions()
      .then((opts) => {
        if (cancelled) return;
        setOptions(opts);
        setRoleId((current) => current || opts.roles[0]?.id || "");
        setDepartmentId((current) => current || opts.departments[0]?.id || "");
      })
      .catch((err) => { if (!cancelled) setOptionsError(err instanceof Error ? err.message : "Failed to load role/department options."); });
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "Full name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    if (!roleId) errors.roleId = "Role is required.";
    if (!departmentId) errors.departmentId = "Department is required.";
    if (!joinedAt) errors.joinedAt = "Date joined is required.";
    if (!temporaryPassword || temporaryPassword.length < 6) errors.temporaryPassword = "A temporary password of at least 6 characters is required.";

    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const created = await createWorkforceEmployee({
        fullName: fullName.trim(),
        email: email.trim(),
        roleId,
        departmentId,
        designationId: designationId || undefined,
        managerUserId: managerUserId || undefined,
        joinedAt,
        temporaryPassword,
      });
      setSuccessPassword({ email: created.email, password: temporaryPassword });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the employee.");
    } finally {
      setSubmitting(false);
    }
  }

  if (successPassword) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionPreset.page.transition} style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <UserPlus2 size={18} color="var(--op-accent)" />
          <span style={T.cardTitle}>Employee created</span>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-2)" }}>
          Account created for <strong>{successPassword.email}</strong>. Share this temporary password with
          them so they can sign in — it will not be shown again:
        </p>
        <code style={{ ...S.cardInner, padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: "var(--text-14)", width: "fit-content" }}>{successPassword.password}</code>
        <div>
          <button type="button" style={S.btnPrimary} onClick={onCancel}>Done</button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionPreset.page.transition} style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <UserPlus2 size={18} color="var(--op-accent)" />
        <span style={T.cardTitle}>New Employee</span>
      </div>

      {optionsError && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--color-error)" }}>
          <CircleAlert size={13} /> {optionsError}
        </span>
      )}

      <FormSection icon={UserRound} title="Personal Information">
        <FormField label="Full Name" error={fieldErrors.fullName}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={S.input} placeholder="Jordan Lee" />
        </FormField>
        <FormField label="Email" error={fieldErrors.email}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={S.input} placeholder="jordan@example.com" />
        </FormField>
      </FormSection>

      <FormSection icon={Briefcase} title="Employment Information">
        <FormField label="Role" error={fieldErrors.roleId}>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={S.select}>
            {(options?.roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </FormField>
        <FormField label="Department" error={fieldErrors.departmentId}>
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setDesignationId(""); }} style={S.select}>
            {(options?.departments ?? []).map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>
        </FormField>
        <FormField label="Designation">
          <select value={designationId} onChange={(e) => setDesignationId(e.target.value)} style={S.select}>
            <option value="">No designation</option>
            {(options?.designations ?? []).filter((d) => !departmentId || d.departmentId === departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </FormField>
        <FormField label="Date Joined" error={fieldErrors.joinedAt}>
          <input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} style={S.input} />
        </FormField>
      </FormSection>

      <FormSection icon={Users} title="Reporting Structure">
        <FormField label="Reporting Manager">
          <select value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)} style={S.select}>
            <option value="">No manager</option>
            {(options?.managers ?? []).map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
          </select>
        </FormField>
      </FormSection>

      <FormSection icon={ShieldCheck} title="Account">
        <FormField label="Temporary Password" error={fieldErrors.temporaryPassword}>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              style={S.input}
              placeholder="Shared with the new hire to sign in"
            />
            <button type="button" style={S.btnGhost} onClick={() => setTemporaryPassword(generateTemporaryPassword())}>Generate</button>
          </div>
        </FormField>
      </FormSection>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={S.btnPrimary} onClick={submit} disabled={submitting}>{submitting ? "Creating…" : "Create Employee"}</button>
        <button type="button" style={S.btnGhost} onClick={onCancel}>Cancel</button>
        {error && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--color-error)" }}>
            <CircleAlert size={13} /> {error}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function FormSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "12px" }}>
        <Icon size={14} color="var(--op-text-3)" />
        <span style={T.sectionLabel}>{title}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {error && (
        <div style={{ ...S.errorText, display: "flex", alignItems: "center", gap: "4px" }}>
          <CircleAlert size={11} /> {error}
        </div>
      )}
    </div>
  );
}

function RosterEditPanel({
  person,
  departments,
  managerOptions,
  onSave,
  onCancel,
}: {
  person: User;
  departments: Array<{ id: DeptId; name: string }>;
  managerOptions: User[];
  onSave: (updates: { departmentId?: DeptId; supervisorId?: string; status?: UserStatus }) => void;
  onCancel: () => void;
}) {
  const [departmentId, setDepartmentId] = useState<DeptId | "">(person.departmentId ?? "");
  const [supervisorId, setSupervisorId] = useState(person.supervisorId ?? "");
  const [status, setStatus] = useState<UserStatus>(person.status);

  return (
    <div style={{ ...S.card, marginTop: "6px", padding: "18px 20px", border: "1px solid rgba(245,166,35,0.18)" }}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 700, color: "var(--op-text)", marginBottom: "14px" }}>Edit Roster - {person.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        <div>
          <label style={S.label}>Department</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value as DeptId)} style={S.select}>
            <option value="">Unassigned</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Manager</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} style={S.select}>
            <option value="">No manager</option>
            {managerOptions.filter((u) => u.id !== person.id).map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} style={S.select}>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
        <button type="button" style={S.btnPrimary} onClick={() => onSave({ departmentId: departmentId || undefined, supervisorId: supervisorId || undefined, status })}>Save</button>
        <button type="button" style={S.btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DeboardingPanel({
  person,
  deboard,
  checklistItems,
  showInitiate,
  showApprove,
  showComplete,
  onInitiate,
  onApprove,
  onComplete,
  onCancel,
}: {
  person: User;
  deboard?: DeboardingRecord;
  checklistItems: ChecklistDef;
  showInitiate: boolean;
  showApprove: boolean;
  showComplete: boolean;
  onInitiate: (reason: string) => void;
  onApprove: () => void;
  onComplete: (checklist: Record<string, boolean>) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function wrap<T>(fn: () => T) {
    try {
      return fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  const allChecked = checked.size === checklistItems.length;
  const title = showInitiate ? `Initiate Deboarding - ${person.name}` : showApprove ? `Approve Deboarding - ${person.name}` : `Complete Deboarding - ${person.name}`;

  return (
    <div style={{ ...S.card, marginTop: "6px", padding: "18px 20px", border: "1px solid rgba(229,72,77,0.18)" }}>
      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 700, color: "var(--op-text)", marginBottom: "14px" }}>{title}</div>

      {showInitiate && (
        <div>
          <div style={S.label}>Reason (optional)</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this person being offboarded?" style={{ ...S.input, marginTop: "4px", width: "100%" }} />
        </div>
      )}

      {showApprove && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-2)", marginBottom: "4px" }}>
          {deboard?.reason ? <span>Reason: <em>{deboard.reason}</em></span> : <span style={{ color: "var(--op-text-3)" }}>No reason provided.</span>}
        </div>
      )}

      {showComplete && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
          {checklistItems.map((item) => {
            const isChecked = checked.has(item.id);
            return (
              <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", userSelect: "none" }}>
                <span
                  onClick={() => toggle(item.id)}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "var(--r-sm)",
                    border: `2px solid ${isChecked ? "#e5484d" : "var(--op-border)"}`,
                    background: isChecked ? "rgba(229,72,77,0.12)" : "transparent",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="#e5484d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span onClick={() => toggle(item.id)} style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: isChecked ? "var(--op-text-3)" : "var(--op-text)", textDecoration: isChecked ? "line-through" : "none" }}>{item.label}</span>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: showInitiate ? "16px" : 0 }}>
        {showInitiate && <button type="button" style={{ ...S.btnPrimary, background: "#e5484d", height: "34px", padding: "0 18px" }} onClick={() => wrap(() => onInitiate(reason))}>Initiate Deboarding</button>}
        {showApprove && <button type="button" style={{ ...S.btnPrimary, background: "#e5484d", height: "34px", padding: "0 18px" }} onClick={() => wrap(onApprove)}>Approve Deboarding</button>}
        {showComplete && (
          <button
            type="button"
            disabled={!allChecked}
            onClick={() => {
              const cl: Record<string, boolean> = {};
              for (const item of checklistItems) cl[item.id] = checked.has(item.id);
              wrap(() => onComplete(cl));
            }}
            style={{ ...S.btnPrimary, background: allChecked ? "#e5484d" : "rgba(229,72,77,0.25)", color: allChecked ? "#fff" : "rgba(229,72,77,0.5)", cursor: allChecked ? "pointer" : "not-allowed", height: "34px", padding: "0 18px" }}
          >
            Mark as Offboarded
          </button>
        )}
        <button type="button" style={{ ...S.btnGhost, height: "34px", padding: "0 14px" }} onClick={onCancel}>Cancel</button>
        {showComplete && !allChecked && <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)" }}>{checklistItems.length - checked.size} item{checklistItems.length - checked.size !== 1 ? "s" : ""} remaining</span>}
        {error && <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "#e5484d" }}>{error}</span>}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...S.label, marginBottom: "1px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text)", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
