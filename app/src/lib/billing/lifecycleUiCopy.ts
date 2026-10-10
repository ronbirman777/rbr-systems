import type { LifecycleUiCopy } from "@/components/space-lifecycle-controls";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";

/**
 * TASK 032: the Archive / Restore / Replace buttons and the Replace dialog labels in paid mode, translated
 * on the server (billing namespace, account locale) and passed to the client component. The Space name is
 * interpolated verbatim into the type-to-confirm label; the dialog still compares the typed text to the
 * exact Space name.
 */
export function lifecycleUiCopy(locale: Locale, spaceName: string): LifecycleUiCopy {
  const t = (k: AccountKey<"billing">, v?: Record<string, string>) => translateAccount(locale, "billing", k, v);
  return {
    archive: t("lifecycleArchiveButton"),
    confirmArchive: t("lifecycleConfirmArchive"),
    archiving: t("lifecycleArchiving"),
    restore: t("lifecycleRestoreButton"),
    restoring: t("lifecycleRestoring"),
    replace: t("lifecycleReplaceButton"),
    replaceTitle: t("lifecycleReplaceTitle"),
    typeNameLabel: t("lifecycleTypeNameLabel", { space: spaceName }),
    newNameLabel: t("lifecycleNewNameLabel"),
    discardReplace: t("lifecycleDiscardReplace"),
    replacing: t("lifecycleReplacing"),
    cancel: t("lifecycleCancel"),
  };
}
