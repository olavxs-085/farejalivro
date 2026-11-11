importScripts("stores.js", "engine.js");

const E = globalThis.RadarEngine;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- Leitura de HTML (o service worker não tem DOMParser; usa um documento offscreen) ----------
let creating = null;
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({ url: "offscreen.html", reasons: ["DOM_PARSER"], justification: "Ler os preços das páginas das lojas" })
      .catch((e) => {
        if (!/single offscreen|already/i.test(String(e))) throw e;
      })
      .finally(() => (creating = null));
  }
  await creating;
}

async function parse(html, mode, recipe, url) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", type: "parse", html, mode, recipe, url });
}

// ---------- Rotina diária ----------
let running = null;

async function checkNow(reason) {
  if (running) return running;
  running = (async () => {
    await chrome.storage.local.set({ checking: { since: Date.now(), reason } });
    try {
      const { books } = await E.runCheck(parse, (done, total) => chrome.storage.local.set({ checking: { since: Date.now(), done, total, reason } }));
      await targetAlerts(books);
    } finally {
      await chrome.storage.local.remove("checking");
      running = null;
    }
  })();
  return running;
}

async function targetAlerts(books) {
  const { meta } = await E.getState();
  meta.alerted = meta.alerted || {};
  for (const b of books) {
    if (!b.target) continue;
    const best = E.currentBest(b);
    if (!best || best.lastPrice > b.target) continue;
    const key = b.id + ":" + best.lastPrice;
    if (meta.alerted[b.id] === key) continue;
    meta.alerted[b.id] = key;
    chrome.notifications.create("alvo:" + b.id, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Baixou! " + b.title,
      message: `${brl(best.lastPrice)} na ${best.storeName}. Seu preço-alvo era ${brl(b.target)}.`,
      priority: 2,
    });
  }
  await E.saveMeta(meta);
}

function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("sv-SE").slice(0, 7);
}

async function monthlyReport() {
  const { books, meta } = await E.getState();
  const prev = previousMonth();
  if (meta.lastReportMonth === prev) return;
  const hasData = books.some((b) => (b.items || []).some((i) => (i.history || []).some((h) => h.d.startsWith(prev))));
  if (!hasData) return;
  meta.lastReportMonth = prev;
  await E.saveMeta(meta);
  const [y, m] = prev.split("-");
  chrome.notifications.create("relatorio:" + prev, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Seu relatório de preços chegou",
    message: `Veja como os preços dos seus livros variaram em ${MONTHS[+m - 1]} de ${y}.`,
    priority: 2,
  });
}

async function tick() {
  const { meta, books } = await E.getState();
  if (books.length && meta.lastCheckDay !== E.today()) await checkNow("diária");
  await monthlyReport();
}

// ---------- Eventos ----------
function setupAlarm() {
  chrome.alarms.create("tick", { delayInMinutes: 1, periodInMinutes: 60 });
}
chrome.runtime.onInstalled.addListener((d) => {
  setupAlarm();
  if (d.reason === "install") chrome.tabs.create({ url: "app.html" });
});
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tick") return tick();
});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("app.html");
  const [tab] = await chrome.tabs.query({ url });
  if (tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else chrome.tabs.create({ url });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("relatorio:")) chrome.tabs.create({ url: "report.html?m=" + id.split(":")[1] });
  else chrome.tabs.create({ url: "app.html" });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === "offscreen") return false;
  if (msg.type === "checkNow") {
    checkNow("manual").then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
