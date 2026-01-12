import React, { useState } from "react";
import { apiConfig } from "../apiConfig";

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const passwordErrors = (p) => {
    const errors = [];
    if (p.length < 10) errors.push("At least 10 characters");
    if (!/[A-Z]/.test(p)) errors.push("At least 1 uppercase letter");
    if (!/[a-z]/.test(p)) errors.push("At least 1 lowercase letter");
    if ((p.match(/\d/g) || []).length < 2) errors.push("At least 2 numbers");
    if (!/[^A-Za-z0-9]/.test(p)) errors.push("At least 1 symbol");
    return errors;
  };

  const submit = async () => {
    setErr("");

    if (!isValidEmail(email)) {
      setErr("Please enter a valid email address.");
      return;
    }

    if (mode === "signup") {
      const errs = passwordErrors(password);
      if (errs.length) {
        setErr(`Password requirements: ${errs.join(", ")}`);
        return;
      }
    }

    setBusy(true);
    try {
      const endpoint = mode === "signup" ? "/api/signup" : "/api/login";

      const res = await fetch(`${apiConfig.apiUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const details = Array.isArray(data.details) ? ` (${data.details.join(", ")})` : "";
        setErr((data.error || (mode === "signup" ? "Signup failed" : "Login failed")) + details);
        return;
      }

      try {
        localStorage.setItem("userEmail", data?.user?.email || email.trim());
      } catch { }

      onLogin(data.user);
    } catch (e) {
      setErr("Network error – could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-700
                bg-neutral-950/50 backdrop-blur p-6 shadow-xl
                shadow-[0_0_0_1px_rgba(139,92,246,0.15)]">
        <div className="text-2xl font-bold">
          {mode === "login" ? "Sign in" : "Create account"}
        </div>
        <div className="text-sm text-neutral-400 mt-1">
          You must be signed in to use the editor.
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-300 mb-1">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="At least 10 characters"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {err ? (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              {err}
            </div>
          ) : null}

          <button
            disabled={busy}
            onClick={submit}
            className="w-full rounded-xl py-2.5 font-semibold text-white
           bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500
           hover:from-indigo-600 hover:via-purple-600 hover:to-blue-600
           disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-sm text-neutral-300 hover:text-white underline"
          >
            {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}