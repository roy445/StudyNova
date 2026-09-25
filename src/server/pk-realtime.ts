type Listener = (event: { type: string; payload: Record<string, unknown>; sequence?: number }) => void;

const listeners = new Map<string, Set<Listener>>();
const lastEvents = new Map<string, { type: string; payload: Record<string, unknown>; sequence?: number }>();

export function publishPkEvent(matchId: string, event: { type: string; payload: Record<string, unknown>; sequence?: number }) {
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

export function sseResponse(matchId: string, signal: AbortSignal) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: { type: string; payload: Record<string, unknown>; sequence?: number }) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        } catch {
          cleanup();
        }
      };
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      cleanup = subscribePkMatch(matchId, write);
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
