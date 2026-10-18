import type { CSSProperties } from "react";

const STATE_COLORS: Record<string, string> = {
  ACTIVE: "var(--active)",
  ISSUED: "var(--active)",
  authorized: "var(--active)",
  REFUSED: "var(--refused)",
  outside_scope: "var(--refused)",
  widens: "var(--refused)",
  HELD: "var(--held)",
  unclear: "var(--held)",
  REVOKED: "var(--revoked)",
  DEAD: "var(--revoked)",
};

export default function StateBadge({ state, big }: { state: string; big?: boolean }) {
  const color = STATE_COLORS[state] ?? "var(--revoked)";
  const style = { "--badge-color": color } as CSSProperties;
  return (
    <span className={big ? "badge badge--big" : "badge"} data-state={state} style={style}>
      {state.toUpperCase()}
    </span>
  );
}
