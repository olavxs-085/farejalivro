// FarejaLivro — motor de busca e checagem de preços.
// Usado pela página do app e pelo service worker (checagem diária).
(function () {
  if (globalThis.RadarEngine) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local
  const monthOf = (d) => d.slice(0, 7);

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  const STOP = new Set(["de", "da", "do", "das", "dos", "o", "a", "os", "as", "e", "em", "no", "na", "um", "uma", "the", "of", "and"]);
  const words = (s) => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));

  function scoreItem(item, title, author) {
    const hay = " " + norm(item.title + " " + item.author + " " + item.text) + " ";
    const tw = words(title);
    const hit = tw.filter((w) => hay.includes(" " + w + " ")).length;
    const titleScore = tw.length ? hit / tw.length : 0;
    let authorMatch = null;
    if (author && author.trim()) {
      const aw = words(author);
      const last = aw[aw.length - 1];
      authorMatch = !!last && hay.includes(" " + last + " ");
    }
    const ebook = /\b(kindle|e ?book|ebook|audiolivro|audiobook)\b/.test(norm(item.title + " " + item.extra));
    let score = titleScore * (authorMatch === null ? 1 : 0.7) + (authorMatch ? 0.3 : 0);
    if (ebook) score -= 0.2;
    return { score, titleScore, authorMatch, ebook };
  }

  function buildSearchUrl(store, title, author) {
    const query = (store.withAuthor && author ? title + " " + author : title).trim();
    return store.searchUrl
      .replace("{q-}", encodeURIComponent(norm(query).replace(/ /g, "-")))
      .replace("{q}", encodeURIComponent(query));
  }

  async function fetchHtml(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(url, { credentials: "include", signal: ctrl.signal, cache: "no-store" });
      const html = await r.text();
      return { ok: r.ok, status: r.status, html, finalUrl: r.url || url };
    } finally {
      clearTimeout(t);
    }
  }

  // Abre a página numa janela minimizada, espera carregar e lê o conteúdo já montado
  async function renderExtract(url, mode, recipe) {
    const win = await chrome.windows.create({ url, state: "minimized", focused: false });
    const tabId = win.tabs[0].id;
    try {
      await new Promise((resolve) => {
        const done = () => {
          chrome.tabs.onUpdated.removeListener(fn);
          clearTimeout(timer);
          resolve();
        };
        const fn = (id, info) => {
          if (id === tabId && info.status === "complete") done();
        };
        const timer = setTimeout(done, 30000);
        chrome.tabs.onUpdated.addListener(fn);
      });
      let last = null;
      for (let i = 0; i < 6; i++) {
        await sleep(i === 0 ? 2000 : 1500);
        await chrome.scripting.executeScript({ target: { tabId }, files: ["extractor.js"] });
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          args: [mode, recipe || null],
          func: (mode, recipe) => {
            const blocked = RadarExtract.looksBlocked(document);
            const data = mode === "search" ? RadarExtract.search(document, recipe, location.href) : RadarExtract.product(document, recipe, location.href);
            return { blocked, data };
          },
        });
        last = res && res.result;
        if (last && !last.blocked && (mode === "search" ? last.data.length : last.data.price)) break;
      }
      return last || { blocked: false, data: mode === "search" ? [] : { price: null } };
    } finally {
      chrome.windows.remove(win.id).catch(() => {});
    }
  }

  // parse(html, mode, recipe, url) => {blocked, data}
  async function readPage(url, mode, recipe, parse, preferRender) {
    if (!preferRender) {
      try {
        const r = await fetchHtml(url);
        if (r.ok) {
          const res = await parse(r.html, mode, recipe, r.finalUrl);
          const good = res && !res.blocked && (mode === "search" ? res.data.length : res.data.price);
          if (good) return { ...res, via: "rápido" };
        }
      } catch (e) {}
    }
    try {
      const res = await renderExtract(url, mode, recipe);
      return { ...res, via: "aba" };
    } catch (e) {
      return { blocked: false, data: mode === "search" ? [] : { price: null }, error: String(e && e.message || e) };
    }
  }

  async function searchStore(store, title, author, parse) {
    const url = buildSearchUrl(store, title, author);
    const res = await readPage(url, "search", store.recipe, parse, store.render);
    const items = (res.data || [])
      .map((it) => ({ ...it, ...scoreItem(it, title, author) }))
      .filter((it) => it.titleScore >= 0.5)
      .sort((a, b) => b.score - a.score || (a.price || 1e9) - (b.price || 1e9));
    let error = null;
    if (res.blocked) error = "A loja pediu verificação (login ou captcha). Abra o site uma vez no Chrome e tente de novo.";
    else if (res.error) error = "Não consegui abrir o site da loja agora. Confira a internet e tente de novo.";
    else if (!res.data || !res.data.length) error = "Não consegui ler os resultados desta loja.";
    else if (!items.length) error = "Nenhum resultado parecido com esse livro.";
    return { storeId: store.id, storeName: store.name, searchUrl: url, ok: !!items.length, items: items.slice(0, 12), error, via: res.via };
  }

  // ---------- Dados ----------
  async function getState() {
    const s = await chrome.storage.local.get(["stores", "books", "meta"]);
    let stores = s.stores;
    if (!stores) {
      stores = globalThis.RADAR_BUILTIN_STORES.map((b) => ({ id: b.id, enabled: true, builtin: true }));
    }
    // junta configurações salvas com as receitas atuais das lojas padrão
    const full = stores
      .map((st) => {
        if (st.builtin) {
          const b = globalThis.RADAR_BUILTIN_STORES.find((x) => x.id === st.id);
          return b ? { ...b, ...st, builtin: true } : null;
        }
        return st;
      })
      .filter(Boolean);
    for (const b of globalThis.RADAR_BUILTIN_STORES) {
      if (!full.find((x) => x.id === b.id)) full.push({ ...b, enabled: true, builtin: true });
    }
    return { stores: full, books: s.books || [], meta: s.meta || {} };
  }

  async function saveStores(stores) {
    const slim = stores.map((st) =>
      st.builtin ? { id: st.id, enabled: st.enabled, builtin: true, status: st.status } : st
    );
    await chrome.storage.local.set({ stores: slim });
  }

  async function saveBooks(books) {
    await chrome.storage.local.set({ books });
  }

  async function saveMeta(meta) {
    await chrome.storage.local.set({ meta });
  }

  function recordPrice(item, price) {
    const d = today();
    item.history = (item.history || []).filter((h) => h.d !== d);
    item.history.push({ d, p: price });
    item.history.sort((a, b) => (a.d < b.d ? -1 : 1));
    // guarda 2 anos de histórico
    if (item.history.length > 730) item.history = item.history.slice(-730);
    item.lastPrice = price;
    item.lastOk = d;
    item.lastError = null;
  }

  function currentBest(book) {
    let best = null;
    for (const it of book.items || []) {
      if (it.lastPrice && (!best || it.lastPrice < best.lastPrice)) best = it;
    }
    return best;
  }

  // Checa todos os livros em todas as lojas
  async function runCheck(parse, onProgress) {
    const state = await getState();
    const { books, stores } = state;
    const storeById = Object.fromEntries(stores.map((s) => [s.id, s]));
    const storeStatus = {};
    let done = 0;
    const total = books.reduce((n, b) => n + (b.items || []).length, 0);

    for (const book of books) {
      // agrupa por loja: uma busca por loja e por livro
      const byStore = {};
      for (const it of book.items || []) (byStore[it.storeId] = byStore[it.storeId] || []).push(it);
      for (const storeId of Object.keys(byStore)) {
        const store = storeById[storeId];
        const items = byStore[storeId];
        if (!store || store.enabled === false) {
          done += items.length;
          continue;
        }
        let found = [];
        try {
          const url = buildSearchUrl(store, book.title, book.author);
          const res = await readPage(url, "search", store.recipe, parse, store.render);
          found = res.data || [];
          if (res.blocked) storeStatus[storeId] = "bloqueada";
        } catch (e) {}
        for (const it of items) {
          const match = found.find((f) => f.key === it.key && f.price);
          let price = match ? match.price : null;
          if (!price) {
            try {
              const res = await readPage(it.url, "product", store.recipe, parse, store.render);
              price = res.data && res.data.price;
              if (res.blocked) storeStatus[storeId] = "bloqueada";
            } catch (e) {}
          }
          if (price) {
            recordPrice(it, price);
            if (!storeStatus[storeId]) storeStatus[storeId] = "ok";
          } else {
            it.lastError = today();
            storeStatus[storeId] = storeStatus[storeId] === "ok" ? "ok" : storeStatus[storeId] || "erro";
          }
          done++;
          onProgress && onProgress(done, total, book, store);
        }
      }
    }
    // salva preços sem atropelar mudanças feitas no app durante a checagem
    const fresh = await getState();
    for (const fb of fresh.books) {
      const b = books.find((x) => x.id === fb.id);
      if (!b) continue;
      for (const fi of fb.items || []) {
        const i = (b.items || []).find((x) => x.key === fi.key && x.storeId === fi.storeId);
        if (i) Object.assign(fi, { history: i.history, lastPrice: i.lastPrice, lastOk: i.lastOk, lastError: i.lastError });
      }
    }
    await saveBooks(fresh.books);
    for (const st of fresh.stores) if (storeStatus[st.id]) st.status = { s: storeStatus[st.id], d: today() };
    await saveStores(fresh.stores);
    fresh.meta.lastCheckDay = today();
    fresh.meta.lastCheckAt = Date.now();
    await saveMeta(fresh.meta);
    return { books: fresh.books, storeStatus };
  }

  // Resumo de um mês para o relatório
  function monthSummary(book, month) {
    const rows = [];
    for (const it of book.items || []) {
      const h = (it.history || []).filter((x) => monthOf(x.d) === month);
      const before = (it.history || []).filter((x) => monthOf(x.d) < month);
      if (!h.length) {
        rows.push({ item: it, empty: true });
        continue;
      }
      const ps = h.map((x) => x.p);
      const start = before.length ? before[before.length - 1].p : h[0].p;
      const end = h[h.length - 1].p;
      const min = Math.min(...ps);
      const max = Math.max(...ps);
      rows.push({
        item: it,
        history: h,
        start,
        end,
        min,
        minDay: h.find((x) => x.p === min).d,
        max,
        change: end - start,
        changePct: start ? ((end - start) / start) * 100 : 0,
      });
    }
    return rows;
  }

  globalThis.RadarEngine = {
    today,
    monthOf,
    norm,
    scoreItem,
    buildSearchUrl,
    searchStore,
    readPage,
    getState,
    saveStores,
    saveBooks,
    saveMeta,
    runCheck,
    currentBest,
    monthSummary,
    recordPrice,
  };
})();
