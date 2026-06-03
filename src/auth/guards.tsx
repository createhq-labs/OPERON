"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/auth/useSession";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loaded, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loaded && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loaded, user, router, pathname]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-content-primary">
        <div className="rounded-3xl border border-border-subtle bg-bg-secondary p-6 text-sm text-content-secondary">Loading your secure session…</div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-content-primary">
        <div className="rounded-3xl border border-border-subtle bg-bg-secondary p-6 text-sm text-content-secondary">
          Authentication failed. Please refresh or check your connection.
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
