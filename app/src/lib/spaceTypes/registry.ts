/**
 * Space Type Registry - the single source of truth for what each InnerDweS
 * Space type IS in application code: identifier, product metadata, Studio
 * route, guest renderer key, create behaviour, product copy and (for
 * validation/tests) which SQL builder its published snapshot depends on.
 *
 * Isomorphic and dependency-free (no React, no server-only imports) so both
 * Server Components and client code can read it. Guest renderer COMPONENTS
 * live in the server-only map in ./guestRenderers.tsx, keyed by
 * `guest.renderer`.
 *
 * What this registry is NOT:
 *  - Not an authorization source. Every guard reads `product_type` from the
 *    database (tenants / published_spaces) and only then looks the value up
 *    here. Registry metadata never grants access to anything.
 *  - Not the allowed-values authority. `tenants_product_type_check` (latest:
 *    migration 0019) is. registry.test.ts asserts SPACE_TYPE_IDS equals that
 *    CHECK list, so the two cannot drift silently.
 *
 * Unknown values: resolveSpaceType() returns { kind: "unknown" } for any
 * explicit value not listed here. Callers must fail visibly (404 / an
 * "unsupported Space type" state) - there is deliberately NO fallback to
 * Retreat for an unknown type. There is no legacy/null case to support:
 * tenants.product_type and published_spaces.product_type are both NOT NULL
 * (migrations 0001 / 0004), so every row has an explicit value.
 */

/** Exactly the values allowed by tenants_product_type_check (migration 0019). */
export const SPACE_TYPE_IDS = ["retreat", "client_hub", "teach"] as const;
export type SpaceTypeId = (typeof SPACE_TYPE_IDS)[number];

export type GuestRendererKey = "retreat" | "teach";

export type SpaceTypeDefinition = {
  id: SpaceTypeId;
  product: {
    name: string;
    tagline: string;
    /** Brand accent used for family labels/borders. */
    accent: string;
    /** AA-safe variant of the accent for small text on parchment/white. */
    accentText: string;
    /** Optional one-line description on the /create card. */
    description?: string;
  };
  /** "live" = creatable and editable; "comingSoon" = shown, not creatable. */
  availability: "live" | "comingSoon";
  /** Owner Studio. null = this type has no Studio (yet). */
  studio: { basePath: `/configurator/${string}`; publishQuery: string } | null;
  /** How /create starts this type. */
  create: { kind: "link"; href: string } | { kind: "action"; action: "createTeachSpace" } | { kind: "none" };
  /** Published guest experience. null = no guest app (yet). */
  guest: { renderer: GuestRendererKey } | null;
  publish: {
    /** Product-specific SQL builder publish_space() must call, if any.
     * Checked by the publish regression test (publishSpaceRegression.test.ts). */
    sqlBuilder: string | null;
  };
  copy: {
    /** Lower-case noun used in sentences ("this retreat", "this space"). */
    spaceNoun: string;
    /** Name used when a Space is created/replaced without a name. */
    untitledName: string;
    guestAccess: { title: string; openLabel: string; askHint: string };
  };
};

export const SPACE_TYPES: Record<SpaceTypeId, SpaceTypeDefinition> = {
  // Time to Flow - values reproduce pre-registry behaviour exactly
  // (registry.test.ts pins them).
  retreat: {
    id: "retreat",
    product: { name: "Time to Flow", tagline: "For retreats and wellness programs.", accent: "#A86750", accentText: "#8f5844" },
    availability: "live",
    studio: { basePath: "/configurator/retreat", publishQuery: "step=publish" },
    create: { kind: "link", href: "/configurator/retreat" },
    guest: { renderer: "retreat" },
    publish: { sqlBuilder: null },
    copy: {
      spaceNoun: "retreat",
      untitledName: "Untitled Retreat",
      guestAccess: { title: "Private Retreat", openLabel: "Open Retreat", askHint: "Ask your retreat organizer for the access code." },
    },
  },
  // Time to Heal - already present in the DB CHECK (0001) and shown as
  // "Coming Soon" on /create. No Studio, no guest app, not creatable.
  client_hub: {
    id: "client_hub",
    product: { name: "Time to Heal", tagline: "For practitioners and their clients.", accent: "#BAC5B2", accentText: "#4E6650" },
    availability: "comingSoon",
    studio: null,
    create: { kind: "none" },
    guest: null,
    publish: { sqlBuilder: null },
    copy: {
      spaceNoun: "space",
      untitledName: "Untitled Space",
      guestAccess: { title: "Private Space", openLabel: "Open", askHint: "Ask your practitioner for the access code." },
    },
  },
  // Time to Teach.
  teach: {
    id: "teach",
    product: {
      name: "Time to Teach",
      tagline: "For independent teachers.",
      accent: "#9A7B4F",
      accentText: "#7E6440",
      description: "Your classes, private sessions, readings, audio and how to reach you — a beautiful home for your teaching.",
    },
    availability: "live",
    studio: { basePath: "/configurator/teach", publishQuery: "section=publish" },
    create: { kind: "action", action: "createTeachSpace" },
    guest: { renderer: "teach" },
    publish: { sqlBuilder: "build_teach_payload" },
    copy: {
      spaceNoun: "space",
      untitledName: "My Teaching Space",
      guestAccess: { title: "Private Space", openLabel: "Open", askHint: "Ask your teacher for the access code." },
    },
  },
};

/** Order Space types are offered on /create. */
export const CREATE_ORDER: readonly SpaceTypeId[] = ["retreat", "teach", "client_hub"];

export type ResolvedSpaceType =
  | { kind: "known"; type: SpaceTypeDefinition }
  | { kind: "unknown"; value: string | null };

export function isSpaceTypeId(value: unknown): value is SpaceTypeId {
  return typeof value === "string" && (SPACE_TYPE_IDS as readonly string[]).includes(value);
}

/** Looks up a DB product_type. Never falls back to another type. */
export function resolveSpaceType(value: string | null | undefined): ResolvedSpaceType {
  return isSpaceTypeId(value) ? { kind: "known", type: SPACE_TYPES[value] } : { kind: "unknown", value: value ?? null };
}

export function getSpaceType(value: string | null | undefined): SpaceTypeDefinition | null {
  const r = resolveSpaceType(value);
  return r.kind === "known" ? r.type : null;
}

/** Studio URL for a tenant, or null when its type has no Studio / is unknown. */
export function studioHref(productType: string | null | undefined, tenantId: string, opts: { publish?: boolean } = {}): string | null {
  const studio = getSpaceType(productType)?.studio;
  if (!studio) return null;
  const base = `${studio.basePath}/${tenantId}`;
  return opts.publish ? `${base}?${studio.publishQuery}` : base;
}

/** Every product-specific SQL builder publish_space() must keep calling. */
export function requiredPublishBuilders(): string[] {
  return SPACE_TYPE_IDS.map((id) => SPACE_TYPES[id].publish.sqlBuilder).filter((b): b is string => Boolean(b));
}

/**
 * Decides what a Studio route should do with a tenant of `productType`:
 * render (it belongs here), redirect (it belongs to another Studio) or
 * unsupported (unknown type, or a type with no Studio) - never "render as
 * the wrong product".
 */
export function studioRouteDecision(
  productType: string | null | undefined,
  thisStudio: SpaceTypeId,
  tenantId: string
): { action: "render" } | { action: "redirect"; href: string } | { action: "unsupported" } {
  if (productType === thisStudio) return { action: "render" };
  const href = studioHref(productType, tenantId);
  return href ? { action: "redirect", href } : { action: "unsupported" };
}
