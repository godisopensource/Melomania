"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { User, MusicShare } from "@/types";
import { ShareCard } from "@/components/music/ShareCard";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  User as UserIcon,
  Calendar,
  Headphones,
  Sparkles,
  ArrowLeft,
  Flame,
  Music,
} from "lucide-react";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { allUsers, user: currentUser } = useAuth();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [userShares, setUserShares] = useState<MusicShare[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const foundUser = allUsers.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    setProfileUser(foundUser || null);

    const fetchUserShares = async () => {
      if (!foundUser) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/shares?authorId=${foundUser.id}`);
        if (res.ok) {
          const data = await res.json();
          setUserShares(data.shares || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchUserShares();
  }, [username, allUsers]);

  if (!profileUser && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <h2 className="text-lg font-bold text-foreground">Utilisateur introuvable</h2>
        <Link
          href="/"
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white"
        >
          Retour au fil d'actualité
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Retour</span>
      </Link>

      {/* User Header Profile Card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-primary/10 via-card/90 to-black/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          <img
            src={profileUser?.avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
            alt=""
            className="h-24 w-24 rounded-full object-cover ring-4 ring-primary/40 shadow-xl"
          />

          <div className="flex-1 space-y-2">
            <h1 className="text-2xl font-black text-foreground">{profileUser?.displayName}</h1>
            <p className="text-xs font-semibold text-primary font-mono">@{profileUser?.username}</p>
            {profileUser?.bio && (
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                {profileUser.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5 text-primary" />
                <span className="font-bold text-foreground">{userShares.length}</span> partages
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                Membre depuis {new Date(profileUser?.createdAt || Date.now()).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* User's Shares Feed */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          Partages de {profileUser?.displayName} ({userShares.length})
        </h2>

        {userShares.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-muted-foreground">
            Cet utilisateur n'a pas encore partagé de morceaux.
          </div>
        ) : (
          <div className="space-y-4">
            {userShares.map((share) => (
              <ShareCard key={share.id} share={share} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
