// src/app/api/tags/route.ts — top tags created by users
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(30, Number(searchParams.get("limit")) || 12));
  const tags = db.getTopTags(limit);
  return NextResponse.json({ tags });
}
