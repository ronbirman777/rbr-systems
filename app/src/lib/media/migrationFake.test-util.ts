import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * In-memory stand-in for the slice of Supabase legacyMigration.ts uses:
 * a Storage bucket plus the draft-ref tables, published_spaces and tenants,
 * with the touch_tenant_content() trigger simulated. Supports compare-and-set
 * updates (`.update().eq().select()` returns the affected rows), upsert:false
 * uploads, and per-operation failure / hook injection.
 */
type Row = Record<string, unknown>;
type Err = { message: string; statusCode?: string } | null;

export function makeMigrationFake() {
  const files = new Map<string, { bytes: Buffer; createdAt: string }>();
  const tables: Record<string, Row[]> = { module_items: [], module_configs: [], brand_configs: [], published_spaces: [], tenants: [] };
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const failures: { op: string; remaining: number; error: Err }[] = [];
  const hooks = new Map<string, () => void>();
  const log: string[] = [];
  const touching = new Set(["module_items", "module_configs", "brand_configs"]);

  const failure = (op: string): Err => {
    const f = failures.find((x) => op.startsWith(x.op) && x.remaining > 0);
    if (!f) return null;
    f.remaining--;
    return f.error;
  };

  class Query implements PromiseLike<{ data: unknown; error: Err }> {
    private mode: "select" | "update" = "select";
    private patch: Row = {};
    private filters: ((r: Row) => boolean)[] = [];
    private cols: string | null = null;
    private returning = false;
    private one = false;
    constructor(private table: string) {}
    select(cols?: string) {
      if (this.mode === "update") this.returning = true;
      this.cols = cols ?? null;
      return this;
    }
    update(patch: Row) {
      this.mode = "update";
      this.patch = patch;
      return this;
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v);
      return this;
    }
    gt(col: string, v: unknown) {
      this.filters.push((r) => String(r[col]) > String(v));
      return this;
    }
    order() {
      return this;
    }
    range() {
      return this;
    }
    maybeSingle() {
      this.one = true;
      return this;
    }
    private project(r: Row) {
      if (!this.cols) return { ...r };
      const out: Row = {};
      for (const c of this.cols.split(",").map((s) => s.trim())) out[c] = r[c];
      return out;
    }
    private run(): { data: unknown; error: Err } {
      const rows = tables[this.table].filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === "select") {
        const err = failure(`select:${this.table}`);
        if (err) return { data: null, error: err };
        const out = rows.map((r) => this.project(r));
        return { data: this.one ? (out[0] ?? null) : out, error: null };
      }
      hooks.get(`update:${this.table}`)?.();
      const err = failure(`update:${this.table}`);
      if (err) return { data: null, error: err };
      const live = tables[this.table].filter((r) => this.filters.every((f) => f(r)));
      for (const r of live) Object.assign(r, this.patch);
      log.push(`update:${this.table}:${live.length}`);
      if (touching.has(this.table) && live.length > 0) {
        for (const r of live) for (const t of tables.tenants) if (t.id === r.tenant_id) t.content_updated_at = tick();
      }
      return { data: this.returning ? live.map((r) => this.project(r)) : null, error: null };
    }
    then<A, B>(ok?: ((v: { data: unknown; error: Err }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.run()).then(ok, bad);
    }
  }

  const storage = {
    from: () => ({
      list: async (prefix: string) => {
        const err = failure(`list:${prefix}`);
        if (err) return { data: null, error: err };
        const seen = new Map<string, Row>();
        for (const [path, f] of files) {
          if (!path.startsWith(`${prefix}/`)) continue;
          const rest = path.slice(prefix.length + 1).split("/");
          if (rest.length === 1) seen.set(rest[0], { name: rest[0], id: "obj", created_at: f.createdAt, updated_at: f.createdAt });
          else if (!seen.has(rest[0])) seen.set(rest[0], { name: rest[0], id: null });
        }
        return { data: [...seen.values()], error: null };
      },
      download: async (path: string) => {
        const err = failure(`download:${path}`);
        if (err) return { data: null, error: err };
        const f = files.get(path);
        if (!f) return { data: null, error: { message: "Object not found", statusCode: "404" } };
        return { data: new Blob([new Uint8Array(f.bytes)]), error: null };
      },
      upload: async (path: string, bytes: Buffer, opts?: { upsert?: boolean }) => {
        const err = failure(`upload:${path}`);
        if (err) return { data: null, error: err };
        if (files.has(path) && !opts?.upsert) return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
        files.set(path, { bytes: Buffer.from(bytes), createdAt: tick() });
        log.push(`upload:${path}`);
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        const err = failure("remove");
        if (err) return { data: null, error: err };
        for (const p of paths) files.delete(p);
        log.push(`remove:${paths.length}`);
        return { data: paths, error: null };
      },
    }),
  };

  const client = { from: (t: string) => new Query(t), storage } as unknown as SupabaseClient;
  return {
    client,
    files,
    tables,
    log,
    hooks,
    tick,
    setClock: (ms: number) => {
      clock = ms;
    },
    failOn: (op: string, error: Err = { message: "injected failure" }, times = 1) => failures.push({ op, remaining: times, error }),
    clearFailures: () => (failures.length = 0),
    put: (path: string, content: string, ageMs?: number) => {
      files.set(path, { bytes: Buffer.from(content), createdAt: ageMs === undefined ? tick() : new Date(clock - ageMs).toISOString() });
    },
    text: (path: string) => files.get(path)?.bytes.toString() ?? null,
  };
}
export type MigrationFake = ReturnType<typeof makeMigrationFake>;
