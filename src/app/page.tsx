"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

import type { DriveDiagnostics } from "@/services/drive";
import type {
  DeptId, DocTag, Document, DriveParsedDocument, ResourceCategory,
  Role, RoleId, User, UserType, VisibilityScope,
} from "@/core/operon";
import {
  canAddDocuments, isAdmin, saveRole, canDeleteRole, canEditRole,
  canManageResources, canManageRoles, canManageUsers, canPublishGlobally,
  canViewActivity, canViewResources, createDocumentUploadFromFile, createResource,
  createUser, deleteRole, getAccessibleDocument, getAccessibleDocuments,
  getActivityFeed, getAllUsers, getCreatableRoles, getDepartmentFilters,
  getPinnedDocuments, getQuickActions, getResourceById, getRoleLabel, getRoles,
  getSupervisors, getTeams, getUserById, getAssignableDepartments,
  getDocumentEntity, searchDocuments, searchResources,
} from "@/core/operon";
import {
  getProviderHealth, setDataProviderMode, subscribeToDataUpdates, onSupabaseHydrated,
} from "@/services/api";
import { renderBlock } from "@/renderers";
import { useSession } from "@/auth/useSession";
import { MVPAccessMode } from "@/features/auth/MVPAccessMode";
import { HomePanel } from "@/features/dashboard/HomePanel";
import { Sidebar } from "@/components/Sidebar";

// ─── Shared inline-style helpers (design system tokens) ──────────────────────

const S = {
  card: {
    background:             "var(--op-surface)",
    border:                 "1px solid var(--op-border)",
    borderRadius:           "var(--r-lg)",
    backdropFilter:         "var(--glass-blur)",
    WebkitBackdropFilter:   "var(--glass-blur)",
  },
  cardInner: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
  },
  input: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
    padding:      "10px 14px",
    fontSize:     "var(--text-14)",
    color:        "var(--op-text)",
    width:        "100%",
    outline:      "none",
    fontFamily:   "var(--font-body)",
  },
  select: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
    padding:      "10px 14px",
    fontSize:     "var(--text-14)",
    color:        "var(--op-text)",
    width:        "100%",
    outline:      "none",
    fontFamily:   "var(--font-body)",
    cursor:       "pointer",
  },
  btnPrimary: {
    background:   "var(--op-accent)",
    color:        "#000",
    border:       "none",
    borderRadius: "var(--r-full)",
    padding:      "0 20px",
    height:       "38px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   600,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "opacity 120ms",
  },
  btnGhost: {
    background:   "transparent",
    color:        "var(--op-text-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-full)",
    padding:      "0 16px",
    height:       "34px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   500,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "border-color 120ms, color 120ms",
  },
  label: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-12)",
    fontWeight:    500,
    color:         "var(--op-text-3)",
    letterSpacing: "0.04em",
    display:       "block" as const,
    marginBottom:  "8px",
  },
  sectionTitle: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    color:         "var(--op-text)",
    letterSpacing: "-0.02em",
    margin:        0,
  },
  sectionDesc: {
    fontFamily:  "var(--font-body)",
    fontSize:    "var(--text-14)",
    color:       "var(--op-text-2)",
    marginTop:   "6px",
    lineHeight:  1.6,
  },
  pill: (active: boolean) => ({
    display:       "inline-flex",
    alignItems:    "center",
    padding:       "5px 14px",
    borderRadius:  "var(--r-full)",
    border:        `1px solid ${active ? "var(--op-border-hover)" : "var(--op-border)"}`,
    background:    active ? "rgba(255,255,255,0.08)" : "transparent",
    color:         active ? "var(--op-text)" : "var(--op-text-2)",
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-12)",
    fontWeight:    500,
    cursor:        "pointer",
    transition:    "all 150ms",
    whiteSpace:    "nowrap" as const,
  }),
  toggleBtn: (active: boolean) => ({
    display:      "flex",
    alignItems:   "center",
    justifyContent: "space-between",
    padding:      "10px 14px",
    borderRadius: "var(--r-md)",
    border:       `1px solid ${active ? "var(--op-accent)" : "var(--op-border)"}`,
    background:   active ? "rgba(245,166,35,0.08)" : "var(--op-surface-2)",
    color:        active ? "var(--op-text)" : "var(--op-text-2)",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   500,
    cursor:       "pointer",
    transition:   "all 150ms",
    width:        "100%",
    textAlign:    "left" as const,
  }),
  badge: {
    display:       "inline-flex",
    alignItems:    "center",
    padding:       "3px 10px",
    borderRadius:  "var(--r-full)",
    background:    "var(--op-surface-3)",
    border:        "1px solid var(--op-border)",
    fontFamily:    "var(--font-mono)",
    fontSize:      "var(--text-11)",
    color:         "var(--op-text-3)",
    letterSpacing: "0.04em",
    whiteSpace:    "nowrap" as const,
  },
  emptyState: {
    border:          "1px dashed var(--op-border)",
    borderRadius:    "var(--r-lg)",
    padding:         "48px 24px",
    textAlign:       "center" as const,
    color:           "var(--op-text-3)",
    fontFamily:      "var(--font-body)",
    fontSize:        "var(--text-14)",
  },
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_NAMES = {
  signin:  "Sign in",
  home:    "Home",
  library: "Library",
  resources: "Resources",
  activity:  "Activity",
  finance:   "Finance",
  team:      "Team",
  roles:     "Roles",
  docs:      "Document",
} as const;

const TAG_LABELS: Record<DocTag, string> = {
  sop:        "SOP",
  onboarding: "Onboarding",
  brand:      "Brand",
  creator:    "Creator",
  ops:        "Operations",
  hr:         "HR",
  internal:   "Internal",
};

const LIBRARY_CATEGORIES: ReadonlyArray<{ id: string; label: string; tags: DocTag[] }> = [
  { id: "all",        label: "All",        tags: ["sop","hr","ops","creator","onboarding","brand","internal"] },
  { id: "hr",         label: "HR",         tags: ["hr"] },
  { id: "finance",    label: "Finance",    tags: ["ops","creator"] },
  { id: "operations", label: "Operations", tags: ["ops","internal"] },
  { id: "training",   label: "Training",   tags: ["onboarding"] },
  { id: "policies",   label: "Policies",   tags: ["sop","hr"] },
  { id: "sop",        label: "SOPs",       tags: ["sop"] },
];

const RESOURCE_CATEGORIES = [
  { id: "all",      label: "All" },
  { id: "forms",    label: "Forms" },
  { id: "policies", label: "Policies" },
  { id: "team",     label: "Team" },
  { id: "training", label: "Training" },
] as const;

const FINANCE_MENU_ITEMS = [
  { id: "notices",       label: "Notices",       description: "Finance alerts, policy updates, and operational announcements." },
  { id: "reimbursements",label: "Reimbursements",description: "Expense requests and reimbursement workflows." },
  { id: "expense_forms", label: "Expense Forms", description: "Templates for cost submissions and approvals." },
  { id: "invoices",      label: "Invoices",      description: "Invoice tracking, status, and payment schedules." },
  { id: "policies",      label: "Policies",      description: "Finance policies, controls, and audit guidelines." },
  { id: "resources",     label: "Resources",     description: "Finance references, processes, and external guides." },
] as const;

type Section = keyof typeof SECTION_NAMES;
type ResourceCategoryFilter = ResourceCategory | "all";
export type LibraryCategoryId = (typeof LIBRARY_CATEGORIES)[number]["id"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  const { user, loaded, signOut } = useSession();
  const router = useRouter();

  // ── Navigation & search ──────────────────────────────────────────────────
  const [selectedSection,  setSelectedSection]  = useState<Section>("signin");
  const [selectedDocId,    setSelectedDocId]    = useState<string | null>(null);
  const [globalSearch,     setGlobalSearch]     = useState("");
  const [isSearchOpen,     setIsSearchOpen]     = useState(false);
  const [isMobileNavOpen,  setIsMobileNavOpen]  = useState(false);
  const [documentView,     setDocumentView]     = useState<"grid" | "list">("grid");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // ── Library ──────────────────────────────────────────────────────────────
  const [librarySearch,   setLibrarySearch]   = useState("");
  const [libraryCategory, setLibraryCategory] = useState<LibraryCategoryId>("all");
  const [libraryDept,     setLibraryDept]     = useState<"all" | DeptId>("all");

  // ── Upload ───────────────────────────────────────────────────────────────
  const [uploadTitle,         setUploadTitle]         = useState("");
  const [uploadCategory,      setUploadCategory]      = useState<DocTag>("sop");
  const [uploadDepartment,    setUploadDepartment]    = useState<DeptId>("operations");
  const [uploadVisibility,    setUploadVisibility]    = useState<VisibilityScope>("department");
  const [uploadDepartmentIds, setUploadDepartmentIds] = useState<DeptId[]>([]);
  const [uploadTeamIds,       setUploadTeamIds]       = useState<string[]>([]);
  const [uploadUserTypes,     setUploadUserTypes]     = useState<UserType[]>(["employee"]);
  const [selectedRoleIds,     setSelectedRoleIds]     = useState<RoleId[]>([]);
  const [selectedUserIds,     setSelectedUserIds]     = useState<string[]>([]);
  const [uploadFile,          setUploadFile]          = useState<File | null>(null);
  const [uploadStatus,        setUploadStatus]        = useState("");
  const [uploadError,         setUploadError]         = useState("");
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Resources ────────────────────────────────────────────────────────────
  const [resourceQuery,            setResourceQuery]            = useState("");
  const [resourceCategory,         setResourceCategory]         = useState<ResourceCategoryFilter>("all");
  const [resourceTitle,            setResourceTitle]            = useState("");
  const [resourceHref,             setResourceHref]             = useState("");
  const [resourceAllowedRoleIds,   setResourceAllowedRoleIds]   = useState<RoleId[]>(["role_cofounder","role_hr","role_finance","role_im_team_lead","role_tm_team_lead"]);
  const [resourceAllowedUserTypes, _setResourceAllowedUserTypes] = useState<UserType[]>(["employee"]);
  const [resourceAllowedDepartments, setResourceAllowedDepartments] = useState<DeptId[]>([]);
  const [resourceAllowedTeamIds,   setResourceAllowedTeamIds]   = useState<string[]>([]);
  const [resourceVisibility,       setResourceVisibility]       = useState<VisibilityScope>("private");
  const [resourceMessage,          setResourceMessage]          = useState("");

  // ── Drive & data ─────────────────────────────────────────────────────────
  const [dataVersion,     setDataVersion]     = useState(0);
  const [providerLoading, setProviderLoading] = useState(true);
  const [_providerReady,   setProviderReady]   = useState(false);
  const [_providerHealth,  setProviderHealth]  = useState(getProviderHealth());
  const [driveDiagnostics, _setDriveDiagnostics] = useState<DriveDiagnostics | null>(null);
  const [cachedQuickActions, setCachedQuickActions] = useState<Array<{ id: string; label: string; description: string; category?: string }>>([]);

  // ── Team / users ─────────────────────────────────────────────────────────
  const [newName,            setNewName]            = useState("");
  const [newEmail,           setNewEmail]           = useState("");
  const [newRoleId,          setNewRoleId]          = useState<RoleId>("role_intern");
  const [newDepartmentId,    setNewDepartmentId]    = useState<DeptId>("im");
  const [newSupervisorId,    setNewSupervisorId]    = useState("");
  const [newStatus,          setNewStatus]          = useState<User["status"]>("active");
  const [assignedDocumentIds,setAssignedDocumentIds]= useState<string[]>([]);
  const [teamStatus,         setTeamStatus]         = useState("");
  const [teamError,          setTeamError]          = useState("");

  // ── Roles ────────────────────────────────────────────────────────────────
  const [roles,            setRoles]            = useState<Role[]>(getRoles());
  const [editingRoleId,    setEditingRoleId]    = useState<string | null>(null);
  const [roleName,         setRoleName]         = useState("");
  const [roleDescription,  setRoleDescription]  = useState("");
  const [roleInheritsFrom, setRoleInheritsFrom] = useState("");
  const [rolePermissions,  setRolePermissions]  = useState<Role["permissions"]>({
    documents: { create: false, view: false, edit: false, delete: false, upload: false },
    users:     { create: false, edit: false, delete: false, assignRole: false },
    system:    { adminPanelAccess: false, roleManagement: false },
  });
  const [roleFormError,   setRoleFormError]   = useState("");
  const [roleFormMessage, setRoleFormMessage] = useState("");
  const [showRoleEditor,  setShowRoleEditor]  = useState(false);

  // ── Document view ────────────────────────────────────────────────────────
  const [selectedDoc, setSelectedDoc] = useState<Document | DriveParsedDocument | null>(null);

  // ─── Keyboard shortcut ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") setIsSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Auth-driven section reset ────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      setSelectedSection((s) => s === "signin" ? "home" : s);
    } else {
      setSelectedSection("signin");
      setSelectedDocId(null);
    }
  }, [user]);

  // ─── Data provider bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    setProviderLoading(true);
    setDataProviderMode("supabase");
    setProviderHealth(getProviderHealth());

    const updateHealth = () => setProviderHealth(getProviderHealth());

    const unsubChanges    = subscribeToDataUpdates(() => { setDataVersion((v) => v + 1); updateHealth(); });
    const unsubHydration  = onSupabaseHydrated(() => {
      setProviderReady(true);
      setProviderLoading(false);
      setDataVersion((v) => v + 1);
      updateHealth();
    });

    return () => { unsubChanges(); unsubHydration(); };
  }, []);

  // ─── Quick actions cache ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("operon-quick-actions");
      if (stored) setCachedQuickActions(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setRoles(getRoles());
  }, [user?.roleId]);

  const quickActions = useMemo(() => (user ? getQuickActions(user) : []), [user]);
  const displayQuickActions = quickActions.length > 0 ? quickActions : cachedQuickActions;

  useEffect(() => {
    if (!providerLoading && quickActions.length > 0) {
      try { window.localStorage.setItem("operon-quick-actions", JSON.stringify(quickActions)); } catch { /* ignore */ }
    }
  }, [providerLoading, quickActions]);

  // ─── Derived data ─────────────────────────────────────────────────────────
  const pinnedDocs     = useMemo(() => (user ? getPinnedDocuments(user, 3) : []),               [user]);
  const accessibleDocs = useMemo(() => (user ? getAccessibleDocuments(user) : []),              [user]);
  const _availableUsers = useMemo(() => (user && isAdmin(user) ? getAllUsers() : []),            [user]);
  const supervisors    = useMemo(() => (user ? getSupervisors(user) : []),                      [user]);
  const _teams          = useMemo(() => (user ? getTeams() : []),                                [user]);
  const creatableRoles = useMemo(() => (user ? getCreatableRoles(user) : []),                   [user]);
  const uploadRoles    = creatableRoles;
  const activityFeed   = useMemo(() => (user ? getActivityFeed(user) : []),                     [user]);
  const assignableDepartments = useMemo(() => (user ? getAssignableDepartments(user, newRoleId) : []), [user, newRoleId]);

  const libraryDocs = useMemo(() => {
    if (!user) return [];
    const results = searchDocuments(user, librarySearch, libraryDept);
    if (libraryCategory === "all") return results;
    const cat = LIBRARY_CATEGORIES.find((c) => c.id === libraryCategory);
    return cat ? results.filter((doc) => cat.tags.includes(doc.tag)) : results;
  }, [user, librarySearch, libraryDept, libraryCategory]);

  const resourceItems = useMemo(
    () => (user && canViewResources(user) ? searchResources(user, resourceQuery, resourceCategory === "all" ? undefined : resourceCategory) : []),
    [user, resourceQuery, resourceCategory],
  );

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    const docs      = (q ? accessibleDocs.filter((d) => [d.title, d.description, d.author, TAG_LABELS[d.tag]].filter(Boolean).some((v) => v.toLowerCase().includes(q))) : accessibleDocs).slice(0, 6);
    const resources = (q ? resourceItems.filter((r) => [r.title, r.description, r.category].filter(Boolean).some((v) => v.toLowerCase().includes(q))) : resourceItems).slice(0, 4);
    return { docs, resources };
  }, [accessibleDocs, globalSearch, resourceItems]);

  // ─── Permissions ──────────────────────────────────────────────────────────
  const resourceCanCreate = user ? canManageResources(user) : false;
  const userCanManage     = user ? canManageUsers(user)     : false;
  const resourceCanView   = user ? canViewResources(user)   : false;
  const activityCanView   = user ? canViewActivity(user)    : false;
  const userCanUpload     = user ? canAddDocuments(user)    : false;
  const financeAccess     = user ? canPublishGlobally(user) : false;
  const roleManagerAccess = user ? canManageRoles(user)     : false;

  const visibleSections = useMemo(() => {
    if (!user) return ["signin"] as Section[];
    const s: Section[] = ["home", "library"];
    if (resourceCanView)   s.push("resources");
    if (activityCanView)   s.push("activity");
    if (financeAccess)     s.push("finance");
    if (userCanManage)     s.push("team");
    if (roleManagerAccess) s.push("roles");
    return s;
  }, [user, resourceCanView, activityCanView, userCanManage, roleManagerAccess, financeAccess]);

  // ─── Role editor derived ──────────────────────────────────────────────────
  const selectedRole     = editingRoleId ? roles.find((r) => r.id === editingRoleId) ?? null : null;
  const roleEditorCanEdit= user && selectedRole ? canEditRole(user, selectedRole) : false;
  const canEditRoleForm  = user ? (!selectedRole || roleEditorCanEdit) : false;

  // ─── Document load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDocId || !user) { setSelectedDoc(null); return; }
    const u = user; const id = selectedDocId;
    async function load() {
      const entity = await getDocumentEntity(u, id);
      setSelectedDoc(entity ?? null);
    }
    void load();
  }, [selectedDocId, user]);

  const localRoleLabel = user ? (user as User & { displayRoleName?: string }).displayRoleName : undefined;
  const roleLabel = user ? localRoleLabel ?? getRoleLabel(user.roleId) : "";

  // ─── Handlers ────────────────────────────────────────────────────────────

  function showDoc(docId: string) {
    setSelectedDocId(docId);
    setSelectedSection("docs");
  }

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRoleInheritsFrom("");
    setRolePermissions({ documents: { create: false, view: false, edit: false, delete: false, upload: false }, users: { create: false, edit: false, delete: false, assignRole: false }, system: { adminPanelAccess: false, roleManagement: false } });
    setRoleFormError("");
    setRoleFormMessage("");
    setShowRoleEditor(false);
  }

  function openRoleEditor(role?: Role) {
    if (!role) { resetRoleForm(); setShowRoleEditor(true); return; }
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRoleDescription(role.description ?? "");
    setRoleInheritsFrom(role.inheritsFrom ?? "");
    setRolePermissions(role.permissions);
    setRoleFormError("");
    setRoleFormMessage("");
    setShowRoleEditor(true);
  }

  function getRolePermissionSummary(role: Role) {
    const docs   = Object.values(role.permissions.documents).filter(Boolean).length;
    const users  = Object.values(role.permissions.users).filter(Boolean).length;
    const system = Object.values(role.permissions.system).filter(Boolean).length;
    return `${docs}/5 docs · ${users}/4 users · ${system}/2 system`;
  }

  function handleSaveRole() {
    if (!user) return;
    if (!roleName.trim()) { setRoleFormError("Role name is required."); return; }

    const role: Role = {
      id:          editingRoleId ?? `role_${Date.now()}`,
      name:        roleName.trim(),
      description: roleDescription.trim() || undefined,
      userType:    selectedRole?.userType ?? "employee",
      permissions: {
        ...rolePermissions,
        system: {
          adminPanelAccess: isAdmin(user) ? rolePermissions.system.adminPanelAccess : false,
          roleManagement:   rolePermissions.system.roleManagement,
        },
      },
      inheritsFrom: roleInheritsFrom || undefined,
      createdById:  editingRoleId ? selectedRole?.createdById ?? user.id : user.id,
      group:        selectedRole?.group ?? undefined,
    };
    if (!isAdmin(user)) {
      role.permissions.system.adminPanelAccess = false;
      if (!editingRoleId) role.permissions.system.roleManagement = false;
    }
    saveRole(role);
    setRoles(getRoles());
    setRoleFormMessage(editingRoleId ? "Role updated." : "Role created.");
    if (!editingRoleId) setEditingRoleId(role.id);
  }

  function handleDeleteCurrentRole() {
    if (!user || !selectedRole || !canDeleteRole(user, selectedRole)) return;
    deleteRole(selectedRole.id);
    setRoles(getRoles());
    resetRoleForm();
  }

  async function handleUpload() {
    if (!user || !uploadFile) { setUploadError(uploadFile ? "User session unavailable." : "Select a file first."); return; }
    if (!uploadTitle.trim())       { setUploadError("Document title is required."); return; }
    if (selectedRoleIds.length === 0) { setUploadError("Select at least one allowed role."); return; }

    setUploadStatus("Uploading…");
    setUploadError("");

    try {
      const departmentId = user.roleId === "role_cofounder" ? uploadDepartment : (user.departmentId ?? "operations");
      await createDocumentUploadFromFile(uploadFile, {
        title:            uploadTitle.trim(),
        description:      "",
        departmentId,
        authorId:         user.id,
        tag:              uploadCategory,
        allowedRoleIds:   selectedRoleIds,
        allowedUserTypes: uploadUserTypes,
        assignedUserIds:  user.roleId === "role_cofounder" ? selectedUserIds : undefined,
        visibilityScope:  uploadVisibility,
        allowedDepartments: uploadDepartmentIds.length > 0 ? uploadDepartmentIds : [departmentId],
        allowedTeamIds:   uploadTeamIds,
      });
      setUploadStatus(`"${uploadTitle.trim()}" added to the library.`);
      setUploadTitle("");
      setUploadFile(null);
      setSelectedRoleIds([]);
      setSelectedUserIds([]);
      setUploadDepartmentIds([]);
      setUploadTeamIds([]);
      setUploadUserTypes(["employee"]);
      setUploadVisibility("department");
    } catch {
      setUploadError("Upload failed. Please try again.");
      setUploadStatus("");
    }
  }

  function handleCreateResource() {
    if (!user || !resourceCanCreate) { setResourceMessage("No permission to add resources."); return; }
    if (!resourceTitle.trim() || !resourceHref.trim()) { setResourceMessage("Title and link are required."); return; }
    createResource({
      title:              resourceTitle.trim(),
      description:        "Added via Operon.",
      category:           resourceCategory === "all" ? "forms" : resourceCategory,
      href:               resourceHref.trim(),
      external:           true,
      icon:               "Link",
      allowedRoleIds:     resourceAllowedRoleIds,
      allowedUserTypes:   resourceAllowedUserTypes,
      allowedDepartments: resourceAllowedDepartments.length > 0 ? resourceAllowedDepartments : undefined,
      allowedTeamIds:     resourceAllowedTeamIds,
      visibilityScope:    resourceVisibility,
      createdById:        user.id,
    });
    setResourceMessage(`"${resourceTitle.trim()}" added.`);
    setResourceTitle("");
    setResourceHref("");
    setResourceAllowedDepartments([]);
    setResourceAllowedTeamIds([]);
    setResourceVisibility("private");
  }

  function handleCreateUser() {
    if (!user) return;
    setTeamError(""); setTeamStatus("");
    try {
      createUser({ creator: user, name: newName, email: newEmail, roleId: newRoleId, departmentId: newDepartmentId, supervisorId: newSupervisorId, assignedDocumentIds, status: newStatus });
      setTeamStatus("User created.");
      setNewName(""); setNewEmail(""); setAssignedDocumentIds([]);
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "Unable to create user.");
    }
  }

  // ─── Loading screen ───────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.card, padding: "14px 24px", fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", color: "var(--op-text-3)" }}>
          Preparing workspace…
        </div>
      </div>
    );
  }

  if (!user) return <MVPAccessMode />;

  // ─── Authenticated shell ───────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100dvh" }}>

      {/* Mobile nav overlay */}
      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex" }}
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsMobileNavOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }}
            />
            <div style={{ position: "relative", left: "16px", top: "16px", height: "calc(100dvh - 32px)", width: "240px" }}>
              <Sidebar
                user={user} roleLabel={roleLabel}
                sections={visibleSections} selectedSection={selectedSection}
                onClose={() => setIsMobileNavOpen(false)}
                onSelect={(s) => { setSelectedSection(s as Section); if (s !== "docs") setSelectedDocId(null); }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ⌘K search palette */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(16px)", padding: "80px 16px 0" }}
          >
            <button type="button" aria-label="Close search" onClick={() => setIsSearchOpen(false)} style={{ position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "pointer" }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -16 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -16 }}
              transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
              style={{ position: "relative", width: "100%", maxWidth: "600px", ...S.card, padding: "20px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-12)", color: "var(--op-text-3)" }}>⌘K</span>
                <input
                  ref={searchInputRef}
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search documents and resources…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-body)", fontSize: "var(--text-16)", color: "var(--op-text)" }}
                />
              </div>
              <div style={{ borderTop: "1px solid var(--op-border)", paddingTop: "12px", maxHeight: "60vh", overflowY: "auto" }}>
                {globalSearchResults.docs.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px 8px" }}>Documents</div>
                    {globalSearchResults.docs.map((doc) => (
                      <button key={doc.id} type="button" onClick={() => { showDoc(doc.id); setIsSearchOpen(false); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--r-md)", border: "none", background: "transparent", cursor: "pointer", transition: "background 120ms" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--op-surface-2)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 500, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                        {doc.description && <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.description}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {globalSearchResults.resources.length > 0 && (
                  <div>
                    {globalSearchResults.docs.length > 0 && <div style={{ borderTop: "1px solid var(--op-border)", margin: "8px 0" }} />}
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "4px 8px 8px" }}>Resources</div>
                    {globalSearchResults.resources.map((r) => (
                      <a key={r.id} href={r.href} target="_blank" rel="noopener noreferrer" onClick={() => setIsSearchOpen(false)}
                        style={{ display: "block", padding: "10px 12px", borderRadius: "var(--r-md)", textDecoration: "none", transition: "background 120ms" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--op-surface-2)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                      >
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 500, color: "var(--op-text)" }}>{r.title}</div>
                      </a>
                    ))}
                  </div>
                )}
                {globalSearchResults.docs.length === 0 && globalSearchResults.resources.length === 0 && (
                  <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "var(--font-body)", fontSize: "var(--text-14)", color: "var(--op-text-3)" }}>No results</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layout grid */}
      <div style={{ maxWidth: "1400px", margin: "0 auto", display: "grid", gridTemplateColumns: "260px minmax(0,1fr)", gap: "24px", padding: "16px 32px" }} className="page-grid">

        {/* Sidebar — desktop only */}
        <div className="sidebar-col">
          <Sidebar
            user={user} roleLabel={roleLabel}
            sections={visibleSections} selectedSection={selectedSection}
            onSelect={(s) => { setSelectedSection(s as Section); if (s !== "docs") setSelectedDocId(null); }}
          />
        </div>

        {/* Main */}
        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Top bar */}
          <motion.header
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "10px 18px", ...S.card }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {/* Mobile menu — hidden on desktop */}
              <button
                type="button" onClick={() => setIsMobileNavOpen(true)} className="mobile-only"
                style={{ display: "none", alignItems: "center", justifyContent: "center", height: "36px", width: "36px", borderRadius: "var(--r-md)", border: "1px solid var(--op-border)", background: "var(--op-surface-2)", cursor: "pointer", color: "var(--op-text-2)" }}
                aria-label="Open navigation"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", letterSpacing: "-0.01em", margin: 0 }}>
                {SECTION_NAMES[selectedSection] ?? "Workspace"}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Search button — hidden on mobile */}
              <button
                type="button" onClick={() => setIsSearchOpen(true)} className="search-btn"
                style={{ display: "none", alignItems: "center", gap: "8px", height: "36px", borderRadius: "var(--r-full)", border: "1px solid var(--op-border)", background: "var(--op-surface-2)", padding: "0 14px", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)" }}
              >
                <span>Search…</span>
                <span style={{ padding: "1px 5px", borderRadius: "var(--r-sm)", background: "var(--op-surface-3)", border: "1px solid var(--op-border)", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--op-text-3)" }}>⌘K</span>
              </button>
              <button type="button" onClick={handleLogout}
                style={{ height: "34px", borderRadius: "var(--r-full)", background: "#fff", border: "none", padding: "0 16px", fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, color: "#0A0A0A", cursor: "pointer" }}
              >
                Sign out
              </button>
            </div>
          </motion.header>

          <style>{`
            @media (max-width: 1279px) { .sidebar-col { display: none; } .page-grid { grid-template-columns: minmax(0,1fr) !important; } }
            @media (max-width: 767px)  { .mobile-only { display: flex !important; } }
            @media (min-width: 768px)  { .search-btn  { display: flex !important; } }
          `}</style>

          {/* ── Sections ──────────────────────────────────────────────────────── */}

          <div style={{ flex: 1 }}>

            {/* Home */}
            {selectedSection === "home" && (
              <HomePanel
                user={user} providerLoading={providerLoading} driveDiagnostics={driveDiagnostics}
                displayQuickActions={displayQuickActions} accessibleDocs={accessibleDocs} pinnedDocs={pinnedDocs}
                onActionSelect={(s) => { setSelectedSection(s as Section); if (s !== "docs") setSelectedDocId(null); }}
                onShowDoc={showDoc}
              />
            )}

            {/* Library */}
            {selectedSection === "library" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ display: "grid", gridTemplateColumns: userCanUpload ? "minmax(0,1fr) 320px" : "minmax(0,1fr)", gap: "20px", alignItems: "start" }}
                className="library-grid"
              >
                {/* Doc list */}
                <div style={{ ...S.card, padding: "24px" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Documents</div>
                      <h2 style={S.sectionTitle}>Library</h2>
                    </div>
                    <div style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "var(--r-full)", border: "1px solid var(--op-border)", background: "var(--op-surface-2)" }}>
                      {(["grid", "list"] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setDocumentView(v)}
                          style={{ height: "28px", padding: "0 14px", borderRadius: "var(--r-full)", border: "none", background: documentView === v ? "rgba(255,255,255,0.1)" : "transparent", fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 500, color: documentView === v ? "var(--op-text)" : "var(--op-text-3)", cursor: "pointer", textTransform: "capitalize" }}
                        >{v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Filters */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "16px" }}>
                    <input value={librarySearch} onChange={(e) => { setLibrarySearch(e.target.value); setGlobalSearch(e.target.value); }} placeholder="Search documents…" style={{ ...S.input }} />
                    <select value={libraryDept} onChange={(e) => setLibraryDept(e.target.value as "all" | DeptId)} style={{ ...S.select, width: "160px" }}>
                      {getDepartmentFilters().map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>

                  {/* Category pills */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" }}>
                    {LIBRARY_CATEGORIES.map((cat) => (
                      <button key={cat.id} type="button" onClick={() => setLibraryCategory(cat.id)} style={S.pill(libraryCategory === cat.id)}>{cat.label}</button>
                    ))}
                  </div>

                  {/* Pinned */}
                  {pinnedDocs.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }} className="pinned-grid">
                      {pinnedDocs.map((doc) => (
                        <button key={doc.id} type="button" onClick={() => showDoc(doc.id)}
                          style={{ ...S.cardInner, padding: "14px", textAlign: "left", cursor: "pointer", border: "1px solid var(--op-border)", transition: "border-color 150ms" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border-hover)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border)"; }}
                        >
                          <div style={{ height: "48px", borderRadius: "var(--r-sm)", background: "rgba(255,255,255,0.04)", marginBottom: "10px" }} />
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-11)", color: "var(--op-text-3)", marginTop: "3px" }}>Pinned</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Doc grid / list */}
                  {providerLoading && libraryDocs.length === 0 ? (
                    <div style={S.emptyState}>Preparing documents…</div>
                  ) : libraryDocs.length > 0 ? (
                    <div style={{ display: documentView === "grid" ? "grid" : "flex", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", flexDirection: "column", gap: "10px" }} className="doc-grid">
                      {libraryDocs.map((doc) => (
                        <button key={doc.id} type="button" onClick={() => showDoc(doc.id)}
                          style={{ ...S.cardInner, padding: "16px", textAlign: "left", cursor: "pointer", border: "1px solid var(--op-border)", display: "flex", flexDirection: documentView === "grid" ? "column" : "row", gap: "12px", alignItems: documentView === "grid" ? "flex-start" : "center", transition: "border-color 150ms" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border-hover)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border)"; }}
                        >
                          {documentView === "grid" && <div style={{ height: "80px", width: "100%", borderRadius: "var(--r-sm)", background: "rgba(255,255,255,0.04)" }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                            <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-2)", marginTop: "4px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{doc.description}</div>
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <span style={S.badge}>{TAG_LABELS[doc.tag]}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={S.emptyState}>No documents match your filters.</div>
                  )}
                </div>

                {/* Upload panel — only if user can upload */}
                {userCanUpload && (
                  <aside style={{ ...S.card, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Upload</div>
                      <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", margin: 0 }}>Add document</h3>
                    </div>

                    <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Document title" style={S.input} />

                    <div style={{ display: "grid", gridTemplateColumns: user.roleId === "role_cofounder" ? "1fr 1fr" : "1fr", gap: "10px" }}>
                      <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as DocTag)} style={S.select}>
                        {Object.entries(TAG_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                      {user.roleId === "role_cofounder" && (
                        <select value={uploadDepartment} onChange={(e) => setUploadDepartment(e.target.value as DeptId)} style={S.select}>
                          {getDepartmentFilters().filter((f) => f.id !== "all").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                      )}
                    </div>

                    <select value={uploadVisibility} onChange={(e) => setUploadVisibility(e.target.value as VisibilityScope)} style={S.select}>
                      <option value="department">Department</option>
                      <option value="private">Private</option>
                      <option value="global">Global</option>
                    </select>

                    {/* Allowed roles */}
                    <div>
                      <div style={S.label}>Allowed roles</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {uploadRoles.map((role) => (
                          <button key={role.id} type="button"
                            onClick={() => setSelectedRoleIds((c) => c.includes(role.id) ? c.filter((id) => id !== role.id) : [...c, role.id])}
                            style={S.toggleBtn(selectedRoleIds.includes(role.id))}
                          >
                            <span>{role.name}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: selectedRoleIds.includes(role.id) ? "var(--op-accent)" : "var(--op-text-3)" }}>
                              {selectedRoleIds.includes(role.id) ? "✓" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* User types */}
                    <div>
                      <div style={S.label}>User types</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        {(["employee", "creator"] as UserType[]).map((type) => (
                          <button key={type} type="button"
                            onClick={() => setUploadUserTypes((c) => c.includes(type) ? c.filter((t) => t !== type) : [...c, type])}
                            style={{ ...S.toggleBtn(uploadUserTypes.includes(type)), justifyContent: "center" }}
                          >
                            {type === "employee" ? "Employees" : "Creators"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* File picker */}
                    <div>
                      <input
                        ref={uploadFileInputRef}
                        type="file"
                        accept=".docx,.pdf,.md,.markdown,.txt"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setUploadFile(file);
                          setUploadError("");
                          setUploadStatus(file ? `Selected: ${file.name}` : "");
                          e.currentTarget.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => uploadFileInputRef.current?.click()}
                        style={{
                          width:        "100%",
                          padding:      "12px 14px",
                          borderRadius: "var(--r-md)",
                          border:       `1px dashed ${uploadFile ? "var(--op-border-hover)" : "var(--op-border)"}`,
                          background:   uploadFile ? "rgba(255,255,255,0.03)" : "transparent",
                          fontFamily:   "var(--font-body)",
                          fontSize:     "var(--text-13)",
                          color:        uploadFile ? "var(--op-text-2)" : "var(--op-text-3)",
                          cursor:       "pointer",
                          textAlign:    "left",
                          transition:   "border-color 150ms",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {uploadFile ? uploadFile.name : "Choose file (PDF, Word, MD, TXT)"}
                      </button>
                    </div>

                    {/* Submit */}
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={!uploadFile || !uploadTitle.trim()}
                      style={{
                        ...S.btnPrimary,
                        width:   "100%",
                        height:  "40px",
                        justifyContent: "center",
                        opacity: (!uploadFile || !uploadTitle.trim()) ? 0.4 : 1,
                        cursor:  (!uploadFile || !uploadTitle.trim()) ? "not-allowed" : "pointer",
                      }}
                    >
                      Add to library
                    </button>

                    {uploadStatus && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", margin: 0 }}>{uploadStatus}</p>}
                    {uploadError  && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--color-error)", margin: 0 }}>{uploadError}</p>}
                  </aside>
                )}

                <style>{`@media (max-width: 1023px) { .library-grid { grid-template-columns: minmax(0,1fr) !important; } .pinned-grid { grid-template-columns: repeat(2,1fr) !important; } }`}</style>
              </motion.div>
            )}

            {/* Resources */}
            {selectedSection === "resources" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ display: "grid", gridTemplateColumns: resourceCanCreate ? "minmax(0,1fr) 300px" : "minmax(0,1fr)", gap: "20px", alignItems: "start" }}
                className="resources-grid"
              >
                <div style={{ ...S.card, padding: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                    <div>
                      <h2 style={S.sectionTitle}>Resources</h2>
                      <p style={S.sectionDesc}>Links, forms, and policy content for your role.</p>
                    </div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <input value={resourceQuery} onChange={(e) => setResourceQuery(e.target.value)} placeholder="Search resources…" style={{ ...S.input, width: "200px" }} />
                      <select value={resourceCategory} onChange={(e) => setResourceCategory(e.target.value as ResourceCategoryFilter)} style={{ ...S.select, width: "140px" }}>
                        {RESOURCE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {providerLoading && resourceItems.length === 0 ? (
                      <div style={S.emptyState}>Preparing resources…</div>
                    ) : resourceItems.length > 0 ? resourceItems.map((r) => (
                      <a key={r.id} href={r.href} target="_blank" rel="noopener noreferrer"
                        style={{ ...S.cardInner, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", textDecoration: "none", border: "1px solid var(--op-border)", transition: "border-color 150ms" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--op-border-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--op-border)"; }}
                      >
                        <div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{r.title}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-2)", marginTop: "3px" }}>{r.description}</div>
                        </div>
                        <span style={S.badge}>{r.category}</span>
                      </a>
                    )) : <div style={S.emptyState}>No resources match your filters.</div>}
                  </div>
                </div>

                {resourceCanCreate && (
                  <aside style={{ ...S.card, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", margin: 0 }}>Add resource</h3>
                    <input value={resourceTitle} onChange={(e) => setResourceTitle(e.target.value)} placeholder="Title" style={S.input} />
                    <input value={resourceHref} onChange={(e) => setResourceHref(e.target.value)} placeholder="URL" style={S.input} />
                    <div>
                      <div style={S.label}>Allowed roles</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                        {getRoles().map((role) => (
                          <button key={role.id} type="button" onClick={() => setResourceAllowedRoleIds((c) => c.includes(role.id) ? c.filter((id) => id !== role.id) : [...c, role.id])} style={S.toggleBtn(resourceAllowedRoleIds.includes(role.id))}>
                            <span>{role.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={S.label}>Visibility</div>
                      <select value={resourceVisibility} onChange={(e) => setResourceVisibility(e.target.value as VisibilityScope)} style={S.select}>
                        <option value="private">Private</option>
                        <option value="department">Department</option>
                        <option value="global">Global</option>
                      </select>
                    </div>
                    <button type="button" onClick={handleCreateResource}
                      disabled={!resourceTitle.trim() || !resourceHref.trim()}
                      style={{ ...S.btnPrimary, width: "100%", height: "38px", justifyContent: "center", opacity: (!resourceTitle.trim() || !resourceHref.trim()) ? 0.4 : 1, cursor: (!resourceTitle.trim() || !resourceHref.trim()) ? "not-allowed" : "pointer" }}
                    >Add resource</button>
                    {resourceMessage && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", margin: 0 }}>{resourceMessage}</p>}
                  </aside>
                )}
                <style>{`@media (max-width: 1023px) { .resources-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
              </motion.div>
            )}

            {/* Finance */}
            {selectedSection === "finance" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: "20px", alignItems: "start" }} className="finance-grid"
              >
                <div style={{ ...S.card, padding: "24px" }}>
                  <h2 style={S.sectionTitle}>Finance</h2>
                  <p style={S.sectionDesc}>Policy links, expense references, and finance tools.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "20px" }} className="finance-items">
                    {FINANCE_MENU_ITEMS.map((item) => (
                      <button key={item.id} type="button"
                        style={{ ...S.cardInner, padding: "16px", textAlign: "left", cursor: "pointer", border: "1px solid var(--op-border)", transition: "border-color 150ms" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border)"; }}
                      >
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{item.label}</div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-2)", marginTop: "6px", lineHeight: 1.5 }}>{item.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <aside style={{ ...S.card, padding: "20px" }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "12px" }}>Finance</div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-2)", lineHeight: 1.6 }}>This area is restricted to finance teams with role-based controls.</p>
                </aside>
                <style>{`@media (max-width: 1023px) { .finance-grid { grid-template-columns: minmax(0,1fr) !important; } .finance-items { grid-template-columns: 1fr !important; } }`}</style>
              </motion.div>
            )}

            {/* Activity */}
            {selectedSection === "activity" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ ...S.card, padding: "24px" }}
              >
                <h2 style={S.sectionTitle}>Activity</h2>
                <p style={S.sectionDesc}>Events shown only when your role has visibility permission.</p>
                <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {activityCanView ? (
                    activityFeed.length > 0 ? activityFeed.map((event) => {
                      const actor     = getUserById(event.userId);
                      const itemTitle = event.targetType === "document"
                        ? getAccessibleDocument(user, event.targetId ?? "")?.title
                        : event.targetType === "resource" ? getResourceById(event.targetId ?? "")?.title
                        : event.targetId && getUserById(event.targetId)?.name;
                      return (
                        <div key={event.id} style={{ ...S.cardInner, padding: "14px 16px" }}>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>{event.action.replace(/_/g, " ")}</div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{itemTitle ?? "Unknown item"}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "4px" }}>{actor?.name ?? "Unknown"} · {new Date(event.timestamp).toLocaleString()}</div>
                        </div>
                      );
                    }) : <div style={S.emptyState}>No recent activity.</div>
                  ) : <div style={{ ...S.cardInner, padding: "20px", fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)" }}>Activity is restricted for your access level.</div>}
                </div>
              </motion.div>
            )}

            {/* Roles */}
            {selectedSection === "roles" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ display: "grid", gridTemplateColumns: showRoleEditor ? "minmax(0,1fr) 320px" : "minmax(0,1fr)", gap: "20px", alignItems: "start" }} className="roles-grid"
              >
                {/* Role list */}
                <div style={{ ...S.card, padding: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "20px" }}>
                    <div>
                      <h2 style={S.sectionTitle}>Role Manager</h2>
                      <p style={S.sectionDesc}>Manage role definitions and permission mappings.</p>
                    </div>
                    <button type="button" onClick={() => openRoleEditor()} style={S.btnPrimary}>
                      Create role
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {roles.length > 0 ? roles.map((role) => (
                      <button key={role.id} type="button" onClick={() => openRoleEditor(role)}
                        style={{ ...S.cardInner, padding: "14px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: `1px solid ${editingRoleId === role.id ? "var(--op-border-hover)" : "var(--op-border)"}`, transition: "border-color 150ms" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border-hover)"; }}
                        onMouseLeave={(e) => { if (editingRoleId !== role.id) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border)"; }}
                      >
                        <div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{role.name}</div>
                          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "3px" }}>{getRolePermissionSummary(role)}</div>
                        </div>
                        <span style={S.badge}>{getAllUsers().filter((m) => m.roleId === role.id).length} users</span>
                      </button>
                    )) : <div style={S.emptyState}>No roles defined.</div>}
                  </div>
                </div>

                {/* Role editor panel — only when showRoleEditor is true */}
                <AnimatePresence>
                  {showRoleEditor && (
                    <motion.aside
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
                      style={{ ...S.card, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", margin: 0 }}>
                          {selectedRole ? "Edit role" : "New role"}
                        </h3>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {selectedRole && user && canDeleteRole(user, selectedRole) && (
                            <button type="button" onClick={handleDeleteCurrentRole}
                              style={{ ...S.btnGhost, borderColor: "var(--color-error)", color: "var(--color-error)" }}
                            >Delete</button>
                          )}
                          <button type="button" onClick={resetRoleForm} style={S.btnGhost} aria-label="Close editor">✕</button>
                        </div>
                      </div>

                      <input value={roleName} onChange={(e) => setRoleName(e.target.value)} disabled={!canEditRoleForm} placeholder="Role name" style={{ ...S.input, opacity: canEditRoleForm ? 1 : 0.5 }} />
                      <input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} disabled={!canEditRoleForm} placeholder="Description" style={{ ...S.input, opacity: canEditRoleForm ? 1 : 0.5 }} />
                      <select value={roleInheritsFrom} onChange={(e) => setRoleInheritsFrom(e.target.value)} disabled={!canEditRoleForm} style={{ ...S.select, opacity: canEditRoleForm ? 1 : 0.5 }}>
                        <option value="">No inheritance</option>
                        {roles.filter((r) => r.id !== selectedRole?.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>

                      {/* Documents */}
                      <div style={{ ...S.cardInner, padding: "14px" }}>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 600, color: "var(--op-text-2)", marginBottom: "10px" }}>Documents</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(["view","create","edit","delete","upload"] as const).map((key) => (
                            <button key={key} type="button" disabled={!canEditRoleForm}
                              onClick={() => canEditRoleForm && setRolePermissions((p) => ({ ...p, documents: { ...p.documents, [key]: !p.documents[key] } }))}
                              style={S.toggleBtn(rolePermissions.documents[key])}
                            >
                              <span style={{ textTransform: "capitalize" }}>{key}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: rolePermissions.documents[key] ? "var(--op-accent)" : "var(--op-text-3)" }}>{rolePermissions.documents[key] ? "On" : "Off"}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Users */}
                      <div style={{ ...S.cardInner, padding: "14px" }}>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 600, color: "var(--op-text-2)", marginBottom: "10px" }}>Users</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(["create","edit","delete","assignRole"] as const).map((key) => (
                            <button key={key} type="button" disabled={!canEditRoleForm}
                              onClick={() => canEditRoleForm && setRolePermissions((p) => ({ ...p, users: { ...p.users, [key]: !p.users[key] } }))}
                              style={S.toggleBtn(rolePermissions.users[key])}
                            >
                              <span style={{ textTransform: key === "assignRole" ? "none" : "capitalize" }}>{key === "assignRole" ? "Assign role" : key}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: rolePermissions.users[key] ? "var(--op-accent)" : "var(--op-text-3)" }}>{rolePermissions.users[key] ? "On" : "Off"}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* System */}
                      <div style={{ ...S.cardInner, padding: "14px" }}>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 600, color: "var(--op-text-2)", marginBottom: "10px" }}>System</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(["adminPanelAccess","roleManagement"] as const).map((key) => {
                            const locked = !canEditRoleForm || (!isAdmin(user) && key === "adminPanelAccess");
                            return (
                              <button key={key} type="button" disabled={locked}
                                onClick={() => !locked && setRolePermissions((p) => ({ ...p, system: { ...p.system, [key]: !p.system[key] } }))}
                                style={S.toggleBtn(rolePermissions.system[key])}
                              >
                                <span>{key === "adminPanelAccess" ? "Admin panel" : "Role manager"}</span>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: rolePermissions.system[key] ? "var(--op-accent)" : "var(--op-text-3)" }}>{rolePermissions.system[key] ? "On" : "Off"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {roleFormError   && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--color-error)", margin: 0 }}>{roleFormError}</p>}
                      {roleFormMessage && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", margin: 0 }}>{roleFormMessage}</p>}

                      <button type="button" onClick={handleSaveRole} disabled={!canEditRoleForm}
                        style={{ ...S.btnPrimary, width: "100%", height: "38px", justifyContent: "center", opacity: canEditRoleForm ? 1 : 0.4, cursor: canEditRoleForm ? "pointer" : "not-allowed" }}
                      >
                        {selectedRole ? "Save role" : "Create role"}
                      </button>
                    </motion.aside>
                  )}
                </AnimatePresence>
                <style>{`@media (max-width: 1023px) { .roles-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
              </motion.div>
            )}

            {/* Team */}
            {selectedSection === "team" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: "20px", alignItems: "start" }} className="team-grid"
              >
                <div style={{ ...S.card, padding: "24px" }}>
                  <h2 style={S.sectionTitle}>Team directory</h2>
                  <p style={S.sectionDesc}>Manage user access and role assignments.</p>
                  {userCanManage ? (
                    <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      {getAllUsers().map((member) => (
                        <div key={member.id} style={{ ...S.cardInner, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{member.name}</div>
                            <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>{member.email}</div>
                          </div>
                          <span style={S.badge}>{getRoleLabel(member.roleId)}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ marginTop: "20px", ...S.emptyState }}>Team management is unavailable for your role.</div>}
                </div>

                {userCanManage && (
                  <aside style={{ ...S.card, padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", margin: 0 }}>Create user</h3>
                    <input value={newName}  onChange={(e) => setNewName(e.target.value)}  placeholder="Full name" style={S.input} />
                    <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email"     style={S.input} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <select value={newRoleId}       onChange={(e) => setNewRoleId(e.target.value as RoleId)}       style={S.select}>{creatableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                      <select value={newDepartmentId} onChange={(e) => setNewDepartmentId(e.target.value as DeptId)} style={S.select}>
                        {getDepartmentFilters().filter((f) => f.id !== "all" && assignableDepartments.includes(f.id as DeptId)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                    <select value={newSupervisorId} onChange={(e) => setNewSupervisorId(e.target.value)} style={S.select}>
                      <option value="">No supervisor</option>
                      {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as User["status"])} style={S.select}>
                      <option value="active">Active</option>
                      <option value="invited">Invited</option>
                      <option value="disabled">Disabled</option>
                    </select>
                    <button type="button" onClick={handleCreateUser}
                      disabled={!newName.trim() || !newEmail.trim()}
                      style={{ ...S.btnPrimary, width: "100%", height: "38px", justifyContent: "center", opacity: (!newName.trim() || !newEmail.trim()) ? 0.4 : 1, cursor: (!newName.trim() || !newEmail.trim()) ? "not-allowed" : "pointer" }}
                    >Create user</button>
                    {teamStatus && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", margin: 0 }}>{teamStatus}</p>}
                    {teamError  && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--color-error)", margin: 0 }}>{teamError}</p>}
                  </aside>
                )}
                <style>{`@media (max-width: 1023px) { .team-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
              </motion.div>
            )}

            {/* Document detail */}
            {selectedSection === "docs" && selectedDoc && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Document</div>
                    <h2 style={{ ...S.sectionTitle, fontSize: "var(--text-30)" }}>{selectedDoc.title}</h2>
                    <p style={S.sectionDesc}>{selectedDoc.description}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedSection("library")} style={S.btnGhost}>← Library</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) 280px", gap: "20px", alignItems: "start" }} className="doc-detail-grid">
                  <div style={{ ...S.card, padding: "24px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
                      {selectedDoc.source === "google_drive" && <span style={{ ...S.badge, color: "#60a5fa", borderColor: "rgba(96,165,250,0.3)" }}>Google Drive</span>}
                      <span style={S.badge}>{TAG_LABELS[selectedDoc.tag]}</span>
                      <span style={S.badge}>{selectedDoc.dept}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      {selectedDoc.blocks.map((block, i) => renderBlock(block as Parameters<typeof renderBlock>[0], i))}
                    </div>
                  </div>
                  <aside style={{ ...S.card, padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Details</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {[["Author", selectedDoc.author], ["Updated", selectedDoc.updatedAt], ["Version", selectedDoc.version]].map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", color: "var(--op-text-3)" }}>{k}</span>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-2)" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {pinnedDocs.length > 0 && (
                      <div>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 600, color: "var(--op-text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Pinned</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {pinnedDocs.map((doc) => (
                            <button key={doc.id} type="button" onClick={() => showDoc(doc.id)}
                              style={{ ...S.cardInner, padding: "10px 12px", textAlign: "left", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", color: "var(--op-text-2)", border: "1px solid var(--op-border)", transition: "border-color 150ms" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border-hover)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--op-border)"; }}
                            >{doc.title}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </aside>
                </div>
                <style>{`@media (max-width: 1023px) { .doc-detail-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
              </motion.div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}