// Task 021 concurrency + real-signup verification against LOCAL Supabase only.
// Usage: SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=... SUPABASE_SECRET_KEY=... node this-file
// (supabase-js resolved from the app's node_modules: run from app/ or set NODE_PATH.)
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
if (!url || !/^(https?:\/\/)(127\.0\.0\.1|localhost)/.test(url)) {
  console.error("Refusing to run: SUPABASE_URL must be a local stack.");
  process.exit(2);
}
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, opts);
const anon = () => createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, opts);
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const stamp = Date.now();
const created = [];

try {
  // A. 12 concurrent REAL signups via GoTrue: each must end with exactly one row of 1.
  const N = 12;
  const signups = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      anon().auth.signUp({ email: `t021-c${i}-${stamp}@example.com`, password: "Passw0rd!t021" }))
  );
  const ids = signups.map((r) => r.data?.user?.id).filter(Boolean);
  created.push(...ids);
  check(`A1 ${N} concurrent signups succeeded`, ids.length === N, `(${ids.length})`);
  const { data: rows } = await admin.from("user_space_slots").select("user_id, slots_allowed").in("user_id", ids);
  check("A2 each new account has exactly one entitlement row", rows.length === N && new Set(rows.map((r) => r.user_id)).size === N);
  check("A3 every provisioned row has the schema default (1)", rows.every((r) => r.slots_allowed === 1));

  // B. 40 concurrent provisioning attempts for ONE user (the trigger's exact statement,
  //    via PostgREST upsert-ignore) must leave exactly one row and not alter it.
  const target = ids[0];
  await admin.from("user_space_slots").update({ slots_allowed: 4 }).eq("user_id", target);
  await Promise.all(Array.from({ length: 40 }, () =>
    admin.from("user_space_slots").upsert({ user_id: target }, { onConflict: "user_id", ignoreDuplicates: true })));
  const { data: after } = await admin.from("user_space_slots").select("slots_allowed").eq("user_id", target);
  check("B 40 concurrent provisioning attempts: 1 row, existing entitlement (4) unchanged", after.length === 1 && after[0].slots_allowed === 4);

  // C. Concurrent first Space creation by one new account (limit 1): exactly one wins,
  //    the rest hit SLOT_LIMIT_REACHED (real client, RLS + capacity trigger).
  const u = anon();
  const email = `t021-cc-${stamp}@example.com`;
  const su = await u.auth.signUp({ email, password: "Passw0rd!t021" });
  created.push(su.data.user.id);
  await admin.auth.admin.updateUserById(su.data.user.id, { email_confirm: true });
  const si = await u.auth.signInWithPassword({ email, password: "Passw0rd!t021" });
  check("C0 new account signs in", !si.error);
  const attempts = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    u.from("tenants").insert({ name: `t021 race ${i}`, product_type: "retreat" }).select("id").single()));
  const wins = attempts.filter((a) => !a.error).length;
  const limited = attempts.filter((a) => a.error?.hint === "SLOT_LIMIT_REACHED").length;
  check("C 6 concurrent creations by a 1-slot account: 1 succeeds, 5 blocked", wins === 1 && limited === 5, `(wins=${wins}, blocked=${limited})`);
} finally {
  // cleanup synthetic local users (cascades slot rows and tenant memberships)
  for (const id of created) {
    await admin.from("tenants").delete().eq("created_by", id);
    await admin.auth.admin.deleteUser(id);
  }
}
const bad = results.filter((r) => !r).length;
console.log(bad === 0 ? `ALL PASS (${results.length})` : `FAILURES: ${bad}`);
process.exit(bad ? 1 : 0);
