import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import { normalizeMusicText } from "@/lib/utils";
import { findChronologyViolations, recategorizeMovedTracks } from "@/lib/playlist-sync";
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

// ---------------------------------------------------------------------------
// Durable storage.
//
// Why this exists: the database used to live in `.melomania-db.json` on the
// local filesystem. That file is gitignored (never deployed) and, on Vercel,
// the filesystem is ephemeral — every deploy (and every serverless instance)
// starts from an empty seed, wiping users, shares, comments and likes.
//
// - Production (Vercel): set `DATABASE_URL` (Neon Postgres, pooled URL).
//   The whole document is stored as one JSONB row (`melomania_store`), loaded
//   fresh on every call and saved with an optimistic version guard + retry,
//   so concurrent serverless instances cannot silently lose each other's
//   writes and no instance ever serves stale cached data.
// - Local dev (no `DATABASE_URL`): falls back to `.melomania-db.json`.
// ---------------------------------------------------------------------------

const DB_FILE_PATH = path.join(process.cwd(), ".melomania-db.json");
const STORE_ROW_ID = "main";

interface LoadedDoc {
  data: DatabaseSchema;
  version: number;
}

interface DocStore {
  load(): Promise<LoadedDoc>;
  /** Conditional write. Returns false on version conflict (caller should retry). */
  save(data: DatabaseSchema, expectedVersion: number): Promise<boolean>;
  forceSave(data: DatabaseSchema): Promise<void>;
}

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

/**
 * Non-destructive normalization (ex-migration):
 * - ensures new collections exist
 * - backfills immutable sourcePosition from playlist track order
 * - never reorders, never deletes existing data
 * Returns the normalized doc + whether it differs from the input (dirty).
 */
function normalizeDoc(parsed: any): { data: DatabaseSchema; dirty: boolean } {
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

  return { data, dirty };
}

// --- Module-level finders (operate on an already-loaded doc) ---

function findUserById(data: DatabaseSchema, id: string): User | undefined {
  return data.users.find((u) => u.id === id);
}

function findUserByUsername(data: DatabaseSchema, username: string): User | undefined {
  return data.users.find((u) => u.username.toLowerCase() === username.toLowerCase().trim());
}

function findUserByEmail(data: DatabaseSchema, email: string): User | undefined {
  return data.users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
}

function findResourceById(data: DatabaseSchema, id: string): MusicResource | undefined {
  return data.musicResources.find((r) => r.id === id);
}

function findSourcesByResourceId(data: DatabaseSchema, resourceId: string): MusicSource[] {
  return data.musicSources.filter((s) => s.musicResourceId === resourceId);
}

function findEnrichment(data: DatabaseSchema, resourceId: string): TrackEnrichment | undefined {
  return data.trackEnrichments.find((e) => e.resourceId === resourceId);
}

function hydrateShare(data: DatabaseSchema, share: MusicShare, viewerId?: string): MusicShare {
  const likedBy = share.likedByUserIds || [];
  const { likedByUserIds: _omit, ...rest } = share as any;
  void _omit;
  return {
    ...rest,
    likesCount: likedBy.length,
    hasLiked: viewerId ? likedBy.includes(viewerId) : false,
    author: publicAuthor(findUserById(data, share.authorId)),
    resource: findResourceById(data, share.resourceId),
    sources: findSourcesByResourceId(data, share.resourceId),
  };
}

function hydrateThread(data: DatabaseSchema, thread: ConversationThread): ConversationThread {
  const share = thread.shareId
    ? (() => {
        const s = data.musicShares.find((x) => x.id === thread.shareId);
        return s ? hydrateShare(data, s) : undefined;
      })()
    : undefined;
  return {
    ...thread,
    createdBy: publicAuthor(findUserById(data, thread.createdById)),
    share,
  };
}

function hydrateComment(
  data: DatabaseSchema,
  comment: Comment,
  allReplies: Comment[]
): Comment {
  const commentReplies = allReplies
    .filter((r) => r.parentCommentId === comment.id && !r.deletedAt)
    .map((r) => hydrateComment(data, r, []));

  const attachedResource = comment.attachedResourceId
    ? findResourceById(data, comment.attachedResourceId)
    : undefined;

  const mentions = data.mentions.filter((m) => m.commentId === comment.id);

  return {
    ...comment,
    author: publicAuthor(findUserById(data, comment.authorId)),
    attachedResource,
    mentions,
    replies: commentReplies.length > 0 ? commentReplies : undefined,
  };
}

function hydrateTrackNote(
  data: DatabaseSchema,
  note: TrackNote,
  allReplies: TrackNote[]
): TrackNote {
  const replies = allReplies
    .filter((r) => r.parentNoteId === note.id && !r.deletedAt)
    .map((r) => hydrateTrackNote(data, r, []))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const mentions = data.mentions.filter((m) => m.commentId === note.id);
  return {
    ...note,
    author: publicAuthor(findUserById(data, note.authorId)),
    mentions,
    replies: replies.length > 0 ? replies : undefined,
  };
}

/** A share is visible to viewerId when public, or when author / explicitly allowed / participant. */
function shareIsVisibleTo(
  data: DatabaseSchema,
  share: MusicShare,
  viewerId?: string | null
): boolean {
  if (share.visibility === "public") return true;
  if (!viewerId) return false;
  if (share.authorId === viewerId) return true;
  if (share.allowedUserIds?.includes(viewerId)) return true;
  const isParticipant = data.conversationParticipants.some(
    (p) => p.conversationId === share.conversationId && p.userId === viewerId
  );
  if (isParticipant) return true;
  return false;
}

// --- Doc stores ---

class FileDocStore implements DocStore {
  private version = 0;

  async load(): Promise<LoadedDoc> {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE_PATH, "utf8"));
        return { data: parsed as DatabaseSchema, version: this.version };
      }
    } catch (err) {
      console.warn("[db] Could not read local database file, reseeding.", err);
    }
    const seed = getInitialSeed();
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seed, null, 2), "utf8");
    } catch {}
    return { data: seed, version: this.version };
  }

  async save(data: DatabaseSchema, _expectedVersion: number): Promise<boolean> {
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Memory fallback for read-only environments
    }
    this.version++;
    return true;
  }

  async forceSave(data: DatabaseSchema): Promise<void> {
    await this.save(data, this.version);
  }
}

type NeonSql = ReturnType<typeof neon>;

function getNeonSql(): NeonSql {
  const g = globalThis as any;
  const url = process.env.DATABASE_URL as string;
  if (!g.__melomania_sql || g.__melomania_sql_url !== url) {
    g.__melomania_sql = neon(url);
    g.__melomania_sql_url = url;
  }
  return g.__melomania_sql as NeonSql;
}

class PostgresDocStore implements DocStore {
  private initPromise: Promise<void> | null = null;

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const sql = getNeonSql();
        await sql`CREATE TABLE IF NOT EXISTS melomania_store (
          id TEXT PRIMARY KEY,
          version BIGINT NOT NULL DEFAULT 1,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
        const rows = (await sql`SELECT version, data FROM melomania_store WHERE id = ${STORE_ROW_ID}`) as any[];
        if (rows.length === 0) {
          const seed = getInitialSeed();
          try {
            await sql`INSERT INTO melomania_store (id, version, data) VALUES (${STORE_ROW_ID}, 1, ${JSON.stringify(seed)}::jsonb)`;
          } catch {
            // Lost a cold-start race with another instance: the row exists now.
          }
        }
      })().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  async load(): Promise<LoadedDoc> {
    await this.ensureInit();
    const sql = getNeonSql();
    const rows = (await sql`SELECT version, data FROM melomania_store WHERE id = ${STORE_ROW_ID}`) as any[];
    if (rows.length === 0) {
      // Extremely defensive: init raced and rolled back — reseed via upsert.
      const seed = getInitialSeed();
      await this.forceSave(seed);
      return { data: seed, version: 1 };
    }
    const data = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    return { data: data as DatabaseSchema, version: Number(rows[0].version) };
  }

  async save(data: DatabaseSchema, expectedVersion: number): Promise<boolean> {
    await this.ensureInit();
    const sql = getNeonSql();
    const rows = (await sql`UPDATE melomania_store
      SET data = ${JSON.stringify(data)}::jsonb, version = version + 1, updated_at = now()
      WHERE id = ${STORE_ROW_ID} AND version = ${expectedVersion}
      RETURNING version`) as any[];
    return rows.length === 1;
  }

  async forceSave(data: DatabaseSchema): Promise<void> {
    await this.ensureInit();
    const sql = getNeonSql();
    await sql`INSERT INTO melomania_store (id, version, data)
      VALUES (${STORE_ROW_ID}, 1, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data, version = melomania_store.version + 1, updated_at = now()`;
  }
}

function getStore(): DocStore {
  const g = globalThis as any;
  if (process.env.DATABASE_URL) {
    if (!g.__melomania_pg_store) g.__melomania_pg_store = new PostgresDocStore();
    return g.__melomania_pg_store as DocStore;
  }
  if (!g.__melomania_file_store) g.__melomania_file_store = new FileDocStore();
  return g.__melomania_file_store as DocStore;
}

/**
 * Load a fresh, normalized document. Never cached across calls: on serverless,
 * each instance must see writes committed by other instances (and survive
 * redeploys — durability comes from Postgres, not memory).
 */
async function loadDoc(): Promise<LoadedDoc> {
  const store = getStore();
  const loaded = await store.load();
  const parsed: any = loaded.data;
  const hasAdmin =
    parsed &&
    Array.isArray(parsed.users) &&
    parsed.users.some((u: User) => u.username === "admin");
  if (!hasAdmin) {
    const fresh = getInitialSeed();
    await store.forceSave(fresh);
    return { data: fresh, version: loaded.version + 1 };
  }
  const { data, dirty } = normalizeDoc(parsed);
  if (dirty) {
    try {
      await store.forceSave(data);
    } catch {}
  }
  return { data, version: loaded.version };
}

class MelomaniaDatabase {
  /** Fresh read — no cross-request caching (serverless-safe). */
  private async read(): Promise<DatabaseSchema> {
    return (await loadDoc()).data;
  }

  /**
   * Read-modify-write with optimistic concurrency.
   * The mutation fn is pure (operates on the fresh doc, throws on validation
   * errors without persisting). On version conflict the whole cycle reloads
   * and retries, so concurrent requests don't silently drop writes.
   */
  private async mutate<T>(fn: (data: DatabaseSchema) => T): Promise<T> {
    const store = getStore();
    let lastData: DatabaseSchema | null = null;
    let lastResult: T | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const loaded = await loadDoc();
      lastData = loaded.data;
      lastResult = fn(lastData); // may throw (validation) — nothing persisted
      const ok = await store.save(lastData, loaded.version);
      if (ok) return lastResult;
    }
    // Extremely contended row: last write wins rather than losing the mutation.
    await store.forceSave(lastData as DatabaseSchema);
    return lastResult as T;
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    return (await this.read()).users;
  }

  async getUserById(id: string): Promise<User | undefined> {
    return findUserById(await this.read(), id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return findUserByUsername(await this.read(), username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return findUserByEmail(await this.read(), email);
  }

  async createUser(user: User): Promise<User> {
    return this.mutate((data) => {
      data.users.push(user);
      return user;
    });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    return this.mutate((data) => {
      const idx = data.users.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      data.users[idx] = {
        ...data.users[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return data.users[idx];
    });
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLen = data.users.length;
      data.users = data.users.filter((u) => u.id !== id);
      return data.users.length !== initialLen;
    });
  }

  // --- MUSIC RESOURCES ---
  async getMusicResources(): Promise<MusicResource[]> {
    return (await this.read()).musicResources;
  }

  async getMusicResourceById(id: string): Promise<MusicResource | undefined> {
    return findResourceById(await this.read(), id);
  }

  async createMusicResource(resource: MusicResource): Promise<MusicResource> {
    return this.mutate((data) => {
      data.musicResources.push(resource);
      return resource;
    });
  }

  async updateMusicResource(
    id: string,
    updates: Partial<MusicResource>
  ): Promise<MusicResource | null> {
    return this.mutate((data) => {
      const idx = data.musicResources.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      data.musicResources[idx] = {
        ...data.musicResources[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return data.musicResources[idx];
    });
  }

  // --- MUSIC SOURCES ---
  async getMusicSourcesByResourceId(resourceId: string): Promise<MusicSource[]> {
    return findSourcesByResourceId(await this.read(), resourceId);
  }

  async getMusicSourceByExternalId(
    provider: string,
    externalId: string
  ): Promise<MusicSource | undefined> {
    const data = await this.read();
    return data.musicSources.find((s) => s.provider === provider && s.externalId === externalId);
  }

  async createMusicSource(source: MusicSource): Promise<MusicSource> {
    return this.mutate((data) => {
      data.musicSources.push(source);
      return source;
    });
  }

  /** All music sources in one read (used for playlist sync diff). */
  async getMusicSources(): Promise<MusicSource[]> {
    return [...(await this.read()).musicSources];
  }

  /**
   * Non-destructive sync of a playlist against a fresh YouTube fetch.
   * - Existing tracks (matched by YouTube externalId) keep ALL curation
   *   (scores, tags, notes) — only raw metadata is refreshed.
   * - Missing tracks are created as clean slates (no scores/category).
   * - Order follows the YouTube reference: if known tracks moved, their
   *   sourcePosition is rewritten — this is the ONLY writer of sourcePosition
   *   besides the initial import (manual edits stay forbidden). Moved tracks
   *   are re-attached to their new section (previous track's category in
   *   reference order, next's when first — see recategorizeMovedTracks);
   *   unmoved tracks keep their category. The combined layout is simulated
   *   and applied ONLY when every category still groups consecutive tracks
   *   (same invariant as `wouldBreakChronology`); otherwise the old order
   *   AND old categories are kept, new tracks are appended, and the blocking
   *   categories are reported.
   * - Gap comments follow their anchor track on reorder; on a pure append a
   *   conclusion comment (after the old last track) follows the new end.
   * - Tracks absent from the fresh list are KEPT in place and reported.
   * Single mutate → atomic.
   */
  async syncPlaylistWithFreshTracks(
    playlistId: string,
    fresh: Array<{
      externalId: string;
      title: string;
      artist: string;
      album?: string;
      durationSeconds: number;
      coverImageUrl?: string;
      externalUrl: string;
    }>
  ): Promise<{
    added: MusicResource[];
    updatedCount: number;
    removedFromSource: MusicResource[];
    total: number;
    reorderApplied: boolean;
    reorderSkipped: Array<{
      categoryId: string;
      categoryName: string;
      trackIds: string[];
      trackTitles: string[];
    }>;
    /** Moved tracks whose section changed (title + from/to category ids). */
    recategorized: Array<{
      trackId: string;
      title: string;
      fromCategoryId: string | null;
      toCategoryId: string | null;
    }>;
    /** Fresh YouTube externalIds in reference order (diagnostic, read-only). */
    referenceOrder: string[];
  }> {
    const rand = () => Math.random().toString(36).slice(2, 8);
    return this.mutate((data) => {
      const playlist = findResourceById(data, playlistId);
      if (!playlist || playlist.type !== "playlist") {
        throw new Error("Playlist not found.");
      }
      const now = new Date().toISOString();

      // resourceId -> youtube externalId
      const extByResource = new Map<string, string>();
      for (const s of data.musicSources) {
        if (s.provider === "youtube" && s.musicResourceId && s.externalId) {
          if (!extByResource.has(s.musicResourceId)) {
            extByResource.set(s.musicResourceId, s.externalId);
          }
        }
      }

      const embedded: MusicResource[] = Array.isArray((playlist as any).tracks)
        ? (playlist as any).tracks
        : [];

      // Dedupe fresh (first wins), skip entries without externalId.
      const seen = new Set<string>();
      const freshUnique: typeof fresh = [];
      for (const f of fresh) {
        if (!f.externalId || seen.has(f.externalId)) continue;
        seen.add(f.externalId);
        freshUnique.push(f);
      }
      const freshIds = new Set(freshUnique.map((f) => f.externalId));
      const freshById = new Map(freshUnique.map((f) => [f.externalId, f]));

      // Existing refs: embedded copies first (source of truth for order),
      // fallback to top-level tracks carrying this playlistId (then seed the
      // embedded array so counts stay consistent).
      const topLevelTracks = data.musicResources.filter(
        (r) => r.type === "track" && r.playlistId === playlistId
      );
      if (embedded.length === 0 && topLevelTracks.length > 0) {
        (playlist as any).tracks = topLevelTracks.map((t) => ({ ...t }));
      }
      const existingRefs: MusicResource[] =
        (playlist as any).tracks?.length > 0
          ? [...((playlist as any).tracks as MusicResource[])]
          : [...topLevelTracks];

      let maxPos = -1;
      for (const t of existingRefs) {
        const p = t.sourcePosition ?? 0;
        if (p > maxPos) maxPos = p;
      }

      // resourceId per YouTube externalId (first wins on ambiguous data).
      const resByExt = new Map<string, string>();
      for (const t of existingRefs) {
        const ext = extByResource.get(t.id);
        if (ext && !resByExt.has(ext)) resByExt.set(ext, t.id);
      }
      const existingExtIds = new Set(resByExt.keys());

      // Order snapshot BEFORE any mutation, tracks sorted by position.
      const byPosition = [...existingRefs].sort(
        (a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)
      );

      // Has the reference order changed for known tracks? Compare the
      // reference sequence against the local sequence (stable ids).
      const matchedRefOrder: string[] = [];
      for (const f of freshUnique) {
        const rid = resByExt.get(f.externalId);
        if (rid) matchedRefOrder.push(rid);
      }
      const matchedLocalOrder = byPosition
        .filter((t) => {
          const ext = extByResource.get(t.id);
          return ext ? freshIds.has(ext) : false;
        })
        .map((t) => t.id);
      const orderChanged =
        matchedRefOrder.length > 1 &&
        matchedRefOrder.length === matchedLocalOrder.length &&
        matchedRefOrder.some((id, i) => id !== matchedLocalOrder[i]);

      // Proposed positions under the reference order: fresh tracks keep
      // their reference index (existing by identity, new as placeholders),
      // then kept-but-absent tracks (gone from YouTube or sourceless) tail
      // in old relative order — never deleted, never interleaved.
      const newPosOf = new Map<string, number>();
      const freshNewPos = new Map<string, number>();
      let cursor = 0;
      for (const f of freshUnique) {
        const rid = resByExt.get(f.externalId);
        if (rid) newPosOf.set(rid, cursor);
        else freshNewPos.set(f.externalId, cursor);
        cursor++;
      }
      const keptAbsent = byPosition.filter((t) => {
        const ext = extByResource.get(t.id);
        return !ext || !freshIds.has(ext);
      });
      for (const t of keptAbsent) newPosOf.set(t.id, cursor++);

      let updatedCount = 0;
      // Refresh raw metadata of matched tracks (curation untouched).
      for (const t of existingRefs) {
        const ext = extByResource.get(t.id);
        const f = ext ? freshById.get(ext) : undefined;
        if (!f) continue;
        const patch: Partial<MusicResource> = {};
        if (f.title && f.title !== t.title) patch.title = f.title;
        if (f.artist && f.artist !== t.artistName) patch.artistName = f.artist;
        const album = f.album || playlist.title;
        if (album && album !== t.albumName) patch.albumName = album;
        if (typeof f.durationSeconds === "number" && f.durationSeconds !== t.durationSeconds) {
          patch.durationSeconds = f.durationSeconds;
        }
        if (f.coverImageUrl && f.coverImageUrl !== t.coverImageUrl) {
          patch.coverImageUrl = f.coverImageUrl;
        }
        if (Object.keys(patch).length > 0) {
          if (patch.title) patch.normalizedTitle = normalizeMusicText(patch.title);
          if (patch.artistName) patch.normalizedArtist = normalizeMusicText(patch.artistName);
          patch.updatedAt = now;
          Object.assign(t, patch);
          // Mirror onto the top-level copy (embedded + top-level coexist).
          const topById = data.musicResources.find((r) => r.id === t.id);
          if (topById && topById !== t) Object.assign(topById, patch);
          const src = data.musicSources.find(
            (s) => s.provider === "youtube" && s.musicResourceId === t.id
          );
          if (src) {
            src.sourceTitle = f.title;
            src.sourceArtist = f.artist;
            src.sourceDurationSeconds = f.durationSeconds;
            src.externalUrl = f.externalUrl;
            src.updatedAt = now;
          }
          updatedCount++;
        }
      }

      // Category guard + auto-recategorization: the reference order is applied
      // together with a reassignment of MOVED tracks to their new section
      // (previous track's category in reference order, next's when first).
      // Unmoved tracks keep their category; scores/tags/notes are untouched.
      // The combined result is simulated and applied ONLY when every
      // category still groups consecutive tracks — otherwise the old order
      // is kept (legacy skip + report), so curation can never be corrupted.
      let reorderApplied = false;
      let reorderSkipped: Array<{
        categoryId: string;
        categoryName: string;
        trackIds: string[];
        trackTitles: string[];
      }> = [];
      // trackId -> { from, to } for moved tracks whose section changes.
      const recatChanges = new Map<string, { from: string | null; to: string | null }>();
      if (orderChanged) {
        const oldCatOf = new Map<string, string | null>(
          existingRefs.map((t) => [t.id, t.categoryId ?? null] as [string, string | null])
        );
        const moved = new Set<string>();
        for (const t of existingRefs) {
          const next = newPosOf.get(t.id);
          if (next !== undefined && next !== (t.sourcePosition ?? 0)) moved.add(t.id);
        }
        // Existing tracks in reference order (matched first, kept-absent
        // tailed) — new placeholders never serve as category anchors.
        const existingRefOrder = [
          ...matchedRefOrder,
          ...keptAbsent.map((t) => t.id),
        ];
        for (const [id, to] of recategorizeMovedTracks(existingRefOrder, oldCatOf, moved)) {
          recatChanges.set(id, { from: oldCatOf.get(id) ?? null, to });
        }
        const simulated = existingRefs.map((t) => ({
          id: t.id,
          categoryId: recatChanges.has(t.id)
            ? (recatChanges.get(t.id) as { to: string | null }).to
            : (t.categoryId ?? null),
          sourcePosition: newPosOf.get(t.id) ?? t.sourcePosition ?? 0,
        }));
        const violations = findChronologyViolations(simulated);
        if (violations.length === 0) {
          reorderApplied = true;
        } else {
          // Safety net: combined layout still invalid — keep everything.
          recatChanges.clear();
          const catName = new Map(
            data.playlistCategories
              .filter((c) => c.playlistId === playlistId)
              .map((c) => [c.id, c.name] as [string, string])
          );
          const titleOf = new Map(existingRefs.map((t) => [t.id, t.title] as [string, string]));
          reorderSkipped = violations.map((v) => ({
            categoryId: v.categoryId,
            categoryName: catName.get(v.categoryId) ?? v.categoryId,
            trackIds: v.trackIds,
            trackTitles: v.trackIds.map((id) => titleOf.get(id) ?? id),
          }));
        }
      }

      // sourcePosition writer (top-level + every embedded copy + enrichment).
      // Sync is the only path allowed to rewrite positions; manual edits
      // stay forbidden (see upsertTrackEnrichment + PATCH track route).
      const setPositionEverywhere = (resourceId: string, pos: number) => {
        for (const r of data.musicResources) {
          if (r.id === resourceId) {
            r.sourcePosition = pos;
            r.updatedAt = now;
          }
          if (r.type === "playlist" && Array.isArray((r as any).tracks)) {
            for (const t of (r as any).tracks as MusicResource[]) {
              if (t.id === resourceId) {
                t.sourcePosition = pos;
                t.updatedAt = now;
              }
            }
          }
        }
        const e = data.trackEnrichments.find((x) => x.resourceId === resourceId);
        if (e) {
          e.sourcePosition = pos;
          e.updatedAt = now;
        }
      };

      // Section writer for sync-driven recategorization (top-level + every
      // embedded copy + enrichment). ONLY categoryId is written — scores,
      // tags, notes and gaps are never touched here.
      const setCategoryEverywhere = (resourceId: string, categoryId: string | null) => {
        for (const r of data.musicResources) {
          if (r.id === resourceId) {
            r.categoryId = categoryId;
            r.updatedAt = now;
          }
          if (r.type === "playlist" && Array.isArray((r as any).tracks)) {
            for (const t of (r as any).tracks as MusicResource[]) {
              if (t.id === resourceId) {
                t.categoryId = categoryId;
                t.updatedAt = now;
              }
            }
          }
        }
        const e = data.trackEnrichments.find((x) => x.resourceId === resourceId);
        if (e) {
          e.categoryId = categoryId;
          e.updatedAt = now;
        }
      };

      const createFreshTrack = (
        f: (typeof freshUnique)[number],
        pos: number
      ): MusicResource => {
        const trackId = `res_trk_${Date.now()}_${pos}_${rand()}`;
        const track: MusicResource = {
          id: trackId,
          type: "track",
          title: f.title,
          artistName: f.artist,
          albumName: f.album || playlist.title,
          durationSeconds: f.durationSeconds,
          coverImageUrl:
            f.coverImageUrl ||
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600",
          normalizedTitle: normalizeMusicText(f.title),
          normalizedArtist: normalizeMusicText(f.artist),
          sourcePosition: pos,
          playlistId,
          categoryId: null,
          moodScore: null,
          softnessScore: null,
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        data.musicResources.push(track);
        if (!Array.isArray((playlist as any).tracks)) (playlist as any).tracks = [];
        ((playlist as any).tracks as MusicResource[]).push({ ...track });
        data.musicSources.push({
          id: `src_trk_${Date.now()}_${pos}_${rand()}`,
          musicResourceId: trackId,
          provider: "youtube",
          externalId: f.externalId,
          externalUrl: f.externalUrl,
          sourceTitle: track.title,
          sourceArtist: track.artistName,
          sourceDurationSeconds: track.durationSeconds,
          createdAt: now,
          updatedAt: now,
        });
        data.trackEnrichments.push({
          resourceId: trackId,
          playlistId,
          sourcePosition: pos,
          categoryId: null,
          moodScore: null,
          softnessScore: null,
          tags: [],
          updatedAt: now,
        });
        return track;
      };

      const added: MusicResource[] = [];
      if (reorderApplied) {
        // Anchor snapshot: gaps follow their track, not their position.
        const anchorAt = new Map<number, string>();
        for (const t of byPosition) {
          const p = t.sourcePosition ?? 0;
          if (!anchorAt.has(p)) anchorAt.set(p, t.id);
        }
        for (const t of existingRefs) {
          const pos = newPosOf.get(t.id);
          if (pos !== undefined && pos !== (t.sourcePosition ?? 0)) {
            setPositionEverywhere(t.id, pos);
          }
          // Section reassignment for moved tracks (verified violation-free
          // above). Everywhere-mirrored like positions; scores/tags/notes
          // untouched.
          const recat = recatChanges.get(t.id);
          if (recat && (t.categoryId ?? null) !== recat.to) {
            t.categoryId = recat.to;
            t.updatedAt = now;
            setCategoryEverywhere(t.id, recat.to);
          }
        }
        for (const f of freshUnique) {
          if (existingExtIds.has(f.externalId)) continue;
          const pos = freshNewPos.get(f.externalId);
          if (pos === undefined) continue;
          const track = createFreshTrack(f, pos);
          added.push(track);
          existingExtIds.add(f.externalId);
          newPosOf.set(track.id, pos);
        }
        // Keep the embedded array in reference order (readers sort anyway).
        ((playlist as any).tracks as MusicResource[]).sort(
          (a, b) => (a.sourcePosition ?? 0) - (b.sourcePosition ?? 0)
        );
        const newMax = cursor - 1;
        for (const g of data.gapComments) {
          if (g.playlistId !== playlistId) continue;
          const anchor = anchorAt.get(g.afterSourcePosition);
          const target =
            anchor !== undefined && newPosOf.has(anchor)
              ? (newPosOf.get(anchor) as number)
              : newMax;
          if (target !== g.afterSourcePosition) {
            g.afterSourcePosition = target;
            g.updatedAt = now;
          }
        }
      } else {
        // No (or blocked) reorder: append missing tracks after the old max
        // so existing positions, interior gaps and category blocks never shift.
        let nextPos = maxPos + 1;
        for (const f of freshUnique) {
          if (existingExtIds.has(f.externalId)) continue;
          const track = createFreshTrack(f, nextPos);
          added.push(track);
          existingExtIds.add(f.externalId);
          nextPos++;
        }
        // A conclusion comment ("after the last track") follows the new end
        // so it stays a conclusion instead of drifting into the interior.
        if (added.length > 0 && maxPos >= 0) {
          const newMax = nextPos - 1;
          if (newMax !== maxPos) {
            for (const g of data.gapComments) {
              if (g.playlistId === playlistId && g.afterSourcePosition === maxPos) {
                g.afterSourcePosition = newMax;
                g.updatedAt = now;
              }
            }
          }
        }
      }

      // Tracks kept locally but gone from YouTube (signal only — never deleted).
      const removedFromSource = existingRefs
        .filter((t) => {
          const ext = extByResource.get(t.id);
          return ext ? !freshIds.has(ext) : false;
        })
        .map((t) => ({ ...t }));

      // Recategorization report (only when the reorder was applied; the
      // safety-net skip path clears recatChanges, so this is empty there).
      const titleOf = new Map(existingRefs.map((t) => [t.id, t.title] as [string, string]));
      const recategorized = [...recatChanges.entries()].map(([trackId, c]) => ({
        trackId,
        title: titleOf.get(trackId) ?? trackId,
        fromCategoryId: c.from,
        toCategoryId: c.to,
      }));

      const allTracks: MusicResource[] = Array.isArray((playlist as any).tracks)
        ? (playlist as any).tracks
        : [];
      playlist.trackCount = allTracks.length;
      playlist.subtitle = `${allTracks.length} tracks`;
      playlist.durationSeconds = allTracks.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
      playlist.updatedAt = now;

      return { added, updatedCount, removedFromSource, total: allTracks.length, reorderApplied, reorderSkipped, recategorized, referenceOrder: freshUnique.map((f) => f.externalId) };
    });
  }

  // --- MUSIC SHARES ---
  async getMusicShares(viewerId?: string): Promise<MusicShare[]> {
    const data = await this.read();
    return data.musicShares.map((share) => hydrateShare(data, share, viewerId));
  }

  async getMusicShareById(id: string, viewerId?: string): Promise<MusicShare | undefined> {
    const data = await this.read();
    const share = data.musicShares.find((s) => s.id === id);
    return share ? hydrateShare(data, share, viewerId) : undefined;
  }

  async getMusicSharesByAuthorId(authorId: string, viewerId?: string): Promise<MusicShare[]> {
    const data = await this.read();
    return data.musicShares
      .filter((s) => s.authorId === authorId)
      .map((s) => hydrateShare(data, s, viewerId));
  }

  async createMusicShare(share: MusicShare): Promise<MusicShare> {
    return this.mutate((data) => {
      // Defaults for new persistence fields (non-destructive for legacy data)
      if (!share.likedByUserIds) share.likedByUserIds = [];
      if (!share.allowedUserIds) share.allowedUserIds = [];
      if (share.likesCount === undefined) share.likesCount = 0;
      data.musicShares.unshift(share);
      return hydrateShare(data, share);
    });
  }

  async updateMusicShare(id: string, updates: Partial<MusicShare>): Promise<MusicShare | null> {
    return this.mutate((data) => {
      const share = data.musicShares.find((s) => s.id === id);
      if (!share) return null;
      // Likes are only mutated via toggleShareLike — never by a raw update.
      const { likedByUserIds: _l, likesCount: _c, ...safe } = updates as any;
      Object.assign(share, safe, { updatedAt: new Date().toISOString() });
      return hydrateShare(data, share);
    });
  }

  /** Toggle a like. Returns the hydrated share + whether the user now likes it. */
  async toggleShareLike(
    shareId: string,
    userId: string
  ): Promise<{ share: MusicShare; liked: boolean } | null> {
    return this.mutate((data) => {
      const share = data.musicShares.find((s) => s.id === shareId);
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
      return { share: hydrateShare(data, share, userId), liked };
    });
  }

  /** A share is visible to viewerId when public, or when author / explicitly allowed / participant. */
  async isShareVisibleTo(share: MusicShare, viewerId?: string | null): Promise<boolean> {
    const data = await this.read();
    // Re-resolve against fresh data (the passed share may come from another instance).
    const fresh = data.musicShares.find((s) => s.id === share.id) ?? share;
    return shareIsVisibleTo(data, fresh, viewerId);
  }

  /** Most used tags across shares + track enrichments. */
  async getTopTags(limit = 12): Promise<{ tag: string; count: number }[]> {
    const data = await this.read();
    const counts = new Map<string, number>();
    const add = (tags?: string[]) => {
      for (const raw of tags || []) {
        const t = raw.trim().toLowerCase().replace(/^#/, "").slice(0, 40);
        if (!t) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    };
    for (const s of data.musicShares) add(s.tags);
    for (const e of data.trackEnrichments) add(e.tags);
    for (const r of data.musicResources) add(r.tags);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, Math.max(1, Math.min(30, limit)));
  }

  /** Delete a share + its conversation (participants, comments, mentions). Keeps music resources. */
  async deleteShareCascade(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const share = data.musicShares.find((s) => s.id === id);
      if (!share) return false;
      const convId = share.conversationId;
      data.musicShares = data.musicShares.filter((s) => s.id !== id);
      data.conversationThreads = data.conversationThreads.filter((t) => t.id !== convId);
      data.conversationParticipants = data.conversationParticipants.filter(
        (p) => p.conversationId !== convId
      );
      const commentIds = new Set(
        data.comments.filter((c) => c.conversationId === convId).map((c) => c.id)
      );
      data.comments = data.comments.filter((c) => c.conversationId !== convId);
      if (commentIds.size > 0) {
        data.mentions = data.mentions.filter((m) => !commentIds.has(m.commentId));
      }
      return true;
    });
  }

  async deleteMusicShare(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLen = data.musicShares.length;
      data.musicShares = data.musicShares.filter((s) => s.id !== id);
      return data.musicShares.length !== initialLen;
    });
  }

  // --- CONVERSATION THREADS ---
  async getConversationThreads(): Promise<ConversationThread[]> {
    const data = await this.read();
    return data.conversationThreads.map((t) => hydrateThread(data, t));
  }

  async getConversationThreadById(id: string): Promise<ConversationThread | undefined> {
    const data = await this.read();
    const thread = data.conversationThreads.find((t) => t.id === id);
    return thread ? hydrateThread(data, thread) : undefined;
  }

  async createConversationThread(thread: ConversationThread): Promise<ConversationThread> {
    return this.mutate((data) => {
      data.conversationThreads.unshift(thread);
      return hydrateThread(data, thread);
    });
  }

  async updateConversationActivity(id: string): Promise<void> {
    await this.mutate((data) => {
      const thread = data.conversationThreads.find((t) => t.id === id);
      if (thread) {
        thread.lastActivityAt = new Date().toISOString();
      }
    });
  }

  async updateConversationThread(
    id: string,
    updates: Partial<ConversationThread>
  ): Promise<ConversationThread | null> {
    return this.mutate((data) => {
      const thread = data.conversationThreads.find((t) => t.id === id);
      if (!thread) return null;
      Object.assign(thread, updates, { updatedAt: new Date().toISOString() });
      return hydrateThread(data, thread);
    });
  }

  // --- CONVERSATION PARTICIPANTS ---
  async getParticipantsByConversationId(
    conversationId: string
  ): Promise<ConversationParticipant[]> {
    const data = await this.read();
    return data.conversationParticipants
      .filter((p) => p.conversationId === conversationId)
      .map((p) => ({
        ...p,
        user: publicAuthor(findUserById(data, p.userId)),
      }));
  }

  async addParticipant(participant: ConversationParticipant): Promise<ConversationParticipant> {
    return this.mutate((data) => {
      const exists = data.conversationParticipants.find(
        (p) => p.conversationId === participant.conversationId && p.userId === participant.userId
      );
      if (exists) return exists;
      data.conversationParticipants.push(participant);
      return participant;
    });
  }

  /** Remove a participant (used when uninviting someone from a private share). */
  async removeParticipant(conversationId: string, userId: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLen = data.conversationParticipants.length;
      data.conversationParticipants = data.conversationParticipants.filter(
        (p) => !(p.conversationId === conversationId && p.userId === userId)
      );
      return data.conversationParticipants.length !== initialLen;
    });
  }

  // --- COMMENTS ---
  async getCommentsByConversationId(conversationId: string): Promise<Comment[]> {
    const data = await this.read();
    const rawComments = data.comments.filter(
      (c) => c.conversationId === conversationId && !c.deletedAt
    );

    const topLevel = rawComments.filter((c) => !c.parentCommentId);
    const replies = rawComments.filter((c) => !!c.parentCommentId);

    return topLevel.map((c) => hydrateComment(data, c, replies));
  }

  async getCommentById(id: string): Promise<Comment | undefined> {
    const data = await this.read();
    const comment = data.comments.find((c) => c.id === id);
    return comment ? hydrateComment(data, comment, []) : undefined;
  }

  /** Most recent non-deleted comments by a user (for public profiles). */
  async getRecentCommentsByUserId(userId: string, limit = 3): Promise<Comment[]> {
    const data = await this.read();
    return data.comments
      .filter((c) => c.authorId === userId && !c.deletedAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, Math.max(1, Math.min(20, limit)))
      .map((c) => hydrateComment(data, c, []));
  }

  async createComment(comment: Comment): Promise<Comment> {
    return this.mutate((data) => {
      data.comments.push(comment);
      const thread = data.conversationThreads.find((t) => t.id === comment.conversationId);
      if (thread) thread.lastActivityAt = new Date().toISOString();
      return hydrateComment(data, comment, []);
    });
  }

  async updateComment(id: string, updates: Partial<Comment>): Promise<Comment | null> {
    return this.mutate((data) => {
      const idx = data.comments.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      data.comments[idx] = {
        ...data.comments[idx],
        ...updates,
        isEdited: true,
        updatedAt: new Date().toISOString(),
      };
      return hydrateComment(data, data.comments[idx], []);
    });
  }

  async deleteComment(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const comment = data.comments.find((c) => c.id === id);
      if (!comment) return false;
      comment.deletedAt = new Date().toISOString();
      return true;
    });
  }

  async toggleCommentReaction(
    commentId: string,
    emoji: string,
    userId: string
  ): Promise<Comment | null> {
    return this.mutate((data) => {
      const comment = data.comments.find((c) => c.id === commentId);
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

      return hydrateComment(data, comment, []);
    });
  }

  // --- MENTIONS ---
  async createMention(mention: Mention): Promise<Mention> {
    return this.mutate((data) => {
      data.mentions.push(mention);
      return mention;
    });
  }

  // --- EXTERNAL CONNECTIONS ---
  async getConnectionsByUserId(userId: string): Promise<ExternalConnection[]> {
    const data = await this.read();
    return data.externalConnections.filter((c) => c.userId === userId);
  }

  async getConnection(
    userId: string,
    provider: 'spotify' | 'apple_music'
  ): Promise<ExternalConnection | undefined> {
    const data = await this.read();
    return data.externalConnections.find((c) => c.userId === userId && c.provider === provider);
  }

  async saveConnection(connection: ExternalConnection): Promise<ExternalConnection> {
    return this.mutate((data) => {
      const idx = data.externalConnections.findIndex(
        (c) => c.userId === connection.userId && c.provider === connection.provider
      );
      if (idx !== -1) {
        data.externalConnections[idx] = {
          ...data.externalConnections[idx],
          ...connection,
          // Ne jamais écraser les tokens chiffrés avec des valeurs vides
          accessTokenEncrypted:
            connection.accessTokenEncrypted || data.externalConnections[idx].accessTokenEncrypted,
          refreshTokenEncrypted:
            connection.refreshTokenEncrypted ?? data.externalConnections[idx].refreshTokenEncrypted,
          updatedAt: new Date().toISOString(),
        };
      } else {
        data.externalConnections.push(connection);
      }
      return connection;
    });
  }

  async deleteConnection(userId: string, provider: 'spotify' | 'apple_music'): Promise<boolean> {
    return this.mutate((data) => {
      const initialLen = data.externalConnections.length;
      data.externalConnections = data.externalConnections.filter(
        (c) => !(c.userId === userId && c.provider === provider)
      );
      return data.externalConnections.length !== initialLen;
    });
  }

  // --- EXPORT JOBS ---
  async getExportJobsByUserId(userId: string): Promise<ExportJob[]> {
    const data = await this.read();
    return data.exportJobs.filter((j) => j.userId === userId);
  }

  async getExportJobById(id: string): Promise<ExportJob | undefined> {
    const data = await this.read();
    return data.exportJobs.find((j) => j.id === id);
  }

  async createExportJob(job: ExportJob): Promise<ExportJob> {
    return this.mutate((data) => {
      data.exportJobs.unshift(job);
      return job;
    });
  }

  async updateExportJob(id: string, updates: Partial<ExportJob>): Promise<ExportJob | null> {
    return this.mutate((data) => {
      const idx = data.exportJobs.findIndex((j) => j.id === id);
      if (idx === -1) return null;
      data.exportJobs[idx] = {
        ...data.exportJobs[idx],
        ...updates,
      };
      return data.exportJobs[idx];
    });
  }

  // --- NOTIFICATIONS ---
  async getNotificationsByUserId(userId: string): Promise<Notification[]> {
    const data = await this.read();
    return data.notifications
      .filter((n) => n.recipientId === userId)
      .map((n) => ({
        ...n,
        actor: n.actorId ? publicAuthor(findUserById(data, n.actorId)) : undefined,
        musicResource: n.musicResourceId ? findResourceById(data, n.musicResourceId) : undefined,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createNotification(notif: Notification): Promise<Notification> {
    return this.mutate((data) => {
      data.notifications.unshift(notif);
      return notif;
    });
  }

  async markNotificationAsRead(id: string, userId: string): Promise<boolean> {
    return this.mutate((data) => {
      const notif = data.notifications.find((n) => n.id === id && n.recipientId === userId);
      if (notif) {
        notif.isRead = true;
        return true;
      }
      return false;
    });
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    return this.mutate((data) => {
      let count = 0;
      data.notifications.forEach((n) => {
        if (n.recipientId === userId && !n.isRead) {
          n.isRead = true;
          count++;
        }
      });
      return count;
    });
  }

  // --- REPORTS (MODERATION) ---
  async getReports(): Promise<Report[]> {
    const data = await this.read();
    return data.reports.map((r) => ({
      ...r,
      reporter: publicAuthor(findUserById(data, r.reporterId)),
    }));
  }

  async createReport(report: Report): Promise<Report> {
    return this.mutate((data) => {
      data.reports.unshift(report);
      return report;
    });
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | null> {
    return this.mutate((data) => {
      const idx = data.reports.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      data.reports[idx] = {
        ...data.reports[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return data.reports[idx];
    });
  }

  // --- PLAYLIST CATEGORIES (manual curation, no auto-classification) ---
  async getPlaylistCategories(playlistId: string): Promise<PlaylistCategory[]> {
    const data = await this.read();
    return data.playlistCategories
      .filter((c) => c.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  async createPlaylistCategory(cat: PlaylistCategory): Promise<PlaylistCategory> {
    return this.mutate((data) => {
      data.playlistCategories.push(cat);
      return cat;
    });
  }

  async updatePlaylistCategory(
    id: string,
    updates: Partial<PlaylistCategory>
  ): Promise<PlaylistCategory | null> {
    return this.mutate((data) => {
      const idx = data.playlistCategories.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      data.playlistCategories[idx] = {
        ...data.playlistCategories[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return data.playlistCategories[idx];
    });
  }

  async deletePlaylistCategory(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const cat = data.playlistCategories.find((c) => c.id === id);
      if (!cat) return false;
      // Unassign tracks (they become uncategorized, order preserved)
      for (const r of data.musicResources) {
        if (r.categoryId === id) r.categoryId = null;
      }
      for (const pl of data.musicResources) {
        if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
          for (const t of (pl as any).tracks) {
            if (t.categoryId === id) t.categoryId = null;
          }
        }
      }
      for (const e of data.trackEnrichments) {
        if (e.categoryId === id) e.categoryId = null;
      }
      data.playlistCategories = data.playlistCategories.filter((c) => c.id !== id);
      return true;
    });
  }

  // --- EMOTIONAL CRITERIA (custom curves beyond mood & softness) ---
  async getEmotionalCriteria(playlistId: string): Promise<EmotionalCriterion[]> {
    const data = await this.read();
    return data.emotionalCriteria
      .filter((c) => c.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
  }

  async createEmotionalCriterion(criterion: EmotionalCriterion): Promise<EmotionalCriterion> {
    return this.mutate((data) => {
      data.emotionalCriteria.push(criterion);
      return criterion;
    });
  }

  async updateEmotionalCriterion(
    id: string,
    updates: Partial<EmotionalCriterion>
  ): Promise<EmotionalCriterion | null> {
    return this.mutate((data) => {
      const idx = data.emotionalCriteria.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      data.emotionalCriteria[idx] = {
        ...data.emotionalCriteria[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return data.emotionalCriteria[idx];
    });
  }

  async deleteEmotionalCriterion(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const criterion = data.emotionalCriteria.find((c) => c.id === id);
      if (!criterion) return false;
      // Strip this criterion's scores everywhere.
      for (const r of data.musicResources) {
        if (r.customScores && id in r.customScores) delete r.customScores[id];
      }
      for (const pl of data.musicResources) {
        if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
          for (const t of (pl as any).tracks as MusicResource[]) {
            if (t.customScores && id in t.customScores) delete t.customScores[id];
          }
        }
      }
      for (const e of data.trackEnrichments) {
        if (e.customScores && id in e.customScores) delete e.customScores[id];
      }
      data.emotionalCriteria = data.emotionalCriteria.filter((c) => c.id !== id);
      return true;
    });
  }

  // --- TRACK ENRICHMENT (manual metadata only) ---
  async getTrackEnrichment(resourceId: string): Promise<TrackEnrichment | undefined> {
    return findEnrichment(await this.read(), resourceId);
  }

  async upsertTrackEnrichment(
    resourceId: string,
    updates: Partial<Pick<TrackEnrichment, "categoryId" | "moodScore" | "softnessScore" | "customScores" | "tags" | "playlistId" | "sourcePosition">>
  ): Promise<TrackEnrichment | null> {
    return this.mutate((data) => {
      const resource = findResourceById(data, resourceId);
      // sourcePosition is immutable: refuse any attempt to change it
      if (updates.sourcePosition !== undefined) {
        const current = resource?.sourcePosition ?? findEnrichment(data, resourceId)?.sourcePosition;
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
      let e = data.trackEnrichments.find((x) => x.resourceId === resourceId);
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
        data.trackEnrichments.push(e);
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
      for (const pl of data.musicResources) {
        if (pl.type === "playlist" && Array.isArray((pl as any).tracks)) {
          const t = ((pl as any).tracks as MusicResource[]).find((x) => x.id === resourceId);
          if (t) mirror(t);
        }
      }
      return e;
    });
  }

  /** Playlist + tracks enriched, tracks ALWAYS sorted by sourcePosition. */
  async getCuratedPlaylist(
    playlistId: string
  ): Promise<{ playlist: MusicResource; categories: PlaylistCategory[]; tracks: MusicResource[] } | null> {
    const data = await this.read();
    const playlist = findResourceById(data, playlistId);
    if (!playlist || playlist.type !== "playlist") return null;
    const categories = data.playlistCategories
      .filter((c) => c.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
    let tracks: MusicResource[] = [];
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      tracks = [...playlist.tracks];
    } else {
      tracks = data.musicResources.filter((r) => r.type === "track" && r.playlistId === playlistId);
      // Fallback: standalone tracks carry enrichment
      tracks = tracks.map((t) => {
        const e = findEnrichment(data, t.id);
        return e
          ? { ...t, sourcePosition: e.sourcePosition, categoryId: e.categoryId, moodScore: e.moodScore, softnessScore: e.softnessScore, customScores: { ...(e.customScores ?? {}), ...(t.customScores ?? {}) }, tags: e.tags }
          : t;
      });
    }
    // Enrich embedded copies from enrichment table
    tracks = tracks.map((t) => {
      const e = findEnrichment(data, t.id);
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
  async getTrackNotes(trackId: string): Promise<TrackNote[]> {
    const data = await this.read();
    const all = data.trackNotes.filter((n) => n.trackId === trackId && !n.deletedAt);    const roots = all.filter((n) => !n.parentNoteId);
    const replies = all.filter((n) => !!n.parentNoteId);
    return roots
      .map((r) => hydrateTrackNote(data, r, replies))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getTrackInitialNote(trackId: string): Promise<TrackNote | undefined> {
    const data = await this.read();
    const roots = data.trackNotes.filter((n) => n.trackId === trackId && !n.parentNoteId && !n.deletedAt);
    if (roots.length === 0) return undefined;
    const sorted = [...roots].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return hydrateTrackNote(data, sorted[0], data.trackNotes);
  }

  /** Every non-deleted track note (for tag aggregation — filter visibility at the call site). */
  async getAllTrackNotes(): Promise<TrackNote[]> {
    const data = await this.read();
    const all = data.trackNotes.filter((n) => !n.deletedAt);
    const replies = all.filter((n) => !!n.parentNoteId);
    return all.map((n) => hydrateTrackNote(data, n, replies));
  }

  async createTrackNote(note: TrackNote): Promise<TrackNote> {
    return this.mutate((data) => {
      // Only ONE initial note per track: further top-level attempts become replies is handled by API
      data.trackNotes.push(note);
      return hydrateTrackNote(data, note, []);
    });
  }

  async updateTrackNote(
    id: string,
    updates: Partial<TrackNote>,
    requesterId: string
  ): Promise<TrackNote | null> {
    void requesterId;
    return this.mutate((data) => {
      const idx = data.trackNotes.findIndex((n) => n.id === id);
      if (idx === -1) return null;
      const existing = data.trackNotes[idx];
      // Initial note: set in stone once published — no edits by anyone (author included)
      if (existing.isInitial && existing.isLocked) {
        throw new Error("The opening editorial note cannot be edited or deleted.");
      }
      data.trackNotes[idx] = {
        ...existing,
        ...updates,
        id: existing.id,
        trackId: existing.trackId,
        isInitial: existing.isInitial,
        isLocked: existing.isLocked,
        isEdited: true,
        updatedAt: new Date().toISOString(),
      };
      return hydrateTrackNote(data, data.trackNotes[idx], []);
    });
  }

  async deleteTrackNote(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const note = data.trackNotes.find((n) => n.id === id);
      if (!note) return false;
      if (note.isInitial && note.isLocked) {
        throw new Error("The opening editorial note cannot be edited or deleted.");
      }
      note.deletedAt = new Date().toISOString();
      return true;
    });
  }

  // --- GAP COMMENTS (between two consecutive tracks) ---
  async getGapComments(playlistId: string): Promise<GapComment[]> {
    const data = await this.read();
    return data.gapComments
      .filter((g) => g.playlistId === playlistId)
      .map((g) => ({ ...g, author: publicAuthor(findUserById(data, g.authorId)) }))
      .sort((a, b) => a.afterSourcePosition - b.afterSourcePosition);
  }

  /** Every gap comment (for tag aggregation — filter visibility at the call site). */
  async getAllGapComments(): Promise<GapComment[]> {
    const data = await this.read();
    return data.gapComments.map((g) => ({
      ...g,
      author: publicAuthor(findUserById(data, g.authorId)),
    }));
  }

  async createGapComment(gap: GapComment): Promise<GapComment> {
    return this.mutate((data) => {
      data.gapComments.push(gap);
      return { ...gap, author: publicAuthor(findUserById(data, gap.authorId)) };
    });
  }

  async deleteGapComment(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLen = data.gapComments.length;
      data.gapComments = data.gapComments.filter((g) => g.id !== id);
      return data.gapComments.length !== initialLen;
    });
  }

  /** Share that published a playlist resource (for ownership checks). */
  async getShareByResourceId(resourceId: string): Promise<MusicShare | undefined> {
    const data = await this.read();
    const share = data.musicShares.find((s) => s.resourceId === resourceId);
    return share ? hydrateShare(data, share) : undefined;
  }

  /** Every share pointing at a resource (a playlist can be shared several times). */
  async getSharesByResourceId(resourceId: string): Promise<MusicShare[]> {
    const data = await this.read();
    return data.musicShares
      .filter((s) => s.resourceId === resourceId)
      .map((s) => hydrateShare(data, s));
  }
}

declare global {
  var __melomania_db: MelomaniaDatabase | undefined;
}

export const db: MelomaniaDatabase = global.__melomania_db || new MelomaniaDatabase();
if (process.env.NODE_ENV !== "production") {
  global.__melomania_db = db;
}
