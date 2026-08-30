import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ notifications: [] });
  }

  const notifications = db.getNotificationsByUserId(user.id);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await req.json();
  const { id, markAll } = body;

  if (markAll) {
    const updatedCount = db.markAllNotificationsAsRead(user.id);
    return NextResponse.json({ success: true, count: updatedCount });
  }

  if (id) {
    const ok = db.markNotificationAsRead(id, user.id);
    return NextResponse.json({ success: ok });
  }

  return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
}
