export function getAdminDashboardOverview() {
  return {
    feature: "admin-dashboard",
    status: "ready",
    modules: ["audit", "users", "permissions", "ingestion", "analytics"],
  };
}
