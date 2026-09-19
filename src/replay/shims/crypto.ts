/**
 * Browser shim for Node's `crypto`/`node:crypto`, aliased in
 * `vite.config.ts` for the `build`/`serve` commands only. w3gjs uses
 * `createHash(...).update(...).digest("hex")` only to compute the map's
 * checksum — informational metadata, never persisted or compared
 * cross-session — so a deterministic non-cryptographic stub is sufficient;
 * it is never used for anything security-sensitive.
 */
class StubHash {
  private data = "";

  update(chunk: unknown): this {
    this.data += typeof chunk === "string" ? chunk : String(chunk);
    return this;
  }

  digest(): string {
    let hash = 0;
    for (let i = 0; i < this.data.length; i++) {
      hash = (Math.imul(hash, 31) + this.data.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}

export function createHash(): StubHash {
  return new StubHash();
}

export default { createHash };
