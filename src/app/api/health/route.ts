import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded } from "@/server/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;
  try {
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
    ok = false;
  }
  if (ok) {
    try {
      const res = await ensureSeeded();
      checks.seed = res.seeded ? "applied" : "ready";
    } catch {
      checks.seed = "pending";
    }
  }
  return Response.json(
    { status: ok ? "ok" : "degraded", app: "StudyNova AI", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
