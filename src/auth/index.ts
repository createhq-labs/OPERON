// Auth adapter
export { authAdapter, SupabaseAuthAdapter } from "./authAdapter";
export type { AuthAdapter, AuthSession, AuthSubscription } from "./authAdapter";

// Auth context and provider
export { AuthProvider, useAuth } from "./authContext";
export type { AuthState } from "./authContext";

// Permission context and provider
export { PermissionProvider, usePermissions } from "./permissionContext";
export type { PermissionContextValue } from "./permissionContext";

// Session resolver
export { resolveSessionUser, resolveUserRole } from "./sessionResolver";

// Guards
export { RequireAuth } from "./guards";

// Convenience re-exports (same implementation, stable import paths)
export { useSession } from "./useSession";