# Production internal-exemption list — FOR OWNER APPROVAL (not applied)

Source: a read-only query of Production (`qzmsclkzbxrfohuxnitc`) on 2026-10-10. No owner emails or personal data were read or recorded. Production has **23 Spaces**. The billing migrations are **not** on Production, so none of them has a billing row today.

Rules (owner decision, 2026-10-10):
- Preserve the approved demos and internal QA Spaces.
- Never create Stripe subscriptions for them.
- An exemption does **not** transfer automatically through Replace (0046).
- Exemptions are applied only after the release migrations, through Admin → Settings → "Internal / legacy exemption". That step needs step-up MFA and is audited. They are never applied by direct SQL. See PRODUCTION-RELEASE-PLAN.md, "Internal exemptions".

## A. Proposed exemptions — approved demos and the internal Production check

| # | Space | Type | Slug | Status | Tenant id | Proposed |
|---|---|---|---|---|---|---|
| 1 | Lena Hoffmann | Teach | `teacherexample` | live, published | `a535bf4d-ea7d-4970-9240-c4b8db5fb961` | Exempt, no expiry (public Teach demo) |
| 2 | Return to Balance | Flow | `example` | live, published | `98701eb1-5cb9-4108-9618-f76a60d93178` | Exempt, no expiry (public Flow demo) |
| 3 | QA 029 Production Check | Flow | `qa029check` | live, published | `fb6ac195-e151-4306-94c8-03e04f8f754a` | Exempt (internal Production check), or archive. Owner to choose |

Note: Return to Balance has **two owner memberships** on Production. Exemption is per Space, so this doesn't change the proposal. The owner should confirm both owners are intended.

## B. Legacy synthetic QA Spaces from earlier tasks (owner decision needed)

These 20 Spaces look like leftovers from earlier automated tests: all were created on 2026-09-03 or 2026-09-04, with test-style names such as `Slice4 Retreat …`, `DebugAddRemove …`, `RaceFix …`, `ModuleRaceFinal …`, `Slice5 …`, `Browser Verify Retreat`. Each has its own owner account. That they are test data is inferred from names and dates, so the owner should confirm. Five of them show as published with no slug, so they are only reachable through their `/g/<tenantId>` link.

| Status | Count | Tenant ids |
|---|---|---|
| live / published, no slug | 5 | `bd230bc2-2bc8-4951-897d-1771f9c782b0`, `3d91a7b8-9b17-4f31-869b-9c22e09054a2`, `5f7f080e-a597-4240-958d-57794135fb71`, `6516ade0-47f9-446c-90ab-971c1a14bbcc`, `210a0c04-a9da-4f34-b3a6-92850101d4b8` |
| draft | 15 | `f9d062a6-…`, `984d4cbc-…`, `002b6202-…`, `26e049be-…`, `a2244ad1-…`, `7c7a23da-…`, `417e6f0e-…`, `5ad4d5d1-…`, `d66eeb29-…`, `b2da4218-…`, `3e1c8cb4-…`, `ed77dd78-…`, `7dee6625-…`, `6160c41a-…`, `1e77e276-…` |

What happens to them after release without any action: they stay **legacy**, with no billing row. Legacy behaviour is unchanged; billing governs only Spaces it decides.

Options for the owner:
1. **Leave them legacy (recommended for TASK 032).** No exemption and no subscription. Clean them up later in a separately approved task.
2. Mark them internal-exempt. This labels them "internal" in Admin, which is only useful if they are kept.
3. Archive or delete them in a separately approved cleanup task. Deleting is a destructive Production operation and is **not** part of TASK 032.

## Approval needed

- [ ] Exempt #1 Lena Hoffmann (no expiry)
- [ ] Exempt #2 Return to Balance (no expiry), and confirm the two owner memberships
- [ ] #3 QA 029 Production Check: exempt / archive / leave legacy
- [ ] Section B: option 1 / 2 / 3
