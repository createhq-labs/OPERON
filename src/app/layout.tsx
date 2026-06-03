import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/auth/providers/AuthProvider";
import { PermissionProvider } from "@/auth/providers/PermissionProvider";
import { AuthBoundary, ProviderBoundary, RuntimeBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "Operon — Operational Knowledge",
  description: "Role-based SOP access and document management for internal teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RuntimeBoundary>
          <AuthBoundary>
            <AuthProvider>
              <ProviderBoundary>
                <PermissionProvider>{children}</PermissionProvider>
              </ProviderBoundary>
            </AuthProvider>
          </AuthBoundary>
        </RuntimeBoundary>
      </body>
    </html>
  );
}
