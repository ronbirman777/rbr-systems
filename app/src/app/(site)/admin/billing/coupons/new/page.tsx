import Link from "next/link";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { CouponForm } from "../../../_components/CouponForm";
import { PageHeader } from "../../../_components/ui";
import { linkCls } from "../../../_components/styles";

export const dynamic = "force-dynamic";
export const metadata = { title: "New coupon - InnerDweS Admin" };

export default async function NewCouponPage() {
  await requireAdminPage();
  return (
    <>
      <p className="mb-2 text-sm"><Link className={linkCls} href="/admin/billing/coupons">&larr; All coupons</Link></p>
      <PageHeader title="New coupon">The discount terms cannot be changed after customers start using the coupon, so double-check them. Amounts are in major units (5.00 = five dollars).</PageHeader>
      <CouponForm mode="create" />
    </>
  );
}
