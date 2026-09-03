import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  User,
  MusicResource,
  MusicSource,
  MusicShare,
  ConversationThread,
  ConversationParticipant,
  Comment,
  Mention,
  ExternalConnection,
  ExportJob,
  TrackMatch,
  Notification,
  Report,
  PlaylistCategory,
  TrackEnrichment,
  TrackNote,
  GapComment,
  EmotionalCriterion,
} from "@/types";
import { encryptToken } from "./encryption";

interface DatabaseSchema {
  users: User[];
  musicResources: MusicResource[];
  musicSources: MusicSource[];
  musicShares: MusicShare[];
  conversationThreads: ConversationThread[];
  conversationParticipants: ConversationParticipant[];
  comments: Comment[];
  mentions: Mention[];
  externalConnections: ExternalConnection[];
  exportJobs: ExportJob[];
  trackMatches: TrackMatch[];
  notifications: Notification[];
  reports: Report[];
  playlistCategories: PlaylistCategory[];
  trackEnrichments: TrackEnrichment[];
  trackNotes: TrackNote[];
  gapComments: GapComment[];
  emotionalCriteria: EmotionalCriterion[];
}

const DB_FILE_PATH = path.join(process.cwd(), ".melomania-db.json");

// Données publiques d'un utilisateur : jamais de passwordHash, jamais d'email.
// L'email n'est exposé que pour la session elle-même (via /api/auth/me).
// Le cast `as User` conserve les types existants sans fuite à l'exécution.
function publicAuthor(u: User | undefined): User | undefined {
  if (!u) return undefined;
  const { passwordHash: _h, email: _e, ...rest } = u;
  return rest as User;
}

// Admin seed : jamais de mot de passe en dur dans le code.
// - ADMIN_INITIAL_PASSWORD_HASH (hash bcrypt déjà calculé) prioritaire
// - sinon ADMIN_INITIAL_PASSWORD (mot de passe clair, hashé ici)
// - sinon mot de passe aléatoire inutilisable (il faut définir la variable d'env)
function getAdminPasswordHash(): string {
  const preHashed = process.env.ADMIN_INITIAL_PASSWORD_HASH;
  if (preHashed && preHashed.startsWith("$2")) return preHashed;
  const plain = process.env.ADMIN_INITIAL_PASSWORD;
  if (plain && plain.length >= 12) return bcrypt.hashSync(plain, 12);
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[db] ADMIN_INITIAL_PASSWORD(HASH) not set — admin account created with an unusable random password."
    );
  }
  return bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);
}

// Clean Production Seed
function getInitialSeed(): DatabaseSchema {
  const adminPasswordHash = getAdminPasswordHash();
  const now = new Date().toISOString();

  const users: User[] = [
    {
      id: "usr_admin",
      email: "admin@melomania.app",
      username: "admin",
      displayName: "Administrator",
      avatarUrl: "/icon.png",
      bio: "Melomania Platform Administrator",
      isPublic: true,
      passwordHash: adminPasswordHash,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    users,
    musicResources: [],
    musicSources: [],
    musicShares: [],
    conversationThreads: [],
    conversationParticipants: [],
    comments: [],
    mentions: [],
    externalConnections: [],
    exportJobs: [],
    trackMatches: [],
    notifications: [],
    reports: [],
    playlistCategories: [],
    trackEnrichments: [],
    trackNotes: [],
    gapComments: [],
    emotionalCriteria: [],
  };
}

class MelomaniaDatabase {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const fileContent = fs.readFileSync(DB_FILE_PATH, "utf8");
        const parsed = JSON.parse(fileContent);
        // Ensure admin exists with requested credentials
        const hasAdmin = parsed.users?.some((u: User) => u.username === "admin");
        if (hasAdmin) {
          const migrated = this.migrateNonDestructive(parsed);
          return migrated;
        }
      }
    } catch (err) {
      console.warn("Initializing clean database seed.", err);
    }
    const initial = getInitialSeed();
    this.saveToDisk(initial);
    return initial;
  }

  /**
   * Non-destructive migration:
   * - ensures new collections exist
   * - backfills immutable sourcePosition from playlist track order
   * - never reorders, never deletes existing data
   */
  private migrateNonDestructive(parsed: any): DatabaseSchema {
    const data: DatabaseSchema = {
      users: parsed.users || [],
      musicResources: parsed.musicResources || [],
      musicSources: parsed.musicSources || [],
      musicShares: parsed.musicShares || [],
      conversationThreads: parsed.conversationThreads || [],
      conversationParticipants: parsed.conversationParticipants || [],
      comments: parsed.comments || [],
      mentions: parsed.mentions || [],
      externalConnections: parsed.externalConnections || [],
      exportJobs: parsed.exportJobs || [],
      trackMatches: parsed.trackMatches || [],
      notifications: parsed.notifications || [],
      reports: parsed.reports || [],
      playlistCategories: parsed.playlistCategories || [],
      trackEnrichments: parsed.trackEnrichments || [],
      trackNotes: parsed.trackNotes || [],
      gapComments: parsed.gapComments || [],
      emotionalCriteria: parsed.emotionalCriteria || [],
    };

    let dirty = false;
    const enrichmentById = new Map(data.trackEnrichments.map((e) => [e.resourceId, e]));

    // Backfill sourcePosition for every track that belongs to a playlist.
    // Order reference = index inside playlist.tracks array (YouTube Music original order).
    for (const res of data.musicResources) {
      if (res.type === "playlist" && Array.isArray((res as any).tracks)) {
        const tracks = (res as any).tracks as MusicResource[];
        tracks.forEach((t, idx) => {
          // Hydrate embedded copy
          if (t.sourcePosition === undefined || t.sourcePosition === null) {
            (t as any).sourcePosition = idx;
            dirty = true;
          }
          if (!(t as any).playlistId) {
            (t as any).playlistId = res.id;
            dirty = true;
          }
          // Mirror into top-level resource if it exists independently
          const top = data.musicResources.find((r) => r.id === t.id);
          if (top) {
            if (top.sourcePosition === undefined || top.sourcePosition === null) {
              top.sourcePosition = idx;
              dirty = true;
            }
            if (!top.playlistId) {
              top.playlistId = res.id;
              dirty = true;
            }
          }
          // Mirror into enrichment table (immutable once set)
          if (!enrichmentById.has(t.id)) {
            const e: TrackEnrichment = {
              resourceId: t.id,
              playlistId: res.id,
              sourcePosition: (t as any).sourcePosition ?? idx,
              categoryId: (t as any).categoryId ?? null,
              moodScore: (t as any).moodScore ?? null,
              softnessScore: (t as any).softnessScore ?? null,
              tags: (t as any).tags ?? [],
              updatedAt: new Date().toISOString(),
            };
            data.trackEnrichments.push(e);
            enrichmentById.set(t.id, e);
            dirty = true;
          }
        });
      }
      // Standalone tracks without position: keep, do not invent order
      if (res.type === "track" && (res.sourcePosition === undefined || res.sourcePosition === null)) {
        const e = enrichmentById.get(res.id);
        if (e) {
          res.sourcePosition = e.sourcePosition;
          res.playlistId = e.playlistId;
          res.categoryId = e.categoryId;
          res.moodScore = e.moodScore;
          res.softnessScore = e.softnessScore;
          res.tags = e.tags;
          dirty = true;
        }
      }
    }

    // Apply enrichments onto top-level resources (enrichment wins only when resource lacks value)
    for (const e of data.trackEnrichments) {
      const r = data.musicResources.find((x) => x.id === e.resourceId);
      if (r) {
        if (r.sourcePosition === undefined) r.sourcePosition = e.sourcePosition;
        if (r.categoryId === undefined) r.categoryId = e.categoryId ?? null;
        if (r.moodScore === undefined) r.moodScore = e.moodScore ?? null;
        if (r.softnessScore === undefined) r.softnessScore = e.softnessScore ?? null;
        if (r.tags === undefined) r.tags = e.tags ?? [];
        if (!r.playlistId && e.playlistId) r.playlistId = e.playlistId;
      }
    }

    if (dirty) {
      try {
        fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
      } catch {}
    }
    return data;
  }

  private saveToDisk(data: DatabaseSchema) {
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      // Memory fallback for serverless environments
    }
  }

  private persist() {
    this.saveToDisk(this.data);
  }

  // --- USERS ---
  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  getUserByUsername(username: string): User | undefined {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase().trim());
  }

  getUserByEmail(email: string): User | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  }

  createUser(user: User): User {
    this.data.users.push(user);
    this.persist();
    return user;
  }

  updateUser(id: string, updates: Partial<User>): User | null {
    const idx = this.data.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    this.data.users[idx] = {
      ...this.data.users[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.users[idx];
  }

  deleteUser(id: string): boolean {
    const initialLen = this.data.users.length;
    this.data.users = this.data.users.filter((u) => u.id !== id);
    this.persist();
    return this.data.users.length !== initialLen;
  }

  // --- MUSIC RESOURCES ---
  getMusicResources(): MusicResource[] {
    return this.data.musicResources;
  }

  getMusicResourceById(id: string): MusicResource | undefined {
    return this.data.musicResources.find((r) => r.id === id);
  }

  createMusicResource(resource: MusicResource): MusicResource {
    this.data.musicResources.push(resource);
    this.persist();
    return resource;
  }

  updateMusicResource(id: string, updates: Partial<MusicResource>): MusicResource | null {
    const idx = this.data.musicResources.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.data.musicResources[idx] = {
      ...this.data.musicResources[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.musicResources[idx];
  }

  // --- MUSIC SOURCES ---
  getMusicSourcesByResourceId(resourceId: string): MusicSource[] {
    return this.data.musicSources.filter((s) => s.musicResourceId === resourceId);
  }

  getMusicSourceByExternalId(provider: string, externalId: string): MusicSource | undefined {
    return this.data.musicSources.find(
      (s) => s.provider === provider && s.externalId === externalId
    );
  }

  createMusicSource(source: MusicSource): MusicSource {
    this.data.musicSources.push(source);
    this.persist();
    return source;
  }

  // --- MUSIC SHARES ---
  getMusicShares(viewerId?: string): MusicShare[] {
    return this.data.musicShares.map((share) => this.hydrateShare(share, viewerId));
  }

  getMusicShareById(id: string, viewerId?: string): MusicShare | undefined {
    const share = this.data.musicShares.find((s) => s.id === id);
    return share ? this.hydrateShare(share, viewerId) : undefined;
  }

  getMusicSharesByAuthorId(authorId: string, viewerId?: string): MusicShare[] {
    return this.data.musicShares
      .filter((s) => s.authorId === authorId)
      .map((s) => this.hydrateShare(s, viewerId));
  }

  createMusicShare(share: MusicShare): MusicShare {
    // Defaults for new persistence fields (non-destructive for legacy data)
    if (!share.likedByUserIds) share.likedByUserIds = [];
    if (!share.allowedUserIds) share.allowedUserIds = [];
    if (share.likesCount === undefined) share.likesCount = 0;
    this.data.musicShares.unshift(share);
    this.persist();
    return this.hydrateShare(share);
  }

  updateMusicShare(id: string, updates: Partial<MusicShare>): MusicShare | null {
    const share = this.data.musicShares.find((s) => s.id === id);
    if (!share) return null;
    // Likes are only mutated via toggleShareLike — never by a raw update.
    const { likedByUserIds: _l, likesCount: _c, ...safe } = updates as any;
    Object.assign(share, safe, { updatedAt: new Date().toISOString() });
    this.persist();
    return this.hydrateShare(share);
  }

  /** Toggle a like. Returns the hydrated share + whether the user now likes it. */
  toggleShareLike(shareId: string, userId: string): { share: MusicShare; liked: boolean } | null {
    const share = this.data.musicShares.find((s) => s.id === shareId);
    if (!share) return null;
    if (!share.likedByUserIds) share.likedByUserIds = [];
    const idx = share.likedByUserIds.indexOf(userId);
    let liked: boolean;
    if (idx >= 0) {
      share.likedByUserIds.splice(idx, 1);
      liked = false;
    } else {
      share.likedByUserIds.push(userId);
      liked = true;
    }
    share.likesCount = share.likedByUserIds.length;
    share.updatedAt = new Date().toISOString();
    this.persist();
    return { share: this.hydrateShare(share, userId), liked };
  }

  /** A share is visible to viewerId when public, or when author / explicitly allowed / participant. */
  isShareVisibleTo(share: MusicShare, viewerId?: string | null): boolean {
    if (share.visibility === "public") return true;
    if (!viewerId) return false;
    if (share.authorId === viewerId) return true;
    if (share.allowedUserIds?.includes(viewerId)) return true;
    const isParticipant = this.data.conversationParticipants.some(
      (p) => p.conversationId === share.conversationId && p.userId === viewerId
    );
    if (isParticipant) return true;
    return false;
  }

  /** Most used tags across shares + track enrichments. */
  getTopTags(limit = 12): { tag: string; count: number }[] {
    const counts = new Map<string, number>();
    const add = (tags?: string[]) => {
      for (const raw of tags || []) {
        const t = raw.trim().toLowerCase().replace(/^#/, "").slice(0, 40);
        if (!t) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    };
    for (const s of this.data.musicShares) add(s.tags);
    for (const e of this.data.trackEnrichments) add(e.tags);
    for (const r of this.data.musicResources) add(r.tags);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, Math.max(1, Math.min(30, limit)));
  }

  /** Delete a share + its conversation (participants, comments, mentions). Keeps music resources. */
  deleteShareCascade(id: string): boolean {
    const share = this.data.musicShares.find((s) => s.id === id);
    if (!share) return false;
    const convId = share.conversationId;
    this.data.musicShares = this.data.musicShares.filter((s) => s.id !== id);
    this.data.conversationThreads = this.data.conversationThreads.filter((t) => t.id !== convId);
    this.data.conversationParticipants = this.data.conversationParticipants.filter(
      (p) => p.conversationId !== convId
    );
    const commentIds = new Set(
      this.data.comments.filter((c) => c.conversationId === convId).map((c) => c.id)
    );
    this.data.comments = this.data.comments.filter((c) => c.conversationId !== convId);
    if (commentIds.size > 0) {
      this.data.mentions = this.data.mentions.filter((m) => !commentIds.has(m.commentId));
    }
    this.persist();
    return true;
  }

  deleteMusicShare(id: string): boolean {
    const initialLen = this.data.musicShares.length;
    this.data.musicShares = this.data.musicShares.filter((s) => s.id !== id);
    this.persist();
    return this.data.musicShares.length !== initialLen;
  }

  private hydrateShare(share: MusicShare, viewerId?: string): MusicShare {
    const likedBy = share.likedByUserIds || [];
    const { likedByUserIds: _omit, ...rest } = share as any;
    void _omit;
    return {
      ...rest,
      likesCount: likedBy.length,
      hasLiked: viewerId ? likedBy.includes(viewerId) : false,
      author: publicAuthor(this.getUserById(share.authorId)),
      resource: this.getMusicResourceById(share.resourceId),
      sources: this.getMusicSourcesByResourceId(share.resourceId),
    };
  }

  // --- CONVERSATION THREADS ---
  getConversationThreads(): ConversationThread[] {
    return this.data.conversationThreads.map((t) => this.hydrateThread(t));
  }

  getConversationThreadById(id: string): ConversationThread | undefined {
    const thread = this.data.conversationThreads.find((t) => t.id === id);
    return thread ? this.hydrateThread(thread) : undefined;
  }

  createConversationThread(thread: ConversationThread): ConversationThread {
    this.data.conversationThreads.unshift(thread);
    this.persist();
    return this.hydrateThread(thread);
  }

  updateConversationActivity(id: string) {
    const thread = this.data.conversationThreads.find((t) => t.id === id);
    if (thread) {
      thread.lastActivityAt = new Date().toISOString();
      this.persist();
    }
  }

  private hydrateThread(thread: ConversationThread): ConversationThread {
    const share = thread.shareId ? this.getMusicShareById(thread.shareId) : undefined;
    return {
      ...thread,
      createdBy: publicAuthor(this.getUserById(thread.createdById)),
      share,
    };
  }

  // --- CONVERSATION PARTICIPANTS ---
  getParticipantsByConversationId(conversationId: string): ConversationParticipant[] {
    return this.data.conversationParticipants
      .filter((p) => p.conversationId === conversationId)
      .map((p) => ({
        ...p,
        user: publicAuthor(this.getUserById(p.userId)),
      }));
  }

  addParticipant(participant: ConversationParticipant): ConversationParticipant {
    const exists = this.data.conversationParticipants.find(
      (p) => p.conversationId === participant.conversationId && p.userId === participant.userId
    );
    if (exists) return exists;
    this.data.conversationParticipants.push(participant);
    this.persist();
    return participant;
  }

  // --- COMMENTS ---
  getCommentsByConversationId(conversationId: string): Comment[] {
    const rawComments = this.data.comments.filter(
      (c) => c.conversationId === conversationId && !c.deletedAt
    );

    const topLevel = rawComments.filter((c) => !c.parentCommentId);
    const replies = rawComments.filter((c) => !!c.parentCommentId);

    return topLevel.map((c) => this.hydrateComment(c, replies));
  }

  getCommentById(id: string): Comment | undefined {
    const comment = this.data.comments.find((c) => c.id === id);
    return comment ? this.hydrateComment(comment, []) : undefined;
  }

  /** Most recent non-deleted comments by a user (for public profiles). */
  getRecentCommentsByUserId(userId: string, limit = 3): Comment[] {
    return this.data.comments
      .filter((c) => c.authorId === userId && !c.deletedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, Math.max(1, Math.min(20, limit)))
      .map((c) => this.hydrateComment(c, []));
  }

  createComment(comment: Comment): Comment {
    this.data.comments.push(comment);
    this.updateConversationActivity(comment.conversationId);
    this.persist();
    return this.hydrateComment(comment, []);
  }

  updateComment(id: string, updates: Partial<Comment>): Comment | null {
    const idx = this.data.comments.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.comments[idx] = {
      ...this.data.comments[idx],
      ...updates,
      isEdited: true,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.hydrateComment(this.data.comments[idx], []);
  }

  deleteComment(id: string): boolean {
    const comment = this.data.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.deletedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  toggleCommentReaction(commentId: string, emoji: string, userId: string): Comment | null {
    const comment = this.data.comments.find((c) => c.id === commentId);
    if (!comment) return null;
    if (!comment.reactions) comment.reactions = {};

    const existingUsers = comment.reactions[emoji] || [];
    if (existingUsers.includes(userId)) {
      comment.reactions[emoji] = existingUsers.filter((u) => u !== userId);
      if (comment.reactions[emoji].length === 0) {
        delete comment.reactions[emoji];
      }
    } else {
      comment.reactions[emoji] = [...existingUsers, userId];
    }

    this.persist();
    return this.hydrateComment(comment, []);
  }

  private hydrateComment(comment: Comment, allReplies: Comment[]): Comment {
    const commentReplies = allReplies
      .filter((r) => r.parentCommentId === comment.id && !r.deletedAt)
      .map((r) => this.hydrateComment(r, []));

    const attachedResource = comment.attachedResourceId
      ? this.getMusicResourceById(comment.attachedResourceId)
      : undefined;

    const mentions = this.data.mentions.filter((m) => m.commentId === comment.id);

    return {
      ...comment,
      author: publicAuthor(this.getUserById(comment.authorId)),
      attachedResource,
      mentions,
      replies: commentReplies.length > 0 ? commentReplies : undefined,
    };
  }

  // --- MENTIONS ---
  createMention(mention: Mention): Mention {
    this.data.mentions.push(mention);
    this.persist();
    return mention;
  }

  // --- EXTERNAL CONNECTIONS ---
  getConnectionsByUserId(userId: string): ExternalConnection[] {
    return this.data.externalConnections.filter((c) => c.userId === userId);
  }

  getConnection(userId: string, provider: 'spotify' | 'apple_music'): ExternalConnection | undefined {
    return this.data.externalConnections.find(
      (c) => c.userId === userId && c.provider === provider
    );
  }

  saveConnection(connection: ExternalConnection): ExternalConnection {
    const idx = this.data.externalConnections.findIndex(
      (c) => c.userId === connection.userId && c.provider === connection.provider
    );
    if (idx !== -1) {
      this.data.externalConnections[idx] = {
        ...this.data.externalConnections[idx],
        ...connection,
        // Ne jamais écraser les tokens chiffrés avec des valeurs vides
        accessTokenEncrypted:
          connection.accessTokenEncrypted || this.data.externalConnections[idx].accessTokenEncrypted,
        refreshTokenEncrypted:
          connection.refreshTokenEncrypted ?? this.data.externalConnections[idx].refreshTokenEncrypted,
        updatedAt: new Date().toISOString(),
      };
    } else {
      this.data.externalConnections.push(connection);
    }
    this.persist();
    return connection;
  }

  deleteConnection(userId: string, provider: 'spotify' | 'apple_music'): boolean {
    const initialLen = this.data.externalConnections.length;
    this.data.externalConnections = this.data.externalConnections.filter(
      (c) => !(c.userId === userId && c.provider === provider)
    );
    this.persist();
    return this.data.externalConnections.length !== initialLen;
  }

  // --- EXPORT JOBS ---
  getExportJobsByUserId(userId: string): ExportJob[] {
    return this.data.exportJobs.filter((j) => j.userId === userId);
  }

  getExportJobById(id: string): ExportJob | undefined {
    return this.data.exportJobs.find((j) => j.id === id);
  }

  createExportJob(job: ExportJob): ExportJob {
    this.data.exportJobs.unshift(job);
    this.persist();
    return job;
  }

  updateExportJob(id: string, updates: Partial<ExportJob>): ExportJob | null {
    const idx = this.data.exportJobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;
    this.data.exportJobs[idx] = {
      ...this.data.exportJobs[idx],
      ...updates,
    };
    this.persist();
    return this.data.exportJobs[idx];
  }

  // --- NOTIFICATIONS ---
  getNotificationsByUserId(userId: string): Notification[] {
    return this.data.notifications
      .filter((n) => n.recipientId === userId)
      .map((n) => ({
        ...n,
        actor: n.actorId ? publicAuthor(this.getUserById(n.actorId)) : undefined,
        musicResource: n.musicResourceId ? this.getMusicResourceById(n.musicResourceId) : undefined,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  createNotification(notif: Notification): Notification {
    this.data.notifications.unshift(notif);
    this.persist();
    return notif;
  }

  markNotificationAsRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find((n) => n.id === id && n.recipientId === userId);
    if (notif) {
      notif.isRead = true;
      this.persist();
      return true;
    }
    return false;
  }

  markAllNotificationsAsRead(userId: string): number {
    let count = 0;
    this.data.notifications.forEach((n) => {
      if (n.recipientId === userId && !n.isRead) {
        n.isRead = true;
        count++;
      }
    });
    this.persist();
    return count;
  }

  // --- REPORTS (MODERATION) ---
  getReports(): Report[] {
    return this.data.reports.map((r) => ({
      ...r,
      reporter: publicAuthor(this.getUserById(r.reporterId)),
    }));
  }

  createReport(report: Report): Report {
    this.data.reports.unshift(report);
    this.persist();
    return report;
  }

  updateReport(id: string, updates: Partial<Report>): Report | null {
    const idx = this.data.reports.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.data.reports[idx] = {
      ...this.data.reports[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.reports[idx];
  }

  // --- PLAYLIST CATEGORIES (manual curation, no auto-classification) ---
  getPlaylistCategories(playlistId: string): PlaylistCategory[] {
    return this.data.playlistCategories
      .filter((c) => c.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  createPlaylistCategory(cat: PlaylistCategory): PlaylistCategory {
    this.data.playlistCategories.push(cat);
    this.persist();
    return cat;
  }

  updatePlaylistCategory(id: string, updates: Partial<PlaylistCategory>): PlaylistCategory | null {
    const idx = this.data.playlistCategories.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.playlistCategories[idx] = {
      ...this.data.playlistCategories[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.playlistCategories[idx];
  }

  deletePlaylistCategory(id: string): boolean {
    const cat = this.data.playlistCategories.find((c) => c.id === id);
    if (!cat) return false;
    // Unassign tracks (they become uncategorized, order preserved)
    for (const r of this.data.musicResources) {
      if (r.categoryId === id) r.categoryId = null;
    }
    for (const pl of this.data.musicResources) {
      if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
        for (const t of (pl as any).tracks) {
          if (t.categoryId === id) t.categoryId = null;
        }
      }
    }
    for (const e of this.data.trackEnrichments) {
      if (e.categoryId === id) e.categoryId = null;
    }
    this.data.playlistCategories = this.data.playlistCategories.filter((c) => c.id !== id);
    this.persist();
    return true;
  }

  // --- EMOTIONAL CRITERIA (custom curves beyond mood & softness) ---
  getEmotionalCriteria(playlistId: string): EmotionalCriterion[] {
    return this.data.emotionalCriteria
      .filter((c) => c.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  createEmotionalCriterion(criterion: EmotionalCriterion): EmotionalCriterion {
    this.data.emotionalCriteria.push(criterion);
    this.persist();
    return criterion;
  }

  updateEmotionalCriterion(
    id: string,
    updates: Partial<EmotionalCriterion>
  ): EmotionalCriterion | null {
    const idx = this.data.emotionalCriteria.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.emotionalCriteria[idx] = {
      ...this.data.emotionalCriteria[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.emotionalCriteria[idx];
  }

  deleteEmotionalCriterion(id: string): boolean {
    const criterion = this.data.emotionalCriteria.find((c) => c.id === id);
    if (!criterion) return false;
    // Strip this criterion's scores everywhere.
    for (const r of this.data.musicResources) {
      if (r.customScores && id in r.customScores) delete r.customScores[id];
    }
    for (const pl of this.data.musicResources) {
      if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
        for (const t of (pl as any).tracks as MusicResource[]) {
          if (t.customScores && id in t.customScores) delete t.customScores[id];
        }
      }
    }
    for (const e of this.data.trackEnrichments) {
      if (e.customScores && id in e.customScores) delete e.customScores[id];
    }
    this.data.emotionalCriteria = this.data.emotionalCriteria.filter((c) => c.id !== id);
    this.persist();
    return true;
  }

  // --- TRACK ENRICHMENT (manual metadata only) ---
  getTrackEnrichment(resourceId: string): TrackEnrichment | undefined {
    return this.data.trackEnrichments.find((e) => e.resourceId === resourceId);
  }

  upsertTrackEnrichment(
    resourceId: string,
    updates: Partial<Pick<TrackEnrichment, "categoryId" | "moodScore" | "softnessScore" | "customScores" | "tags" | "playlistId" | "sourcePosition">>
  ): TrackEnrichment | null {
    const resource = this.getMusicResourceById(resourceId);
    // sourcePosition is immutable: refuse any attempt to change it
    if (updates.sourcePosition !== undefined) {
      const current = resource?.sourcePosition ?? this.getTrackEnrichment(resourceId)?.sourcePosition;
      if (current !== undefined && updates.sourcePosition !== current) {
        throw new Error("Track order follows the original playlist and cannot be changed.");
      }
    }
    // Validate manual scores 0..100
    for (const key of ["moodScore", "softnessScore"] as const) {
      const v = (updates as any)[key];
      if (v !== undefined && v !== null && (typeof v !== "number" || v < 0 || v > 100)) {
        throw new Error(`${key} must be between 0 and 100.`);
      }
    }
    const sanitizeCustom = (input: Record<string, number | null> | undefined): Record<string, number | null> | undefined => {
      if (input === undefined) return undefined;
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new Error("customScores must be an object of criterionId to 0..100.");
      }
      const out: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(input)) {
        if (v === null) {
          out[k] = null;
        } else {
          const n = Number(v);
          if (!Number.isFinite(n)) throw new Error(`Custom score must be between 0 and 100.`);
          out[k] = Math.max(0, Math.min(100, Math.round(n)));
        }
      }
      return out;
    };
    const customScores = sanitizeCustom(updates.customScores as Record<string, number | null> | undefined);
    let e = this.data.trackEnrichments.find((x) => x.resourceId === resourceId);
    if (!e) {
      e = {
        resourceId,
        playlistId: updates.playlistId ?? resource?.playlistId,
        sourcePosition: resource?.sourcePosition ?? 0,
        categoryId: updates.categoryId ?? null,
        moodScore: (updates.moodScore as number | null) ?? null,
        softnessScore: (updates.softnessScore as number | null) ?? null,
        customScores: customScores ?? {},
        tags: updates.tags ?? [],
        updatedAt: new Date().toISOString(),
      };
      this.data.trackEnrichments.push(e);
    } else {
      if (updates.categoryId !== undefined) e.categoryId = updates.categoryId;
      if (updates.moodScore !== undefined) e.moodScore = updates.moodScore;
      if (updates.softnessScore !== undefined) e.softnessScore = updates.softnessScore;
      if (customScores !== undefined) e.customScores = { ...(e.customScores ?? {}), ...customScores };
      if (updates.tags !== undefined) e.tags = updates.tags;
      if (updates.playlistId !== undefined) e.playlistId = updates.playlistId;
      e.updatedAt = new Date().toISOString();
    }
    // Mirror onto resource copies (top-level + embedded) — never touch sourcePosition
    const mirror = (r: MusicResource) => {
      if (updates.categoryId !== undefined) r.categoryId = updates.categoryId;
      if (updates.moodScore !== undefined) r.moodScore = updates.moodScore;
      if (updates.softnessScore !== undefined) r.softnessScore = updates.softnessScore;
      if (customScores !== undefined) r.customScores = { ...(r.customScores ?? {}), ...customScores };
      if (updates.tags !== undefined) r.tags = [...updates.tags];
      r.updatedAt = new Date().toISOString();
    };
    if (resource) mirror(resource);
    for (const pl of this.data.musicResources) {
      if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
        const t = ((pl as any).tracks as MusicResource[]).find((x) => x.id === resourceId);
        if (t) mirror(t);
      }
    }
    this.persist();
    return e;
  }

  /** Playlist + tracks enriched, tracks ALWAYS sorted by sourcePosition. */
  getCuratedPlaylist(playlistId: string): { playlist: MusicResource; categories: PlaylistCategory[]; tracks: MusicResource[] } | null {
    const playlist = this.getMusicResourceById(playlistId);
    if (!playlist || playlist.type !== "playlist") return null;
    const categories = this.getPlaylistCategories(playlistId);
    let tracks: MusicResource[] = [];
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      tracks = [...playlist.tracks];
    } else {
      tracks = this.data.musicResources.filter((r) => r.type === "track" && r.playlistId === playlistId);
      // Fallback: standalone tracks carry enrichment
      tracks = tracks.map((t) => {
        const e = this.getTrackEnrichment(t.id);
        return e
          ? { ...t, sourcePosition: e.sourcePosition, categoryId: e.categoryId, moodScore: e.moodScore, softnessScore: e.softnessScore, customScores: { ...(e.customScores ?? {}), ...(t.customScores ?? {}) }, tags: e.tags }
          : t;
      });
    }
    // Enrich embedded copies from enrichment table
    tracks = tracks.map((t) => {
      const e = this.getTrackEnrichment(t.id);
      if (e) {
        return {
          ...t,
          sourcePosition: t.sourcePosition ?? e.sourcePosition,
          playlistId: t.playlistId ?? e.playlistId,
          categoryId: t.categoryId ?? e.categoryId ?? null,
          moodScore: t.moodScore ?? e.moodScore ?? null,
          softnessScore: t.softnessScore ?? e.softnessScore ?? null,
          customScores: { ...(e.customScores ?? {}), ...(t.customScores ?? {}) },
          tags: t.tags ?? e.tags ?? [],
        };
      }
      return { ...t, customScores: t.customScores ?? {}, tags: t.tags ?? [] };
    });
    tracks.sort((a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0));
    return { playlist, categories, tracks };
  }

  // --- TRACK NOTES (immutable initial editorial note + replies) ---
  getTrackNotes(trackId: string): TrackNote[] {
    const all = this.data.trackNotes.filter((n) => n.trackId === trackId && !n.deletedAt);
    const roots = all.filter((n) => !n.parentNoteId);
    const replies = all.filter((n) => !!n.parentNoteId);
    return roots
      .map((r) => this.hydrateTrackNote(r, replies))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  getTrackInitialNote(trackId: string): TrackNote | undefined {
    const roots = this.data.trackNotes.filter((n) => n.trackId === trackId && !n.parentNoteId && !n.deletedAt);
    if (roots.length === 0) return undefined;
    const sorted = [...roots].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return this.hydrateTrackNote(sorted[0], this.data.trackNotes);
  }

  createTrackNote(note: TrackNote): TrackNote {
    // Only ONE initial note per track: further top-level attempts become replies is handled by API
    this.data.trackNotes.push(note);
    this.persist();
    return this.hydrateTrackNote(note, []);
  }

  updateTrackNote(id: string, updates: Partial<TrackNote>, requesterId: string): TrackNote | null {
    const idx = this.data.trackNotes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const existing = this.data.trackNotes[idx];
    // Initial note: set in stone once published — no edits by anyone (author included)
    if (existing.isInitial && existing.isLocked) {
      throw new Error("The opening editorial note cannot be edited or deleted.");
    }
    this.data.trackNotes[idx] = {
      ...existing,
      ...updates,
      id: existing.id,
      trackId: existing.trackId,
      isInitial: existing.isInitial,
      isLocked: existing.isLocked,
      isEdited: true,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.hydrateTrackNote(this.data.trackNotes[idx], []);
  }

  deleteTrackNote(id: string): boolean {
    const note = this.data.trackNotes.find((n) => n.id === id);
    if (!note) return false;
    if (note.isInitial && note.isLocked) {
      throw new Error("The opening editorial note cannot be edited or deleted.");
    }
    note.deletedAt = new Date().toISOString();
    this.persist();
    return true;
  }

  private hydrateTrackNote(note: TrackNote, allReplies: TrackNote[]): TrackNote {
    const replies = allReplies
      .filter((r) => r.parentNoteId === note.id && !r.deletedAt)
      .map((r) => this.hydrateTrackNote(r, []))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const mentions = this.data.mentions.filter((m) => m.commentId === note.id);
    return { ...note, author: publicAuthor(this.getUserById(note.authorId)), mentions, replies: replies.length > 0 ? replies : undefined };
  }

  // --- GAP COMMENTS (between two consecutive tracks) ---
  getGapComments(playlistId: string): GapComment[] {
    return this.data.gapComments
      .filter((g) => g.playlistId === playlistId)
      .map((g) => ({ ...g, author: publicAuthor(this.getUserById(g.authorId)) }))
      .sort((a, b) => a.afterSourcePosition - b.afterSourcePosition);
  }

  createGapComment(gap: GapComment): GapComment {
    this.data.gapComments.push(gap);
    this.persist();
    return { ...gap, author: publicAuthor(this.getUserById(gap.authorId)) };
  }

  deleteGapComment(id: string): boolean {
    const initialLen = this.data.gapComments.length;
    this.data.gapComments = this.data.gapComments.filter((g) => g.id !== id);
    this.persist();
    return this.data.gapComments.length !== initialLen;
  }

  /** Share that published a playlist resource (for ownership checks). */
  getShareByResourceId(resourceId: string): MusicShare | undefined {
    const share = this.data.musicShares.find((s) => s.resourceId === resourceId);
    return share ? this.hydrateShare(share) : undefined;
  }
}

declare global {
  var __melomania_db: MelomaniaDatabase | undefined;
}

export const db: MelomaniaDatabase = global.__melomania_db || new MelomaniaDatabase();
if (process.env.NODE_ENV !== "production") {
  global.__melomania_db = db;
}
