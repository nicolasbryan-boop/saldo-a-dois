/**
 * ONE-SHOT: cria (ou redefine a senha de) uma conta administrativa.
 *
 *   npm run admin:create -- ainoamesquita@gmail.com            # produção
 *   npm run admin:create -- alguem@exemplo.test --local        # banco local
 *
 * REGRAS DE SEGREDO
 * =================
 * A senha é digitada num prompt oculto e existe apenas na memória deste
 * processo. Ela nunca é:
 *   - passada por argumento  (ficaria no histórico do shell e em `ps`)
 *   - lida de arquivo ou env (ficaria em disco)
 *   - impressa                (ficaria no log do terminal e no CI)
 *
 * O que chega ao banco é só o hash scrypt, gerado pelo mesmo helper que o
 * Better Auth usa no cadastro normal — então a conta criada aqui é
 * indistinguível de uma criada pelo fluxo do produto, e um login comum
 * funciona sobre ela.
 *
 * O hash trafega num arquivo temporário porque passá-lo em `--command` o
 * exporia na lista de processos. O arquivo é apagado em `finally`, inclusive
 * quando o wrangler falha.
 *
 * PRIVILÉGIO
 * ==========
 * Este script NÃO marca `is_admin`. O acesso ao /admin continua vindo de
 * ADMIN_EMAILS, que é a configuração do ambiente — assim revogar um admin é
 * editar uma variável, não caçar uma linha no banco.
 *
 * Nenhuma assinatura, espaço financeiro ou onboarding é criado: /admin não
 * depende de nada disso, e uma conta de operação não deveria aparecer nas
 * métricas de clientes.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as readline from 'node:readline';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from '@better-auth/core/db';

const DB_NAME = 'saldo-a-dois-db';
const MIN_PASSWORD_LENGTH = 8;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Reads a line without echoing it, so the password never hits the screen. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Suppress the echo of everything except the question itself.
    const asAny = rl as unknown as { _writeToOutput: (text: string) => void };
    asAny._writeToOutput = (text: string) => {
      if (text.includes(question)) process.stdout.write(question);
    };

    let answered = false;

    rl.question(question, (answer) => {
      answered = true;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });

    // Without a TTY (a pipe, CI, cron) readline closes without ever calling
    // the callback above. Left alone, the process would exit 0 having done
    // nothing at all — the worst way to fail, because it looks like success.
    rl.on('close', () => {
      if (!answered) {
        reject(new Error('Entrada interativa indisponível. Rode este script num terminal.'));
      }
    });
  });
}

/** Single-quoted SQL literal. Emails and ids only — never the password. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Everything that touches the database, separated from the prompt so it can
 * be exercised by a test without a terminal. The password arrives as an
 * argument here and nowhere else — this function is not the CLI surface.
 */
export async function provisionAdmin(params: {
  email: string;
  password: string;
  local: boolean;
}): Promise<void> {
  const { email, password, local } = params;

  const passwordHash = await hashPassword(password);
  const issuer = createLocalAccountIssuer('credential');
  const now = Date.now();

  // Stable ids so re-running this is an update, not a second account.
  const userId = `usr_admin_${randomBytes(10).toString('hex')}`;
  const accountId = `acc_admin_${randomBytes(10).toString('hex')}`;

  const sql = `
-- Cria a conta se não existir. Um segundo run não duplica nada.
INSERT INTO user (id, name, email, email_verified, must_change_password, is_admin, created_at, updated_at)
SELECT ${sqlString(userId)}, 'Administrador', ${sqlString(email)}, 0, 0, 0, ${now}, ${now}
WHERE NOT EXISTS (SELECT 1 FROM user WHERE lower(email) = ${sqlString(email)});

-- Credencial local, no mesmo formato que o Better Auth grava num cadastro normal.
INSERT INTO account (id, issuer, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT ${sqlString(accountId)}, ${sqlString(issuer)}, u.id, 'credential', u.id, ${sqlString(passwordHash)}, ${now}, ${now}
FROM user u
WHERE lower(u.email) = ${sqlString(email)}
  AND NOT EXISTS (
    SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );

-- Se a conta já existia, isto é uma redefinição de senha.
UPDATE account
SET password = ${sqlString(passwordHash)}, updated_at = ${now}
WHERE provider_id = 'credential'
  AND user_id IN (SELECT id FROM user WHERE lower(email) = ${sqlString(email)});

-- Uma senha recém-escolhida pela própria pessoa não precisa ser trocada.
UPDATE user SET must_change_password = 0, updated_at = ${now}
WHERE lower(email) = ${sqlString(email)};
`;

  // The hash goes through a file rather than --command: an argument would be
  // visible to anything that can list processes.
  const dir = mkdtempSync(join(tmpdir(), 'saldo-admin-'));
  const file = join(dir, 'admin.sql');

  try {
    writeFileSync(file, sql, { encoding: 'utf8' });

    const wranglerArgs = [
      'wrangler',
      'd1',
      'execute',
      DB_NAME,
      local ? '--local' : '--remote',
      `--file=${file}`,
    ];

    const result = spawnSync('npx', wranglerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      console.error(result.stdout ?? '');
      console.error(result.stderr ?? '');
      fail('O wrangler falhou. Nada foi confirmado.');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const email = args.find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail('Uso: npm run admin:create -- <e-mail> [--local]');
  }

  console.log(`\nConta administrativa em ${local ? 'LOCAL' : 'PRODUÇÃO'}`);
  console.log(`E-mail: ${email}`);
  console.log(
    '\nA senha não aparece na tela, não vai para o histórico do shell e não é gravada em disco.',
  );
  console.log('Só o hash chega ao banco.\n');

  const password = await promptHidden('Senha: ');
  const confirmation = await promptHidden('Repita a senha: ');

  if (password !== confirmation) fail('As senhas não conferem. Nada foi alterado.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  await provisionAdmin({ email, password, local });

  console.log(`\n✓ Conta pronta para ${email}.`);
  console.log('\nFalta um passo, fora do código:');
  console.log(`  npx wrangler secret put ADMIN_EMAILS --env production`);
  console.log(`  (valor: ${email} — vários e-mails separados por vírgula)\n`);
  console.log('Depois entre em /entrar e vá para /admin.\n');
}

// Só executa como CLI: importar este módulo num teste não dispara prompt.
if (process.argv[1]?.includes('create-admin')) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
