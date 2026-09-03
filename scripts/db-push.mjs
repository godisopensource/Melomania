// scripts/db-push.mjs — Rescue/seed tool: uploads the local .melomania-db.json
// document into the Neon Postgres store used in production.
//
// Usage:
//   DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require" npm run db:push
//
// It upserts the single `melomania_store` row, so it is safe to run on an
// empty database. It OVERWRITES whatever is currently stored in Postgres
// with the local file — only run it when that is what you want (first
// production seed, or restoring from a local copy).
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL env var.");
  console.error('Usage: DATABASE_URL="postgresql://..." npm run db:push');
  process.exit(1);
}

const filePath = path.join(process.cwd(), ".melomania-db.json");
if (!fs.existsSync(filePath)) {
  console.error(`Local database file not found: ${filePath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
if (!raw || !Array.isArray(raw.users) || !raw.users.some((u) => u.username === "admin")) {
  console.error("Local file looks invalid (no users array or no admin user). Aborting.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS melomania_store (
  id TEXT PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
await sql`INSERT INTO melomania_store (id, version, data)
  VALUES ('main', 1, ${JSON.stringify(raw)}::jsonb)
  ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data, version = melomania_store.version + 1, updated_at = now()`;

const counts = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v])
);
console.log("Uploaded local database to Neon. Collections:", JSON.stringify(counts));
