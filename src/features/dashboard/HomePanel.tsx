import { motion } from "framer-motion";
import type { Document, DriveDocumentReference, User } from "@/core/operon";
import type { DriveDiagnostics } from "@/services/drive";

const TAG_LABELS: Record<string, string> = {
  sop: "SOP",
  onboarding: "Onboarding",
  brand: "Brand",
  creator: "Creator",
  ops: "Operations",
  hr: "HR",
  internal: "Internal",
};

interface HomePanelProps {
  user: User;
  providerLoading: boolean;
  driveDiagnostics?: DriveDiagnostics | null;
  displayQuickActions: Array<{ id: string; label: string; description: string; category?: string }>;
  accessibleDocs: Array<Document | DriveDocumentReference>;
  pinnedDocs: Document[];
  onActionSelect: (section: string) => void;
  onShowDoc: (docId: string) => void;
}

export function HomePanel({
  user,
  providerLoading,
  driveDiagnostics,
  displayQuickActions,
  accessibleDocs,
  pinnedDocs,
  onActionSelect,
  onShowDoc,
}: HomePanelProps) {
  const recentDocs = accessibleDocs
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.44, 0, 0.56, 1] }}
      style={{ display: "flex", flexDirection: "column", gap: "32px" }}
    >
      {/* Quick Actions */}
      {displayQuickActions.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.44, 0, 0.56, 1] }}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "24px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--text-12)",
              fontWeight: 500,
              color: "var(--text-3)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "16px",
              margin: 0,
            }}
          >
            Quick actions
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {displayQuickActions.slice(0, 6).map((action, index) => (
              <motion.button
                key={`${action.label}-${action.id}`}
                type="button"
                onClick={() => onActionSelect(action.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: index * 0.03,
                  ease: [0.44, 0, 0.56, 1],
                }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "14px 16px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 200ms",
                  fontSize: "var(--text-14)",
                  fontWeight: 500,
                  color: "var(--text)",
                }}
              >
                {action.label}
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Recent Documents */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: [0.44, 0, 0.56, 1] }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "24px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--text-12)",
            fontWeight: 500,
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "16px",
            margin: 0,
          }}
        >
          Recent
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {recentDocs.length > 0 ? (
            recentDocs.map((doc, index) => (
              <motion.button
                key={doc.id}
                type="button"
                onClick={() => onShowDoc(doc.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: index * 0.02,
                  ease: [0.44, 0, 0.56, 1],
                }}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.99 }}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  padding: "12px 14px",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 200ms",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--text-14)",
                      fontWeight: 500,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {doc.title}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-11)",
                    color: "var(--text-3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {TAG_LABELS[doc.tag]}
                </div>
              </motion.button>
            ))
          ) : providerLoading ? (
            <motion.div
              animate={{ opacity: [0.5, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{
                fontSize: "var(--text-14)",
                color: "var(--text-3)",
                padding: "16px",
                textAlign: "center",
              }}
            >
              Loading…
            </motion.div>
          ) : (
            <div
              style={{
                fontSize: "var(--text-14)",
                color: "var(--text-3)",
                padding: "16px",
                textAlign: "center",
              }}
            >
              No documents yet
            </div>
          )}
        </div>
      </motion.section>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15, ease: [0.44, 0, 0.56, 1] }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "24px",
              fontWeight: 400,
              color: "var(--text)",
              marginBottom: "4px",
            }}
          >
            {accessibleDocs.length}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-12)",
              color: "var(--text-3)",
            }}
          >
            Documents
          </div>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            padding: "16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "24px",
              fontWeight: 400,
              color: "var(--text)",
              marginBottom: "4px",
            }}
          >
            {pinnedDocs.length}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-12)",
              color: "var(--text-3)",
            }}
          >
            Pinned
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
