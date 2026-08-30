"use client";

import React, { useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { Lock, Mail, User as UserIcon, AlertCircle } from "lucide-react";

export function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, openAuthModal, login, register } = useAuth();
  
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await login(emailOrUsername, password);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Authentication failed");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await register({
      email,
      username,
      displayName,
      passwordPlain: regPassword,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "Registration failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <img src="/icon.png" alt="Melomania" className="mx-auto h-12 w-12 rounded-xl object-contain mb-3" />
          <h2 className="font-display text-2xl font-bold text-foreground">
            {authModalMode === "login" ? "Sign in to Melomania" : "Create an account"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Share and annotate music with precise timecode conversations
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {authModalMode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Email or username
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="Username or email"
                  className="w-full rounded-lg border border-border bg-black/40 py-2.5 pl-10 pr-3.5 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-black/40 py-2.5 pl-10 pr-3.5 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Don't have an account yet?{" "}
              <button
                type="button"
                onClick={() => openAuthModal("register")}
                className="font-semibold text-brand-320 hover:underline"
              >
                Create account
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name"
                  className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-border bg-black/40 px-3.5 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white shadow hover:bg-brand-590 transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating account..." : "Sign up"}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => openAuthModal("login")}
                className="font-semibold text-brand-320 hover:underline"
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
