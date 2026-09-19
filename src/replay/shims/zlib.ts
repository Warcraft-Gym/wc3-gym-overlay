/**
 * Browser shim for Node's `zlib`, aliased in `vite.config.ts` for the
 * `build`/`serve` commands only (never under `vitest`, so F001's tests keep
 * exercising real Node zlib). w3gjs's `RawParser` calls
 * `inflate(buffer, { finishFlush: constants.Z_SYNC_FLUSH }, callback)`
 * directly (not via `util.promisify`) on each replay block.
 *
 * `Z_SYNC_FLUSH` is exactly what makes Node's zlib tolerant of a replay
 * block whose trailing 4-byte Adler-32 checksum (or, occasionally, the last
 * few bytes of the deflate stream itself) is missing/truncated — common for
 * the last block of a `.w3g` (the game just stops writing when recording
 * ends). fflate's one-shot `inflateSync`/`unzlibSync` always run with
 * "final chunk" semantics internally and throw `unexpected EOF` the moment
 * the bitstream runs out before a proper end-of-block marker, with no flag
 * to relax that. fflate's *streaming* `Inflate` class doesn't have this
 * problem: pushing a chunk with `final: false` sets its internal state to
 * "more data may follow" (`st.i = 0`), which makes the exact same decoder
 * loop stop and return whatever it decoded instead of throwing when it hits
 * the end of the buffer. Feeding the whole (header-stripped) block as a
 * single non-final push reproduces Z_SYNC_FLUSH's tolerance using that
 * class, without needing more than one chunk.
 */
import { Inflate } from "fflate";

export const constants = {
  Z_SYNC_FLUSH: 2,
  Z_FINISH: 4,
};

function toUint8(buf: Uint8Array | ArrayBufferView): Uint8Array {
  if (buf instanceof Uint8Array) return buf;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** RFC 1950 zlib header check: CM (low nibble of byte 0) must be 8
 *  (deflate), and the 16-bit big-endian header must be a multiple of 31
 *  (FCHECK). */
function hasZlibHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  const cm = bytes[0] & 0x0f;
  if (cm !== 8) return false;
  return ((bytes[0] << 8) + bytes[1]) % 31 === 0;
}

/** Synchronous, Z_SYNC_FLUSH-tolerant inflate — strips the zlib header
 *  when present, then decodes with a one-shot, non-final push through
 *  fflate's streaming `Inflate` class (see the module docblock for why).
 *  `opts` is accepted only to match Node's `zlib.inflateSync(buffer,
 *  options)` signature; every replay block round-trips fine without
 *  inspecting it. */
export function inflateSync(buf: Uint8Array, opts?: Record<string, unknown>): Uint8Array {
  void opts;
  const bytes = toUint8(buf);
  const body = hasZlibHeader(bytes) ? bytes.subarray(2) : bytes;

  let output = new Uint8Array(0);
  const inflator = new Inflate((chunk: Uint8Array) => {
    const merged = new Uint8Array(output.length + chunk.length);
    merged.set(output);
    merged.set(chunk, output.length);
    output = merged;
  });
  // `final: false` — see the module docblock. `Inflate.push` calls
  // `ondata` synchronously, so `output` is fully populated by the time
  // this function returns.
  inflator.push(body, false);
  return output;
}

/** Node's async, callback-style `zlib.inflate(buffer, options, callback)` —
 *  w3gjs calls this form directly, so the shim must accept both the
 *  2-arg and 3-arg call shapes. */
export function inflate(
  buf: Uint8Array,
  optsOrCallback: Record<string, unknown> | ((err: Error | null, result?: Uint8Array) => void),
  maybeCallback?: (err: Error | null, result?: Uint8Array) => void,
): void {
  const callback = typeof optsOrCallback === "function" ? optsOrCallback : maybeCallback;
  const opts = typeof optsOrCallback === "function" ? undefined : optsOrCallback;
  queueMicrotask(() => {
    try {
      callback?.(null, inflateSync(buf, opts));
    } catch (err) { // rethrows via the callback — parseReplay.ts's own catch
      // wraps whatever surfaces here into a typed `ReplayParseError`.
      callback?.(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export default { inflate, inflateSync, constants };
