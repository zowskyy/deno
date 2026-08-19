import { validateProfileCustomCss } from "./cssScope";
import { defaultPageDocument } from "./pageDocument";
import type { PageDocument } from "./pageDocumentTypes";

/** Returns an error message when custom CSS is enabled but fails profile validation. */
export function validateDocumentCss(document: PageDocument, handle: string): string | null {
  if (!document.theme.customCssEnabled || !document.theme.customCss.trim()) return null;
  const result = validateProfileCustomCss(document.theme.customCss, handle);
  return result.ok ? null : `Custom CSS blocked: ${result.error}`;
}

/** Build a page document with unsafe custom CSS for adversarial tests. */
export function documentWithUnsafeCss(displayName: string): PageDocument {
  const doc = defaultPageDocument(displayName);
  doc.theme.customCssEnabled = true;
  doc.theme.customCss = "body { display: none; }";
  return doc;
}
