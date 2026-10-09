import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { CouponForm } from "../../../_components/CouponForm";
import { PageHeader } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";
import { adminMetaTitle, getAdminI18n } from "../../../_lib/i18n";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetaTitle("metaNewCoupon");

export default async function NewCouponPage() {
  await requireAdminPage();
  const { t } = await getAdminI18n();
  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/coupons">&larr; {t("cdBack")}</Link></p>
      <PageHeader title={t("cpNew")}>{t("ncIntro")}</PageHeader>
      <CouponForm mode="create" />
    </>
  );
}
