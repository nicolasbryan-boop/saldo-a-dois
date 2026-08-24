import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isAppError } from '@/lib/errors';
import { getAppContext } from '@/server/app-context';
import { BottomNavigation, SideNavigation } from '@/components/app/bottom-navigation';
import { ToastProvider } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/primitives';
import { Logo } from '@/components/marketing/logo';
import { AppRefresh } from '@/components/app/app-refresh';
import { InstallPrompt } from '@/components/app/install-prompt';
import { branding } from '@/config';
import { Settings } from 'lucide-react';

export const dynamic = 'force-dynamic';

/**
 * Shell for everything behind the paywall.
 *
 * Access is decided here, on the server, by `getAppContext()`. Each failure
 * mode routes somewhere the person can actually act:
 *   no session          -> sign in
 *   temporary password  -> change it first
 *   no household        -> buy
 *   inactive plan       -> subscription screen
 *   setup unfinished    -> onboarding
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let context: Awaited<ReturnType<typeof getAppContext>>;

  try {
    context = await getAppContext();
  } catch (error) {
    if (isAppError(error)) {
      switch (error.code) {
        case 'unauthenticated':
          redirect('/entrar?proximo=/app');
        case 'password_change_required':
          redirect('/trocar-senha');
        case 'onboarding_required':
          redirect('/onboarding');
        case 'subscription_required':
          redirect('/assinatura');
        case 'not_found':
          redirect('/checkout');
        default:
          throw error;
      }
    }
    throw error;
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-cream-100">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-cream-100/90 backdrop-blur-md pt-safe">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 lg:px-6">
            <Link href="/app" className="flex min-w-0 items-center gap-2.5">
              <Logo className="size-7 shrink-0" />
              <span className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="text-sm">
                  {branding.glyph}
                </span>
                <span className="truncate text-sm font-semibold text-ink-900">
                  {context.household.name}
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-2">
                {context.members.map((member) => (
                  <Avatar
                    key={member.id}
                    name={member.displayName}
                    accent={member.accentColor}
                    size="sm"
                    className="ring-2 ring-cream-100"
                  />
                ))}
              </div>
              <Link
                href="/app/conta"
                aria-label="Conta e preferências"
                className="grid size-10 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                <Settings aria-hidden className="size-4.5" />
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-5xl gap-8 px-4 pb-8 pt-5 lg:px-6">
          <SideNavigation />
          <main className="min-w-0 flex-1 mb-safe-nav lg:mb-0">{children}</main>
        </div>

        <BottomNavigation />
        <AppRefresh />
        <InstallPrompt />
      </div>
    </ToastProvider>
  );
}
