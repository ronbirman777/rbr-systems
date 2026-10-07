import { InnerDweSMark } from "@/components/brand/wordmark";
import { RequestResetForm } from "../recovery-form";

/**
 * Task 012. A plain server component (unlike log-in's client+Suspense
 * wrapper) since the only query param this page reads is used for a
 * simple server-rendered notice, not for state a client action drives -
 * same pattern already used by preview-access/page.tsx for its own
 * `next` param.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recoveryError?: string }>;
}) {
  const { recoveryError } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm">
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-[28px] tracking-[-0.01em] text-idw-forest">Reset your password</h1>
        <p className="text-sm text-idw-forest/60 mt-2">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {recoveryError === "1" && (
          <p className="text-sm text-idw-forest/70 bg-idw-forest/5 rounded-lg px-3 py-2.5 mt-4">
            This reset link is invalid or has expired. Request a new one below.
          </p>
        )}

        <RequestResetForm />
      </div>
    </main>
  );
}
