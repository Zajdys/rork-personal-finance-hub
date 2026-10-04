import { useEffect, useState } from 'react';

/**
 * Anti-blink: `true` až když je `value` true déle než `delayMs`.
 * Rychlé načtení (< delay) → nikdy true → žádný skeleton flash.
 * Pomalé načtení → true → skeleton místo prázdna.
 */
export function useDelayedFlag(value: boolean, delayMs = 150): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!value) {
      setDelayed(false);
      return;
    }
    const id = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return delayed;
}
