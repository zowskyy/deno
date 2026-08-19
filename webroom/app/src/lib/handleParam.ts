/**
 * Parses the raw [handle] dynamic-segment value from a /@handle route
 * into a bare handle, or returns null if it's not a valid "@..." path.
 *
 * Next.js hands page components the *percent-encoded* form of a dynamic
 * segment (e.g. "%40voidarcade" for a URL the browser shows as
 * "/@voidarcade") rather than the decoded string — confirmed by direct
 * inspection, not documented behavior to rely on blindly, so this is
 * deliberately tolerant of already-decoded input too (decodeURIComponent
 * on a string with no percent-escapes is a no-op).
 */
export function parseHandleParam(rawParam: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    return null; // malformed percent-encoding (e.g. a lone "%")
  }
  if (!decoded.startsWith("@")) return null;
  return decoded.slice(1);
}
