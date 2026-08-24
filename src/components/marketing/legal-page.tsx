import { MarketingHeader } from './header';
import { MarketingFooter } from './footer';

/** Shared layout for the privacy policy and the terms of use. */
export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingHeader />
      <main className="bg-cream-100 px-5 py-14 lg:px-8 lg:py-20">
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-ink-900 sm:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-3 text-sm text-ink-500">Última atualização: {updatedAt}</p>

          <div className="mt-6 rounded-lg border border-money-hold/30 bg-money-hold-soft px-5 py-4">
            <p className="text-sm leading-relaxed text-[#8a5b02]">
              <strong>Versão inicial, pendente de revisão jurídica.</strong> Este documento
              foi escrito para ser claro e honesto sobre o que o produto faz, mas ainda não
              passou por análise de um advogado. Ele precisa ser revisado antes do
              lançamento comercial.
            </p>
          </div>

          <div className="legal mt-10 space-y-8">{children}</div>
        </article>
      </main>
      <MarketingFooter />
    </>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-ink-700">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[1.0625rem] leading-relaxed text-ink-700">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-rose-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
