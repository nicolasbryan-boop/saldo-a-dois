/**
 * ONE-SHOT: cria (ou redefine a senha de) uma conta administrativa.
 *
 *   npm run admin:create -- ainoamesquita@gmail.com          # produção
 *   npm run admin:create -- alguem@exemplo.test --local      # ambiente local
 *
 * COMO A SENHA VIAJA
 * ==================
 * A senha é digitada num prompt oculto e sai deste processo por um único
 * caminho: o corpo de um POST HTTPS para /api/auth/sign-up/email, que é o
 * cadastro normal do Better Auth. Quem faz o hash é o servidor, com o helper
 * do próprio Better Auth — então nem a senha nem o hash chegam a existir como
 * argumento de processo, arquivo ou linha de log.
 *
 * POR QUE NÃO `--file`
 * ====================
 * `wrangler d1 execute --file` sobe por /d1/database/:id/import, que exige um
 * API Token; o login OAuth normal do wrangler devolve "Authentication error
 * [code: 10000]" ali. As consultas deste script usam `--command`, que passa
 * por /query e funciona com a autenticação OAuth de sempre.
 *
 * O que vai em `--command` é apenas o e-mail — nunca senha, nunca hash.
 *
 * PRIVILÉGIO
 * ==========
 * Este script não escreve `is_admin`. Não precisa: o campo é declarado com
 * `input: false` no Better Auth, então o cadastro sempre grava 0 e nenhum
 * cliente consegue se promover. O acesso ao /admin continua vindo de
 * ADMIN_EMAILS, que é configuração de ambiente — revogar um admin é editar uma
 * variável, não caçar uma linha no banco.
 *
 * O cadastro não cria espaço financeiro nem assinatura (não há databaseHooks
 * no Better Auth deste projeto), então uma conta de operação não aparece nas
 * métricas de clientes e não passa a valer como cliente pagante.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import * as readline from 'node:readline';

const DB_NAME = 'saldo-a-dois-db';
const PRODUCTION_URL = 'https://saldo-a-dois.ainoamesquita.workers.dev';
const LOCAL_URL = 'http://localhost:8788';
const MIN_PASSWORD_LENGTH = 8;

const WRANGLER = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');

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

/**
 * Runs one statement against D1 and returns the rows.
 *
 * Spawned as `node wrangler.js` rather than `npx`, with no shell: on Windows
 * `npx` is a .cmd, which modern Node refuses to spawn without one, and a shell
 * would reintroduce quoting and injection questions for no benefit.
 */
function query(sql: string, local: boolean): Array<Record<string, unknown>> {
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER,
      'd1',
      'execute',
      DB_NAME,
      local ? '--local' : '--remote',
      '--json',
      `--command=${sql}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(result.stderr ?? '');
    fail('A consulta ao D1 falhou. Nada foi alterado.');
  }

  try {
    const parsed = JSON.parse(result.stdout) as Array<{
      results?: Array<Record<string, unknown>>;
    }>;
    return parsed[0]?.results ?? [];
  } catch {
    fail('Não consegui interpretar a resposta do D1.');
  }
}

/** Single-quoted SQL literal. Only e-mails go through here. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface AccountState {
  exists: boolean;
  households: number;
  subscriptions: number;
}

function inspect(email: string, local: boolean): AccountState {
  const rows = query(
    `SELECT
       (SELECT COUNT(*) FROM user WHERE lower(email) = ${sqlString(email)}) AS users,
       (SELECT COUNT(*) FROM household_members m JOIN user u ON u.id = m.user_id
         WHERE lower(u.email) = ${sqlString(email)}) AS households,
       (SELECT COUNT(*) FROM subscriptions s JOIN user u ON u.id = s.owner_user_id
         WHERE lower(u.email) = ${sqlString(email)}) AS subs;`,
    local,
  );

  const row = rows[0] ?? {};
  return {
    exists: Number(row.users ?? 0) > 0,
    households: Number(row.households ?? 0),
    subscriptions: Number(row.subs ?? 0),
  };
}

/**
 * Creates the account through the product's own sign-up endpoint.
 *
 * This is the whole reason the password never needs to be hashed here: it goes
 * over TLS and Better Auth does the rest, exactly as it would for a customer.
 */
async function signUp(params: {
  appUrl: string;
  email: string;
  password: string;
}): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${params.appUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Better Auth checks this against trustedOrigins.
        Origin: params.appUrl,
      },
      body: JSON.stringify({
        name: 'Administrador',
        email: params.email,
        password: params.password,
      }),
    });
  } catch {
    fail(`Não consegui falar com ${params.appUrl}. O app está no ar?`);
  }

  if (response.ok) return;

  // The body may echo the submitted values, so only the status and a known
  // error code are ever surfaced.
  let code = '';
  try {
    const body = (await response.json()) as { code?: string };
    code = typeof body.code === 'string' ? body.code : '';
  } catch {
    code = '';
  }

  if (response.status === 403) {
    fail(
      `O app recusou a origem ${params.appUrl}. Confira BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL.`,
    );
  }

  fail(`O cadastro falhou (HTTP ${response.status}${code ? `, ${code}` : ''}).`);
}

/**
 * Everything except the prompt, so a test can drive it without a terminal.
 *
 * The password is a parameter here and nowhere else: this is not the CLI
 * surface, and nothing in this function writes it to disk, argv or a log.
 */
export async function provisionAdmin(params: {
  email: string;
  password: string;
  local: boolean;
  appUrl: string;
  /** Already-collected state, so the CLI can warn before asking for a password. */
  before?: AccountState;
}): Promise<AccountState & { isAdmin: number }> {
  const { email, password, local, appUrl } = params;
  const before = params.before ?? inspect(email, local);

  if (before.exists && (before.households > 0 || before.subscriptions > 0)) {
    fail(
      `${email} já é cliente (${before.households} espaço(s), ${before.subscriptions} assinatura(s)).\n` +
        '  Use "esqueci minha senha" no app. Nada foi alterado.',
    );
  }

  if (before.exists) {
    // Only reached for an account with no financial data, checked just above.
    // Better Auth refuses to sign up an e-mail that already exists, so a reset
    // means clearing the rows first.
    query(
      `DELETE FROM session WHERE user_id IN (SELECT id FROM user WHERE lower(email) = ${sqlString(email)});`,
      local,
    );
    query(
      `DELETE FROM account WHERE user_id IN (SELECT id FROM user WHERE lower(email) = ${sqlString(email)});`,
      local,
    );
    query(`DELETE FROM user WHERE lower(email) = ${sqlString(email)};`, local);
  }

  await signUp({ appUrl, email, password });

  const after = inspect(email, local);
  if (!after.exists) fail('O cadastro respondeu OK mas a conta não apareceu no banco.');

  const check = query(
    `SELECT is_admin FROM user WHERE lower(email) = ${sqlString(email)};`,
    local,
  );

  return { ...after, isAdmin: Number(check[0]?.is_admin ?? 0) };
}

export function resolveAppUrl(local: boolean, override?: string): string {
  return (override ?? (local ? LOCAL_URL : PRODUCTION_URL)).replace(/\/+$/, '');
}

export { inspect };

async function main() {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const appFlag = args.find((arg) => arg.startsWith('--app='))?.slice('--app='.length);
  const email = args.find((arg) => !arg.startsWith('--'))?.trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail('Uso: npm run admin:create -- <e-mail> [--local] [--app=<url>]');
  }

  const appUrl = resolveAppUrl(local, appFlag);

  console.log(`\nConta administrativa em ${local ? 'LOCAL' : 'PRODUÇÃO'}`);
  console.log(`E-mail: ${email}`);
  console.log(`App:    ${appUrl}`);

  // Checked before asking for a password, so a refusal costs nothing.
  const before = inspect(email, local);

  if (before.exists && before.households === 0 && before.subscriptions === 0) {
    console.log('\nA conta já existe e não tem espaço nem assinatura: a senha será redefinida.');
  }

  console.log(
    '\nA senha não aparece na tela, não vai para o histórico do shell e não é gravada em disco.',
  );
  console.log('Ela viaja só no corpo do POST HTTPS de cadastro; quem faz o hash é o app.\n');

  const password = await promptHidden('Senha: ');
  const confirmation = await promptHidden('Repita a senha: ');

  if (password !== confirmation) fail('As senhas não conferem. Nada foi alterado.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const result = await provisionAdmin({ email, password, local, appUrl, before });

  console.log(`\n✓ Conta pronta para ${email}.`);
  console.log(`  is_admin: ${result.isAdmin} (o privilégio vem de ADMIN_EMAILS)`);
  console.log(`  espaços: ${result.households} · assinaturas: ${result.subscriptions}`);
  console.log(`\nEntre em ${appUrl}/entrar e vá para /admin.\n`);
}

// Só executa como CLI: importar este módulo num teste não dispara prompt.
if (process.argv[1]?.includes('create-admin')) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
