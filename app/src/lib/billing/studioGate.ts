import { lifecycleDeadlines } from "./lifecycle";
import { formatBillingDate } from "./displayDate";
import { translate, type Locale, type TranslationKey } from "@/lib/i18n";
import type { SubscriptionRecord } from "./types";

export type StudioSuspendedLabels = {
  title: string;
  body: string;
  /** null when there is no deletion deadline to quote (ended subscriptions). */
  deadline: string | null;
  resolvePayment: string | null;
  backToSpaces: string;
};

/** The gate shows for any billing-governed Space whose Studio is not writable. */
export function isStudioGated(availability: { billing?: { reason: string; studioWritable: boolean } | undefined }): boolean {
  return !!availability.billing && !availability.billing.studioWritable;
}

/** Pre-translated copy for <StudioSuspended/>. "subscription_ended" uses the ended copy and offers no payment action. */
export function buildStudioSuspendedLabels(args: {
  locale: Locale;
  spaceName: string;
  reason: string;
  subscription: Pick<SubscriptionRecord, "paymentFailedAt"> | null;
}): StudioSuspendedLabels {
  const { locale, spaceName, reason, subscription } = args;
  const t = (k: TranslationKey<"billing">, v?: Record<string, string>) => translate(locale, "billing", k, v);
  if (reason === "subscription_ended") {
    return { title: t("endedTitle"), body: t("endedBody", { space: spaceName }), deadline: null, resolvePayment: null, backToSpaces: t("backToSpaces") };
  }
  const deletion = subscription?.paymentFailedAt ? lifecycleDeadlines(subscription.paymentFailedAt).deletionEligibleAt : null;
  return {
    title: t("studioSuspendedTitle"),
    body: t("studioSuspendedBody", { space: spaceName }),
    deadline: deletion ? t("studioSuspendedDeadline", { date: formatBillingDate(deletion, locale) }) : null,
    resolvePayment: t("resolvePayment"),
    backToSpaces: t("backToSpaces"),
  };
}
