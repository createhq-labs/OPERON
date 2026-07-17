"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button, Input, Surface, Tabs } from "@/components/ui";
import { useAuth } from "@/auth/authContext";
import { getSupabaseDiagnostics } from "@/lib/supabase";
import { motionPreset } from "@/styles/motionPresets";
import { Sp, T } from "@/styles/sharedUi";
import { motion } from "framer-motion";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const { signIn, signInWithPassword, signUp, status } = useAuth();
  const router = useRouter();
  const diagnostics = getSupabaseDiagnostics();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  function changeMode(value: AuthMode) {
    setMode(value);
    setError("");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setMessage("");

    if (!email.trim() || !password) return setError("Enter your work email and password.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "signup" && !fullName.trim()) return setError("Enter your full name.");
    if (mode === "signup" && password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithPassword(email, password);
      } else {
        const result = await signUp(email, password, fullName);
        if (result.requiresEmailConfirmation) {
          setMessage("Check your email to confirm your account. Access begins after your Workforce profile is provisioned.");
        } else {
          setMessage("Account created. Your Workforce profile may require administrator approval before access is enabled.");
        }
      }
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
              <h1 style={T.pageTitle}>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
              <p style={{ ...T.pageDesc, marginTop: Sp["2"] }}>
                {mode === "login" ? "Sign in to your operational workspace." : "Use your company identity. Roles and access are assigned by Workforce administrators."}
              </p>
            </div>

            <Tabs<AuthMode> label="Authentication mode" value={mode} onChange={changeMode} items={[
              { value: "login", label: "Log in" },
              { value: "signup", label: "Sign up" },
            ]} />

            <div style={{ display: "flex", flexDirection: "column", gap: Sp["4"] }}>
              {mode === "signup" && <Input label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} />}
              <Input label="Work email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
              <Input label="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} hint={mode === "signup" ? "Use at least 8 characters." : undefined} />
              {mode === "signup" && <Input label="Confirm password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} />}
            </div>

            {error && <div role="alert" style={{ ...T.bodySmall, color: "var(--op-danger)", padding: Sp["3"], background: "var(--op-danger-soft)", borderRadius: "var(--r-md)" }}>{error}</div>}
            {message && <div role="status" style={{ ...T.bodySmall, padding: Sp["3"], background: "var(--op-surface-2)", borderRadius: "var(--r-md)" }}>{message}</div>}

            <Button type="submit" variant="primary" disabled={loading || !diagnostics.configured} style={{ width: "100%" }}>
              {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
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
