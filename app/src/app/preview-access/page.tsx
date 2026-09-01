import { InnerDweSWordmark } from "@/components/brand/wordmark";
import { PreviewAccessForm } from "./preview-access-form";

export default async function PreviewAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center bg-idw-parchment px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <InnerDweSWordmark className="flex flex-col items-center" markSize={32} showDescriptor={false} />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-idw-forest/50 mt-6">
          Private Preview
        </div>
        <PreviewAccessForm next={next ?? "/"} />
      </div>
    </main>
  );
}
