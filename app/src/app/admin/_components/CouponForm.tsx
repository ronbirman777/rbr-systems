"use client";

import { useActionState, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createCouponAction, updateCouponAction, type AdminActionResult } from "../billing/actions";
import { BASE_PLAN_KEY } from "@/lib/billing/constants";
import { LARGE_DISCOUNT_PERCENT } from "@/lib/billing/admin/policy";
import { errorMessage, fieldErrors, isLargeDiscount } from "@/lib/billing/admin/ui/labels";
import { ResultNote } from "./ResultNote";
import { btnPrimary, errCls, hintCls, inputCls, labelCls } from "./styles";

export type CouponFormInitial = {
  code: string; description: string; discountType: "percent" | "fixed_amount"; percentOff: string; amountOff: string; currency: string;
  usageRule: string; durationType: "once" | "repeating" | "forever"; durationCycles: string; validFrom: string; validUntil: string;
  globalMaxRedemptions: string; planKeys: string[]; spaceTypes: string[];
};

export const EMPTY_COUPON: CouponFormInitial = {
  code: "", description: "", discountType: "percent", percentOff: "", amountOff: "", currency: "USD", usageRule: "once_per_user",
  durationType: "once", durationCycles: "", validFrom: "", validUntil: "", globalMaxRedemptions: "", planKeys: [], spaceTypes: [],
};

type Act = (prev: AdminActionResult | null, fd: FormData) => Promise<AdminActionResult>;

function Row({ name, label, hint, error, children }: { name: string; label: string; hint?: ReactNode; error?: string; children: (p: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4" data-field={name}>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children({ id, describedBy, invalid: !!error })}
      {hint ? <div id={`${id}-hint`} className={hintCls}>{hint}</div> : null}
      {error ? <p id={`${id}-err`} role="alert" className={errCls}>{error}</p> : null}
    </div>
  );
}

export function CouponForm({ mode, couponId, initial = EMPTY_COUPON, lockFinancial = false }: { mode: "create" | "edit"; couponId?: string; initial?: CouponFormInitial; lockFinancial?: boolean }) {
  const router = useRouter();
  const action = useMemo<Act>(() => (mode === "edit" && couponId ? updateCouponAction.bind(null, couponId) : createCouponAction), [mode, couponId]);
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(action, null);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [durationType, setDurationType] = useState(initial.durationType);
  const [percentOff, setPercentOff] = useState(initial.percentOff);
  const L = lockFinancial;

  const fields = fieldErrors(state);
  const fe = (n: string) => fields[n];
  const fieldErrorKeys = Object.keys(fields);

  useEffect(() => {
    if (mode === "create" && state?.ok) {
      const id = (state.data as { id?: string } | undefined)?.id;
      if (id) router.push(`/admin/billing/coupons/${id}`);
    }
  }, [state, mode, router]);

  const pct = percentOff === "" ? null : Number(percentOff);
  const large = isLargeDiscount({ discountType, percentOff: pct != null && Number.isFinite(pct) ? pct : null, durationType }, LARGE_DISCOUNT_PERCENT);
  const planOptions = [...new Set([BASE_PLAN_KEY, ...initial.planKeys])];
  const dis = L ? { disabled: true } : {};

  return (
    <form action={formAction} className="max-w-2xl">
      {state && !state.ok && state.error !== "step_up_required" ? (
        <div role="alert" className="mb-4 rounded-xl border border-idw-clay-text/40 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">{errorMessage(state.error)}</p>
          {fieldErrorKeys.length ? <p className="mt-1 text-xs">Fields to fix: {fieldErrorKeys.map((k) => (k === "amountOffMinor" ? "amountOff" : k)).join(", ")}.</p> : null}
        </div>
      ) : null}

      {L ? (
        <div className="mb-4 rounded-xl border border-idw-forest/20 bg-idw-linen/60 p-3 text-sm text-idw-forest">
          <p className="font-semibold">Financial terms are locked.</p>
          <p className="mt-1">Customers have already reserved or redeemed this coupon, so the discount type, value, currency, duration and usage rule cannot change (it would rewrite what they were promised). You can still change the description, availability window, redemption cap and applicability, which only affect NEW redemptions. For different terms, create a new coupon.</p>
        </div>
      ) : null}

      <Row name="code" label="Coupon code" hint="3-32 characters: letters, digits, - and _. Codes are matched case-insensitively." error={fe("code")}>
        {(p) => <input id={p.id} name="code" required minLength={3} maxLength={32} defaultValue={initial.code} autoComplete="off" spellCheck={false} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono uppercase`} />}
      </Row>
      <Row name="description" label="Internal description (optional)" error={fe("description")}>
        {(p) => <input id={p.id} name="description" maxLength={500} defaultValue={initial.description} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Row>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">Discount</legend>
        <Row name="discountType" label="Type">
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "discountType" })} {...dis} value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed_amount")} className={`${inputCls} max-w-xs`}>
              <option value="percent">Percent off</option>
              <option value="fixed_amount">Fixed amount off</option>
            </select>
          )}
        </Row>
        {discountType === "percent" ? (
          <Row name="percentOff" label="Percent off" hint="Greater than 0, at most 100. Up to two decimals." error={fe("percentOff")}>
            {(p) => <input id={p.id} {...(L ? {} : { name: "percentOff" })} {...dis} type="number" inputMode="decimal" min="0.01" max="100" step="0.01" required value={percentOff} onChange={(e) => setPercentOff(e.target.value)} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
          </Row>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Row name="amountOff" label="Amount off (major units)" hint="e.g. 5.00 for five dollars." error={fe("amountOffMinor")}>
              {(p) => <input id={p.id} {...(L ? {} : { name: "amountOff" })} {...dis} type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={initial.amountOff} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
            </Row>
            <Row name="currency" label="Currency (3 letters)" error={fe("currency")}>
              {(p) => <input id={p.id} {...(L ? {} : { name: "currency" })} {...dis} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={initial.currency} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono uppercase`} />}
            </Row>
          </div>
        )}
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">Discount duration</legend>
        <p className={`${hintCls} mb-3`}>How long ONE redemption keeps its discount after a customer redeems it. Once redeemed, the duration is promised and is not cut short when the availability window below ends.</p>
        <Row name="durationType" label="Duration">
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "durationType" })} {...dis} value={durationType} onChange={(e) => setDurationType(e.target.value as "once" | "repeating" | "forever")} className={`${inputCls} max-w-xs`}>
              <option value="once">First billing cycle only</option>
              <option value="repeating">First N billing cycles</option>
              <option value="forever">Forever</option>
            </select>
          )}
        </Row>
        {durationType === "repeating" ? (
          <Row name="durationCycles" label="Number of billing cycles" hint="At least 2, at most 60. For a single cycle choose “First billing cycle only”." error={fe("durationCycles")}>
            {(p) => <input id={p.id} {...(L ? {} : { name: "durationCycles" })} {...dis} type="number" inputMode="numeric" min={2} max={60} step={1} required defaultValue={initial.durationCycles} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
          </Row>
        ) : null}
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">Usage rule</legend>
        <Row name="usageRule" label="Who can redeem it, and how often" hint={
          <ul className="list-disc pl-4">
            <li><b>Once per user</b>: each customer account can redeem it a single time, across all their Spaces.</li>
            <li><b>Once per Space</b>: a Space can never get it twice, but one customer may use it for different Spaces.</li>
            <li><b>Unlimited while available</b>: repeatable across Spaces and customers while the availability window is open.</li>
          </ul>
        } error={fe("usageRule")}>
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "usageRule" })} {...dis} defaultValue={initial.usageRule} aria-describedby={p.describedBy} className={`${inputCls} max-w-md`}>
              <option value="once_per_user">Once per user</option>
              <option value="once_per_space">Once per Space</option>
              <option value="unlimited_during_validity">Unlimited while available</option>
            </select>
          )}
        </Row>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">Availability window (UTC)</legend>
        <p className={`${hintCls} mb-3`}>When a NEW redemption may start. Customers who redeemed inside the window keep their full discount duration even after it closes. Leave both empty for always available.</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Row name="validFrom" label="Available from" error={fe("validFrom")}>
            {(p) => <input id={p.id} name="validFrom" type="datetime-local" defaultValue={initial.validFrom} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
          </Row>
          <Row name="validUntil" label="Available until" error={fe("validUntil")}>
            {(p) => <input id={p.id} name="validUntil" type="datetime-local" defaultValue={initial.validUntil} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
          </Row>
        </div>
        <Row name="globalMaxRedemptions" label="Total redemption cap (optional)" hint="Counts successful redemptions only; abandoned checkouts do not use it up." error={fe("globalMaxRedemptions")}>
          {(p) => <input id={p.id} name="globalMaxRedemptions" type="number" inputMode="numeric" min={1} step={1} defaultValue={initial.globalMaxRedemptions} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
        </Row>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">Applies to (leave all unchecked = everything)</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {planOptions.map((k) => (
            <label key={k} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="planKeys" value={k} defaultChecked={initial.planKeys.includes(k)} className="size-5" /> Plan <code className="font-mono text-xs">{k}</code></label>
          ))}
          {(["teach", "retreat"] as const).map((t) => (
            <label key={t} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="spaceTypes" value={t} defaultChecked={initial.spaceTypes.includes(t)} className="size-5" /> {t === "teach" ? "Teach Spaces" : "Retreat Spaces"}</label>
          ))}
        </div>
      </fieldset>

      {large ? (
        <div role="note" className="mb-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Large discount</p>
          <p className="mt-1">
            {durationType === "forever" ? "A discount that lasts forever" : `A discount of ${LARGE_DISCOUNT_PERCENT}% or more`} is a long or deep commitment to every customer who redeems it, and it cannot be edited afterwards. Saving it will ask you to confirm with a fresh authenticator code.
          </p>
        </div>
      ) : null}

      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Saving..." : mode === "create" ? "Create coupon" : "Save changes"}</button>
      <ResultNote result={state} okMessage={mode === "create" ? "Coupon created. Opening it..." : "Changes saved."} />
      {L ? (
        <>
          <input type="hidden" name="discountType" value={initial.discountType} />
          <input type="hidden" name="percentOff" value={initial.percentOff} />
          <input type="hidden" name="amountOff" value={initial.amountOff} />
          <input type="hidden" name="currency" value={initial.currency} />
          <input type="hidden" name="durationType" value={initial.durationType} />
          <input type="hidden" name="durationCycles" value={initial.durationCycles} />
          <input type="hidden" name="usageRule" value={initial.usageRule} />
        </>
      ) : null}
    </form>
  );
}
