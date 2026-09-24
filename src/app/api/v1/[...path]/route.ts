import { handleApiRequest } from "@/server/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// File-based admin question generation may need provider fallback time.
export const maxDuration = 300;

type Params = { params: Promise<{ path: string[] }> };

async function dispatch(req: Request, ctx: Params) {
  const { path } = await ctx.params;
  return handleApiRequest(req, path ?? []);
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
