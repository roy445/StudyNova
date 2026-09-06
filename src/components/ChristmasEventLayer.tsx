"use client";
import { useEffect, useRef, useState } from "react";
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
      <svg viewBox="0 0 180 80" aria-hidden="true">
        <path d="M18 43c18-23 43-22 62-8 12-12 34-15 49-5 10 7 19 17 30 19-4 11-14 17-28 17H53C35 66 20 57 18 43Z" fill="#7c3f32" stroke="#ffc857" strokeWidth="2" />
        <path d="M116 31c8-15 4-24-2-29M128 31c13-12 14-20 11-27M120 30c-6-10-14-14-20-15" fill="none" stroke="#8c604d" strokeWidth="4" strokeLinecap="round" />
        <circle cx="134" cy="48" r="18" fill="#9c573f" stroke="#ffd98a" strokeWidth="2" />
        <circle cx="129" cy="44" r="2.5" fill="#061323" /><circle cx="140" cy="44" r="2.5" fill="#061323" />
        <circle cx="143" cy="54" r="5" fill="#c83b4b" stroke="#fff7e7" strokeWidth="1.5" />
        <path d="M35 37c-8-9-17-9-23-3 5 8 13 12 23 11M67 36c-4-11-1-18 7-23 5 10 4 18-2 26" fill="#c83b4b" stroke="#ff7180" strokeWidth="2" />
        <path d="M45 56h52" stroke="#ffc857" strokeWidth="4" strokeLinecap="round" />
        <circle cx="104" cy="59" r="4" fill="#ffc857" /><circle cx="116" cy="61" r="4" fill="#ffc857" />
      </svg>
      <span className="christmas-reindeer-label">點我接住聖誕獎勵</span>
    </button>}
    {message && <div className="christmas-reward-toast" role="status">✦ {message}</div>}
  </>;
}
