type Listener = (event: { type: string; payload: Record<string, unknown>; sequence?: number }) => void;

type RealtimeEvent = { type: string; payload: Record<string, unknown>; sequence?: number };

const listeners = new Map<string, Set<Listener>>();
const lastEvents = new Map<string, RealtimeEvent>();

export function publishPkEvent(matchId: string, event: RealtimeEvent) {
  lastEvents.set(matchId, event);
  for (const listener of listeners.get(matchId) ?? []) listener(event);
}

export function subscribePkMatch(matchId: string, listener: Listener) {
  const set = listeners.get(matchId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(matchId, set);
  const last = lastEvents.get(matchId);
  if (last) queueMicrotask(() => listener(last));
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(matchId);
  };
}

export function pkRealtimeSnapshot() {
  return { channels: listeners.size, listeners: [...listeners.values()].reduce((sum, set) => sum + set.size, 0) };
}

export function sseResponse(matchId: string, signal: AbortSignal, replay: RealtimeEvent[] = []) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: RealtimeEvent) => {
        try {
          const id = event.sequence ? `id: ${event.sequence}\n` : "";
          controller.enqueue(encoder.encode(`${id}event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        } catch {
          cleanup();
        }
      };
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      cleanup = subscribePkMatch(matchId, write);
      for (const event of replay) write(event);
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`)); } catch { clearInterval(heartbeat); cleanup(); }
      }, 15_000);
      const close = () => { clearInterval(heartbeat); cleanup(); try { controller.close(); } catch {} };
      if (signal.aborted) close();
      else signal.addEventListener("abort", close, { once: true });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
