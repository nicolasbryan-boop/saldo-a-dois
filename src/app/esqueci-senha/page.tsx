import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Esqueci minha senha' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Vamos recuperar seu acesso"
      subtitle="Informe o e-mail da sua conta e enviamos um link para criar uma nova senha."
      footer={
        <Link href="/entrar" className="link-underline">
          Voltar para o login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
