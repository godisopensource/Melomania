// src/app/api/notifications/route.ts — /api/notifications : gestion des notifications

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ notifications: [] });
  }

  const notifications = await db.getNotificationsByUserId(user.id);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json();
  const { id, markAll } = body;

  if (markAll) {
    const updatedCount = await db.markAllNotificationsAsRead(user.id);
    return NextResponse.json({ success: true, count: updatedCount });
  }

  if (id) {
    const ok = await db.markNotificationAsRead(id, user.id);
    return NextResponse.json({ success: ok });
  }

  return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
}
