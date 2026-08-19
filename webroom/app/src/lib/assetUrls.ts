/** Public URL path for serving a hosted user asset (client-safe). */
export function getAssetPublicUrl(assetId: string): string {
  return `/api/assets/${assetId}`;
}
