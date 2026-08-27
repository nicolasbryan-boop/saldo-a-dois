import type { Metadata } from 'next';
import { LegalPage, LegalSection, LegalList } from '@/components/marketing/legal-page';
import { branding } from '@/config';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: `Como o ${branding.name} trata os dados financeiros do casal.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="23 de agosto de 2026">
      <LegalSection title="Em uma frase">
        <p>
          O {branding.name} guarda os lançamentos financeiros que vocês digitam, usa isso
          para calcular quanto ainda dá para gastar, e não compartilha esses dados com
          nenhum outro usuário ou empresa.
        </p>
      </LegalSection>

      <LegalSection title="Quais dados coletamos">
        <p>Somente o necessário para o produto funcionar:</p>
        <LegalList
          items={[
            'Dados de conta: nome, e-mail e uma senha armazenada apenas como hash criptográfico.',
            'Dados do espaço financeiro: nome do espaço, dia de início do ciclo, moeda e quem faz parte.',
            'Lançamentos financeiros: valores, categorias, descrições, datas e quem registrou.',
            'Contas recorrentes, receitas recorrentes e metas cadastradas por vocês.',
            'Mensagens enviadas ao assistente e a ação que resultou delas.',
            'Eventos de produto sem conteúdo financeiro (por exemplo: "onboarding concluído").',
            'Dados técnicos mínimos de sessão, como data de acesso e identificador de sessão.',
          ]}
        />
      </LegalSection>

      <LegalSection title="O que NÃO coletamos">
        <LegalList
          items={[
            'Não conectamos a sua conta bancária e não temos acesso ao seu extrato.',
            'Não pedimos, guardamos ou processamos dados de cartão de crédito — isso fica com o meio de pagamento.',
            'Não movimentamos dinheiro, não fazemos Pix e não fazemos transferências.',
            'Não vendemos dados e não usamos seus lançamentos para publicidade.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Medição de anúncios">
        <p>
          Nas páginas públicas — a inicial, o checkout, o login e estas páginas
          legais — usamos o Meta Pixel para saber quantas pessoas chegaram aqui
          por um anúncio. Ele registra a visita à página, não o que você faz com
          o seu dinheiro.
        </p>
        <LegalList
          items={[
            'O pixel NÃO roda depois que você entra na sua conta: nada dentro do aplicativo é enviado para a Meta.',
            'Nenhum lançamento, saldo, meta ou mensagem do assistente sai daqui para fins de publicidade.',
            'Bloqueadores de rastreamento impedem o pixel sem quebrar nada do produto.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Como usamos">
        <p>
          Os seus lançamentos servem exclusivamente para calcular e mostrar os números do
          seu espaço: saldo, compromissos, reserva, dinheiro livre, limite diário e
          relatórios. Não usamos os dados de um casal para gerar qualquer coisa exibida a
          outro casal.
        </p>
      </LegalSection>

      <LegalSection title="Inteligência artificial">
        <p>
          Quando o assistente não consegue interpretar uma frase com as regras locais, o
          texto que você escreveu pode ser enviado a um provedor de modelo de linguagem
          apenas para ser transformado em uma ação estruturada — por exemplo, transformar
          “gastei 120 no mercado” em um lançamento de despesa.
        </p>
        <p>
          Nesse envio não vão saldos, histórico, nomes das pessoas do casal nem qualquer
          identificador da sua conta. E o modelo nunca calcula valores: todos os números
          são calculados pelo nosso servidor, com os seus lançamentos.
        </p>
      </LegalSection>

      <LegalSection title="Compartilhamento entre o casal">
        <p>
          Um espaço financeiro é compartilhado por até duas pessoas. As duas enxergam os
          mesmos lançamentos, inclusive quem registrou cada um. Isso é o funcionamento
          esperado do produto: se você não quer que a outra pessoa veja um lançamento, ele
          não deve ser registrado aqui.
        </p>
      </LegalSection>

      <LegalSection title="Operadores">
        <p>
          Usamos a Cloudflare para hospedagem, banco de dados e execução do assistente, e
          um provedor de pagamentos para processar a assinatura. Esses fornecedores tratam
          dados apenas para prestar esses serviços.
        </p>
      </LegalSection>

      <LegalSection title="Segurança">
        <LegalList
          items={[
            'Senhas são armazenadas apenas como hash; ninguém na equipe consegue lê-las.',
            'A sessão usa cookie assinado, HttpOnly e seguro em produção.',
            'Toda leitura e escrita valida no servidor se você pertence àquele espaço financeiro.',
            'Nossos registros técnicos não guardam senhas, tokens nem o conteúdo integral dos seus lançamentos.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Retenção e exclusão">
        <p>
          Os dados ficam guardados enquanto a conta existir. Você pode excluir sua conta a
          qualquer momento em Conta → Excluir minha conta. Se você criou o espaço
          financeiro, a exclusão apaga também o espaço e todo o histórico das duas pessoas.
          Se você é parceiro, sua conta é apagada e você sai do espaço, mas o histórico do
          casal permanece com quem criou.
        </p>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>
          Você pode pedir acesso, correção ou exclusão dos seus dados escrevendo para{' '}
          <a href={`mailto:${branding.supportEmail}`} className="link-underline">
            {branding.supportEmail}
          </a>
          . Responderemos em prazo razoável.
        </p>
      </LegalSection>

      <LegalSection title="Alterações">
        <p>
          Se esta política mudar de forma relevante, avisaremos dentro do aplicativo antes
          da mudança entrar em vigor.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
