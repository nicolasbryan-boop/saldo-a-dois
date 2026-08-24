/**
 * Browser sweep: visits every page with a real session and reports console
 * errors, page exceptions, failed requests and hydration mismatches.
 *
 * Node 24 ships a global WebSocket, so this drives headless Chrome over the
 * DevTools Protocol with no dependencies.
 *
 *   node scripts/browser-check.mjs <baseUrl> [sessionCookieValue]
 *
 * The cookie comes from a normal sign-in, e.g.
 *   curl -s -c jar -X POST -H 'Content-Type: application/json' \
 *     -d '{"email":"ana@exemplo.com","password":"demo123456"}' \
 *     "$BASE/api/auth/sign-in/email"
 *
 * Without a cookie the authenticated routes redirect to the sign-in page,
 * which is still a useful check of the public surface.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] ?? 'http://localhost:8788';
const COOKIE = process.argv[3] ?? '';
const PORT = 9444;

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const chromePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!chromePath) {
  console.error('Nenhum navegador encontrado para a verificação.');
  process.exit(1);
}

const ROUTES = [
  '/',
  '/privacidade',
  '/termos',
  '/entrar',
  '/esqueci-senha',
  '/checkout',
  '/offline',
  '/app',
  '/app/chat',
  '/app/movimentos',
  '/app/planejamento',
  '/app/casal',
  '/app/relatorio',
  '/app/conta',
  '/admin',
];

/** Noise that says nothing about this application's correctness. */
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /DevTools failed to load source map/i,
  /net::ERR_INTERNET_DISCONNECTED/i,
];

const profile = path.join(os.tmpdir(), `sad-browser-check-${Date.now()}`);
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

class Session {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) {
        this.events.push(message);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws?.close();
  }
}

async function waitForDevTools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await sleep(500);
  }
  throw new Error('Chrome DevTools não respondeu');
}

/**
 * Resolves once no request has been in flight for a quiet period, or after the
 * timeout regardless. Waiting for quiet beats guessing a duration: closing the
 * tab mid-request cancels it, and a cancelled request looks like a failure.
 */
async function waitForNetworkIdle(session, { quietMs = 900, timeoutMs = 15000 } = {}) {
  const started = Date.now();
  let lastSeen = -1;

  while (Date.now() - started < timeoutMs) {
    const inFlight = new Set();

    for (const event of session.events) {
      if (event.method === 'Network.requestWillBeSent') {
        inFlight.add(event.params.requestId);
      }
      if (
        event.method === 'Network.loadingFinished' ||
        event.method === 'Network.loadingFailed'
      ) {
        inFlight.delete(event.params.requestId);
      }
    }

    const total = session.events.length;
    if (inFlight.size === 0 && total === lastSeen && total > 0) return;
    lastSeen = total;

    await sleep(quietMs);
  }
}

/**
 * A failed RSC prefetch of a DIFFERENT page than the one under test.
 *
 * Next prefetches the links on a page; this sweep moves to the next route as
 * soon as the current one settles, which cancels those in-flight prefetches.
 * Chrome surfaces the cancellation as a failed resource attributed to the
 * prefetched URL — a page that was never being checked.
 *
 * Verified as a harness artefact, not a defect: requesting those exact URLs
 * with curl returns 307 -> 200 every time, and a focused probe that lets the
 * page settle records zero responses >= 400, with and without the service
 * worker. A failure on the route actually being visited is still reported.
 */
function isCancelledPrefetch(url, route) {
  if (!url || !url.includes('_rsc')) return false;
  try {
    return new URL(url).pathname !== route;
  } catch {
    return false;
  }
}

function isNoise(text) {
  return IGNORED.some((pattern) => pattern.test(text));
}

async function visit(route) {
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());

  const session = new Session(created.webSocketDebuggerUrl);
  await session.connect();

  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');
  await session.send('Network.enable');

  if (COOKIE) {
    await session.send('Network.setCookie', {
      name: 'better-auth.session_token',
      value: COOKIE,
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: true,
      secure: BASE.startsWith('https://'),
    });
  }

  await session.send('Page.navigate', { url: `${BASE}${route}` });
  await waitForNetworkIdle(session);

  const problems = [];
  const requestUrls = new Map();

  for (const event of session.events) {
    if (event.method === 'Network.requestWillBeSent') {
      requestUrls.set(event.params.requestId, event.params.request.url);
    }
  }

  for (const event of session.events) {
    if (event.method === 'Runtime.exceptionThrown') {
      const detail = event.params.exceptionDetails;
      const text = detail.exception?.description ?? detail.text ?? 'exceção';
      if (!isNoise(text)) problems.push(`exceção: ${text.split('\n')[0]}`);
    }

    if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
      const text = event.params.args
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ');
      if (text && !isNoise(text)) problems.push(`console.error: ${text.slice(0, 160)}`);
    }

    if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
      const entry = event.params.entry;
      const text = entry.text ?? '';
      const where = entry.url ? ` <- ${entry.url}` : '';
      if (!isNoise(text) && !isCancelledPrefetch(entry.url, route)) {
        problems.push(`log: ${text.slice(0, 120)}${where}`);
      }
    }

    if (event.method === 'Network.loadingFailed') {
      const text = event.params.errorText ?? '';
      const url = requestUrls.get(event.params.requestId) ?? '(desconhecida)';
      const aborted =
        text === 'net::ERR_ABORTED' &&
        (url.includes('_rsc=') || url.includes('/api/analytics'));
      if (!isNoise(text) && !aborted && !isCancelledPrefetch(url, route)) {
        problems.push(`requisição falhou: ${text} ${url}`);
      }
    }
  }

  // Broken images are invisible in a screenshot review; check them explicitly.
  const images = await session.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      broken: Array.from(document.images)
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.currentSrc || img.src),
      status: document.readyState,
      title: document.title,
    })`,
    returnByValue: true,
  });

  const info = JSON.parse(images.result.value);
  for (const src of info.broken) problems.push(`imagem quebrada: ${src}`);

  session.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`);

  return { route, title: info.title, problems };
}

let failures = 0;

try {
  await waitForDevTools();

  for (const route of ROUTES) {
    const result = await visit(route);
    if (result.problems.length === 0) {
      console.log(`  OK    ${route.padEnd(20)} ${result.title}`);
    } else {
      failures += result.problems.length;
      console.log(`  FALHA ${route}`);
      for (const problem of result.problems) console.log(`        ${problem}`);
    }
  }
} finally {
  chrome.kill();
  await sleep(1500);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows can keep the profile locked briefly; it lives in the temp dir.
  }
}

console.log('');
console.log(
  failures === 0
    ? 'Nenhum erro de console, exceção, requisição falha ou imagem quebrada.'
    : `${failures} problema(s) encontrados.`,
);

process.exit(failures === 0 ? 0 : 1);
