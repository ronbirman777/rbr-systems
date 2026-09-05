import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { ProductFamilySection } from "@/components/marketing/product-family-section";
import { FlowShowcaseSection } from "@/components/marketing/flow-showcase-section";
import { SystemSection } from "@/components/marketing/system-section";
import { RetreatIdentitySection } from "@/components/marketing/retreat-identity-section";
import { PhilosophySection } from "@/components/marketing/philosophy-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { AboutSection } from "@/components/marketing/about-section";
import { SelectedWorkSection } from "@/components/marketing/selected-work-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";

export const metadata: Metadata = {
  title: "InnerDweS · Digital Wellness Solutions",
  description: "Thoughtful digital experiences for retreats, practitioners and the people they support.",
};

export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <ProductFamilySection />
      <FlowShowcaseSection />
      <SystemSection />
      <RetreatIdentitySection />
      <PhilosophySection />
      <PricingSection />
      <AboutSection />
      <SelectedWorkSection />
      <FinalCtaSection />
    </>
  );
}
