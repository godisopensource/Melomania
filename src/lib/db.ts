import fs from "fs";
import path from "path";
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
}

const DB_FILE_PATH = path.join(process.cwd(), ".melomania-db.json");

// Clean Production Seed
function getInitialSeed(): DatabaseSchema {
  const adminPasswordHash = bcrypt.hashSync("9caxV&H2hhLg2n%tJ8Z!s%Zm0", 10);
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
          return parsed;
        }
      }
    } catch (err) {
      console.warn("Initializing clean database seed.", err);
    }
    const initial = getInitialSeed();
    this.saveToDisk(initial);
    return initial;
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
  getMusicShares(): MusicShare[] {
    return this.data.musicShares.map((share) => this.hydrateShare(share));
  }

  getMusicShareById(id: string): MusicShare | undefined {
    const share = this.data.musicShares.find((s) => s.id === id);
    return share ? this.hydrateShare(share) : undefined;
  }

  getMusicSharesByAuthorId(authorId: string): MusicShare[] {
    return this.data.musicShares
      .filter((s) => s.authorId === authorId)
      .map((s) => this.hydrateShare(s));
  }

  createMusicShare(share: MusicShare): MusicShare {
    this.data.musicShares.unshift(share);
    this.persist();
    return this.hydrateShare(share);
  }

  deleteMusicShare(id: string): boolean {
    const initialLen = this.data.musicShares.length;
    this.data.musicShares = this.data.musicShares.filter((s) => s.id !== id);
    this.persist();
    return this.data.musicShares.length !== initialLen;
  }

  private hydrateShare(share: MusicShare): MusicShare {
    return {
      ...share,
      author: this.getUserById(share.authorId),
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
      createdBy: this.getUserById(thread.createdById),
      share,
    };
  }

  // --- CONVERSATION PARTICIPANTS ---
  getParticipantsByConversationId(conversationId: string): ConversationParticipant[] {
    return this.data.conversationParticipants
      .filter((p) => p.conversationId === conversationId)
      .map((p) => ({
        ...p,
        user: this.getUserById(p.userId),
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
      author: this.getUserById(comment.authorId),
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
        actor: n.actorId ? this.getUserById(n.actorId) : undefined,
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
      reporter: this.getUserById(r.reporterId),
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
}

declare global {
  var __melomania_db: MelomaniaDatabase | undefined;
}

export const db: MelomaniaDatabase = global.__melomania_db || new MelomaniaDatabase();
if (process.env.NODE_ENV !== "production") {
  global.__melomania_db = db;
}
