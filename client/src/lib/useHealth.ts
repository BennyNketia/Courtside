import { useEffect, useState } from 'react';
import { getHealth, type HealthResponse } from './runtime';

// Poll GET /health every 10s. On failure the last-known-good state stays
// visible for one interval — flickering red on every transient miss is
// worse UX than a slightly stale green — but two consecutive failures
// flip the dot to red so a real outage becomes obvious.

export function useHealth(intervalMs = 10_000): {
  healthy: boolean;
  model: string | null;
  health: HealthResponse | null;
} {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await getHealth();
        if (cancelled) return;
        setHealth(h);
        setMisses(0);
      } catch {
        if (cancelled) return;
        setMisses((m) => m + 1);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  const model = health?.model?.primary ?? health?.model?.fallback ?? null;
  const healthy = health !== null && misses < 2;
  return { healthy, model, health };
}
