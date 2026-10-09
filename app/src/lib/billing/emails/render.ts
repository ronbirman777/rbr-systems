import { formatLongDateLocalized } from "@/lib/i18n/datetime";
import { directionOf, translate, type Locale } from "@/lib/i18n";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import { formatMoney } from "../money";

/**
 * Pure rendering of every billing email: (template, locale, payload) -> subject +
 * plain text + HTML. No I/O, so it is unit-tested directly in all seven locales.
 *
 * Safety:
 *   - every dynamic value is HTML-escaped (Space names and coupon codes are user/Admin text);
 *   - links are emitted only if they are https URLs;
 *   - there are NO tracking pixels and NO redirect/click-tracking wrappers - links are the
 *     plain destination (Resend open/click tracking is also disabled on the sending domain);
 *   - Hebrew gets dir="rtl";
 *   - user-authored text (Space name, coupon code) is never translated.
 */

export type EmailTemplate =
  | "payment_confirmation" | "payment_failed" | "guest_unavailable" | "studio_suspended"
  | "final_warning" | "cancellation_scheduled" | "subscription_ended";

export type RenderedEmail = { subject: string; text: string; html: string; dir: "ltr" | "rtl"; lang: string };

type P = Record<string, unknown>;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function safeHttpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const dateOf = (iso: unknown, locale: Locale) => {
  const s = str(iso);
  return s ? formatLongDateLocalized(s.slice(0, 10), locale) : "";
};

function statusLabel(locale: Locale, status: unknown): string {
  const t = (k: AccountKey<"billing">) => translateAccount(locale, "billing", k);
  switch (status) {
    case "active": case "trialing": return t("statusActive");
    case "past_due": case "unpaid": return t("statusPaymentIssue");
    case "canceled": case "incomplete_expired": return t("statusEnded");
    case "exempt": return t("statusExempt");
    default: return t("statusSettingUp");
  }
}

type Row = { label: string; value: string };
type Button = { label: string; href: string };

function layout(locale: Locale, o: { subject: string; heading: string; intro: string; rows: Row[]; buttons: Button[]; footnote: string | null; footer: string }): RenderedEmail {
  const dir = directionOf(locale);
  const rowsHtml = o.rows.map((r) => `<tr><td style="padding:6px 0;color:#5b6a60;font-size:13px;">${esc(r.label)}</td><td style="padding:6px 0;text-align:${dir === "rtl" ? "left" : "right"};color:#192b21;font-size:14px;font-weight:600;" dir="auto">${esc(r.value)}</td></tr>`).join("");
  const buttonsHtml = o.buttons.map((b, i) => `<a href="${esc(b.href)}" style="display:inline-block;margin:6px 6px 0 0;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${i === 0 ? "background:#192b21;color:#ffffff;" : "border:1px solid #192b21;color:#192b21;"}">${esc(b.label)}</a>`).join("");
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.subject)}</title></head><body style="margin:0;background:#f2efe7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px;" cellpadding="0" cellspacing="0"><tr><td dir="${dir}"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8f5844;">InnerDweS</div><h1 style="margin:10px 0 12px;font-size:22px;line-height:1.3;color:#192b21;">${esc(o.heading)}</h1><p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#33423a;">${esc(o.intro)}</p>${o.rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e1d6;border-bottom:1px solid #e6e1d6;margin:8px 0 16px;">${rowsHtml}</table>` : ""}<div>${buttonsHtml}</div>${o.footnote ? `<p style="margin:18px 0 0;font-size:12.5px;line-height:1.5;color:#5b6a60;">${esc(o.footnote)}</p>` : ""}<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#8a948d;">${esc(o.footer)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = [
    o.heading, "", o.intro, "",
    ...o.rows.map((r) => `${r.label}: ${r.value}`),
    ...(o.rows.length ? [""] : []),
    ...o.buttons.map((b) => `${b.label}: ${b.href}`),
    ...(o.footnote ? ["", o.footnote] : []),
    "", o.footer,
  ].join("\n");
  return { subject: o.subject, text, html, dir, lang: locale };
}

export function renderBillingEmail(template: EmailTemplate, locale: Locale, payload: P): RenderedEmail {
  const t = <K extends AccountKey<"billing">>(k: K, v?: Record<string, string | number>) => translateAccount(locale, "billing", k, v);
  const space = str(payload.spaceName) ?? "";
  const billingUrl = safeHttpsUrl(payload.billingUrl);
  const footer = t("emailFooter", { space });
  const manage: Button[] = billingUrl ? [{ label: t("emailManageBilling"), href: billingUrl }] : [];

  switch (template) {
    case "payment_confirmation": {
      const variant = (str(payload.variant) ?? "renewal") as "first" | "renewal" | "recovered" | "final";
      const currency = str(payload.currency) ?? "USD";
      const accessEnds = dateOf(payload.nextBillingDate, locale);
      const subject = t(({ first: "emailPaymentFirstSubject", renewal: "emailPaymentRenewalSubject", recovered: "emailPaymentRecoveredSubject", final: "emailPaymentFinalSubject" } as const)[variant], { space });
      const intro = t(({ first: "emailPaymentFirstIntro", renewal: "emailPaymentRenewalIntro", recovered: "emailPaymentRecoveredIntro", final: "emailPaymentFinalIntro" } as const)[variant], { date: accessEnds, space });
      const rows: Row[] = [{ label: t("emailRowSpace"), value: space }];
      const type = str(payload.spaceType);
      if (type) rows.push({ label: t("emailRowType"), value: type === "teach" ? t("productTeach") : t("productFlow") });
      if (str(payload.planName)) rows.push({ label: t("emailRowPlan"), value: String(payload.planName) });
      rows.push({ label: t("emailRowAmountPaid"), value: formatMoney(num(payload.amountPaidMinor) ?? 0, currency, locale) });
      const discountMinor = num(payload.discountMinor) ?? 0;
      if (str(payload.couponCode) && discountMinor > 0) {
        rows.push({ label: t("emailRowDiscount"), value: t("emailDiscountValue", { code: String(payload.couponCode), amount: formatMoney(discountMinor, currency, locale) }) });
      }
      const dc = payload.discountCycle as { completed: number; total: number | null } | null | undefined;
      if (dc) {
        rows.push({ label: t("emailRowDiscountProgress"), value: dc.total == null ? t("emailDiscountProgressForever") : t("emailDiscountProgressValue", { done: dc.completed, total: dc.total }) });
      }
      if (variant !== "final") {
        if (accessEnds) rows.push({ label: t("emailRowNextBilling"), value: accessEnds });
        const nextCharge = num(payload.nextExpectedChargeMinor);
        if (nextCharge != null) rows.push({ label: t("emailRowNextCharge"), value: formatMoney(nextCharge, currency, locale) });
      }
      rows.push({ label: t("emailRowStatus"), value: statusLabel(locale, payload.subscriptionStatus) });
      if (str(payload.invoiceNumber)) rows.push({ label: t("emailRowInvoice"), value: String(payload.invoiceNumber) });
      const doc = safeHttpsUrl(payload.hostedInvoiceUrl) ?? safeHttpsUrl(payload.receiptUrl);
      const buttons: Button[] = [...(doc ? [{ label: t("emailViewInvoice"), href: doc }] : []), ...manage];
      return layout(locale, { subject, heading: subject, intro, rows, buttons, footnote: doc ? t("emailOfficialDocument") : null, footer });
    }
    case "payment_failed": {
      const subject = t("emailFailedSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailFailedIntro", { space }), rows: [], buttons: billingUrl ? [{ label: t("emailFailedCta"), href: billingUrl }] : [], footnote: null, footer });
    }
    case "guest_unavailable": {
      const subject = t("emailGuestSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailGuestIntro", { space, date: dateOf(payload.studioSuspensionAt, locale) }), rows: [], buttons: manage, footnote: null, footer });
    }
    case "studio_suspended": {
      const subject = t("emailStudioSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailStudioIntro", { space, date: dateOf(payload.deletionEligibleAt, locale) }), rows: [], buttons: manage, footnote: null, footer });
    }
    case "final_warning": {
      const subject = t("emailFinalSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailFinalIntro", { space, date: dateOf(payload.deletionEligibleAt, locale) }), rows: [], buttons: manage, footnote: null, footer });
    }
    case "cancellation_scheduled": {
      const subject = t("emailCancelSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailCancelIntro", { space, date: dateOf(payload.accessEndsAt, locale) }), rows: [], buttons: manage, footnote: null, footer });
    }
    case "subscription_ended": {
      const subject = t("emailEndedSubject", { space });
      return layout(locale, { subject, heading: subject, intro: t("emailEndedIntro", { space }), rows: [], buttons: manage, footnote: null, footer });
    }
  }
}
