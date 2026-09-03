"use client";
// src/app/admin/moderation/page.tsx — /admin/moderation : panneau de modération admin

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Report } from "@/types";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Check,
  Trash2,
} from "lucide-react";
import Link from "next/link";

export default function ModerationPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/moderation");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [user]);

  const handleUpdateStatus = async (
    reportId: string,
    status: Report["status"],
    notes?: string
  ) => {
    try {
      await fetch("/api/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: reportId,
          status,
          adminNotes: notes || "Handled by administrator",
        }),
      });
      fetchReports();
    } catch (e) {
      console.error(e);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-destructive mb-2" />
        <h2 className="text-lg font-bold text-foreground">
          Restricted to administrators
        </h2>
        <p className="text-xs text-muted-foreground">
          Please sign in with an administrator account to access this page.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white"
        >
          Back to feed
        </Link>
      </div>
    );
  }

  const pending = reports.filter((r) => r.status === "pending");
  const resolved = reports.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <div className="space-y-0.5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <ShieldAlert className="h-6 w-6 text-brand-410" />
          Moderation
        </h1>
        <p className="text-xs text-muted-foreground">
          Review community reports and take action on flagged content.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <span className="block text-xl font-bold text-foreground">
            {reports.length}
          </span>
          <span className="text-[11px] text-muted-foreground">Total reports</span>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
          <span className="block text-xl font-bold text-yellow-400">
            {pending.length}
          </span>
          <span className="text-[11px] text-yellow-300">Pending</span>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
          <span className="block text-xl font-bold text-emerald-400">
            {resolved.length}
          </span>
          <span className="text-[11px] text-emerald-300">Resolved</span>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 w-full animate-pulse rounded-2xl bg-card/60" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400/60 mb-2" />
            <p className="text-sm font-bold text-foreground">No pending reports</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The platform is running smoothly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border bg-card p-5 shadow space-y-3 ${
                  r.status === "pending"
                    ? "border-yellow-500/20"
                    : "border-border opacity-70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold text-brand-320">
                      {r.targetType}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.targetId}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      r.status === "pending"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : r.status === "action_taken"
                        ? "bg-rose-500/20 text-rose-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {r.status === "pending"
                      ? "Pending"
                      : r.status === "action_taken"
                      ? "Action taken"
                      : "Dismissed"}
                  </span>
                </div>

                <p className="text-xs font-semibold text-foreground">
                  Reason:{" "}
                  <span className="font-normal text-muted-foreground">{r.reason}</span>
                </p>

                <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
                  <span className="text-[11px] text-muted-foreground">
                    Reported by @{r.reporter?.username || "anonymous"}
                  </span>

                  {r.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(r.id, "dismissed")}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Dismiss</span>
                      </button>
                      <button
                        onClick={() =>
                          handleUpdateStatus(r.id, "action_taken", "Content hidden")
                        }
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Take action</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
