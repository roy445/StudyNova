export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  // Load the router only at request time. The router imports the database
  // singleton, which must not be evaluated while Next.js collects route data
  // during a build where DATABASE_URL is intentionally unavailable.
  const { handleApiRequest } = await import("@/server/router");
  const url = new URL(request.url);
  url.searchParams.set("task", "queue_drain");
  const delegated = new Request(url, { method: "GET", headers: request.headers });
  return handleApiRequest(delegated, ["system", "cron"]);
}
