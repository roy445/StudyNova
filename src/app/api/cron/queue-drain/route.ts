import { handleApiRequest } from "@/server/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.searchParams.set("task", "queue_drain");
  const delegated = new Request(url, { method: "GET", headers: request.headers });
  return handleApiRequest(delegated, ["system", "cron"]);
}
