import { readObject } from "@/server/storage";
import { getMaintenanceState } from "@/server/maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const maintenance = await getMaintenanceState();
  if (maintenance.enabled) return Response.json({ ok: false, code: "SERVICE_MAINTENANCE", message: maintenance.notice, estimatedRecoveryAt: maintenance.estimatedRecoveryAt }, { status: 503 });
  try {
    const { id } = await context.params;
    const object = await readObject(id);
    if (!object.mimeType.startsWith("image/")) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(object.data), {
      headers: { "content-type": object.mimeType, "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
