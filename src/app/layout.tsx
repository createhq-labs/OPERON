import type { Metadata } from "next";
import "@/styles/tokens.css";
import "@/styles/ember.css";
import "@/styles/motion.css";
import "@/styles/components.css";
import "./globals.css";
import { AuthProvider } from "@/auth/authContext";
import { PermissionProvider } from "@/auth/permissionContext";
import { AuthBoundary, ProviderBoundary, RuntimeBoundary } from "@/components/ErrorBoundary";
import { EmberOrb } from "@/components/EmberOrb";

export const metadata: Metadata = {
  title: "Operon",
  description: "Role-based knowledge management for internal teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&display=swap"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        {/* Cursor-tracking ambient orb — fixed behind all content */}
        <EmberOrb />

        {/* All page content sits above the orb */}
        <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh" }}>
          <RuntimeBoundary>
            <AuthBoundary>
              <AuthProvider>
                <ProviderBoundary>
                  <PermissionProvider>{children}</PermissionProvider>
                </ProviderBoundary>
              </AuthProvider>
            </AuthBoundary>
          </RuntimeBoundary>
        </div>
      </body>
    </html>
  );
}