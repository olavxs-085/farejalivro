const E = RadarEngine;
const $ = (s) => document.querySelector(s);
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmtDay = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "");
const SVGNS = "http://www.w3.org/2000/svg";

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}

// No app, a leitura do HTML é feita aqui mesmo
async function parse(html, mode, recipe, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return {
    blocked: RadarExtract.looksBlocked(doc),
    data: mode === "search" ? RadarExtract.search(doc, recipe, url) : RadarExtract.product(doc, recipe, url),
  };
}

const safeImg = (src, cls) => {
  const i = h("img", { class: cls, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  const fallback = () => {
    i.onerror = null;
    i.src = "icons/logo-mark.png";
    i.classList.add("ph");
  };
  i.onerror = fallback;
  if (src && /^https?:/.test(src)) i.src = src;
  else fallback();
  return i;
};

// ---------- Abas (controle segmentado) ----------
const tabs = [...document.querySelectorAll('.segmented [role="tab"]')];
function moveThumb() {
  const sel = tabs.find((t) => t.getAttribute("aria-selected") === "true");
  const thumb = $(".segmented .thumb");
  if (!sel || !thumb) return;
  thumb.style.width = sel.offsetWidth + "px";
  thumb.style.transform = `translateX(${sel.offsetLeft}px)`;
}
function selectTab(id) {
  for (const t of tabs) {
    const on = t.id === id;
    t.setAttribute("aria-selected", on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).classList.toggle("active", on);
  }
  moveThumb();
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => selectTab(t.id));
  t.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(n.id);
    n.focus();
  });
});
window.addEventListener("resize", moveThumb);
const edge = document.getElementById("edge");
const onScroll = () => edge.classList.toggle("on", scrollY > 300);
window.addEventListener("scroll", onScroll, { passive: true });

// ---------- Status ----------
async function renderStatus() {
  const { meta } = await E.getState();
  const { checking } = await chrome.storage.local.get("checking");
  const st = $("#status");
  st.textContent = "";
  if (checking) {
    const pct = checking.total ? Math.round((checking.done / checking.total) * 100) : 5;
    st.append(h("span", { class: "spin", style: "color:var(--brand)" }), "Conferindo preços", h("span", { class: "progress" }, h("i", { style: `width:${pct}%` })));
    $("#btnCheck").disabled = true;
  } else {
    $("#btnCheck").disabled = false;
    if (meta.lastCheckAt) {
      st.append(
        h("span", { class: "dot", style: "color:var(--down)" }),
        "Conferido " + new Date(meta.lastCheckAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às")
      );
    } else st.append("Nenhuma checagem ainda");
  }
}

// ---------- Busca ----------
let searchState = null;

$("#formSearch").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const title = $("#fTitle").value.trim();
  const author = $("#fAuthor").value.trim();
  const target = parseFloat($("#fTarget").value) || null;
  if (!title) return;
  const { stores } = await E.getState();
  const active = stores.filter((s) => s.enabled !== false);
  searchState = { title, author, target, stores: {}, selected: new Map() };
  updateCount();
  $("#btnSearch").disabled = true;
  const card = $("#resultsCard");
  card.hidden = false;
  $("#resultsTitle").textContent = `Resultados para “${title}”`;
  const box = $("#results");
  box.textContent = "";
  card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  if (!active.length) {
    box.append(h("p", { class: "msg err" }, "Nenhuma loja ligada. Ligue pelo menos uma na aba Lojas."));
    $("#btnSearch").disabled = false;
    return;
  }
  for (const st of active) {
    box.append(
      h("div", { class: "store-block", id: "sb-" + st.id },
        h("div", { class: "store-head" }, h("strong", {}, st.name), h("span", { class: "pill" }, h("span", { class: "spin" }), "farejando…"))
      )
    );
  }
  await Promise.all(
    active.map(async (st) => {
      const res = await E.searchStore(st, title, author, parse);
      searchState.stores[st.id] = res;
      renderStoreResults(st, res);
    })
  );
  $("#btnSearch").disabled = false;
});

$("#btnCloseResults").addEventListener("click", closeResults);
function closeResults() {
  $("#resultsCard").hidden = true;
  $("#results").textContent = "";
  searchState = null;
  updateCount();
}

function renderStoreResults(store, res) {
  const block = $("#sb-" + store.id);
  if (!block) return;
  block.textContent = "";
  const head = h("div", { class: "store-head" }, h("strong", {}, store.name));
  if (res.ok) head.append(h("span", { class: "pill ok" }, res.items.length + (res.items.length === 1 ? " resultado" : " resultados")));
  else head.append(h("span", { class: "pill err" }, res.error || "Sem resultados"), h("a", { href: res.searchUrl, target: "_blank" }, "abrir a busca na loja"));
  block.append(head);
  if (!res.ok) return;

  const top = res.items[0];
  const autoPick = top && top.titleScore === 1 && top.authorMatch !== false && !top.ebook && top.price;
  const shown = res.items.slice(0, 5);
  const more = res.items.slice(5);
  const list = h("div", {});
  const addRow = (it, i) => {
    const id = store.id + "|" + it.key;
    const row = h("div", { class: "result" });
    const cb = h("input", { type: "checkbox", "aria-label": "Monitorar " + it.title + " na " + store.name });
    const toggle = (on) => {
      cb.checked = on;
      row.classList.toggle("sel", on);
      if (on) searchState.selected.set(id, { store, it });
      else searchState.selected.delete(id);
      updateCount();
    };
    row.addEventListener("click", (e) => {
      if (e.target.tagName === "A") return;
      toggle(e.target === cb ? cb.checked : !cb.checked);
    });
    const meta = [it.author, it.extra].filter(Boolean).join(" · ");
    row.append(
      cb,
      safeImg(it.img, "thumb-img"),
      h("div", {}, h("div", { class: "t" }, it.title, it.ebook ? h("span", { class: "tag" }, "digital") : null), meta ? h("div", { class: "m" }, meta) : null),
      h("div", { class: "p" }, it.price ? h("b", {}, brl(it.price)) : h("span", { class: "muted" }, "sem preço"), h("a", { href: it.url, target: "_blank" }, "ver na loja"))
    );
    list.append(row);
    if (i === 0 && autoPick) toggle(true);
  };
  shown.forEach(addRow);
  block.append(list);
  if (more.length) {
    const btn = h("button", { class: "btn quiet", type: "button" }, `ver mais ${more.length}`);
    btn.onclick = () => {
      more.forEach((it) => addRow(it, -1));
      btn.remove();
    };
    block.append(btn);
  }
}

function updateCount() {
  const n = searchState ? searchState.selected.size : 0;
  $("#selCount").textContent = n ? `${n} ${n === 1 ? "item marcado" : "itens marcados"}` : "Nada marcado";
  $("#btnSave").disabled = !n;
  $("#selbar").classList.toggle("show", n > 0);
}

$("#btnSave").addEventListener("click", saveSelection);
async function saveSelection() {
  if (!searchState || !searchState.selected.size) return;
  const { books } = await E.getState();
  const { title, author, target } = searchState;
  let book = books.find((b) => E.norm(b.title) === E.norm(title) && E.norm(b.author) === E.norm(author));
  if (!book) {
    book = { id: "b" + Date.now(), title, author, target, createdAt: E.today(), items: [] };
    books.unshift(book);
  } else if (target) book.target = target;
  for (const { store, it } of searchState.selected.values()) {
    if (book.items.some((x) => x.storeId === store.id && x.key === it.key)) continue;
    const item = { storeId: store.id, storeName: store.name, key: it.key, url: it.url, title: it.title, img: it.img, extra: it.extra || "", history: [] };
    if (it.price) E.recordPrice(item, it.price);
    book.items.push(item);
  }
  await E.saveBooks(books);
  closeResults();
  $("#formSearch").reset();
  selectTab("tab-books");
  await renderBooks();
  const el = document.querySelector(`[data-book="${book.id}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- Meus livros ----------
function sparkline(book) {
  // menor preço do dia entre as lojas, últimos 30 dias
  const byDay = {};
  for (const it of book.items) for (const p of it.history || []) byDay[p.d] = Math.min(byDay[p.d] ?? Infinity, p.p);
  const days = Object.keys(byDay).sort().slice(-30);
  if (days.length < 2) return null;
  const vals = days.map((d) => byDay[d]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const W = 120, H = 32;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (W - 4) + 2, max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6)]);
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");
  const down = vals[vals.length - 1] <= vals[0];
  const color = down ? "var(--down)" : "var(--up)";
  const path = document.createElementNS(SVGNS, "polyline");
  path.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
  path.setAttribute("fill", "none");
  path.style.stroke = color;
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  const end = document.createElementNS(SVGNS, "circle");
  end.setAttribute("cx", pts[pts.length - 1][0]);
  end.setAttribute("cy", pts[pts.length - 1][1]);
  end.setAttribute("r", "3");
  end.style.fill = color;
  svg.append(path, end);
  return svg;
}

async function renderBooks() {
  const { books, stores } = await E.getState();
  const box = $("#books");
  box.textContent = "";
  const count = $("#countBooks");
  count.hidden = !books.length;
  count.textContent = books.length;
  moveThumb();
  if (!books.length) {
    box.append(
      h("div", { class: "empty" },
        h("img", { src: "icons/logo-mark.png", alt: "" }),
        h("b", {}, "Nenhum livro ainda"),
        "Digite o nome de um livro lá em cima e clique em Farejar."
      )
    );
    return;
  }
  const storeName = Object.fromEntries(stores.map((s) => [s.id, s.name]));
  for (const b of books) {
    const best = E.currentBest(b);
    const img = (b.items.find((i) => i.img) || {}).img;
    const table = h("table", { class: "items" });
    const sorted = [...b.items].sort((x, y) => (x.lastPrice || 1e9) - (y.lastPrice || 1e9));
    for (const it of sorted) {
      const failing = it.lastError && (!it.lastOk || it.lastError > it.lastOk);
      table.append(
        h("tr", { class: best && it === best ? "best" : null },
          h("td", { class: "store" }, storeName[it.storeId] || it.storeName),
          h("td", { class: "muted" }, it.title.length > 56 ? it.title.slice(0, 54) + "…" : it.title),
          h("td", {}, failing ? h("span", { class: "pill err" }, "não li em " + fmtDay(it.lastError)) : it.lastOk ? h("span", { class: "muted" }, "conferido " + fmtDay(it.lastOk)) : ""),
          h("td", { class: "price" }, h("a", { href: it.url, target: "_blank" }, brl(it.lastPrice))),
          h("td", { class: "x" }, h("button", { class: "btn quiet danger", title: "Parar de monitorar nesta loja", "aria-label": "Parar de monitorar na " + (storeName[it.storeId] || it.storeName), onclick: () => removeItem(b.id, it) }, "✕"))
        )
      );
    }
    const hit = best && b.target && best.lastPrice <= b.target;
    box.append(
      h("article", { class: "book", "data-book": b.id },
        safeImg(img, "cover"),
        h("div", {},
          h("div", { class: "book-top" },
            h("div", {},
              h("h3", {}, b.title),
              b.author ? h("div", { class: "by" }, b.author) : null,
              h("div", { style: "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap" },
                b.target ? h("span", { class: "pill" + (hit ? " down" : "") }, hit ? "chegou no alvo de " + brl(b.target) : "alvo " + brl(b.target)) : null
              )
            ),
            h("div", { class: "bestbox" },
              h("div", { class: "v" }, best ? brl(best.lastPrice) : "—"),
              h("div", { class: "l" }, best ? "mais barato agora · " + (storeName[best.storeId] || best.storeName) : "ainda sem preço"),
              sparkline(b)
            )
          ),
          table,
          h("div", { class: "book-actions" },
            h("button", { class: "btn quiet", onclick: () => prefill(b) }, "+ procurar em mais lojas"),
            h("button", { class: "btn quiet danger", onclick: () => removeBook(b) }, "remover livro")
          )
        )
      )
    );
  }
}

function prefill(b) {
  $("#fTitle").value = b.title;
  $("#fAuthor").value = b.author || "";
  $("#fTarget").value = b.target || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#fTitle").focus({ preventScroll: true });
}

async function removeItem(bookId, it) {
  const { books } = await E.getState();
  const b = books.find((x) => x.id === bookId);
  if (!b) return;
  b.items = b.items.filter((x) => !(x.storeId === it.storeId && x.key === it.key));
  await E.saveBooks(books);
  renderBooks();
}

async function removeBook(b) {
  if (!confirm(`Parar de monitorar "${b.title}"? O histórico de preços dele será apagado.`)) return;
  const { books } = await E.getState();
  await E.saveBooks(books.filter((x) => x.id !== b.id));
  renderBooks();
}

// ---------- Lojas ----------
async function renderStores() {
  const { stores } = await E.getState();
  const t = $("#stores");
  t.textContent = "";
  for (const st of stores) {
    const sw = h("label", { class: "switch" },
      h("input", { type: "checkbox", role: "switch", "aria-label": "Procurar na " + st.name, checked: st.enabled !== false, onchange: (e) => toggleStore(st.id, e.target.checked) }),
      h("span", {})
    );
    let status = "";
    if (st.status && st.status.s === "bloqueada") status = h("span", { class: "pill err" }, "pediu verificação em " + fmtDay(st.status.d));
    else if (st.status && st.status.s === "erro") status = h("span", { class: "pill err" }, "falhou em " + fmtDay(st.status.d));
    else if (st.status && st.status.s === "ok") status = h("span", { class: "pill ok" }, h("span", { class: "dot" }), "funcionando · " + fmtDay(st.status.d));
    let host = "";
    try {
      host = new URL(st.searchUrl).host.replace(/^www\./, "");
    } catch (e) {}
    t.append(
      h("tr", {},
        h("td", { style: "width:66px" }, sw),
        h("td", {}, h("b", {}, st.name), h("div", { class: "muted", style: "font-size:12.5px" }, host)),
        h("td", {}, status),
        h("td", { style: "text-align:right" }, st.builtin ? h("span", { class: "muted", style: "font-size:12.5px" }, "padrão") : h("button", { class: "btn quiet danger", onclick: () => removeStore(st) }, "remover"))
      )
    );
  }
}

async function toggleStore(id, on) {
  const { stores } = await E.getState();
  const st = stores.find((s) => s.id === id);
  if (st) st.enabled = on;
  await E.saveStores(stores);
}

async function removeStore(st) {
  if (!confirm(`Remover a loja ${st.name}? Os livros acompanhados nela deixam de ser conferidos.`)) return;
  const { stores } = await E.getState();
  await E.saveStores(stores.filter((s) => s.id !== st.id));
  renderStores();
}

$("#formStore").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const msg = $("#storeMsg");
  msg.className = "msg";
  const name = $("#sName").value.trim();
  const raw = $("#sUrl").value.trim();
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    msg.className = "msg err";
    msg.textContent = "Esse endereço não parece um link. Copie direto da barra do Chrome.";
    return;
  }
  const full = url.href;
  const idx = full.toLowerCase().lastIndexOf("livro");
  if (idx < 0) {
    msg.className = "msg err";
    msg.textContent = 'Não achei a palavra "livro" no link. Pesquise exatamente a palavra livro no site e copie o endereço da página de resultados.';
    return;
  }
  const template = full.slice(0, idx) + "{q}" + full.slice(idx + 5);
  // o pedido de permissão precisa acontecer logo no clique
  chrome.permissions.request({ origins: [url.origin + "/*"] }).then(async (granted) => {
    if (!granted) {
      msg.className = "msg err";
      msg.textContent = "Sem a permissão a extensão não consegue ler os preços desse site.";
      return;
    }
    msg.textContent = "Testando a loja…";
    const store = { id: "c" + Date.now(), name, searchUrl: template, withAuthor: false, recipe: null, enabled: true, builtin: false };
    const res = await E.searchStore(store, "livro", "", parse);
    const { stores } = await E.getState();
    stores.push(store);
    await E.saveStores(stores);
    $("#formStore").reset();
    renderStores();
    if (res.ok) {
      msg.className = "msg ok";
      msg.textContent = `${name} adicionada. No teste encontrei ${res.items.length} produtos com preço.`;
    } else {
      msg.className = "msg err";
      msg.textContent = `${name} foi adicionada, mas no teste não consegui ler os preços (${res.error}). Pode ser que esse site não funcione bem com a extensão.`;
    }
  });
});

// ---------- Apoio ----------
const PIX_CODE = "00020126600014br.gov.bcb.pix0114+55479892156450220Pressione_o_artista!5204000053039865802BR5919LUCAS_ALVES_DE_LIMA6014JARAGUA_DO_SUL62150511FarejaLivro63040F90";
$("#btnPix").addEventListener("click", async () => {
  const b = $("#btnPix");
  try {
    await navigator.clipboard.writeText(PIX_CODE);
    b.textContent = "Copiado! Cole no app do banco";
  } catch (e) {
    b.textContent = "Não consegui copiar. Use o QR code";
  }
  b.classList.add("copied");
  setTimeout(() => {
    b.textContent = "Copiar Pix copia e cola";
    b.classList.remove("copied");
  }, 2600);
});

// ---------- Botões do topo ----------
$("#btnCheck").addEventListener("click", async () => {
  $("#btnCheck").disabled = true;
  await chrome.runtime.sendMessage({ type: "checkNow" });
  renderAll();
});
$("#btnReport").addEventListener("click", () => {
  chrome.tabs.create({ url: "report.html?m=" + E.today().slice(0, 7) });
});

chrome.storage.onChanged.addListener((ch) => {
  if (ch.checking || ch.meta) renderStatus();
  if (ch.books) renderBooks();
  if (ch.stores) renderStores();
});

function renderAll() {
  renderStatus();
  renderBooks();
  renderStores();
}
renderAll();
requestAnimationFrame(moveThumb);
