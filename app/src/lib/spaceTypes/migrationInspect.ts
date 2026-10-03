/**
 * Test-support helpers that read the repository's SQL migrations as text.
 * Used by the publish_space() regression test and the registry/CHECK
 * consistency test. Pure string functions (no fs) so they can be unit
 * tested against synthetic SQL.
 */

export type MigrationFile = { name: string; sql: string };

/** Removes `-- line comments` so commented-out code can never satisfy a check. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function migrationNumber(name: string): number {
  const m = /^(\d+)_/.exec(name);
  return m ? Number(m[1]) : -1;
}

export function sortMigrations(files: MigrationFile[]): MigrationFile[] {
  return [...files].sort((a, b) => migrationNumber(a.name) - migrationNumber(b.name));
}

/**
 * Body of the LAST `create or replace function public.<name>(` in a SQL
 * text (from the opening $$ to the closing $$), comments stripped.
 */
export function extractFunctionBody(sql: string, fnName: string): string | null {
  const clean = stripSqlComments(sql);
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fnName}\\s*\\(`, "gi");
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) last = m;
  if (!last) return null;
  const open = clean.indexOf("$$", last.index);
  if (open < 0) return null;
  const close = clean.indexOf("$$", open + 2);
  if (close < 0) return null;
  return clean.slice(open + 2, close);
}

/** The latest migration (by numeric prefix) that (re)defines public.<fnName>. */
export function latestFunctionDefinition(files: MigrationFile[], fnName: string): { file: string; body: string } | null {
  let found: { file: string; body: string } | null = null;
  for (const f of sortMigrations(files)) {
    const body = extractFunctionBody(f.sql, fnName);
    if (body !== null) found = { file: f.name, body };
  }
  return found;
}

/** Migrations after `afterFile` that drop public.<fnName>. */
export function laterDrops(files: MigrationFile[], fnName: string, afterFile: string): string[] {
  const after = migrationNumber(afterFile);
  const re = new RegExp(`drop\\s+function\\s+(if\\s+exists\\s+)?public\\.${fnName}\\b`, "i");
  return sortMigrations(files)
    .filter((f) => migrationNumber(f.name) > after && re.test(stripSqlComments(f.sql)))
    .map((f) => f.name);
}

/** Does this publish_space() body call the builder inside a product_type guard for `typeId`? */
export function bodyCallsGuardedBuilder(body: string, typeId: string, builder: string): boolean {
  const flat = body.replace(/\s+/g, " ").toLowerCase();
  const guard = `if v_tenant.product_type = '${typeId.toLowerCase()}' then`;
  const g = flat.indexOf(guard);
  if (g < 0) return false;
  const endIf = flat.indexOf("end if;", g);
  const block = flat.slice(g, endIf < 0 ? undefined : endIf);
  return block.includes(`public.${builder.toLowerCase()}(p_tenant_id)`);
}

/** Values of the latest `tenants.product_type` CHECK constraint across all migrations. */
export function latestProductTypeCheck(files: MigrationFile[]): string[] | null {
  let values: string[] | null = null;
  for (const f of sortMigrations(files)) {
    const clean = stripSqlComments(f.sql);
    const re = /check\s*\(\s*product_type\s+in\s*\(([^)]*)\)\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      values = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  return values;
}
