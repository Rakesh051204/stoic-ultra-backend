/**
 * browserTakeover.server.js
 * ---------------------------------------------------------------
 * Drives a real, visible browser (Comet by default, falls back to
 * system Chromium) with Playwright, streams a live screencast to
 * the frontend over WebSocket, tracks a Manus-style "task progress"
 * step list, and forwards mouse/keyboard input back into the page
 * while the user is in "takeover" mode.
 * ---------------------------------------------------------------
 */

import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import http from 'http';

// ---- Config ------------------------------------------------------

const COMET_PATHS = {
  darwin: '/Applications/Comet.app/Contents/MacOS/Comet',
  win32: 'C:\\Program Files\\Perplexity\\Comet\\Application\\Comet.exe',
  linux: '/opt/Comet/comet',
};

const EXECUTABLE_PATH =
  process.env.COMET_PATH === 'bundled'
    ? undefined
    : process.env.COMET_PATH || COMET_PATHS[process.platform];

const PORT = process.env.TAKEOVER_PORT || 4790;

// ---- Session state -------------------------------------------------

let browser, context, page, cdp;
let mode = 'agent'; // 'agent' | 'takeover'
let taskStatus = 'idle'; // 'idle' | 'running' | 'completed'
let steps = []; // [{ id, label, status: 'pending'|'active'|'done', tool: 'browser'|'editor', detail, filename, content }]
const clients = new Set();

async function ensureBrowser() {
  if (browser) return;

  browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    headless: false,
    args: ['--start-maximized'],
  });
  context = await browser.newContext({ viewport: null });
  page = await context.newPage();
  cdp = await context.newCDPSession(page);

  await startScreencast();

  cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
    broadcast({ type: 'frame', data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      // session may have been torn down by a navigation restart, ignore
    }
  });

  page.on('framenavigated', (f) => {
    if (f !== page.mainFrame()) return;
    broadcast({ type: 'nav', url: f.url() });
    // FIX: cross-origin nav swaps the renderer process and silently kills
    // the active screencast session. Restart it every time the main frame
    // navigates, or the live view goes black after any real navigation.
    restartScreencast();
  });
}

async function startScreencast() {
  try {
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });
  } catch (e) {
    console.warn('startScreencast failed:', e.message);
  }
}

async function restartScreencast() {
  try {
    await cdp.send('Page.stopScreencast');
  } catch {
    // ignore - may already be stopped
  }
  await startScreencast();
}

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function sendState(ws) {
  ws.send(JSON.stringify({ type: 'mode', mode }));
  ws.send(JSON.stringify({ type: 'task-status', status: taskStatus }));
  ws.send(JSON.stringify({ type: 'steps', steps }));
  if (page) ws.send(JSON.stringify({ type: 'nav', url: page.url() }));
}

// ---- Turn typed input into a real destination -------------------------
// Same behavior as a real browser omnibox: looks-like-a-URL -> go there,
// otherwise treat it as a search query.

function resolveNavTarget(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return 'about:blank';

  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ');

  if (hasProtocol) return trimmed;
  if (looksLikeDomain) return `https://${trimmed}`;

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ---- Step / task-progress helpers (Manus-style checklist) -------------

function resetSteps(newSteps) {
  steps = newSteps.map((s) => ({ status: 'pending', tool: 'browser', ...s }));
  broadcast({ type: 'steps', steps });
}

function setTaskStatus(status) {
  taskStatus = status;
  broadcast({ type: 'task-status', status });
}

function updateStep(id, patch) {
  steps = steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
  broadcast({ type: 'steps', steps });
}

function startStep(id) {
  updateStep(id, { status: 'active' });
}

function completeStep(id, detail) {
  updateStep(id, { status: 'done', detail });
}

// ---- Agent-facing API ------------------------------------------------

async function gotoAsAgent(url) {
  await ensureBrowser();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page.url();
}

function getPage() {
  return page;
}

/**
 * Fully automatic: agent decides "this needs a web search", calls this,
 * user does nothing. Drives the real visible browser, shows live progress
 * in the pill/panel, no takeover needed.
 */
async function runWebSearchTask(query) {
  await ensureBrowser();
  setTaskStatus('running');
  resetSteps([
    { id: 'search', label: 'Searching the web', tool: 'browser',
      detail: `Find authoritative sources for "${query}"` },
    { id: 'review', label: 'Reviewing results', tool: 'browser' },
  ]);

  startStep('search');
  const target = resolveNavTarget(query);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  completeStep('search', page.url());

  startStep('review');
  await page.waitForTimeout(600); // let content settle / room for real extraction logic
  completeStep('review');

  setTaskStatus('completed');
}

/**
 * "editor" tool step — streams text into a step like the answer.md
 * pane you already had, so the pill can show "Writing the answer"
 * with live-typed content instead of the browser frame.
 */
async function runAnswerWritingTask(filename, fullText, { chunkSize = 40, delayMs = 30 } = {}) {
  setTaskStatus('running');
  resetSteps([
    { id: 'write', label: 'Writing the findings', tool: 'editor', filename, content: '' },
  ]);
  startStep('write');

  let acc = '';
  for (let i = 0; i < fullText.length; i += chunkSize) {
    acc += fullText.slice(i, i + chunkSize);
    updateStep('write', { content: acc });
    await new Promise((r) => setTimeout(r, delayMs));
  }
  completeStep('write', `${filename} — Modified`);
  setTaskStatus('completed');
}

// ---- Input forwarding (only while mode === 'takeover') ---------------

async function dispatchMouse(evt) {
  if (mode !== 'takeover' || !cdp) return;
  await cdp.send('Input.dispatchMouseEvent', {
    type: evt.eventType,
    x: evt.x,
    y: evt.y,
    button: evt.button || 'left',
    clickCount: evt.clickCount || 1,
    deltaX: evt.deltaX || 0,
    deltaY: evt.deltaY || 0,
  });
}

async function dispatchKey(evt) {
  if (mode !== 'takeover' || !cdp) return;
  await cdp.send('Input.dispatchKeyEvent', {
    type: evt.eventType,
    key: evt.key,
    code: evt.code,
    text: evt.text,
    unmodifiedText: evt.text,
  });
}

// ---- WebSocket server --------------------------------------------------

const server = http.createServer();
const wss = new WebSocketServer({ server, path: '/takeover' });

wss.on('connection', async (ws) => {
  clients.add(ws);
  await ensureBrowser();
  sendState(ws);

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'enter-takeover':
        mode = 'takeover';
        broadcast({ type: 'mode', mode });
        break;
      case 'exit-takeover':
        mode = 'agent';
        broadcast({ type: 'mode', mode });
        break;
      case 'goto': {
        const target = resolveNavTarget(msg.value);
        try {
          await page.goto(target, { waitUntil: 'domcontentloaded' });
        } catch (e) {
          console.warn('goto failed:', e.message);
        }
        break;
      }
      case 'mouse':
        await dispatchMouse(msg);
        break;
      case 'key':
        await dispatchKey(msg);
        break;
    }
  });

  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Takeover screencast server listening on ws://localhost:${PORT}/takeover`);
  console.log(`Browser executable: ${EXECUTABLE_PATH || '(Playwright bundled Chromium)'}`);
});

export { gotoAsAgent, getPage, runWebSearchTask, runAnswerWritingTask };
