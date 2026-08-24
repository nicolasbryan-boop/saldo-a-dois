import type { Metadata } from 'next';
import { LegalPage, LegalSection, LegalList } from '@/components/marketing/legal-page';
import { branding, planList, pricing } from '@/config';
import { formatBRL } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: `Condições de uso do ${branding.name}.`,
};

/** One line per plan, so the terms always match the catalogue. */
const PLAN_LINES = planList.map(
  (plan) =>
    `Plano ${plan.name}: ${formatBRL(plan.priceCents)} por ${plan.intervalLabel}, cobrado de forma recorrente.`,
);

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="23 de agosto de 2026">
      <LegalSection title="O que é este serviço">
        <p>
          O {branding.name} é uma ferramenta de organização financeira para casais. Ele
          registra o que vocês informam e calcula quanto do dinheiro está comprometido e
          quanto está livre.
        </p>
        <p>
          <strong>O que ele não é:</strong> não é banco, não é instituição financeira, não
          é corretora e não é consultoria de investimentos. Ele não movimenta dinheiro, não
          faz Pix, não faz transferências e não promete retorno financeiro de nenhum tipo.
        </p>
      </LegalSection>

      <LegalSection title="Os números vêm de vocês">
        <p>
          Todos os valores exibidos são calculados a partir dos lançamentos que vocês
          informam. O que aparece como “saldo atual” é o saldo registrado no{' '}
          {branding.name} — não é o saldo da sua conta bancária, que pode ser diferente.
        </p>
        <p>
          Projeções como “se vocês gastarem X, ficam com Y” são aritmética sobre esses
          dados, não recomendação financeira profissional.
        </p>
      </LegalSection>

      <LegalSection title="Conta e acesso">
        <LegalList
          items={[
            'Você precisa ter pelo menos 18 anos para assinar.',
            'Cada pessoa usa o próprio e-mail e a própria senha; você é responsável por mantê-la em sigilo.',
            'Um espaço financeiro comporta no máximo duas pessoas ativas.',
            'Quem cria o espaço é responsável pela assinatura e por quem tem acesso a ele.',
            'Se a senha temporária de um parceiro for criada, ela deixa de valer assim que ele definir a própria senha.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Assinatura, cobrança e cancelamento">
        <LegalList
          items={[
            `Todos os planos cobrem as ${pricing.maxMembers} pessoas do casal e dão acesso ao mesmo produto — muda apenas a periodicidade da cobrança.`,
            ...PLAN_LINES,
            'A cobrança é recorrente e processada pelo meio de pagamento contratado.',
            'Você pode cancelar quando quiser, dentro do aplicativo, sem multa e sem fidelidade.',
            'Ao cancelar, o acesso continua até o fim do período já pago.',
            'Se um pagamento falhar, avisamos e o acesso pode ser suspenso até a regularização. Os dados não são apagados por isso.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Uso aceitável">
        <p>Ao usar o serviço, você concorda em não:</p>
        <LegalList
          items={[
            'Tentar acessar dados de outro casal ou contornar os controles de acesso.',
            'Automatizar acessos de forma a prejudicar o funcionamento do serviço.',
            'Usar o serviço para qualquer atividade ilegal.',
            'Compartilhar a conta com pessoas fora do seu espaço financeiro.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Disponibilidade">
        <p>
          Fazemos o possível para manter o serviço disponível, mas ele é oferecido “como
          está”. Podem ocorrer interrupções para manutenção ou por falhas de fornecedores.
        </p>
      </LegalSection>

      <LegalSection title="Limitação de responsabilidade">
        <p>
          As decisões financeiras são de vocês. O {branding.name} organiza informações que
          vocês mesmos informaram, e não se responsabiliza por prejuízos decorrentes de
          decisões tomadas com base nesses números, nem por dados incorretos que tenham
          sido registrados.
        </p>
      </LegalSection>

      <LegalSection title="Encerramento">
        <p>
          Você pode encerrar sua conta quando quiser. Podemos encerrar uma conta que viole
          estes termos, com aviso prévio sempre que possível.
        </p>
      </LegalSection>

      <LegalSection title="Contato">
        <p>
          Dúvidas sobre estes termos:{' '}
          <a href={`mailto:${branding.supportEmail}`} className="link-underline">
            {branding.supportEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
