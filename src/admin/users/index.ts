import type { User } from "@/core/operon";
 
export function getActiveUsers(users: User[]): User[] {
  return users
    .filter((user) => user.status !== "disabled")
    .sort((a, b) => a.name.localeCompare(b.name));
}
 