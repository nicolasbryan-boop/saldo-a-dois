import type { Metadata } from 'next';
import { MarketingHeader } from '@/components/marketing/header';
import { MarketingFooter } from '@/components/marketing/footer';
import { LandingAnalytics } from '@/components/marketing/landing-analytics';
import {
  Hero,
  PainSection,
  FreeMoneySection,
  DashboardSection,
  HowItWorksSection,
  ChatSection,
  CoupleDashboardSection,
  BenefitsSection,
  BillsSection,
  GoalsSection,
  ReportSection,
  SecuritySection,
  MadeForTwoSection,
  PricingSection,
  FaqSection,
  FinalCtaSection,
} from '@/components/marketing/sections';
import { branding, pricing, planList } from '@/config';

export const metadata: Metadata = {
  title: `${branding.name} — ${branding.tagline}`,
  description: branding.description,
  alternates: { canonical: '/' },
};

/** Structured data so the plan and the FAQ are legible to search engines. */
function StructuredData() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: branding.name,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        description: branding.description,
        inLanguage: 'pt-BR',
        offers: planList.map((plan) => ({
          '@type': 'Offer',
          name: `Plano ${plan.name}`,
          price: (plan.priceCents / 100).toFixed(2),
          priceCurrency: pricing.currency,
          category: 'subscription',
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Static, developer-authored JSON: no user input reaches this string.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function LandingPage() {
  return (
    <>
      <StructuredData />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-ink-900 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>

      <MarketingHeader />

      <main id="conteudo">
        <Hero />
        <PainSection />
        <FreeMoneySection />
        <DashboardSection />
        <HowItWorksSection />
        <ChatSection />
        <CoupleDashboardSection />
        <BenefitsSection />
        <BillsSection />
        <GoalsSection />
        <ReportSection />
        <SecuritySection />
        <MadeForTwoSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <MarketingFooter />
      <LandingAnalytics />
    </>
  );
}
