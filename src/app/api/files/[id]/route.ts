import { getSession } from "@/server/auth";
import { readObject, verifyObjectSignature, objectOwner } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp") ?? 0);
  const sig = url.searchParams.get("sig") ?? "";
  const viewer = url.searchParams.get("v") ?? "";

  const session = await getSession();
  const owner = await objectOwner(id);
  if (!owner) return new Response("Not found", { status: 404 });

  const signedOk = sig && viewer && verifyObjectSignature(id, viewer, exp, sig) && session?.user.userId === viewer;
  const ownerOk = session && owner.userId === session.user.userId;
  const adminOk = session && (session.user.role === "admin" || session.user.role === "owner") && owner.userId === session.user.userId;

  if (!signedOk && !ownerOk && !adminOk) return new Response("Forbidden", { status: 403 });

  const obj = await readObject(id);
  return new Response(new Uint8Array(obj.data), {
    headers: {
      "content-type": obj.mimeType,
      "cache-control": "private, max-age=300",
      "content-disposition": `inline; filename="${encodeURIComponent(obj.filename)}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
