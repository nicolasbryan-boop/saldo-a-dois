import Link from 'next/link';
import { branding, pricing } from '@/config';
import { Logo } from './logo';
import { formatBRL } from '@/lib/money';

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-200 bg-cream-100 px-5 py-14 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Logo className="size-8" />
              <span className="font-display text-lg font-semibold tracking-[-0.02em] text-ink-900">
                {branding.name}
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-600">
              {branding.description}
            </p>
            <p className="mt-5 max-w-sm text-xs leading-relaxed text-ink-500">
              O {branding.name} é uma ferramenta de organização financeira. Não é um banco,
              não é corretora, não movimenta dinheiro e não oferece recomendação de
              investimento. Os valores exibidos vêm dos lançamentos informados por vocês.
            </p>
          </div>

          <nav aria-label="Produto">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
              Produto
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/#como-funciona" className="text-ink-600 hover:text-ink-900">
                  Como funciona
                </Link>
              </li>
              <li>
                <Link href="/#livre" className="text-ink-600 hover:text-ink-900">
                  Dinheiro livre
                </Link>
              </li>
              <li>
                <Link href="/#preco" className="text-ink-600 hover:text-ink-900">
                  Preço · {formatBRL(pricing.plan.priceCents)}/mês
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-ink-600 hover:text-ink-900">
                  Dúvidas
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Conta e documentos">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">
              Conta
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/entrar" className="text-ink-600 hover:text-ink-900">
                  Entrar
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="text-ink-600 hover:text-ink-900">
                  Assinar
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className="text-ink-600 hover:text-ink-900">
                  Privacidade
                </Link>
              </li>
              <li>
                <Link href="/termos" className="text-ink-600 hover:text-ink-900">
                  Termos de uso
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-200 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-500">
            © {year} {branding.legalName}. Todos os direitos reservados.
          </p>
          <p className="text-xs text-ink-500">
            Dúvidas?{' '}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="link-underline text-ink-700"
            >
              {branding.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
