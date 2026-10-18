import { useCallback, useEffect, useRef, useState } from "react";

export type Phase = "idle" | "working" | "done" | "error";

export interface ActionState {
  phase: Phase;
  message: string;
  hash: string;
  elapsed: number;
}

export interface ActionResult {
  hash: string;
  id?: string;
}

/**
 * Runs one write at a time and tracks its progress. Success is only reported
 * after the write helper has seen the transaction FINALIZED with a successful
 * leader result, which is what writes.ts guarantees before it resolves.
 */
export function useAction() {
  const [state, setState] = useState<ActionState>({ phase: "idle", message: "", hash: "", elapsed: 0 });
  const startedAt = useRef(0);

  useEffect(() => {
    if (state.phase !== "working") return;
    const t = window.setInterval(() => {
      setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - startedAt.current) / 1000) }));
    }, 1000);
    return () => window.clearInterval(t);
  }, [state.phase]);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult) => void, okMessage?: (r: ActionResult) => string) => {
      startedAt.current = Date.now();
      setState({ phase: "working", message: "", hash: "", elapsed: 0 });
      try {
        const r = await fn();
        setState({
          phase: "done",
          message: okMessage ? okMessage(r) : "Done. The record below is read back from the chain.",
          hash: r.hash,
          elapsed: 0,
        });
        onOk?.(r);
      } catch (e) {
        console.error(e);
        const text = e instanceof Error ? e.message : String(e);
        setState({ phase: "error", message: text, hash: "", elapsed: 0 });
      }
    },
    []
  );

  const reset = useCallback(() => setState({ phase: "idle", message: "", hash: "", elapsed: 0 }), []);

  return { state, run, reset, busy: state.phase === "working" };
}
