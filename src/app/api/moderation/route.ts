// src/app/api/moderation/route.ts — /api/moderation : signalements et actions de modération

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Report } from "@/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Access restricted to administrators" }, { status: 403 });
  }

  const reports = await db.getReports();
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to report content." }, { status: 401 });
  }

  const body = await req.json();
  const { targetType, targetId, reason } = body;

  if (!targetType || !targetId || !reason) {
    return NextResponse.json({ error: "Missing required information for report." }, { status: 400 });
  }

  const report: Report = {
    id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    reporterId: user.id,
    targetType,
    targetId,
    reason,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.createReport(report);
  return NextResponse.json({ success: true, report });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { id, status, adminNotes } = body;

  const updated = await db.updateReport(id, { status, adminNotes });
  return NextResponse.json({ report: updated });
}
