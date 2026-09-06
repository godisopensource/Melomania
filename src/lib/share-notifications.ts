// src/lib/share-notifications.ts — notify everyone involved in a shared playlist/share.
// A "shared playlist" audience = share author + explicitly allowed users +
// conversation participants. Used when someone writes something on a shared
// context (share conversation comment, track note under a track of a shared
// playlist, ...).

import { db } from "@/lib/db";
import { MusicShare, NotificationType } from "@/types";

const rand = () => Math.random().toString(36).slice(2, 6);

/** All user ids that should hear about activity on this share. */
export async function getShareAudienceUserIds(share: MusicShare): Promise<string[]> {
  const ids = new Set<string>();
  if (share.authorId) ids.add(share.authorId);
  for (const uid of share.allowedUserIds || []) ids.add(uid);
  try {
    const participants = await db.getParticipantsByConversationId(share.conversationId);
    for (const p of participants) ids.add(p.userId);
  } catch {}
  return [...ids];
}

interface NotifyAudienceOptions {
  share: MusicShare;
  actorId: string;
  actorDisplayName: string;
  type: NotificationType;
  message: string;
  conversationId?: string;
  commentId?: string;
  /** Track id for track notes, playlist/track resource id otherwise. */
  musicResourceId?: string;
  shareId?: string;
  /** Users already notified via mention/reply — skipped here to avoid doubles. */
  excludeUserIds?: Iterable<string>;
}

/** Create one notification per audience member (except actor + excluded). */
export async function notifyShareAudience(opts: NotifyAudienceOptions): Promise<number> {
  const excluded = new Set(opts.excludeUserIds || []);
  excluded.add(opts.actorId);
  const audience = await getShareAudienceUserIds(opts.share);
  const now = new Date().toISOString();
  let created = 0;
  for (const recipientId of audience) {
    if (excluded.has(recipientId)) continue;
    await db.createNotification({
      id: `notif_${Date.now()}_${rand()}_${created}`,
      recipientId,
      actorId: opts.actorId,
      type: opts.type,
      conversationId: opts.conversationId ?? opts.share.conversationId,
      commentId: opts.commentId,
      shareId: opts.shareId ?? opts.share.id,
      musicResourceId: opts.musicResourceId ?? opts.share.resourceId,
      isRead: false,
      message: opts.message,
      createdAt: now,
    });
    created++;
  }
  return created;
}
