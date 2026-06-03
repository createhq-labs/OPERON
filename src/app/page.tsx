"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { DeptId, DocTag, Document, DriveParsedDocument, ResourceCategory, Role, RoleId, User, UserType, VisibilityScope } from "@/core/operon";
import { getProviderHealth, setDataProviderMode, subscribeToDataUpdates, onSupabaseHydrated } from "@/services/api";
import { connectDrive, attachDriveDocument, attachDriveFolder, getDriveDiagnostics, type DriveDiagnostics } from "@/services/drive";
import { renderBlock } from "@/renderers";
import { useSession } from "@/auth/useSession";
import { ENABLE_GOOGLE_DRIVE, ENABLE_DRIVE_ATTACHMENTS, ENABLE_DEV_AUTH, ENABLE_GOOGLE_SIGN_IN } from "@/config/featureFlags";
import { SectionNavigation } from "@/features/navigation/SectionNavigation";
import { SignInPanel } from "@/features/auth/SignInPanel";
import { HomePanel } from "@/features/dashboard/HomePanel";
import {
  canAddDocuments,
  isAdmin,
  saveRole,
  canDeleteRole,
  canEditRole,
  canManageResources,
  canManageRoles,
  canManageUsers,
  canPublishGlobally,
  canViewActivity,
  canViewResources,
  createDocumentUploadFromFile,
  createDriveDocumentReference,
  createResource,
  createUser,
  deleteRole,
  getAccessibleDocument,
  getAccessibleDocuments,
  getAccessibleDriveDocuments,
  getActivityFeed,
  getAllUsers,
  getCreatableRoles,
  getDepartmentFilters,
  getPinnedDocuments,
  getQuickActions,
  getResourceById,
  getRoleLabel,
  getRoles,
  getSignInRoleOptions,
  getSupervisors,
  getTeams,
  getUserById,
  getUserByRoleId,
  getAssignableDepartments,
  getDocumentEntity,
  searchDocuments,
  searchDriveDocuments,
  searchResources,
} from "@/core/operon";

const SECTION_NAMES = {
  signin: "Sign in",
  home: "Home",
  library: "Document Library",
  resources: "Resources",
  activity: "Activity",
  finance: "Finance",
  team: "Team",
  roles: "Roles",
  docs: "Document",
} as const;

const TAG_LABELS: Record<DocTag, string> = {
  sop: "SOP",
  onboarding: "Onboarding",
  brand: "Brand",
  creator: "Creator",
  ops: "Operations",
  hr: "HR",
  internal: "Internal",
};

const RESOURCE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "forms", label: "Forms" },
  { id: "policies", label: "Policies" },
  { id: "team", label: "Team" },
  { id: "training", label: "Training" },
] as const;

const FINANCE_MENU_ITEMS = [
  { id: "notices", label: "Notices", description: "Publish finance alerts, policy updates, and operational announcements." },
  { id: "reimbursements", label: "Reimbursements", description: "Manage expense requests and reimbursement workflows." },
  { id: "expense_forms", label: "Expense Forms", description: "Access templates for cost submissions and approvals." },
  { id: "invoices", label: "Invoices", description: "Review invoice tracking, status, and payment schedules." },
  { id: "policies", label: "Policies", description: "Share finance policies, controls, and audit guidelines." },
  { id: "resources", label: "Resources", description: "Link to finance references, processes, and external guides." },
] as const;

type Section = keyof typeof SECTION_NAMES;

type ResourceCategoryFilter = ResourceCategory | "all";

export default function Page() {
  const { user, loaded, signIn, signOut, signInWithRole } = useSession();
  const [selectedSection, setSelectedSection] = useState<Section>("signin");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryDept, setLibraryDept] = useState<"all" | DeptId>("all");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<DocTag>("sop");
  const [uploadDepartment, setUploadDepartment] = useState<DeptId>("operations");
  const [uploadVisibility, setUploadVisibility] = useState<VisibilityScope>("department");
  const [uploadDepartmentIds, setUploadDepartmentIds] = useState<DeptId[]>([]);
  const [uploadTeamIds, setUploadTeamIds] = useState<string[]>([]);
  const [uploadUserTypes, setUploadUserTypes] = useState<UserType[]>(["employee"]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<RoleId[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceCategory, setResourceCategory] = useState<ResourceCategoryFilter>("all");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceHref, setResourceHref] = useState("");
  const [resourceAllowedRoleIds, setResourceAllowedRoleIds] = useState<RoleId[]>([
    "role_cofounder",
    "role_hr",
    "role_finance",
    "role_im_team_lead",
    "role_tm_team_lead",
  ]);
  const [resourceAllowedUserTypes, setResourceAllowedUserTypes] = useState<UserType[]>(["employee"]);
  const [resourceAllowedDepartments, setResourceAllowedDepartments] = useState<DeptId[]>([]);
  const [resourceAllowedTeamIds, setResourceAllowedTeamIds] = useState<string[]>([]);
  const [resourceVisibility, setResourceVisibility] = useState<VisibilityScope>("private");
  const [resourceMessage, setResourceMessage] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerReady, setProviderReady] = useState(false);
  const [providerHealth, setProviderHealth] = useState(getProviderHealth());
  const [driveDiagnostics, setDriveDiagnostics] = useState<DriveDiagnostics | null>(null);
  const [cachedQuickActions, setCachedQuickActions] = useState<Array<{ id: string; label: string; description: string; category?: string }>>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [driveConnectionStatus, setDriveConnectionStatus] = useState("");
  const [driveConnectionMessage, setDriveConnectionMessage] = useState("");
  const [driveUploadStatus, setDriveUploadStatus] = useState("");
  const [driveUploadError, setDriveUploadError] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRoleId, setNewRoleId] = useState<RoleId>("role_intern");
  const [newDepartmentId, setNewDepartmentId] = useState<DeptId>("im");
  const [newSupervisorId, setNewSupervisorId] = useState<string>("");
  const [newStatus, setNewStatus] = useState<User["status"]>("active");
  const [assignedDocumentIds, setAssignedDocumentIds] = useState<string[]>([]);
  const [teamStatus, setTeamStatus] = useState("");
  const [teamError, setTeamError] = useState("");
  const [roles, setRoles] = useState<Role[]>(getRoles());
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleInheritsFrom, setRoleInheritsFrom] = useState<string>("");
  const [rolePermissions, setRolePermissions] = useState<Role["permissions"]>({
    documents: { create: false, view: false, edit: false, delete: false, upload: false },
    users: { create: false, edit: false, delete: false, assignRole: false },
    system: { adminPanelAccess: false, roleManagement: false },
  });
  const [roleFormError, setRoleFormError] = useState("");
  const [roleFormMessage, setRoleFormMessage] = useState("");
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const driveEnabled = ENABLE_GOOGLE_DRIVE || ENABLE_DRIVE_ATTACHMENTS;
  const router = useRouter();

  useEffect(() => {
    if (user) {
      setSelectedSection((current) => (current === "signin" ? "home" : current));
    } else {
      setSelectedSection("signin");
      setSelectedDocId(null);
    }
  }, [user]);

  useEffect(() => {
    setProviderLoading(true);
    setDataProviderMode("supabase");
    setProviderHealth(getProviderHealth());

    const updateHealth = () => setProviderHealth(getProviderHealth());

    const unsubscribeChanges = subscribeToDataUpdates(() => {
      setDataVersion((current) => current + 1);
      updateHealth();
    });

    const loadDriveDiagnostics = async () => {
      try {
        const diagnostics = await getDriveDiagnostics();
        setDriveDiagnostics(diagnostics);
      } catch {
        setDriveDiagnostics(null);
      }
    };

    const unsubscribeHydration = onSupabaseHydrated(() => {
      setProviderReady(true);
      setProviderLoading(false);
      setDataVersion((current) => current + 1);
      updateHealth();
      loadDriveDiagnostics();
    });

    loadDriveDiagnostics();

    return () => {
      unsubscribeChanges();
      unsubscribeHydration();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const persisted = window.localStorage.getItem("operon-quick-actions");
      if (persisted) {
        setCachedQuickActions(JSON.parse(persisted));
      }
    } catch {
      // ignore invalid cache entries
    }
  }, []);

  useEffect(() => {
    if (user) {
      setSelectedSection((current) => (current === "signin" ? "home" : current));
    } else {
      setSelectedSection("signin");
      setSelectedDocId(null);
    }
  }, [user]);

  useEffect(() => {
    setRoles(getRoles());
  }, [user?.roleId]);

  const signInOptions = getSignInRoleOptions();
  const quickActions = useMemo(() => (user ? getQuickActions(user) : []), [user]);
  const displayQuickActions = quickActions.length > 0 ? quickActions : cachedQuickActions;

  useEffect(() => {
    if (!providerLoading && quickActions.length > 0) {
      try {
        window.localStorage.setItem("operon-quick-actions", JSON.stringify(quickActions));
        setCachedQuickActions(quickActions);
      } catch {
        // ignore local cache write failures
      }
    }
  }, [providerLoading, quickActions]);

  const pinnedDocs = useMemo(() => (user ? getPinnedDocuments(user, 3) : []), [user]);
  const accessibleDocs = useMemo(
    () => (user ? [...getAccessibleDocuments(user), ...getAccessibleDriveDocuments(user)] : []),
    [user]
  );
  const libraryDocs = useMemo(() => {
    if (!user) return [];
    return [...searchDocuments(user, librarySearch, libraryDept), ...searchDriveDocuments(user, librarySearch, libraryDept)];
  }, [user, librarySearch, libraryDept]);
  const resourceItems = useMemo(
    () => (user && canViewResources(user) ? searchResources(user, resourceQuery, resourceCategory === "all" ? undefined : resourceCategory) : []),
    [user, resourceQuery, resourceCategory]
  );
  const activityFeed = useMemo(() => (user ? getActivityFeed(user) : []), [user]);
  const creatableRoles = useMemo(() => (user ? getCreatableRoles(user) : []), [user]);
  const uploadRoles = useMemo(() => (user ? getCreatableRoles(user) : []), [user]);
  const resourceCanCreate = user ? canManageResources(user) : false;
  const userCanManage = user ? canManageUsers(user) : false;
  const resourceCanView = user ? canViewResources(user) : false;
  const activityCanView = user ? canViewActivity(user) : false;
  const userCanUpload = user ? canAddDocuments(user) : false;
  const financeAccess = user ? canPublishGlobally(user) : false;
  const roleManagerAccess = user ? canManageRoles(user) : false;
  const visibleSections = useMemo(() => {
    if (!user) return ["signin"] as Section[];
    const sections: Section[] = ["home", "library"];
    if (resourceCanView) sections.push("resources");
    if (activityCanView) sections.push("activity");
    if (financeAccess) sections.push("finance");
    if (userCanManage) sections.push("team");
    if (roleManagerAccess) sections.push("roles");
    return sections;
  }, [user, resourceCanView, activityCanView, userCanManage, roleManagerAccess, financeAccess]);
  const [selectedDoc, setSelectedDoc] = useState<Document | DriveParsedDocument | null>(null);
  const availableUsers = useMemo(() => (user && isAdmin(user) ? getAllUsers() : []), [user]);

  useEffect(() => {
    if (!selectedDocId || !user) {
      setSelectedDoc(null);
      return;
    }

    const currentUser = user;
    const currentSelectedDocId = selectedDocId;

    async function loadEntity(userToLoad: User, docId: string) {
      const entity = await getDocumentEntity(userToLoad, docId);
      setSelectedDoc(entity ?? null);
    }

    void loadEntity(currentUser, currentSelectedDocId);
  }, [selectedDocId, user]);

  const supervisors = useMemo(() => (user ? getSupervisors(user) : []), [user]);
  const teams = useMemo(() => (user ? getTeams() : []), [user]);
  const selectedRole = editingRoleId ? roles.find((role) => role.id === editingRoleId) : null;
  const roleEditorCanEdit = user && selectedRole ? canEditRole(user, selectedRole) : false;
  const canEditRoleForm = user ? (!selectedRole || roleEditorCanEdit) : false;
  const assignableDepartments = useMemo(
    () => (user ? getAssignableDepartments(user, newRoleId) : []),
    [user, newRoleId]
  );

  function handleDevLogin(roleId: RoleId) {
    if (!ENABLE_DEV_AUTH) return;
    signInWithRole(roleId);
  }

  function resetAppState() {
    setSelectedSection("signin");
    setSelectedDocId(null);
    setLibrarySearch("");
    setLibraryDept("all");
    setUploadTitle("");
    setUploadCategory("sop");
    setUploadDepartment("operations");
    setUploadVisibility("department");
    setUploadDepartmentIds([]);
    setUploadTeamIds([]);
    setUploadUserTypes(["employee"]);
    setSelectedRoleIds([]);
    setSelectedUserIds([]);
    setUploadFile(null);
    setUploadStatus("");
    setUploadError("");
    setResourceQuery("");
    setResourceCategory("all");
    setResourceTitle("");
    setResourceHref("");
    setResourceAllowedRoleIds([
      "role_cofounder",
      "role_hr",
      "role_finance",
      "role_im_team_lead",
      "role_tm_team_lead",
    ]);
    setResourceAllowedUserTypes(["employee"]);
    setResourceAllowedDepartments([]);
    setResourceAllowedTeamIds([]);
    setResourceVisibility("private");
    setResourceMessage("");
    setDriveUrl("");
    setDriveUploadStatus("");
    setDriveUploadError("");
    setNewName("");
    setNewEmail("");
    setNewRoleId("role_intern");
    setNewDepartmentId("im");
    setNewSupervisorId("");
    setNewStatus("active");
    setAssignedDocumentIds([]);
    setTeamStatus("");
    setTeamError("");
  }

  async function handleLogout() {
    resetAppState();
    await signOut();
    router.replace("/login");
  }

  function resetRoleForm() {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setRoleInheritsFrom("");
    setRolePermissions({
      documents: { create: false, view: false, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
    });
    setRoleFormError("");
    setRoleFormMessage("");
    setShowRoleEditor(false);
  }

  function openRoleEditor(role?: Role) {
    if (!role) {
      resetRoleForm();
      setShowRoleEditor(true);
      return;
    }
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
    const docs = Object.values(role.permissions.documents).filter(Boolean).length;
    const users = Object.values(role.permissions.users).filter(Boolean).length;
    const system = Object.values(role.permissions.system).filter(Boolean).length;
    return `${docs}/5 docs • ${users}/4 users • ${system}/2 system`;
  }

  function handleSaveRole() {
    if (!user) return;
    if (!roleName.trim()) {
      setRoleFormError("Role name is required.");
      return;
    }

    const role: Role = {
      id: editingRoleId ?? `role_${Date.now()}`,
      name: roleName.trim(),
      description: roleDescription.trim() || undefined,
      userType: selectedRole?.userType ?? "employee",
      permissions: {
        ...rolePermissions,
        system: {
          adminPanelAccess: isAdmin(user) ? rolePermissions.system.adminPanelAccess : false,
          roleManagement: rolePermissions.system.roleManagement,
        },
      },
      inheritsFrom: roleInheritsFrom || undefined,
      createdById: editingRoleId ? selectedRole?.createdById ?? user.id : user.id,
      group: selectedRole?.group ?? undefined,
    };

    if (!isAdmin(user)) {
      role.permissions.system.adminPanelAccess = false;
      if (!editingRoleId) {
        role.permissions.system.roleManagement = false;
      }
    }

    saveRole(role);
    setRoles(getRoles());
    setRoleFormMessage(editingRoleId ? "Role updated." : "Role created.");
    if (!editingRoleId) {
      setEditingRoleId(role.id);
    }
  }

  function handleDeleteCurrentRole() {
    if (!user || !selectedRole || !canDeleteRole(user, selectedRole)) return;
    deleteRole(selectedRole.id);
    setRoles(getRoles());
    resetRoleForm();
  }

  function showDoc(docId: string) {
    setSelectedDocId(docId);
    setSelectedSection("docs");
  }

  async function handleConnectDrive() {
    setDriveConnectionStatus("Connecting Drive...");
    setDriveConnectionMessage("");
    const result = await connectDrive();
    setDriveConnectionStatus(result.connected ? "Drive connected" : "Drive unavailable");
    setDriveConnectionMessage(result.message);
  }

  function handleUploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadError("");
    setUploadStatus(file ? `Selected ${file.name}` : "");
  }

  async function handleUpload() {
    if (!user || !uploadFile) return;
    if (!uploadTitle.trim()) {
      setUploadError("Document title is required.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setUploadError("Select at least one allowed role.");
      return;
    }

    setUploadStatus("Parsing file...");
    setUploadError("");

    try {
      const departmentId = user.roleId === "role_cofounder" ? uploadDepartment : (user.departmentId ?? "operations");
      await createDocumentUploadFromFile(uploadFile, {
        title: uploadTitle.trim(),
        description: "",
        departmentId,
        authorId: user.id,
        tag: uploadCategory,
        allowedRoleIds: selectedRoleIds,
        allowedUserTypes: uploadUserTypes,
        assignedUserIds: user.roleId === "role_cofounder" ? selectedUserIds : undefined,
        visibilityScope: uploadVisibility,
        allowedDepartments: uploadDepartmentIds.length > 0 ? uploadDepartmentIds : [departmentId],
        allowedTeamIds: uploadTeamIds,
      });
      setUploadStatus(`Added '${uploadTitle.trim()}' to the library.`);
      setUploadTitle("");
      setUploadFile(null);
      setSelectedRoleIds([]);
      setSelectedUserIds([]);
      setUploadDepartmentIds([]);
      setUploadTeamIds([]);
      setUploadUserTypes(["employee"]);
      setUploadVisibility("department");
    } catch (error) {
      setUploadError("Unable to parse or upload the selected file.");
      setUploadStatus("");
    }
  }

  async function handleLinkDriveDocument() {
    if (!user || !driveUrl.trim()) return;
    if (!uploadTitle.trim()) {
      setDriveUploadError("Document title is required for Drive links.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setDriveUploadError("Select at least one allowed role.");
      return;
    }

    setDriveUploadStatus("Linking Google Drive document...");
    setDriveUploadError("");

    const match = driveUrl.match(/(?:\/d\/|document\/d\/|spreadsheets\/d\/|file\/d\/|folders\/)([a-zA-Z0-9_-]+)/);
    if (!match) {
      setDriveUploadError("Enter a valid Google Drive or Google Docs URL.");
      setDriveUploadStatus("");
      return;
    }

    const fileId = match[1];
    const isFolder = driveUrl.includes("folders/");
    const webViewLink = driveUrl;
    const mimeType = isFolder ? "application/vnd.google-apps.folder" : "application/vnd.google-apps.document";

    try {
      await attachDriveDocument({
        title: uploadTitle.trim(),
        description: "Drive document linked successfully.",
        departmentId: user.roleId === "role_cofounder" ? uploadDepartment : (user.departmentId ?? "operations"),
        authorId: user.id,
        tag: uploadCategory,
        driveUrl,
        driveFileId: fileId,
        googleDocId: fileId,
        webViewLink,
        fileMimeType: mimeType,
        ownerEmail: user.email,
        allowedRoleIds: selectedRoleIds,
        allowedUserTypes: uploadUserTypes,
        allowedDepartments: uploadDepartmentIds.length > 0 ? uploadDepartmentIds : undefined,
        allowedTeamIds: uploadTeamIds,
        visibilityScope: uploadVisibility,
        folderId: isFolder ? fileId : undefined,
      });
      setDriveUploadStatus("Drive document registered successfully.");
      setDriveUrl("");
      setUploadTitle("");
      setSelectedRoleIds([]);
      setSelectedUserIds([]);
      setUploadDepartmentIds([]);
      setUploadTeamIds([]);
      setUploadUserTypes(["employee"]);
      setUploadVisibility("department");
    } catch (error) {
      setDriveUploadError("Unable to link the Google Drive document.");
      setDriveUploadStatus("");
    }
  }

  async function handleAttachDriveFolder() {
    if (!user || !driveFolderUrl.trim()) return;
    if (!uploadTitle.trim()) {
      setDriveUploadError("Folder title is required.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setDriveUploadError("Select at least one allowed role.");
      return;
    }

    setDriveUploadStatus("Attaching Google Drive folder...");
    setDriveUploadError("");

    const match = driveFolderUrl.match(/(?:folders\/)([a-zA-Z0-9_-]+)/);
    if (!match) {
      setDriveUploadError("Enter a valid Google Drive folder URL.");
      setDriveUploadStatus("");
      return;
    }

    const folderId = match[1];

    try {
      await attachDriveFolder({
        title: uploadTitle.trim(),
        description: "Drive folder attached for future sync.",
        departmentId: user.roleId === "role_cofounder" ? uploadDepartment : (user.departmentId ?? "operations"),
        authorId: user.id,
        tag: uploadCategory,
        driveUrl: driveFolderUrl,
        driveFileId: folderId,
        googleDocId: folderId,
        webViewLink: driveFolderUrl,
        fileMimeType: "application/vnd.google-apps.folder",
        ownerEmail: user.email,
        allowedRoleIds: selectedRoleIds,
        allowedUserTypes: uploadUserTypes,
        allowedDepartments: uploadDepartmentIds.length > 0 ? uploadDepartmentIds : undefined,
        allowedTeamIds: uploadTeamIds,
        visibilityScope: uploadVisibility,
        folderId,
        folderName: "Google Drive folder",
      });
      setDriveUploadStatus("Drive folder attached successfully.");
      setDriveFolderUrl("");
    } catch (error) {
      setDriveUploadError("Unable to attach the Google Drive folder.");
      setDriveUploadStatus("");
    }
  }

  function handleCreateResource() {
    if (!user || !resourceCanCreate) {
      setResourceMessage("No permission to add resources.");
      return;
    }
    if (!resourceTitle.trim() || !resourceHref.trim()) {
      setResourceMessage("Title and link are required.");
      return;
    }
    createResource({
      title: resourceTitle.trim(),
      description: "Added via Operon.",
      category: resourceCategory === "all" ? "forms" : resourceCategory,
      href: resourceHref.trim(),
      external: true,
      icon: "Link",
      allowedRoleIds: resourceAllowedRoleIds,
      allowedUserTypes: resourceAllowedUserTypes,
      allowedDepartments: resourceAllowedDepartments.length > 0 ? resourceAllowedDepartments : undefined,
      allowedTeamIds: resourceAllowedTeamIds,
      visibilityScope: resourceVisibility,
      createdById: user.id,
    });
    setResourceMessage(`Added ${resourceTitle.trim()}.`);
    setResourceTitle("");
    setResourceHref("");
    setResourceAllowedDepartments([]);
    setResourceAllowedTeamIds([]);
    setResourceVisibility("private");
  }

  function handleCreateUser() {
    if (!user) return;
    setTeamError("");
    setTeamStatus("");
    try {
      createUser({
        creator: user,
        name: newName,
        email: newEmail,
        roleId: newRoleId,
        departmentId: newDepartmentId,
        supervisorId: newSupervisorId,
        assignedDocumentIds,
        status: newStatus,
      });
      setTeamStatus("New user created.");
      setNewName("");
      setNewEmail("");
      setAssignedDocumentIds([]);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Unable to create user.");
    }
  }

  const aboutUser = user ? `${user.name} • ${getRoleLabel(user.roleId)}` : "Sign in to continue";

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-content-primary">
        <div className="rounded-3xl border border-border-subtle bg-bg-secondary p-6 text-sm text-content-secondary">Loading secure session…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-col gap-4 rounded-[32px] border border-border bg-bg-secondary/80 p-6 shadow-soft backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-content-tertiary">Operon</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content-primary">Operational knowledge, simplified.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">A focused workspace for SOPs, document access, and role-based controls.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm text-content-primary">{aboutUser}</span>
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 items-center justify-center rounded-full border border-border bg-bg-secondary px-4 text-sm font-semibold text-content-primary transition hover:border-primary hover:bg-bg-secondary"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        {providerHealth.status !== "connected" ? (
          <div className="mb-6 operon-panel-strong p-4 text-sm text-content-secondary">
            <div>{providerHealth.status === "offline" || providerHealth.status === "fallback" || providerHealth.status === "degraded"
              ? "Running in local enterprise mode. Supabase is unavailable or degraded, so the app continues with local access and cached data."
              : providerHealth.message}</div>
            {providerHealth.diagnostics ? (
              <div className="mt-3 rounded-3xl border border-border-subtle bg-bg-primary/90 p-3 text-xs text-content-secondary">
                <div className="font-semibold text-content-primary">Supabase diagnostics</div>
                <div className="mt-2 grid gap-2 text-sm">
                  <div>Configured: {providerHealth.diagnostics.configured ? "yes" : "no"}</div>
                  <div>Resolved URL: {providerHealth.diagnostics.url || "<missing>"}</div>
                  <div>Provider mode: {providerHealth.providerMode}</div>
                  <div>Effective mode: {providerHealth.effectiveProviderMode}</div>
                  <div>Fallback mode: {providerHealth.fallbackMode ? "enabled" : "disabled"}</div>
                  <div>Auth mode: {providerHealth.diagnostics.authMode}</div>
                </div>
                {providerHealth.diagnostics.warnings?.length ? (
                  <div className="mt-3 rounded-3xl border border-border-subtle bg-bg-primary/95 p-3 text-xs text-content-secondary">
                    <div className="font-semibold text-content-primary">Warnings</div>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {providerHealth.diagnostics.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {user && (
          <SectionNavigation
            sections={visibleSections}
            selectedSection={selectedSection}
            labels={SECTION_NAMES}
            onSelect={(section) => {
              setSelectedSection(section as Section);
              if (section !== "docs") setSelectedDocId(null);
            }}
          />
        )}

        {providerHealth.status !== "connected" ? (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
            {providerHealth.message}
          </div>
        ) : null}

        <div className="space-y-5">
          {!user || selectedSection === "signin" ? (
            <SignInPanel
              signIn={signIn}
              enableDevAuth={ENABLE_DEV_AUTH}
              signInOptions={signInOptions}
              handleDevLogin={handleDevLogin}
              googleAuthConfigured={ENABLE_GOOGLE_SIGN_IN}
              googleAuthUnavailableMessage="Google Sign-In will be available after deployment."
            />
          ) : selectedSection === "home" ? (
            <HomePanel
              user={user}
              providerHealth={providerHealth}
              providerLoading={providerLoading}
              driveDiagnostics={driveDiagnostics}
              displayQuickActions={displayQuickActions}
              pinnedDocs={pinnedDocs}
              onActionSelect={(section) => {
                setSelectedSection(section as Section);
                if (section !== "docs") setSelectedDocId(null);
              }}
              onShowDoc={showDoc}
            />
          ) : selectedSection === "library" ? (
            <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="operon-panel p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-content-primary">Document Library</h2>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">Browse the SOPs and resources that are explicitly assigned to your access set.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={librarySearch}
                      onChange={(event) => setLibrarySearch(event.target.value)}
                      placeholder="Search documents"
                      className="operon-input w-full px-4 py-3 text-sm"
                    />
                    <select
                      value={libraryDept}
                      onChange={(event) => setLibraryDept(event.target.value as "all" | DeptId)}
                      className="operon-input w-full px-4 py-3 text-sm"
                    >
                      {getDepartmentFilters().map((filter) => (
                        <option key={filter.id} value={filter.id}>
                          {filter.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  {providerLoading && libraryDocs.length === 0 ? (
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-5 text-sm text-content-tertiary">Loading your document library from Supabase...</div>
                  ) : libraryDocs.length > 0 ? (
                    libraryDocs.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => showDoc(doc.id)}
                        className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-left text-sm text-content-primary transition hover:border-accent-soft"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">{doc.title}</div>
                            <p className="mt-1 text-sm text-content-secondary">{doc.description}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {doc.source === "google_drive" ? (
                              <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] text-blue-700">Google Drive</span>
                            ) : null}
                            <span className="rounded-full bg-bg-secondary px-3 py-1 text-[11px] text-content-tertiary">{TAG_LABELS[doc.tag]}</span>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-content-tertiary">No documents match your current filters.</p>
                  )}
                </div>
              </div>

              {userCanUpload && (
                <aside className="space-y-5">
                  <div className="operon-panel p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-content-tertiary">Upload SOP</p>
                        <h3 className="mt-2 text-lg font-semibold text-content-primary">Add a new document</h3>
                      </div>
                    </div>
                    <div className="mt-5 space-y-4">
                      <input
                        value={uploadTitle}
                        onChange={(event) => setUploadTitle(event.target.value)}
                        placeholder="Document title"
                        className="operon-input w-full px-4 py-3 text-sm"
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          value={uploadCategory}
                          onChange={(event) => setUploadCategory(event.target.value as DocTag)}
                          className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                        >
                          {Object.entries(TAG_LABELS).map(([id, label]) => (
                            <option key={id} value={id}>{label}</option>
                          ))}
                        </select>
                        {user.roleId === "role_cofounder" ? (
                          <select
                            value={uploadDepartment}
                            onChange={(event) => setUploadDepartment(event.target.value as DeptId)}
                            className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                          >
                            {getDepartmentFilters().filter((filter) => filter.id !== "all").map((filter) => (
                              <option key={filter.id} value={filter.id}>{filter.label}</option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      <div>
                        <div className="mb-2 text-sm text-content-tertiary">Allowed roles</div>
                        <div className="grid gap-2">
                          {uploadRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => setSelectedRoleIds((current) =>
                                current.includes(role.id)
                                  ? current.filter((id) => id !== role.id)
                                  : [...current, role.id]
                              )}
                              className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${selectedRoleIds.includes(role.id) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                            >
                              {role.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {user.roleId === "role_cofounder" ? (
                        <div>
                          <div className="mb-2 text-sm text-content-tertiary">Specific users</div>
                          <div className="grid max-h-40 gap-2 overflow-y-auto">
                            {availableUsers.map((candidate) => (
                              <label key={candidate.id} className={`flex items-center justify-between rounded-3xl border px-4 py-3 text-sm transition ${selectedUserIds.includes(candidate.id) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}>
                                <span>{candidate.name}</span>
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.includes(candidate.id)}
                                  onChange={() => setSelectedUserIds((current) =>
                                    current.includes(candidate.id)
                                      ? current.filter((id) => id !== candidate.id)
                                      : [...current, candidate.id]
                                  )}
                                  className="h-4 w-4 text-accent"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <div className="mb-2 text-sm text-content-tertiary">User types</div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(["employee", "creator"] as UserType[]).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setUploadUserTypes((current) =>
                                current.includes(type)
                                  ? current.filter((item) => item !== type)
                                  : [...current, type]
                              )}
                              className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${uploadUserTypes.includes(type) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                            >
                              {type === "employee" ? "Employees" : "Creators"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-sm text-content-tertiary">Visibility</div>
                        <select
                          value={uploadVisibility}
                          onChange={(event) => setUploadVisibility(event.target.value as VisibilityScope)}
                          className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                        >
                          <option value="department">Department</option>
                          <option value="private">Private</option>
                          <option value="global">Global</option>
                        </select>
                      </div>
                      <div>
                        <div className="mb-2 text-sm text-content-tertiary">Allowed departments</div>
                        <div className="grid gap-2">
                          {getDepartmentFilters().filter((filter) => filter.id !== "all").map((filter) => (
                            <button
                              key={filter.id}
                              type="button"
                              onClick={() => setUploadDepartmentIds((current) =>
                                current.includes(filter.id as DeptId)
                                  ? current.filter((id) => id !== filter.id)
                                  : [...current, filter.id as DeptId]
                              )}
                              className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${uploadDepartmentIds.includes(filter.id as DeptId) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-sm text-content-tertiary">Allowed teams</div>
                        <div className="grid gap-2">
                          {teams.map((team) => (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => setUploadTeamIds((current) =>
                                current.includes(team.id)
                                  ? current.filter((id) => id !== team.id)
                                  : [...current, team.id]
                              )}
                              className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${uploadTeamIds.includes(team.id) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                            >
                              {team.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="block rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-4 text-sm text-content-primary">
                        <span>{uploadFile ? uploadFile.name : "Attach document"}</span>
                        <input type="file" className="hidden" onChange={handleUploadFile} accept=".docx,.pdf,.md,.markdown,.txt" />
                      </label>
                      {driveEnabled ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={handleConnectDrive}
                              className="h-10 w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 text-sm font-semibold text-content-primary transition hover:bg-bg-secondary"
                            >
                              Connect Drive
                            </button>
                            <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-secondary">
                              {driveConnectionStatus || "Drive integration is not enabled."}
                              {driveConnectionMessage ? <div className="mt-2 text-xs text-content-tertiary">{driveConnectionMessage}</div> : null}
                            </div>
                          </div>
                          <input
                            value={driveUrl}
                            onChange={(event) => setDriveUrl(event.target.value)}
                            placeholder="Google Drive or Docs URL"
                            className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={handleLinkDriveDocument}
                            className="h-10 w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 text-sm font-semibold text-content-primary transition hover:bg-bg-secondary"
                          >
                            Link Drive document
                          </button>
                          <input
                            value={driveFolderUrl}
                            onChange={(event) => setDriveFolderUrl(event.target.value)}
                            placeholder="Google Drive folder URL"
                            className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={handleAttachDriveFolder}
                            className="h-10 w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 text-sm font-semibold text-content-primary transition hover:bg-bg-secondary"
                          >
                            Attach Drive folder
                          </button>
                          {driveUploadStatus && <p className="text-sm text-content-tertiary">{driveUploadStatus}</p>}
                          {driveUploadError && <p className="text-sm text-rose-500">{driveUploadError}</p>}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleUpload}
                        className="h-10 w-full rounded-3xl bg-accent/90 px-4 text-sm font-semibold text-white transition hover:bg-accent"
                      >
                        Add to library
                      </button>
                      {uploadStatus && <p className="text-sm text-content-tertiary">{uploadStatus}</p>}
                      {uploadError && <p className="text-sm text-rose-500">{uploadError}</p>}
                    </div>
                  </div>
                </aside>
              )}
            </section>
          ) : selectedSection === "resources" ? (
            <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-content-primary">Resources</h2>
                    <p className="mt-2 text-sm text-content-secondary">Browse links, forms, and policy content available to your role.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={resourceQuery}
                      onChange={(event) => setResourceQuery(event.target.value)}
                      placeholder="Search resources"
                      className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    />
                    <select
                      value={resourceCategory}
                      onChange={(event) => setResourceCategory(event.target.value as ResourceCategoryFilter)}
                      className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    >
                      {RESOURCE_CATEGORIES.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  {providerLoading && resourceItems.length === 0 ? (
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-5 text-sm text-content-tertiary">Loading team resources from Supabase...</div>
                  ) : resourceItems.length > 0 ? (
                    resourceItems.map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary transition hover:border-accent-soft"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold">{resource.title}</div>
                            <p className="mt-1 text-sm text-content-secondary">{resource.description}</p>
                          </div>
                          <span className="rounded-full bg-bg-secondary px-3 py-1 text-[11px] text-content-tertiary">{resource.category}</span>
                        </div>
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-content-tertiary">No accessible resources match your filters.</p>
                  )}
                </div>
              </div>
              {resourceCanCreate ? (
                <aside className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                  <h3 className="text-lg font-semibold text-content-primary">Add a resource</h3>
                  <div className="mt-4 space-y-3">
                    <input
                      value={resourceTitle}
                      onChange={(event) => setResourceTitle(event.target.value)}
                      placeholder="Title"
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    />
                    <input
                      value={resourceHref}
                      onChange={(event) => setResourceHref(event.target.value)}
                      placeholder="Link"
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    />
                    <div className="grid gap-2">
                      <div className="text-sm text-content-tertiary">Allowed roles</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {getRoles().map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => setResourceAllowedRoleIds((current) =>
                              current.includes(role.id)
                                ? current.filter((id) => id !== role.id)
                                : [...current, role.id]
                            )}
                            className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${resourceAllowedRoleIds.includes(role.id) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                          >
                            {role.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-content-tertiary">Allowed user types</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(["employee", "creator"] as UserType[]).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setResourceAllowedUserTypes((current) =>
                              current.includes(type)
                                ? current.filter((item) => item !== type)
                                : [...current, type]
                            )}
                            className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${resourceAllowedUserTypes.includes(type) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                          >
                            {type === "employee" ? "Employees" : "Creators"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-content-tertiary">Allowed departments</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {getDepartmentFilters().filter((filter) => filter.id !== "all").map((filter) => (
                          <button
                            key={filter.id}
                            type="button"
                            onClick={() => setResourceAllowedDepartments((current) =>
                              current.includes(filter.id as DeptId)
                                ? current.filter((id) => id !== filter.id)
                                : [...current, filter.id as DeptId]
                            )}
                            className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${resourceAllowedDepartments.includes(filter.id as DeptId) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-content-tertiary">Allowed teams</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {teams.map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => setResourceAllowedTeamIds((current) =>
                              current.includes(team.id)
                                ? current.filter((id) => id !== team.id)
                                : [...current, team.id]
                            )}
                            className={`rounded-3xl border px-4 py-3 text-left text-sm transition ${resourceAllowedTeamIds.includes(team.id) ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-primary/80 text-content-secondary hover:border-accent-soft"}`}
                          >
                            {team.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-content-tertiary">Visibility</div>
                      <select
                        value={resourceVisibility}
                        onChange={(event) => setResourceVisibility(event.target.value as VisibilityScope)}
                        className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                      >
                        <option value="private">Private</option>
                        <option value="department">Department</option>
                        <option value="global">Global</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateResource}
                      className="h-10 w-full rounded-3xl bg-accent/90 px-4 text-sm font-semibold text-white transition hover:bg-accent"
                    >
                      Add resource
                    </button>
                    {resourceMessage && <p className="text-sm text-content-tertiary">{resourceMessage}</p>}
                  </div>
                </aside>
              ) : null}
            </section>
          ) : selectedSection === "finance" ? (
            <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <h2 className="text-xl font-semibold text-content-primary">Finance</h2>
                <p className="mt-2 text-sm text-content-secondary">Finance tools for policy links, expense references, reimbursement forms, and controlled visibility.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {FINANCE_MENU_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-4 text-left text-sm text-content-primary transition hover:border-accent-soft"
                    >
                      <div className="font-semibold">{item.label}</div>
                      <p className="mt-2 text-sm text-content-secondary">{item.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <aside className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <div className="text-xs uppercase tracking-[0.24em] text-content-tertiary">Finance navigation</div>
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-content-secondary">This area is reserved for finance teams and published controls that require strict role-based access.</p>
                  {providerLoading ? (
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-4 text-sm text-content-tertiary">Loading finance links and notices from Supabase...</div>
                  ) : null}
                  {FINANCE_MENU_ITEMS.map((item) => (
                    <div key={item.id} className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary">
                      <div className="font-semibold">{item.label}</div>
                    </div>
                  ))}
                </div>
              </aside>
            </section>
          ) : selectedSection === "activity" ? (
            <section className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
              <h2 className="text-xl font-semibold text-content-primary">Activity Logs</h2>
              <p className="mt-2 text-sm text-content-secondary">Events are shown only when your role has explicit visibility permission.</p>
              <div className="mt-5 space-y-4">
                {activityCanView ? (
                  activityFeed.length > 0 ? (
                    activityFeed.map((event) => {
                      const actor = getUserById(event.userId);
                      const itemTitle =
                        event.targetType === "document"
                          ? getAccessibleDocument(user, event.targetId ?? "")?.title
                          : event.targetType === "resource"
                          ? getResourceById(event.targetId ?? "")?.title
                          : event.targetId && getUserById(event.targetId)?.name;
                      return (
                        <div key={event.id} className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-5">
                          <div className="text-sm text-content-tertiary">{event.action.replace(/_/g, " ")}</div>
                          <div className="mt-2 text-base font-semibold text-content-primary">{itemTitle ?? "Unknown item"}</div>
                          <div className="mt-1 text-sm text-content-secondary">{actor?.name ?? "Unknown user"} • {new Date(event.timestamp).toLocaleString()}</div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-content-tertiary">No recent activity.</p>
                  )
                ) : (
                  <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-6 text-sm text-content-tertiary">Activity is restricted for your access level.</div>
                )}
              </div>
            </section>
          ) : selectedSection === "roles" ? (
            <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-content-primary">Role Manager</h2>
                    <p className="mt-2 text-sm text-content-secondary">Manage role definitions, permission mappings, and inheritance without code changes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRoleEditor()}
                    className="h-10 rounded-full bg-accent/90 px-4 text-sm font-semibold text-white transition hover:bg-accent"
                  >
                    Create role
                  </button>
                </div>
                <div className="mt-5 grid gap-3">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => openRoleEditor(role)}
                        className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-4 text-left text-sm text-content-primary transition hover:border-accent-soft"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">{role.name}</div>
                          <span className="rounded-full bg-bg-secondary px-3 py-1 text-[11px] text-content-tertiary">
                            {getAllUsers().filter((member) => member.roleId === role.id).length} users
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-content-secondary">{getRolePermissionSummary(role)}</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-content-tertiary">No roles found.</p>
                  )}
                </div>
              </div>

              <aside className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-content-primary">{selectedRole ? "Edit role" : "Create role"}</h3>
                    <p className="mt-2 text-sm text-content-secondary">{selectedRole ? (roleEditorCanEdit ? "Update role permissions." : "Viewing role details.") : "Define a new role and permission matrix."}</p>
                  </div>
                  {selectedRole && user && canDeleteRole(user, selectedRole) ? (
                    <button
                      type="button"
                      onClick={handleDeleteCurrentRole}
                      className="h-10 rounded-full border border-rose-500 px-4 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/10"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="mt-5 space-y-4">
                  <input
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                    disabled={!canEditRoleForm}
                    placeholder="Role name"
                    className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent disabled:opacity-50"
                  />
                  <input
                    value={roleDescription}
                    onChange={(event) => setRoleDescription(event.target.value)}
                    disabled={!canEditRoleForm}
                    placeholder="Description"
                    className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent disabled:opacity-50"
                  />
                  <select
                    value={roleInheritsFrom}
                    onChange={(event) => setRoleInheritsFrom(event.target.value)}
                    disabled={!canEditRoleForm}
                    className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent disabled:opacity-50"
                  >
                    <option value="">No inheritance</option>
                    {roles
                      .filter((role) => role.id !== selectedRole?.id)
                      .map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                  </select>
                  <div className="grid gap-3">
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-4">
                      <div className="mb-3 text-sm font-semibold text-content-primary">Documents</div>
                      <div className="grid gap-2">
                        {([
                          ["view", "View"],
                          ["create", "Create"],
                          ["edit", "Edit"],
                          ["delete", "Delete"],
                          ["upload", "Upload"],
                        ] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => canEditRoleForm && setRolePermissions((current) => ({
                              ...current,
                              documents: {
                                ...current.documents,
                                [key]: !current.documents[key],
                              },
                            }))}
                            disabled={!canEditRoleForm}
                            className={`flex items-center justify-between rounded-3xl border px-4 py-3 text-sm transition ${rolePermissions.documents[key] ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-secondary text-content-secondary hover:border-accent-soft"}`}
                          >
                            <span>{label}</span>
                            <span>{rolePermissions.documents[key] ? "On" : "Off"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-4">
                      <div className="mb-3 text-sm font-semibold text-content-primary">Users</div>
                      <div className="grid gap-2">
                        {([
                          ["create", "Create"],
                          ["edit", "Edit"],
                          ["delete", "Delete"],
                          ["assignRole", "Assign"]
                        ] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => canEditRoleForm && setRolePermissions((current) => ({
                              ...current,
                              users: {
                                ...current.users,
                                [key]: !current.users[key],
                              },
                            }))}
                            disabled={!canEditRoleForm}
                            className={`flex items-center justify-between rounded-3xl border px-4 py-3 text-sm transition ${rolePermissions.users[key] ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-secondary text-content-secondary hover:border-accent-soft"}`}
                          >
                            <span>{label}</span>
                            <span>{rolePermissions.users[key] ? "On" : "Off"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-border-subtle bg-bg-primary/80 p-4">
                      <div className="mb-3 text-sm font-semibold text-content-primary">System</div>
                      <div className="grid gap-2">
                        {([
                          ["adminPanelAccess", "Admin panel"],
                          ["roleManagement", "Role manager"]
                        ] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => canEditRoleForm && setRolePermissions((current) => ({
                              ...current,
                              system: {
                                ...current.system,
                                [key]: !current.system[key],
                              },
                            }))}
                            disabled={!canEditRoleForm || (!isAdmin(user) && key === "adminPanelAccess")}
                            className={`flex items-center justify-between rounded-3xl border px-4 py-3 text-sm transition ${rolePermissions.system[key] ? "border-accent bg-accent/10 text-content-primary" : "border-border-subtle bg-bg-secondary text-content-secondary hover:border-accent-soft"}`}
                          >
                            <span>{label}</span>
                            <span>{rolePermissions.system[key] ? "On" : "Off"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {roleFormError ? <p className="text-sm text-rose-500">{roleFormError}</p> : null}
                  {roleFormMessage ? <p className="text-sm text-content-tertiary">{roleFormMessage}</p> : null}
                  <button
                    type="button"
                    onClick={handleSaveRole}
                    disabled={!canEditRoleForm}
                    className="h-10 w-full rounded-3xl bg-accent/90 px-4 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-50"
                  >
                    {selectedRole ? "Save role" : "Create role"}
                  </button>
                </div>
              </aside>
            </section>
          ) : selectedSection === "team" ? (
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <h2 className="text-xl font-semibold text-content-primary">Team directory</h2>
                <p className="mt-2 text-sm text-content-secondary">Manage explicit user access and assignments.</p>
                {userCanManage ? (
                  <div className="mt-5 grid gap-3">
                    {getAllUsers().map((member) => (
                      <div key={member.id} className="rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-content-primary">{member.name}</div>
                            <div className="text-sm text-content-secondary">{member.email}</div>
                          </div>
                          <span className="rounded-full bg-bg-secondary px-3 py-1 text-[11px] text-content-tertiary">{getRoleLabel(member.roleId)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-border-subtle bg-bg-primary/80 p-6 text-sm text-content-tertiary">Team management is unavailable for your role.</div>
                )}
              </div>
              <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                <h2 className="text-xl font-semibold text-content-primary">Create user</h2>
                {userCanManage ? (
                  <div className="mt-5 space-y-4">
                    <input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Full name"
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    />
                    <input
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="Email"
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={newRoleId}
                        onChange={(event) => setNewRoleId(event.target.value as RoleId)}
                        className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                      >
                        {creatableRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                      <select
                        value={newDepartmentId}
                        onChange={(event) => setNewDepartmentId(event.target.value as DeptId)}
                        className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                      >
                        {getDepartmentFilters()
                          .filter((department) => department.id !== "all")
                          .filter((department) => assignableDepartments.includes(department.id))
                          .map((department) => (
                            <option key={department.id} value={department.id}>{department.label}</option>
                          ))}
                      </select>
                    </div>
                    <select
                      value={newSupervisorId}
                      onChange={(event) => setNewSupervisorId(event.target.value)}
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    >
                      {supervisors.map((supervisor) => (
                        <option key={supervisor.id} value={supervisor.id}>{supervisor.name}</option>
                      ))}
                    </select>
                    <select
                      value={newStatus}
                      onChange={(event) => setNewStatus(event.target.value as User["status"])}
                      className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary outline-none transition focus:border-accent"
                    >
                      <option value="active">Active</option>
                      <option value="invited">Invited</option>
                      <option value="disabled">Disabled</option>
                    </select>
                    <div className="space-y-3">
                      <div className="text-sm text-content-tertiary">Assign documents</div>
                      <div className="grid max-h-40 gap-2 overflow-y-auto">
                        {accessibleDocs.map((doc) => (
                          <label key={doc.id} className="flex items-center justify-between rounded-3xl border border-border-subtle bg-bg-primary/80 px-4 py-3 text-sm text-content-primary">
                            <span>{doc.title}</span>
                            <input
                              type="checkbox"
                              checked={assignedDocumentIds.includes(doc.id)}
                              onChange={() => setAssignedDocumentIds((current) =>
                                current.includes(doc.id) ? current.filter((id) => id !== doc.id) : [...current, doc.id]
                              )}
                              className="h-4 w-4 text-accent"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateUser}
                      className="h-10 w-full rounded-3xl bg-accent/90 px-4 text-sm font-semibold text-white transition hover:bg-accent"
                    >
                      Create user
                    </button>
                    {teamStatus && <p className="text-sm text-content-tertiary">{teamStatus}</p>}
                    {teamError && <p className="text-sm text-rose-500">{teamError}</p>}
                  </div>
                ) : (
                  <div className="mt-5 rounded-3xl border border-border-subtle bg-bg-primary/80 p-6 text-sm text-content-tertiary">Your role cannot create users.</div>
                )}
              </div>
            </section>
          ) : selectedSection === "docs" && selectedDoc ? (
            <section className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-content-tertiary">Document</p>
                  <h2 className="mt-2 text-3xl font-semibold text-content-primary">{selectedDoc.title}</h2>
                  <p className="mt-2 text-sm text-content-secondary">{selectedDoc.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSection("library")}
                  className="rounded-full border border-border-subtle bg-bg-secondary px-4 py-2 text-sm text-content-secondary transition hover:border-accent-soft"
                >
                  Back to library
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                  <div className="mb-5 flex flex-wrap gap-3">
                    {selectedDoc.source === "google_drive" ? (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-blue-700">Google Drive</span>
                    ) : null}
                    <span className="rounded-full bg-bg-primary/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-content-tertiary">{TAG_LABELS[selectedDoc.tag]}</span>
                    <span className="rounded-full bg-bg-primary/80 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-content-tertiary">{selectedDoc.dept}</span>
                    {selectedDoc.source === "google_drive" && "syncStatus" in selectedDoc && selectedDoc.syncStatus ? (
                      <span className="rounded-full bg-bg-secondary px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-content-secondary">{selectedDoc.syncStatus}</span>
                    ) : null}
                  </div>
                  <div className="space-y-5">
                    {selectedDoc.blocks.map((block, index) => renderBlock(block, index))}
                  </div>
                  {selectedDoc.source === "google_drive" && "webViewLink" in selectedDoc ? (
                    <div className="mt-6 rounded-3xl border border-border-subtle bg-bg-primary/80 p-5">
                      <div className="text-sm font-semibold text-content-primary">Live Google Docs sync</div>
                      <p className="mt-2 text-sm text-content-secondary">This document is sourced from Google Drive and auto-updates from the live doc.</p>
                      <a
                        href={selectedDoc.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex h-10 items-center justify-center rounded-3xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800"
                      >
                        Open in Google Docs
                      </a>
                    </div>
                  ) : null}
                </div>
                <aside className="rounded-[28px] border border-border bg-bg-secondary p-6 shadow-card">
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-content-tertiary">Details</div>
                      <div className="mt-3 text-sm text-content-secondary">
                        Author: {selectedDoc.author}
                        <br />
                        Updated: {selectedDoc.updatedAt}
                        <br />
                        Version: {selectedDoc.version}
                        {selectedDoc.source === "google_drive" && "lastSyncedAt" in selectedDoc && selectedDoc.lastSyncedAt ? (
                          <><br />Last sync: {selectedDoc.lastSyncedAt}</>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-content-tertiary">Pinned docs</div>
                      <div className="mt-3 space-y-3">
                        {pinnedDocs.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => showDoc(doc.id)}
                            className="w-full rounded-3xl border border-border-subtle bg-bg-primary/80 px-3 py-3 text-left text-sm text-content-primary transition hover:border-accent-soft"
                          >
                            {doc.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Block rendering is delegated to the shared renderer layer in `@/renderers`.
