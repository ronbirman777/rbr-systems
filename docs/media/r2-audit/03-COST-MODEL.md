# 03 — Cost model (TASK 032.5)

Date 2026-10-10. **Prices are VERIFIED** from the vendor pages cited in 02-VENDOR-RESEARCH.md. **Workload figures are ESTIMATES** and their assumptions are listed below. Incremental monthly USD only: the Supabase Pro base fee ($25) is paid in every option, so it is excluded.

## Assumptions (estimates)

- Bitrate 96 kbps, so **0.72 MB per listening minute** (0.72 GB per 1,000 minutes).
- Storage per Space: a full 240-minute base library, stored as draft + published copies, is **346 MB**. One add-on doubles it.
- Requests: 0.5 range requests per listening minute (one per ~2 minutes, including seeks and reconnects). Progress beacons are sent every 5 minutes of playback (0.2/min). 2 CPU-ms per Worker request.
- Guest visits (50/day/Space, about 1,500/month) are page loads, **not** listening minutes. They don't drive audio egress, so they aren't in the egress figures.
- Supabase: signed URLs are minted per request and the CDN caches per URL, so the **uncached** egress rate ($0.09/GB) is realistic. The cached rate ($0.03/GB) is shown as a best case.
- R2: a private bucket behind a Worker. The Worker cache doesn't store 206 responses, so every request is an R2 Class B read.

## Planning scenario: 80,000 listening min/Space/month

| Spaces | Audio egress (TB/mo) | Supabase uncached | Supabase cached (best case) | R2 + Worker | B2 backup copy | Saving per Space (Supabase uncached − R2) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.6 | $29 | $10 | $5.00 | $0.02 | $2.43 |
| 25 | 1.4 | $107 | $36 | $5.00 | $0.06 | $4.08 |
| 50 | 2.9 | $237 | $79 | $5.11 | $0.12 | $4.63 |
| 100 | 5.8 | $496 | $165 | $5.37 | $0.24 | $4.91 |
| 250 | 14.4 | $1,273 | $424 | $7.35 | $0.60 | $5.06 |
| 500 | 28.8 | $2,571 | $858 | $16.96 | $1.20 | $5.11 |
| 1000 | 57.6 | $5,167 | $1,726 | $36.27 | $2.40 | $5.13 |
| 2000 | 115.2 | $10,358 | $3,461 | $74.90 | $4.80 | $5.14 |

## Base cap: 100,000 min/Space/month

| Spaces | Audio egress (TB/mo) | Supabase uncached | Supabase cached (best case) | R2 + Worker | B2 backup copy | Saving per Space (Supabase uncached − R2) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.7 | $42 | $14 | $5.00 | $0.02 | $3.73 |
| 25 | 1.8 | $139 | $46 | $5.00 | $0.06 | $5.38 |
| 50 | 3.6 | $301 | $100 | $5.11 | $0.12 | $5.93 |
| 100 | 7.2 | $625 | $208 | $5.37 | $0.24 | $6.20 |
| 250 | 18.0 | $1,598 | $532 | $9.40 | $0.60 | $6.35 |
| 500 | 36.0 | $3,219 | $1,074 | $21.14 | $1.20 | $6.40 |
| 1000 | 72.0 | $6,463 | $2,158 | $44.63 | $2.40 | $6.42 |
| 2000 | 144.0 | $12,950 | $4,325 | $91.62 | $4.80 | $6.43 |

## Low usage: 10,000 min/Space/month

| Spaces | Audio egress (TB/mo) | Supabase uncached | Supabase cached (best case) | R2 + Worker | B2 backup copy | Saving per Space (Supabase uncached − R2) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 0.1 | $0 | $0 | $5.00 | $0.02 | $-0.50 |
| 25 | 0.2 | $0 | $0 | $5.00 | $0.06 | $-0.20 |
| 50 | 0.4 | $10 | $3 | $5.11 | $0.12 | $0.10 |
| 100 | 0.7 | $42 | $14 | $5.37 | $0.24 | $0.37 |
| 250 | 1.8 | $139 | $46 | $6.15 | $0.60 | $0.53 |
| 500 | 3.6 | $303 | $102 | $7.44 | $1.20 | $0.59 |
| 1000 | 7.2 | $631 | $214 | $10.03 | $2.40 | $0.62 |
| 2000 | 14.4 | $1,286 | $437 | $16.42 | $4.80 | $0.63 |

## High usage: one add-on fully used, 170,000 min/Space/month

| Spaces | Audio egress (TB/mo) | Supabase uncached | Supabase cached (best case) | R2 + Worker | B2 backup copy | Saving per Space (Supabase uncached − R2) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 1.2 | $88 | $29 | $5.00 | $0.02 | $8.27 |
| 25 | 3.1 | $253 | $84 | $5.00 | $0.06 | $9.92 |
| 50 | 6.1 | $528 | $176 | $5.11 | $0.12 | $10.46 |
| 100 | 12.2 | $1,079 | $360 | $5.94 | $0.24 | $10.73 |
| 250 | 30.6 | $2,731 | $910 | $16.71 | $0.60 | $10.86 |
| 500 | 61.2 | $5,487 | $1,830 | $35.77 | $1.20 | $10.90 |
| 1000 | 122.4 | $10,999 | $3,670 | $73.89 | $2.40 | $10.92 |
| 2000 | 244.8 | $22,022 | $7,349 | $150.14 | $4.80 | $10.94 |

## $5 audio add-on economics (marginal cost of one fully used add-on, beyond free quotas)

- An add-on's +70,000 minutes is **50.4 GB** of egress, and +240 library minutes is 346 MB of storage.
- **Supabase (uncached):** ≈ $4.54 egress per add-on, before Stripe fees (~$0.65–0.85 on $5). That is $5.19–5.39 of cost against $5 of revenue, so a fully used add-on **loses money**. Only the best-case cached rate ($1.51) leaves a margin, and per-request signed URLs make that rate unrealistic.
- **R2 + Worker:** ≈ $0.032 per add-on at full use (ops + Worker requests + storage). **Viable.**
- Base plan at the 100,000-minute cap (72 GB): Supabase ≈ $6.48 per Space per month of $25 revenue, versus R2 ≈ $0.039.

## Break-even

At the 80,000-minute planning scenario, R2 is already cheaper at **10 Spaces**. The fixed $5 Workers Paid fee is outweighed as soon as total egress passes Supabase's 250 GB quota, which is about 4–5 Spaces at full usage. At the low-usage scenario (10,000 min/Space), Supabase stays within its free quotas up to about 25 Spaces and R2 is cheaper from about **50 Spaces**.

## Sensitivity notes

- If request density were 4× higher (very seek-heavy use), R2 + Worker costs still stay below $1 per Space per month at 2,000 Spaces.
- Monitoring and logging: Workers Logs on Paid retain 7 days at no extra cost, within quotas. Analytics Engine billing is not active yet. Budget for D1 metering writes at $1 per million beyond 50M.
- Real listening is usually far below the cap. The cost difference scales linearly with actual minutes, and the gap persists at every scale.
