import type { DeptId } from "@/core/operon";

export function normalizeSearchText(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function createSearchFilter(query = "", departmentId?: DeptId | "all") {
  const cleanQuery = normalizeSearchText(query);
  return {
    cleanQuery,
    departmentId,
    matchesDepartment: (itemDepartmentId?: DeptId) => {
      return !departmentId || departmentId === "all" || itemDepartmentId === departmentId;
    },
  };
}

export function createFallbackQuery(query = "") {
  return normalizeSearchText(query);
}
