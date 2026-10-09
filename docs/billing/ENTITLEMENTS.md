# Entitlements

Data-driven: the base bundle lives in `billing_plans.entitlements` (jsonb, `entitlement_version` 1) for plan `space_monthly_usd` ($25.00 USD / month / Space, `2500` minor units). Nothing is hard-coded in UI components. Metering is Space/resource level only: no listener identity, IP, user agent or cross-Space tracking.

## Base bundle (per Space)

| Entitlement | Value |
|---|---|
| Audio library | 240 minutes |
| Maximum single recording | 60 minutes |
| Listening | 100,000 minutes / month |

## Audio add-on (`audio_pack`)

Defined on the plan: price `500` USD minor units (+$5), +240 library minutes, +70,000 listening minutes per unit. Stored quantity in `space_subscription_addons (subscription_id, addon_key, quantity)`.

Math (`computeAudioEntitlements`, mirrored by `space_audio_entitlements(tenant)`):

```
library   = 240 + qty * 240
max rec   = 60                      (never increased by add-ons)
listening = 100000 + qty * 70000
```

| Add-on units | Library | Max recording | Listening / month |
|---|---|---|---|
| 0 | 240 | 60 | 100,000 |
| 1 | 480 | 60 | 170,000 |
| 2 | 720 | 60 | 240,000 |

Quantity must be a non-negative integer; a quantity above 0 on a plan without the add-on throws.

## Status: infrastructure only

- No add-on is sold: no checkout line item, no Stripe price for it, and no code writes `space_subscription_addons`.
- `space_audio_entitlements` is executable by `service_role` only.
- The numbers are computed for display (`customerView.ts`). No code path was found that enforces library size, recording length or listening minutes against actual uploads or playback. Treat enforcement as **not implemented**.
- TS and SQL arithmetic parity is pinned by tests (`domain.test.ts` reads the migration SQL and pins the numbers).
