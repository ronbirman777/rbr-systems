export const STAGING_REF: string;
export const PRODUCTION_REF: string;
export const STAGING_URL: string;
export function assertStagingTarget(a: { url: string | undefined; serviceKey: string | undefined; env?: Record<string, string | undefined> }): { ref: string };
export function runScopedDelete(
  client: unknown,
  a: { table: string; column?: string; ids: string[]; expected?: number | null }
): Promise<number>;
