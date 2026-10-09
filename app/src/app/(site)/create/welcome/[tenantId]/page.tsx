import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { getAccountLocale } from "@/lib/i18n/accountLocale";
import { directionOf, translate, type TranslationKey } from "@/lib/i18n";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import { createClient } from "@/lib/supabase/server";
import { nameSpaceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!z.string().uuid().safeParse(tenantId).success) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");
  // The owner's own RLS session decides whether this Space is theirs to name.
  const { data: tenant } = await supabase.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
  if (!tenant) notFound();

  const locale = await getAccountLocale();
  const t = (k: AccountKey<"billing">) => translateAccount(locale, "billing", k);

  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-16 sm:py-20 flex flex-col items-center">
      <div className="w-full max-w-md">
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-2xl sm:text-3xl text-idw-forest">{t("onboardTitle")}</h1>
        <p className="mt-2 text-sm text-idw-forest/60">{t("onboardBody")}</p>
        <form action={nameSpaceAction.bind(null, tenantId)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="space-name" className="block text-sm font-semibold text-idw-forest">{t("spaceNameLabel")}</label>
            <input
              id="space-name"
              name="name"
              type="text"
              dir="auto"
              maxLength={80}
              autoComplete="off"
              autoFocus
              className="mt-2 w-full min-h-11 rounded-xl border border-idw-forest/20 bg-white px-3 text-sm text-idw-forest"
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" className="min-h-11 px-5 rounded-full bg-idw-forest text-sm font-semibold text-idw-parchment active:scale-[0.97] motion-reduce:active:scale-100">
              {t("saveAndOpenStudio")}
            </button>
            <button type="submit" name="skip" value="1" formNoValidate className="min-h-11 px-5 rounded-full border border-idw-forest/20 text-sm font-semibold text-idw-forest active:bg-idw-forest/10">
              {t("skipForNow")}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
