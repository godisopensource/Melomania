"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  Link2,
  CheckCircle2,
  ShieldCheck,
  Loader2,
} from "lucide-react";

export default function ConnectedServicesPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [user]);

  const handleToggleConnect = async (provider: "spotify" | "apple_music", isConnected: boolean) => {
    setActionLoading(provider);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          action: isConnected ? "disconnect" : "connect",
        }),
      });
      if (res.ok) {
        await fetchConnections();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const spotifyConn = connections.find((c) => c.provider === "spotify");
  const appleConn = connections.find((c) => c.provider === "apple_music");

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
      <div className="space-y-0.5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Link2 className="h-6 w-6 text-brand-500" />
          Connected streaming services
        </h1>
        <p className="text-xs text-muted-foreground">
          Link your streaming accounts to export your selections and playlists.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="font-bold text-foreground">Server-side AES-256 token encryption</p>
          <p className="leading-relaxed">
            Your OAuth access tokens are encrypted server-side and never transmitted in cleartext to the client browser.
          </p>
        </div>
      </div>

      <div className="space-y-3.5">
        {/* Spotify Card */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/20 text-[#1DB954] ring-1 ring-[#1DB954]/30">
                <span className="font-black text-lg">S</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Spotify</h3>
                <p className="text-xs text-muted-foreground">
                  {spotifyConn ? spotifyConn.accountName : "Not connected"}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggleConnect("spotify", !!spotifyConn)}
              disabled={actionLoading === "spotify"}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                spotifyConn
                  ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "bg-[#1DB954] text-black hover:opacity-90 shadow"
              }`}
            >
              {actionLoading === "spotify" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : spotifyConn ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </button>
          </div>

          {spotifyConn && (
            <div className="border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Ready for direct playlist export</span>
              </div>
              <p>Active permissions: create and modify personal playlists.</p>
            </div>
          )}
        </div>

        {/* Apple Music Card */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FC3C44]/20 text-[#FC3C44] ring-1 ring-[#FC3C44]/30">
                <span className="font-black text-lg">A</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Apple Music</h3>
                <p className="text-xs text-muted-foreground">
                  {appleConn ? appleConn.accountName : "Not connected"}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleToggleConnect("apple_music", !!appleConn)}
              disabled={actionLoading === "apple_music"}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                appleConn
                  ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "bg-[#FC3C44] text-white hover:opacity-90 shadow"
              }`}
            >
              {actionLoading === "apple_music" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : appleConn ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </button>
          </div>

          {appleConn && (
            <div className="border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Ready for iCloud Music Library export</span>
              </div>
              <p>Active permissions: manage music playlists.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
