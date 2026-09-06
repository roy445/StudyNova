"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { apiGet, apiPost } from "@/lib/api";

type Props = { enabled: boolean; reindeer: boolean };
type EventState = { token: string; durationMs: number } | null;

function playBell() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const now = context.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.12 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.65);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.7);
    });
    window.setTimeout(() => void context.close(), 1100);
  } catch {
    /* Sound is decorative; it must never affect claiming. */
  }
}

export default function ChristmasEventLayer({ enabled, reindeer }: Props) {
  const [event, setEvent] = useState<EventState>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!enabled || !reindeer) return () => { mounted.current = false; };
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await apiGet<{ event: EventState }>("/christmas/reindeer/event");
        if (mounted.current && result.event) {
          setEvent(result.event);
          playBell();
          timer = window.setTimeout(() => setEvent(null), result.event.durationMs);
        }
      } catch {
        /* A missed random event is harmless. */
      } finally {
        if (mounted.current) timer = window.setTimeout(poll, 42_000 + Math.random() * 38_000);
      }
    };
    timer = window.setTimeout(poll, 18_000 + Math.random() * 30_000);
    return () => {
      mounted.current = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, reindeer]);

  async function claim() {
    if (!event || busy) return;
    setBusy(true);
    try {
      const result = await apiPost<{ reward: { nova: number; xp: number } }>("/christmas/reindeer/claim", { token: event.token });
      setEvent(null);
      setMessage(`馴鹿帶來了 +${result.reward.nova} Nova・+${result.reward.xp} XP`);
      window.setTimeout(() => setMessage(null), 4200);
    } catch {
      setEvent(null);
    } finally {
      setBusy(false);
    }
  }

  return <>
    {event && <button type="button" aria-label="點擊馴鹿領取聖誕獎勵" className="christmas-reindeer" onClick={() => void claim()} disabled={busy}>
      <span className="christmas-reindeer-glow" />
      <Image src="/brand/christmas-reindeer-sleigh-b.png" width={2688} height={1152} sizes="190px" alt="" aria-hidden="true" draggable={false} />
      <span className="christmas-reindeer-label">點我接住聖誕獎勵</span>
    </button>}
    {message && <div className="christmas-reward-toast" role="status">✦ {message}</div>}
  </>;
}
