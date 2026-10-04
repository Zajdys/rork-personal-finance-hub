import { useCallback, useRef, useState } from 'react';

export type UseAsyncActionOptions = {
  /** Volitelné; chyby se jinak jen zalogují (žádný red box). */
  onError?: (error: unknown) => void;
};

/**
 * Jednotná ochrana proti dvojkliku pro async akce.
 * Guard přes useRef (okamžitý); isRunning state pro UI (spinner/disabled).
 * Druhé volání během běhu se ignoruje.
 */
export function useAsyncAction<TArgs extends unknown[], TResult = void>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  options?: UseAsyncActionOptions,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isRunning: boolean;
} {
  const runningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    if (runningRef.current) return undefined;
    runningRef.current = true;
    setIsRunning(true);
    try {
      return await fnRef.current(...args);
    } catch (error) {
      console.warn('[useAsyncAction]', error);
      onErrorRef.current?.(error);
      return undefined;
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  return { run, isRunning };
}
