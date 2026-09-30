import { vi } from "vitest";

/**
 * In-memory stand-in for the slice of Supabase the media lifecycle uses:
 * a Storage bucket (list/download/upload/remove) and the four tables the
 * Studio actions and publishSpace() touch, plus a publish_space() RPC that
 * builds the snapshot the same way the SQL does (draft ref -> published
 * ref, image refs under `imageRef` keys). Tests inject failures per
 * operation to prove the previous snapshot survives.
 */
type Row = Record<string, unknown>;
type Failure = { message: string } | null;

export type FakeSupabase = ReturnType<typeof makeFakeSupabase>;

export function makeFakeSupabase(userId: string | null = "user-1") {
  const files = new Map<string, { bytes: string; updatedAt: string }>();
  const tables: Record<string, Row[]> = { module_items: [], brand_configs: [], module_configs: [], published_spaces: [] };
  const fail: Record<string, Failure> = {};
  let clock = Date.parse("2026-01-01T00:00:00Z");
  const tick = () => new Date((clock += 1000)).toISOString();

  const keyOf: Record<string, string[]> = {
    module_items: ["id"],
    brand_configs: ["tenant_id"],
    module_configs: ["tenant_id", "module_key"],
    published_spaces: ["tenant_id"],
  };

  class Query implements PromiseLike<{ data: unknown; error: Failure }> {
    private op: "select" | "update" | "delete" | "upsert" = "select";
    private payload: Row | Row[] | null = null;
    private filters: Array<(r: Row) => boolean> = [];
    private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    private single = false;
    private cols: string | null = null;
    constructor(private table: string) {}
    select(cols?: string) {
      this.cols = cols ?? null;
      return this;
    }
    update(p: Row) {
      this.op = "update";
      this.payload = p;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      this.op = "upsert";
      this.payload = p;
      this.opts = opts;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    private run(): { data: unknown; error: Failure } {
      const failure = fail[`${this.op}:${this.table}`];
      if (failure) return { data: null, error: failure };
      const rows = tables[this.table];
      const matching = () => rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "select") {
        const found = matching().map((r) => ({ ...r }));
        return { data: this.single ? (found[0] ?? null) : found, error: null };
      }
      if (this.op === "update") {
        matching().forEach((r) => Object.assign(r, this.payload));
        return { data: null, error: null };
      }
      if (this.op === "delete") {
        const gone = new Set(matching());
        tables[this.table] = rows.filter((r) => !gone.has(r));
        return { data: null, error: null };
      }
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const keys = (this.opts.onConflict ?? keyOf[this.table].join(",")).split(",");
      for (const item of list) {
        const existing = rows.find((r) => keys.every((k) => r[k] === item[k]));
        if (existing) {
          if (!this.opts.ignoreDuplicates) Object.assign(existing, item);
        } else rows.push({ ...item });
      }
      return { data: null, error: null };
    }
    then<T1, T2>(
      onfulfilled?: ((v: { data: unknown; error: Failure }) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((e: unknown) => T2 | PromiseLike<T2>) | null
    ) {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const publishedOf = (ref: unknown) =>
    typeof ref === "string" ? ref.replace(/\/draft\.([a-zA-Z0-9]+)$/, "/published.$1") : null;

  const storageApi = {
    list: vi.fn(async (prefix: string, o?: { limit?: number; offset?: number }) => {
      if (fail.list) return { data: null, error: fail.list };
      const seen = new Map<string, Row>();
      for (const [path, f] of files) {
        if (!path.startsWith(`${prefix}/`)) continue;
        const rest = path.slice(prefix.length + 1);
        const [head, ...tail] = rest.split("/");
        if (tail.length === 0) seen.set(head, { name: head, id: `id:${path}`, updated_at: f.updatedAt, created_at: f.updatedAt });
        else if (!seen.has(head)) seen.set(head, { name: head, id: null });
      }
      const all = [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const offset = o?.offset ?? 0;
      return { data: all.slice(offset, offset + (o?.limit ?? 100)), error: null };
    }),
    download: vi.fn(async (path: string) => {
      if (fail.download) return { data: null, error: fail.download };
      const f = files.get(path);
      return f ? { data: f.bytes, error: null } : { data: null, error: { message: "Object not found" } };
    }),
    upload: vi.fn(async (path: string, body: unknown) => {
      if (fail.upload) return { data: null, error: fail.upload };
      files.set(path, { bytes: typeof body === "string" ? body : Buffer.from(body as Buffer).toString(), updatedAt: tick() });
      return { data: { path }, error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      if (fail.remove) return { data: null, error: fail.remove };
      paths.forEach((p) => files.delete(p));
      return { data: paths.map((name) => ({ name })), error: null };
    }),
    createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `http://signed/${path}` }, error: null })),
  };

  const rpc = vi.fn(async (name: string, args: { p_tenant_id: string }) => {
    if (name !== "publish_space") throw new Error(`unexpected rpc ${name}`);
    if (fail.rpc) return { data: null, error: fail.rpc };
    const t = args.p_tenant_id;
    const brand = tables.brand_configs.find((r) => r.tenant_id === t);
    const modules: Row = {
      brand: {
        hero: { imageRef: publishedOf(brand?.hero_image_ref) },
        space: { imageRef: publishedOf(brand?.space_image_ref) },
        logo: { imageRef: publishedOf(brand?.logo_ref) },
      },
      moduleCovers: Object.fromEntries(
        tables.module_configs.filter((r) => r.tenant_id === t).map((r) => [r.module_key, { imageRef: publishedOf(r.image_ref) }])
      ),
    };
    for (const it of tables.module_items.filter((r) => r.tenant_id === t)) {
      const key = it.module_key as string;
      ((modules[key] ??= []) as Row[]).push({ id: it.id, title: it.title, imageRef: publishedOf(it.image_ref) });
    }
    const snap = { tenant_id: t, modules };
    tables.published_spaces = tables.published_spaces.filter((r) => r.tenant_id !== t).concat(snap);
    return { data: tick(), error: null };
  });

  const supabase = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: (table: string) => new Query(table),
    storage: { from: () => storageApi },
    rpc,
  };

  return {
    supabase: supabase as unknown as import("@supabase/supabase-js").SupabaseClient,
    files,
    tables,
    storageApi,
    rpc,
    put: (path: string, bytes: string, updatedAt?: string) => files.set(path, { bytes, updatedAt: updatedAt ?? tick() }),
    setFailure: (key: string, message: string | null) => {
      fail[key] = message ? { message } : null;
    },
    snapshotRefs: (tenantId: string) => {
      const snap = tables.published_spaces.find((r) => r.tenant_id === tenantId);
      const refs: string[] = [];
      (function walk(n: unknown) {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object")
          for (const [k, v] of Object.entries(n)) {
            if (k === "imageRef" && typeof v === "string") refs.push(v);
            else walk(v);
          }
      })(snap?.modules);
      return refs.sort();
    },
  };
}
