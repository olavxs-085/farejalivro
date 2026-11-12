importScripts("stores.js", "engine.js", "indicacoes.js", "config.js");

const E = globalThis.RadarEngine;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- Leitura de HTML (o service worker não tem DOMParser; usa um documento offscreen) ----------
let creating = null;
let docDeSom = false; // o documento atual foi aberto só para tocar o latido
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has && !docDeSom) return;
  if (has && docDeSom) {
    await chrome.offscreen.closeDocument().catch(() => {});
    docDeSom = false;
  }
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

// Toca o latido num documento invisível (o service worker não toca som).
async function latir() {
  try {
    if (await chrome.offscreen.hasDocument?.()) await chrome.offscreen.closeDocument().catch(() => {});
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Tocar o som de latido do aviso de preço" });
    docDeSom = true;
    await chrome.runtime.sendMessage({ target: "offscreen", type: "latir" });
  } catch (_) {}
}

async function parse(html, mode, recipe, url) {
  const msg = { target: "offscreen", type: "parse", html, mode, recipe, url };
  try {
    await ensureOffscreen();
    const r = await chrome.runtime.sendMessage(msg);
    if (r) return r;
  } catch (_) {}
  docDeSom = true; // força abrir de novo um documento de leitura
  await ensureOffscreen();
  return chrome.runtime.sendMessage(msg);
}

// ---------- Rotina diária ----------
let running = null;

async function checkNow(reason) {
  if (running) return running;
  running = (async () => {
    await chrome.storage.local.set({ checking: { since: Date.now(), reason } });
    try {
      const { books } = await E.runCheck(parse, (done, total) => chrome.storage.local.set({ checking: { since: Date.now(), done, total, reason } }));
      await priceAlerts(books);
    } finally {
      await chrome.storage.local.remove("checking");
      running = null;
    }
  })();
  return running;
}

async function priceAlerts(books) {
  const cfg = await globalThis.FarejaConfig.ler();
  const { meta } = await E.getState();
  meta.alerted = meta.alerted || {};
  meta.lastBest = meta.lastBest || {};
  const hoje = E.today();
  let avisou = false;
  for (const b of books) {
    const best = E.currentBest(b);
    if (!best) continue;
    const preco = best.lastPrice;
    const anterior = meta.lastBest[b.id];
    let menorAntes = Infinity;
    for (const it of b.items) for (const p of it.history || []) if (p.d < hoje) menorAntes = Math.min(menorAntes, p.p);
    meta.lastBest[b.id] = preco;

    let aviso = null;
    if (cfg.avisoAlvo && b.target && preco <= b.target) {
      aviso = { tipo: "alvo", title: "Baixou! " + b.title, message: `${brl(preco)} na ${best.storeName}. Seu preço-alvo era ${brl(b.target)}.` };
    } else if (cfg.avisoMinimo && Number.isFinite(menorAntes) && preco < menorAntes) {
      aviso = { tipo: "minimo", title: "Menor preço até hoje: " + b.title, message: `${brl(preco)} na ${best.storeName}. O menor que eu tinha visto era ${brl(menorAntes)}.` };
    } else if (cfg.avisoQueda && anterior && preco <= anterior * (1 - cfg.quedaPct / 100)) {
      const pct = Math.round((1 - preco / anterior) * 100);
      aviso = { tipo: "queda", title: `Caiu ${pct}%: ${b.title}`, message: `De ${brl(anterior)} para ${brl(preco)} na ${best.storeName}.` };
    }
    if (!aviso) continue;
    const key = aviso.tipo + ":" + preco;
    if (meta.alerted[b.id] === key) continue;
    meta.alerted[b.id] = key;
    chrome.notifications.create("preco:" + b.id + ":" + Date.now(), {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: aviso.title,
      message: aviso.message,
      priority: 2,
      silent: !!cfg.latido,
    });
    avisou = true;
  }
  await E.saveMeta(meta);
  if (avisou && cfg.latido) await latir();
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

function diasDesde(dia) {
  if (!dia) return Infinity;
  return Math.round((new Date(E.today() + "T12:00:00") - new Date(dia + "T12:00:00")) / 86400000);
}

async function tick() {
  const { meta, books } = await E.getState();
  const cfg = await globalThis.FarejaConfig.ler();
  const intervalo = cfg.freq === "semana" ? 7 : 1;
  if (books.length && diasDesde(meta.lastCheckDay) >= intervalo) await checkNow(cfg.freq === "semana" ? "semanal" : "diária");
  await monthlyReport();
  await indicacoesTick();
}

// ---------- Indicações: número no ícone e aviso opcional ----------
function juntarPt(lista) {
  return lista.length <= 1 ? lista.join("") : lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
}
async function indicacoesTick() {
  try {
    const I = globalThis.FarejaIndicacoes;
    await I.garantirVistoAte();
    const dados = await I.obter(55);
    const p = await I.prefs();
    const novas = I.novasDesde(dados.itens, p.vistoAte, p.categorias);
    await chrome.action.setBadgeBackgroundColor({ color: "#1b4db0" });
    await chrome.action.setBadgeText({ text: novas.length ? String(Math.min(novas.length, 99)) : "" });
    if (!p.avisar || !novas.length) return;
    const { indAvisadoAte } = await chrome.storage.local.get("indAvisadoAte");
    const recentes = novas.filter((x) => !indAvisadoAte || x.publicada_em > indAvisadoAte);
    if (!recentes.length) return;
    const nome = (id) => (dados.categorias.find((c) => c.id === id) || {}).nome || id;
    const cats = [...new Set(recentes.map((x) => nome(x.categoria)))];
    chrome.notifications.create("indicacoes:" + Date.now(), {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: recentes.length === 1 ? "Indicação nova no FarejaLivro" : recentes.length + " indicações novas no FarejaLivro",
      message: recentes.length === 1 ? `“${recentes[0].titulo}”, em ${cats[0]}` : "Em " + juntarPt(cats),
      priority: 0,
    });
    const maisNova = recentes.map((x) => x.publicada_em).sort().pop();
    await chrome.storage.local.set({ indAvisadoAte: maisNova });
  } catch (_) {
    // Sem internet ou banco fora do ar: tenta de novo na próxima hora.
  }
}

// ---------- Eventos ----------
function setupAlarm() {
  chrome.alarms.create("tick", { delayInMinutes: 1, periodInMinutes: 60 });
}
chrome.runtime.onInstalled.addListener((d) => {
  setupAlarm();
  globalThis.FarejaIndicacoes.garantirVistoAte();
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
  else if (id.startsWith("indicacoes:")) chrome.tabs.create({ url: "app.html#indicacoes" });
  else chrome.tabs.create({ url: "app.html" });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target === "offscreen") return false;
  if (msg.type === "latir") {
    latir().then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "checkNow") {
    checkNow("manual").then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
