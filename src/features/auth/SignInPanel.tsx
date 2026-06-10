"use client";

import { motion } from "framer-motion";
import { Logo } from "@/components/Logo";

interface SignInPanelProps {
  signIn: () => Promise<void>;
  googleAuthConfigured: boolean;
  authError?: string;
}

export function SignInPanel({
  signIn,
  googleAuthConfigured,
  authError,
}: SignInPanelProps) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            "40px",
        width:          "100%",
        maxWidth:       "400px",
        margin:         "0 auto",
      }}
    >
      {/* Logo — large, centered, the only brand mark on this screen */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.44, 0, 0.56, 1] }}
      >
        <Logo variant="signin" />
      </motion.div>

      {/* Sign-in card */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0, 0, 0.2, 1] }}
        style={{
          background:   "var(--op-surface)",
          border:       "1px solid var(--op-border)",
          borderRadius: "var(--r-xl)",
          padding:      "32px",
          width:        "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <h2
              style={{
                fontFamily:    "var(--font-display)",
                fontSize:      "var(--text-20)",
                fontWeight:    400,
                color:         "var(--op-text)",
                letterSpacing: "-0.02em",
                marginBottom:  "10px",
              }}
            >
              Sign in
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize:   "var(--text-14)",
                color:      "var(--op-text-2)",
                lineHeight: 1.6,
              }}
            >
              Sign in with Google to access your workspace and role-based
              documents.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <motion.button
              type="button"
              onClick={googleAuthConfigured ? signIn : undefined}
              disabled={!googleAuthConfigured}
              whileHover={googleAuthConfigured ? { scale: 1.02, y: -2 } : {}}
              whileTap={googleAuthConfigured ? { scale: 0.98 } : {}}
              style={{
                borderRadius: "var(--r-full)",
                padding:      "12px 32px",
                fontFamily:   "var(--font-ui)",
                fontSize:     "var(--text-14)",
                fontWeight:   600,
                border:       "1px solid var(--op-border)",
                background:   googleAuthConfigured
                  ? "var(--op-surface-2)"
                  : "rgba(255,255,255,0.03)",
                color:        googleAuthConfigured
                  ? "var(--op-text)"
                  : "var(--op-text-3)",
                cursor:       googleAuthConfigured ? "pointer" : "not-allowed",
                transition:   "border-color 150ms, background 150ms",
              }}
            >
              {googleAuthConfigured
                ? "Sign in with Google"
                : "Sign in unavailable"}
            </motion.button>

            {!googleAuthConfigured && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                style={{
                  background:   "var(--op-surface-2)",
                  border:       "1px solid var(--op-border)",
                  borderRadius: "var(--r-lg)",
                  padding:      "16px 20px",
                }}
              >
                <div
                  style={{
                    fontFamily:   "var(--font-ui)",
                    fontSize:     "var(--text-13)",
                    fontWeight:   600,
                    color:        "var(--op-text)",
                    marginBottom: "6px",
                  }}
                >
                  Configuration needed
                </div>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize:   "var(--text-13)",
                    color:      "var(--op-text-2)",
                  }}
                >
                  {authError ??
                    "Sign in is not ready for this workspace yet. Contact your administrator."}
                </p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}