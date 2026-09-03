"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { User } from "@/types";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (emailOrUsername: string, passwordPlain: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    email: string;
    username: string;
    displayName?: string;
    passwordPlain: string;
    /** Token Turnstile (champ canonique cf-turnstile-response). */
    "cf-turnstile-response"?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  openAuthModal: (mode?: "login" | "register") => void;
  closeAuthModal: () => void;
  authModalOpen: boolean;
  authModalMode: "login" | "register";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");

  const refreshUser = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
      }
    } catch (err) {
      console.error("Failed to load user session:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    await refreshUser();
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (emailOrUsername: string, passwordPlain: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", emailOrUsername, password: passwordPlain }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Sign-in error" };
      }
      setUser(data.user);
      setAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const register = async (data: {
    email: string;
    username: string;
    displayName?: string;
    passwordPlain: string;
    "cf-turnstile-response"?: string;
  }) => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          email: data.email,
          username: data.username,
          displayName: data.displayName,
          password: data.passwordPlain,
          "cf-turnstile-response": data["cf-turnstile-response"],
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        return { success: false, error: resData.error || "Sign-up error" };
      }
      setUser(resData.user);
      setAuthModalOpen(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
  };

  const openAuthModal = (mode: "login" | "register" = "login") => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refresh,
        openAuthModal,
        closeAuthModal,
        authModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
