import { InnerDweSMark } from "@/components/brand/wordmark";

const PRINCIPLES = [
  { name: "Calm", detail: "No notifications that demand. No flows that distract." },
  { name: "Human", detail: "Designed for the pace of presence, not productivity." },
  { name: "Intentional", detail: "Every element serves the experience. Nothing is filler." },
  { name: "Private", detail: "Guest data belongs to the guest and the facilitator." },
  { name: "Beautiful", detail: "Because aesthetics are part of the therapeutic work." },
];

export function PhilosophySection() {
  return (
    <section id="philosophy" className="bg-idw-parchment py-28 px-6">
      <div className="mx-auto max-w-[1280px] grid lg:grid-cols-2 gap-16">
        <div>
          <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-6">
            Philosophy
          </div>
          <InnerDweSMark size={40} className="mb-6" />
          <h2 className="font-editorial italic font-light text-[32px] sm:text-[40px] leading-[1.2] text-idw-forest text-balance">
            Technology should support the experience, not interrupt it.
          </h2>
        </div>

        <div className="flex flex-col">
          {PRINCIPLES.map((p, i) => (
            <div
              key={p.name}
              className={`grid grid-cols-[140px_1fr] gap-6 py-6 ${i > 0 ? "border-t border-idw-forest/10" : ""}`}
            >
              <div className="font-editorial italic text-lg text-idw-clay-text">{p.name}</div>
              <div className="font-ui text-idw-forest/70 leading-relaxed">{p.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
