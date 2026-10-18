export default function PathBadge({ path, hash }: { path: string; hash?: string }) {
  if (path === "root") {
    return <span className="path-badge"><span className="path-badge__dot" aria-hidden="true" />human</span>;
  }
  if (path === "consensus") {
    return (
      <span className="path-badge">
        <span className="path-badge__dots" aria-hidden="true"><i /><i /><i /></span>
        validators
      </span>
    );
  }
  if (path === "hash") {
    let short = "hash";
    if (hash && hash !== "") {
      const clean = hash.toLowerCase().replace(/^0x/, "");
      short = clean.slice(0, 8);
    }
    return (
      <span className="path-badge" title={hash ?? undefined}>
        <span className="mono">#{short}</span>
      </span>
    );
  }
  return null;
}
