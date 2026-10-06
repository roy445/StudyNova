import { pool } from "@/db";
import { diagnoseDatabaseRuntime } from "@/server/db-runtime-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const diagnostic = await diagnoseDatabaseRuntime(pool);
  const ok = diagnostic.connection === "success" && diagnostic.query === "success";
  if (!ok) console.error("[StudyNova][db-runtime-health]", JSON.stringify(diagnostic));
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      app: "StudyNova AI",
      checks: {
        databaseConfigured: diagnostic.databaseConfigured,
        connection: diagnostic.connection,
        query: diagnostic.query,
        latencyMs: diagnostic.latencyMs,
      },
      runtime: {
        environment: diagnostic.environment,
        target: diagnostic.target,
        stages: diagnostic.stages,
        pool: diagnostic.pool,
      },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
