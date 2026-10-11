/**
 * Maps a tenant slug to its PostgreSQL schema name.
 *
 * The ONLY place this mapping is defined. Output is restricted to
 * [a-z0-9_] so it is safe to embed in a quoted identifier.
 */
export function tenantSchemaName(tenantSlug: string): string {
  return `fk_${tenantSlug.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
}
