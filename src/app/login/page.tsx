"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button, Input, Surface } from "@/components/ui";
import { useAuth } from "@/auth/authContext";
import { getSupabaseDiagnostics } from "@/lib/supabase";
import { motionPreset } from "@/styles/motionPresets";
import { Sp, T } from "@/styles/sharedUi";
import { motion } from "framer-motion";

export default function LoginPage() {
  const { signIn, signInWithPassword, status } = useAuth();
  const router = useRouter();
  const diagnostics = getSupabaseDiagnostics();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");

    if (!email.trim() || !password) return setError("Enter your work email and password.");

    setLoading(true);
    try {
      await signInWithPassword(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: Sp["6"], background: "var(--op-bg)" }}>
      <motion.div {...motionPreset.page} style={{ width: "min(420px, 100%)", display: "flex", flexDirection: "column", gap: Sp["8"], alignItems: "center" }}>
        <Logo variant="signin" />
        <Surface tone="raised" padding="roomy" style={{ width: "100%" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: Sp["5"] }} noValidate>
            <div>
              <h1 style={T.pageTitle}>Welcome back</h1>
              <p style={{ ...T.pageDesc, marginTop: Sp["2"] }}>
                Sign in with your company Google account or the credentials HR provided. Access is granted by invitation only.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: Sp["4"] }}>
              <Input label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
              <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
            </div>

            {error && <div role="alert" style={{ ...T.bodySmall, color: "var(--op-danger)", padding: Sp["3"], background: "var(--op-danger-soft)", borderRadius: "var(--r-md)" }}>{error}</div>}

            <Button type="submit" variant="primary" disabled={loading || !diagnostics.configured} style={{ width: "100%" }}>
              {loading ? "Please wait…" : "Log in"}
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: Sp["3"] }}><span style={{ height: 1, flex: 1, background: "var(--op-border)" }} /><span style={T.caption}>or</span><span style={{ height: 1, flex: 1, background: "var(--op-border)" }} /></div>
            <Button type="button" variant="secondary" onClick={() => void signIn()} disabled={loading || !diagnostics.configured} style={{ width: "100%" }}>Continue with Google</Button>

            {!diagnostics.configured && <p role="alert" style={{ ...T.caption, textAlign: "center" }}>{diagnostics.message}</p>}
          </form>
        </Surface>
        <p style={{ ...T.caption, textAlign: "center" }}>Secure authentication · Global role-based access · Workforce data isolation</p>
      </motion.div>
    </main>
  );
}
