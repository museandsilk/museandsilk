"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(result.error ?? "Invalid email or password.");
      setBusy(false);
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  return (
    <main className="admin-standalone">
      <header>
        <div>
          <p className="eyebrow">Muse &amp; Silk</p>
          <h1>Owner sign in</h1>
          <p>Sign in with your admin email and password to manage the store.</p>
        </div>
      </header>
      <form className="admin-settings-card" onSubmit={submit}>
        <div className="admin-form-grid">
          <label className="field-wide">
            <span>Email</span>
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@museandsilk.com"
            />
          </label>
          <label className="field-wide">
            <span>Password</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>
        {error && <p className="admin-message">{error}</p>}
        <button className="admin-primary" disabled={busy}>
          {busy ? (
            <span className="busy-label">
              <span className="spinner spinner-light" aria-hidden="true" /> Signing in…
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
