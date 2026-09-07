import { FlowShowcaseDeck } from "./flow-showcase-deck";

/**
 * Purpose-built marketing recreations of the five Time to Flow screens (see
 * product-visuals/*.tsx), rebuilt to match the supplied premium product
 * reference screenshots directly - photography-forward, editorial, fewer
 * and larger elements per screen. Section background stays Deep Forest
 * deliberately; the devices themselves are light cream/parchment product UI
 * throughout. Editorial fan composition: Today dominant but not towering,
 * Schedule and Team with substantial presence, Meals and Treatments
 * slightly smaller - overlap and rotation for depth, not five equal phones
 * in a row and not four tiny satellites clinging to one giant center.
 *
 * The phone row itself lives in flow-showcase-deck.tsx (a client
 * component) - it owns the hover/focus "spotlight" interaction, kept
 * separate so this section stays a server component for everything else.
 */
export function FlowShowcaseSection() {
  return (
    <section id="flow-showcase" className="bg-idw-forest py-28 px-6 overflow-hidden">
      <div className="mx-auto max-w-[1280px] text-center">
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[48px] leading-[1.15] text-idw-parchment text-balance">
          Everything your guests need.
          <br />
          <span className="text-idw-clay">Nothing they don&apos;t.</span>
        </h2>
        <p className="font-ui text-idw-parchment/60 mt-6 max-w-xl mx-auto leading-relaxed">
          One thoughtfully designed space holds the entire retreat — schedule, team, meals,
          treatments, arrival and more.
        </p>

        <FlowShowcaseDeck />
      </div>
    </section>
  );
}
