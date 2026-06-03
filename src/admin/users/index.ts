import type { User } from "@/core/operon";

export function listAdminUsers(users: User[]) {
  return users.filter((user) => user.status !== "disabled");
}
