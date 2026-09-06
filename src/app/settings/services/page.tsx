"use client";
// src/app/settings/services/page.tsx — /settings/services : paramètres des services musicaux
//
// Spotify : vraie connexion OAuth (compte dev gratuit).
// Apple Music : mode gratuit, aucun compte à connecter — un switch contrôle
//   l'affichage des boutons « Open in Apple Music » sur le lecteur
//   (recherche réelle via iTunes Search API, ajout manuel dans l'app Apple).
//   Le flux MusicKit complet (connexion réelle + ajout en 1 clic) reste en
//   place côté serveur et se réactivera si les clés payantes sont configurées.

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useLinkPrefs } from "@/lib/link-prefs";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  Link2,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function ConnectedServicesPage() {
  const { user } = useAuth();
  const [linkPrefs, setLinkPrefs] = useLinkPrefs();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [spotifyNotice, setSpotifyNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

  // Statut retour OAuth Spotify (?spotify=connected | error | not-configured).
  useEffect(() => {
    let status: string | null = null;
    let reason: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      status = params.get("spotify");
      reason = params.get("reason");
    } catch {}
    if (!status) return;
    if (status === "connected") {
      setSpotifyNotice({ kind: "ok", text: "Spotify connected — ready for playlist export." });
    } else if (status === "not-configured") {
      setSpotifyNotice({
        kind: "err",
        text: "Spotify is not configured on the server yet (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET + Redirect URI).",
      });
    } else {
      setSpotifyNotice({
        kind: "err",
        text: `Spotify connection failed${reason ? `: ${reason}` : "."} Please try again.`,
      });
    }
    fetchConnections();
    // Nettoie l'URL sans recharger.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("spotify");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSpotifyDisconnect = async () => {
    setActionLoading("spotify");
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "spotify", action: "disconnect" }),
      });
      if (res.ok) await fetchConnections();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSpotifyConnect = () => {
    setActionLoading("spotify");
    window.location.href = "/api/spotify/auth";
  };

  const spotifyRaw = connections.find((c) => c.provider === "spotify");
  const spotifyConn = spotifyRaw && spotifyRaw.isReal === false ? null : spotifyRaw;

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

      {spotifyNotice && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3.5 text-xs ${
            spotifyNotice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {spotifyNotice.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{spotifyNotice.text}</span>
        </div>
      )}

      <div className="space-y-3.5">
        {/* Spotify Card — vraie connexion OAuth */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1DB954]/20 text-[#1DB954] ring-1 ring-[#1DB954]/30">
                <span className="font-black text-lg">S</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Spotify</h3>
                <p className="text-xs text-muted-foreground">
                  {loading ? "Checking…" : spotifyConn ? spotifyConn.accountName : "Not connected"}
                </p>
              </div>
            </div>

            {spotifyConn ? (
              <button
                onClick={handleSpotifyDisconnect}
                disabled={actionLoading === "spotify"}
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
              >
                {actionLoading === "spotify" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Disconnect"
                )}
              </button>
            ) : (
              <button
                onClick={handleSpotifyConnect}
                disabled={actionLoading === "spotify"}
                className="rounded-lg bg-[#1DB954] px-3.5 py-1.5 text-xs font-semibold text-black hover:opacity-90 shadow transition-opacity"
              >
                {actionLoading === "spotify" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Connect with Spotify"
                )}
              </button>
            )}
          </div>

          {spotifyConn ? (
            <div className="border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Connected — ready for direct playlist export</span>
              </div>
              <p>Active permissions: create and modify your private playlists.</p>
            </div>
          ) : (
            <div className="border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
              <p>
                Sign in with your own Spotify account. Melomania can search tracks and add them
                to your playlists — nothing else.
              </p>
            </div>
          )}
        </div>

        {/* Apple Music Card — mode gratuit : switch d'affichage des liens */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FC3C44]/20 text-[#FC3C44] ring-1 ring-[#FC3C44]/30">
                <span className="font-black text-lg">A</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Apple Music</h3>
                <p className="text-xs text-muted-foreground">
                  {linkPrefs.appleLinks ? "Links enabled" : "Links disabled"}
                </p>
              </div>
            </div>

            <ToggleSwitch
              checked={linkPrefs.appleLinks}
              onChange={(v) => setLinkPrefs({ appleLinks: v })}
              label="Toggle Apple Music links on the player"
              activeClass="bg-[#FC3C44]"
            />
          </div>

          <div className="border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground space-y-1">
            {linkPrefs.appleLinks ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>« Open in Apple Music » buttons show on the player</span>
              </div>
            ) : null}
            <p className="leading-relaxed">
              No login needed: the player searches the real Apple catalog and opens the track in
              Apple Music, where you add it to your playlist yourself.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
