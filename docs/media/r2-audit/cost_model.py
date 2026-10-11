import math
# VERIFIED vendor prices (02-VENDOR-RESEARCH.md, read 2026-10-10)
R2_STORE=0.015; R2_FREE_GB=10; R2_A=4.50/1e6; R2_A_FREE=1e6; R2_B=0.36/1e6; R2_B_FREE=10e6
W_BASE=5.0; W_REQ=0.30/1e6; W_REQ_FREE=10e6; W_CPU=0.02/1e6; W_CPU_FREE=30e6
DO_REQ=0.15/1e6; DO_REQ_FREE=1e6; DO_GBS=12.50/1e6; DO_GBS_FREE=400e3; DO_W=1.0/1e6; DO_W_FREE=50e6
LOG=0.60/1e6; LOG_FREE=20e6
B2=6.95/1000; B2_FREE=10
SB_STORE=0.0213; SB_STORE_FREE=100; SB_UNC=0.09; SB_UNC_FREE=250; SB_C=0.03; SB_C_FREE=250
MB_PER_MIN=0.72
SCALES=[10,25,50,100,250,500,1000,2000]

S={ # ESTIMATES
 'Low':  dict(listen=10_000, lib=120, req=0.3, beacon=0.2, cpu=2, retry=1.10, uploads=10, do_s=5),
 'Base': dict(listen=80_000, lib=240, req=0.5, beacon=0.2, cpu=2, retry=1.25, uploads=30, do_s=10),
 'High': dict(listen=170_000,lib=480, req=1.0, beacon=0.2, cpu=5, retry=2.00, uploads=100, do_s=20),
}
def over(x,free): return max(0.0,x-free)
def r2(n,p):
    gb_store = n*p['lib']*MB_PER_MIN*2/1000           # draft + published copies
    rng = n*p['listen']*p['req']*p['retry']            # Worker range requests -> R2 Class B
    beacons = n*p['listen']*p['beacon']*p['retry']
    wreq = rng+beacons
    objs = n*p['lib']/15*2                             # ~15-min avg recording, 2 copies
    lists = 180*max(1,math.ceil(objs/1000))            # rclone sync every 4h: ListObjects = Class A
    classA = n*p['uploads']*3 + lists                  # upload/complete/publish-copy + listings
    classB = rng + n*p['uploads']                      # playback reads + backup reads of changed objects
    c = {}
    c['R2 storage']=over(gb_store,R2_FREE_GB)*R2_STORE
    c['R2 Class B (reads)']=over(classB,R2_B_FREE)*R2_B
    c['R2 Class A (writes/lists)']=over(classA,R2_A_FREE)*R2_A
    c['Worker base']=W_BASE
    c['Worker requests']=over(wreq,W_REQ_FREE)*W_REQ
    c['Worker CPU']=over(wreq*p['cpu'],W_CPU_FREE)*W_CPU
    do_req=beacons; do_gbs=beacons*p['do_s']*0.128; do_w=n*730   # hourly flush row per Space
    c['Durable Objects']=over(do_req,DO_REQ_FREE)*DO_REQ+over(do_gbs,DO_GBS_FREE)*DO_GBS+over(do_w,DO_W_FREE)*DO_W
    c['Monitoring (Workers Logs, 100% sampling)']=over(wreq,LOG_FREE)*LOG
    c['Backups (B2, +15% versions)']=over(gb_store*1.15,B2_FREE)*B2
    return c, gb_store
def sb(n,p,cached=False):
    gb_store=n*p['lib']*MB_PER_MIN*2/1000
    eg=n*p['listen']*MB_PER_MIN*(1+(p['retry']-1)*0.2)/1000   # retries re-fetch only part of the bytes
    e=over(eg,SB_C_FREE)*SB_C if cached else over(eg,SB_UNC_FREE)*SB_UNC
    return over(gb_store,SB_STORE_FREE)*SB_STORE+e
out=[]
for name,p in S.items():
    out.append(f"\n### {name} scenario — {p['listen']:,} listening min/Space/month, {p['lib']} library min stored, {p['req']} range req/min, retry ×{p['retry']}\n")
    out.append("| Spaces | R2 storage | R2 reads | R2 writes | Worker (base+req+CPU) | Durable Objects | Monitoring | B2 backup | **R2 total** | **R2 per Space** | Supabase uncached total | Supabase per Space | Supabase cached (best case) per Space |")
    out.append("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for n in SCALES:
        c,_=r2(n,p); t=sum(c.values())
        w=c['Worker base']+c['Worker requests']+c['Worker CPU']
        su=sb(n,p); scc=sb(n,p,True)
        out.append(f"| {n} | ${c['R2 storage']:.2f} | ${c['R2 Class B (reads)']:.2f} | ${c['R2 Class A (writes/lists)']:.2f} | ${w:.2f} | ${c['Durable Objects']:.2f} | ${c['Monitoring (Workers Logs, 100% sampling)']:.2f} | ${c['Backups (B2, +15% versions)']:.2f} | **${t:.2f}** | **${t/n:.3f}** | ${su:,.0f} | ${su/n:.2f} | ${scc/n:.2f} |")
# abuse
def abuse():
    rows=[]
    # invalid-token flood: Worker req + 1ms CPU, no R2 op
    for m in (10e6,100e6,1e9):
        rows.append((f"Invalid/expired-token flood, {m/1e6:,.0f}M req/month (rejected before R2)", (m*W_REQ)+(m*1*W_CPU)+m*LOG))
    # valid-token tiny-range amplification
    for m in (10e6,100e6):
        rows.append((f"Valid-token tiny-range amplification, {m/1e6:,.0f}M req/month (R2 read each)", m*(R2_B+W_REQ+2*W_CPU+LOG)))
    # leaked token full download loop: bytes free on R2; cost is ops
    rows.append(("Leaked token re-downloading a 60-min file every 10 s for 10 min (60 GETs)", 60*(R2_B+W_REQ)))
    # same abuse on Supabase: egress
    rows.append(("Same leaked-URL loop on Supabase (60 × 43 MB = 2.6 GB uncached egress)", 60*43.2/1000*SB_UNC))
    rows.append(("Scraper pulling 1 TB of audio with valid tokens on Supabase (uncached)", 1000*SB_UNC))
    rows.append(("Scraper pulling 1 TB with valid tokens via R2 (~23k GETs of 43 MB)", (1e6/43.2)*(R2_B+W_REQ)))
    return rows
out.append("\n### Abuse scenarios (incremental $ per month, above quotas)\n")
out.append("| Scenario | Cost |\n|---|---:|")
for k,v in abuse(): out.append(f"| {k} | ${v:,.2f} |")
print("\n".join(out))

# Variant B (RECOMMENDED): no Durable Object.
#  - Delivered bandwidth: one Analytics Engine data point per range request (cost metric, sampling acceptable).
#  - Listening usage: cookieless client beacon every 5 min + on pause/end (0.2/min) -> Worker -> Cloudflare Queues
#    (3 ops/message) -> consumer batches hourly into Supabase.
Q_OP=0.40/1e6; Q_FREE=1e6      # VERIFIED 2026-10-11 developers.cloudflare.com/queues/platform/pricing
AE_PT=0.25/1e6; AE_FREE=10e6   # VERIFIED price, billing "not yet active" (02 F) - budgeted anyway
def r2b(n,p):
    c,_=r2(n,p); c['Durable Objects']=0
    rng=n*p['listen']*p['req']*p['retry']; beacons=n*p['listen']*p['beacon']*p['retry']
    wreq=rng+beacons
    c['Worker requests']=over(wreq,W_REQ_FREE)*W_REQ; c['Worker CPU']=over(wreq*p['cpu'],W_CPU_FREE)*W_CPU
    c['Monitoring (Workers Logs, 100% sampling)']=over(wreq,LOG_FREE)*LOG
    c['Queues']=over(beacons*3,Q_FREE)*Q_OP
    c['Analytics Engine']=over(rng,AE_FREE)*AE_PT
    return c
print("\n### Design B (RECOMMENDED) — R2 + Worker + Queues + Analytics Engine, total and per Space\n")
print("| Spaces | Low | Base | High | Supabase uncached per Space (Low / Base / High) |\n|---:|---:|---:|---:|---:|")
for n in SCALES:
    row=[]; sbr=[]
    for name,p in S.items():
        t=sum(r2b(n,p).values()); row.append(f"${t:,.2f} / **${t/n:.3f}**"); sbr.append(f"${sb(n,p)/n:.2f}")
    print(f"| {n} | "+" | ".join(row)+" | "+" / ".join(sbr)+" |")
print("\n### Design B component breakdown at Base scenario\n")
print("| Spaces | R2 storage | R2 reads | Worker base+req+CPU | Queues | Analytics Engine | Logs | B2 backup | Total |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
for n in SCALES:
    c=r2b(n,S['Base']); w=c['Worker base']+c['Worker requests']+c['Worker CPU']
    print(f"| {n} | ${c['R2 storage']:.2f} | ${c['R2 Class B (reads)']:.2f} | ${w:.2f} | ${c['Queues']:.2f} | ${c['Analytics Engine']:.2f} | ${c['Monitoring (Workers Logs, 100% sampling)']:.2f} | ${c['Backups (B2, +15% versions)']:.2f} | ${sum(c.values()):.2f} |")
