"use client";

import { useActionState, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createCouponAction, updateCouponAction, type AdminActionResult } from "../billing/actions";
import { BASE_PLAN_KEY } from "@/lib/billing/constants";
import { LARGE_DISCOUNT_PERCENT } from "@/lib/billing/admin/policy";
import { errorMessage, fieldErrors, isLargeDiscount, type AdminKey, type AdminT } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";
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

const FIELD_LABEL_KEYS: Record<string, AdminKey> = {
  code: "cfCode", description: "cfDescription", discountType: "cfType", percentOff: "cfPercentOff", amountOff: "cfAmountOff", amountOffMinor: "cfAmountOff",
  currency: "cfCurrency", durationType: "cfDuration", durationCycles: "cfCycles", usageRule: "cfUsageLabel", validFrom: "cfFrom", validUntil: "cfUntil",
  globalMaxRedemptions: "cfCap",
};
const fieldLabel = (name: string, t: AdminT) => (FIELD_LABEL_KEYS[name] ? t(FIELD_LABEL_KEYS[name]) : name);

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
  const c = useAdminI18n();
  const { t } = c;
  const router = useRouter();
  const action = useMemo<Act>(() => (mode === "edit" && couponId ? updateCouponAction.bind(null, couponId) : createCouponAction), [mode, couponId]);
  const [state, formAction, pending] = useActionState<AdminActionResult | null, FormData>(action, null);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [durationType, setDurationType] = useState(initial.durationType);
  const [percentOff, setPercentOff] = useState(initial.percentOff);
  const L = lockFinancial;

  const fields = fieldErrors(state, c);
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
    <>
    <form action={formAction} className="max-w-2xl">
      {state && !state.ok && state.error !== "step_up_required" ? (
        <div role="alert" className="mb-4 rounded-xl border border-idw-clay-text/40 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">{errorMessage(state.error, c)}</p>
          {fieldErrorKeys.length ? <p className="mt-1 text-xs">{t("cfFieldsToFix", { fields: fieldErrorKeys.map((k) => fieldLabel(k, t)).join(", ") })}</p> : null}
        </div>
      ) : null}

      {L ? (
        <div className="mb-4 rounded-xl border border-idw-forest/20 bg-idw-linen/60 p-3 text-sm text-idw-forest">
          <p className="font-semibold">{t("cfLockedTitle")}</p>
          <p className="mt-1">{t("cfLockedBody")}</p>
        </div>
      ) : null}

      <Row name="code" label={t("cfCode")} hint={t("cfCodeHint")} error={fe("code")}>
        {(p) => <input id={p.id} name="code" required minLength={3} maxLength={32} defaultValue={initial.code} autoComplete="off" spellCheck={false} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono uppercase`} />}
      </Row>
      <Row name="description" label={t("cfDescription")} error={fe("description")}>
        {(p) => <input id={p.id} name="description" maxLength={500} defaultValue={initial.description} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
      </Row>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">{t("cfDiscountLegend")}</legend>
        <Row name="discountType" label={t("cfType")}>
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "discountType" })} {...dis} value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed_amount")} className={`${inputCls} max-w-xs`}>
              <option value="percent">{t("cfTypePercent")}</option>
              <option value="fixed_amount">{t("cfTypeFixed")}</option>
            </select>
          )}
        </Row>
        {discountType === "percent" ? (
          <Row name="percentOff" label={t("cfPercentOff")} hint={t("cfPercentHint")} error={fe("percentOff")}>
            {(p) => <input id={p.id} {...(L ? {} : { name: "percentOff" })} {...dis} type="number" inputMode="decimal" min="0.01" max="100" step="0.01" required value={percentOff} onChange={(e) => setPercentOff(e.target.value)} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
          </Row>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Row name="amountOff" label={t("cfAmountOff")} hint={t("cfAmountHint")} error={fe("amountOffMinor")}>
              {(p) => <input id={p.id} {...(L ? {} : { name: "amountOff" })} {...dis} type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={initial.amountOff} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
            </Row>
            <Row name="currency" label={t("cfCurrency")} error={fe("currency")}>
              {(p) => <input id={p.id} {...(L ? {} : { name: "currency" })} {...dis} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={initial.currency} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} font-mono uppercase`} />}
            </Row>
          </div>
        )}
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">{t("cfDurationLegend")}</legend>
        <p className={`${hintCls} mb-3`}>{t("cfDurationIntro")}</p>
        <Row name="durationType" label={t("cfDuration")}>
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "durationType" })} {...dis} value={durationType} onChange={(e) => setDurationType(e.target.value as "once" | "repeating" | "forever")} className={`${inputCls} max-w-xs`}>
              <option value="once">{t("cfDurOnce")}</option>
              <option value="repeating">{t("cfDurRepeating")}</option>
              <option value="forever">{t("cfDurForever")}</option>
            </select>
          )}
        </Row>
        {durationType === "repeating" ? (
          <Row name="durationCycles" label={t("cfCycles")} hint={t("cfCyclesHint", { once: t("cfDurOnce") })} error={fe("durationCycles")}>
            {(p) => <input id={p.id} {...(L ? {} : { name: "durationCycles" })} {...dis} type="number" inputMode="numeric" min={2} max={60} step={1} required defaultValue={initial.durationCycles} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
          </Row>
        ) : null}
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">{t("cfUsageLegend")}</legend>
        <Row name="usageRule" label={t("cfUsageLabel")} hint={
          <ul className="list-disc pl-4">
            <li><b>{t("cfUsage1Name")}</b>: {t("cfUsage1Desc")}</li>
            <li><b>{t("cfUsage2Name")}</b>: {t("cfUsage2Desc")}</li>
            <li><b>{t("cfUsage3Name")}</b>: {t("cfUsage3Desc")}</li>
          </ul>
        } error={fe("usageRule")}>
          {(p) => (
            <select id={p.id} {...(L ? {} : { name: "usageRule" })} {...dis} defaultValue={initial.usageRule} aria-describedby={p.describedBy} className={`${inputCls} max-w-md`}>
              <option value="once_per_user">{t("cfUsage1Name")}</option>
              <option value="once_per_space">{t("cfUsage2Name")}</option>
              <option value="unlimited_during_validity">{t("cfUsage3Name")}</option>
            </select>
          )}
        </Row>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">{t("cfWindowLegend")}</legend>
        <p className={`${hintCls} mb-3`}>{t("cfWindowIntro")}</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Row name="validFrom" label={t("cfFrom")} error={fe("validFrom")}>
            {(p) => <input id={p.id} name="validFrom" type="datetime-local" defaultValue={initial.validFrom} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
          </Row>
          <Row name="validUntil" label={t("cfUntil")} error={fe("validUntil")}>
            {(p) => <input id={p.id} name="validUntil" type="datetime-local" defaultValue={initial.validUntil} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={inputCls} />}
          </Row>
        </div>
        <Row name="globalMaxRedemptions" label={t("cfCap")} hint={t("cfCapHint")} error={fe("globalMaxRedemptions")}>
          {(p) => <input id={p.id} name="globalMaxRedemptions" type="number" inputMode="numeric" min={1} step={1} defaultValue={initial.globalMaxRedemptions} aria-describedby={p.describedBy} aria-invalid={p.invalid || undefined} className={`${inputCls} max-w-[10rem]`} />}
        </Row>
      </fieldset>

      <fieldset className="mb-4 rounded-xl border border-idw-forest/15 p-4">
        <legend className="px-1 text-sm font-semibold text-idw-forest">{t("cfAppliesLegend")}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {planOptions.map((k) => (
            <label key={k} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="planKeys" value={k} defaultChecked={initial.planKeys.includes(k)} className="size-5" /> <span dir="auto">{t("cfPlanLabel", { key: k })}</span></label>
          ))}
          {(["teach", "retreat"] as const).map((st) => (
            <label key={st} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" name="spaceTypes" value={st} defaultChecked={initial.spaceTypes.includes(st)} className="size-5" /> {st === "teach" ? c.t("cfTeachSpaces") : c.t("cfRetreatSpaces")}</label>
          ))}
        </div>
      </fieldset>

      {large ? (
        <div role="note" className="mb-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">{t("cfLargeTitle")}</p>
          <p className="mt-1">
            {t("cfLargeBody", { lead: durationType === "forever" ? t("cfLargeForever") : t("cfLargePercent", { percent: LARGE_DISCOUNT_PERCENT }) })}
          </p>
        </div>
      ) : null}

      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? t("fmSaving") : mode === "create" ? t("cfCreate") : t("cfSave")}</button>
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
    {/* Kept outside the form element: the step-up box is a form of its own and forms must never nest. */}
    <div className="max-w-2xl">
      <ResultNote result={state} okMessage={mode === "create" ? t("cfCreatedOk") : t("cfSavedOk")} />
    </div>
    </>
  );
}
