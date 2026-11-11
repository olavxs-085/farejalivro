// FarejaLivro — leitura de preços em páginas de lojas.
// Roda em 3 lugares: na página do app, no documento offscreen e injetado em abas.
(function () {
  if (globalThis.RadarExtract) return;

  const PRICE_RE = /R\$\s*([\d.]+(?:,\d{1,2})?)/;
  const INSTALLMENT_RE = /\d+\s*x\s*(de\s*)?R\$/i;
  // classes que indicam preço antigo/riscado (comparadas palavra por palavra, para não pegar "font-bold")
  const OLD_TOKEN = /^(.*[-_])?(old|orig|original|antigo|riscado|strike|strikethrough|was|before|previous|line-through|listprice)([-_].*)?$|valororiginal|precode|pricefrom|price-from|list-price|preco-de|price-old|old-price/i;
  const hasOldClass = (s) => String(s || "").split(/\s+/).some((t) => t && OLD_TOKEN.test(t));

  function clean(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(text) {
    if (text == null) return null;
    if (typeof text === "number") return text > 0 ? Math.round(text * 100) / 100 : null;
    const t = String(text).replace(/ /g, " ");
    let m = t.match(PRICE_RE);
    let raw = m ? m[1] : null;
    if (!raw) {
      const m2 = t.trim().match(/^([\d.]+,\d{2})$|^(\d+(?:\.\d{1,2})?)$/);
      if (!m2) return null;
      raw = m2[1] || m2[2];
      if (m2[2]) {
        const v = parseFloat(m2[2]);
        return v > 0 ? v : null;
      }
    }
    const v = parseFloat(raw.replace(/\./g, "").replace(",", "."));
    return v > 0 && v < 100000 ? Math.round(v * 100) / 100 : null;
  }

  function absUrl(href, base) {
    try {
      return new URL(href, base).href;
    } catch (e) {
      return null;
    }
  }

  function isStruck(el) {
    let p = el;
    for (let i = 0; i < 3 && p; i++) {
      if (/^(S|DEL|STRIKE)$/.test(p.tagName)) return true;
      const cls = (p.className && (p.className.baseVal ?? p.className)) || "";
      if (hasOldClass(cls) || /orig|antig|old/i.test(p.id || "")) return true;
      if (p.getAttribute && p.getAttribute("data-a-strike") === "true") return true;
      const view = p.ownerDocument && p.ownerDocument.defaultView;
      if (view && view.getComputedStyle) {
        try {
          if (/line-through/.test(view.getComputedStyle(p).textDecorationLine || "")) return true;
        } catch (e) {}
      }
      p = p.parentElement;
    }
    return false;
  }

  function isInstallment(el) {
    const ctx = clean((el.parentElement || el).textContent).slice(0, 80);
    return INSTALLMENT_RE.test(ctx) && !/à vista|a vista|pix/i.test(ctx);
  }

  // Menores elementos que contêm um preço completo (funciona com preço quebrado em vários spans)
  function priceElements(root) {
    const out = [];
    const all = root.querySelectorAll("span,strong,b,p,div,ins,em,small,dd,td,label,a,h2,h3,h4");
    for (const el of all) {
      const txt = el.textContent;
      if (!txt || txt.length > 60 || !PRICE_RE.test(txt.replace(/ /g, " "))) continue;
      let childHas = false;
      for (const c of el.children) {
        if (PRICE_RE.test((c.textContent || "").replace(/ /g, " "))) {
          childHas = true;
          break;
        }
      }
      if (!childHas) out.push(el);
    }
    return out;
  }

  function bestPriceIn(container, selector, allowHeuristic = true) {
    if (selector) {
      let els = [];
      try {
        els = container.querySelectorAll(selector);
      } catch (e) {}
      for (const el of els) {
        if (isStruck(el) || isInstallment(el)) continue;
        const v = parsePrice(el.getAttribute("content") || el.textContent);
        if (v) return v;
      }
    }
    if (!allowHeuristic) return null;
    const vals = [];
    for (const el of priceElements(container)) {
      if (isStruck(el) || isInstallment(el)) continue;
      const v = parsePrice(el.textContent);
      if (v) vals.push(v);
    }
    return vals.length ? Math.min(...vals) : null;
  }

  function q(el, sel) {
    if (!sel) return null;
    try {
      return el.querySelector(sel);
    } catch (e) {
      return null;
    }
  }

  function textOf(el, sel) {
    const t = q(el, sel);
    return t ? clean(t.getAttribute("title") || t.textContent) : "";
  }

  function itemKey(url, recipe) {
    if (!url) return null;
    const asin = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (asin) return "asin:" + asin[1].toUpperCase();
    const mlb = url.match(/MLB-?(\d{6,})/i);
    if (mlb) return "mlb:" + mlb[1];
    try {
      const u = new URL(url);
      return (u.host.replace(/^www\./, "") + u.pathname).toLowerCase().replace(/\/$/, "");
    } catch (e) {
      return url;
    }
  }

  function pickLink(card, recipe, base, title) {
    let a = q(card, recipe && recipe.link);
    if (!a) {
      const anchors = [...card.querySelectorAll("a[href]")].filter((x) => {
        const h = x.getAttribute("href") || "";
        return h && !h.startsWith("#") && !/^javascript:/i.test(h);
      });
      const t = clean(title).toLowerCase();
      a =
        anchors.find((x) => t && clean(x.getAttribute("title") || x.getAttribute("aria-label") || x.textContent).toLowerCase().includes(t)) ||
        anchors.find((x) => x.querySelector("img")) ||
        anchors.sort((x, y) => clean(y.textContent).length - clean(x.textContent).length)[0];
      if (!a && card.tagName === "A") a = card;
      if (!a && card.closest) a = card.closest("a[href]");
    }
    return a ? absUrl(a.getAttribute("href"), base) : null;
  }

  function pickImg(card, recipe, base) {
    const img = q(card, recipe && recipe.img) || card.querySelector("img");
    if (!img) return null;
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy") || "";
    if (!src || src.startsWith("data:")) {
      const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
      const first = ss.split(",")[0].trim().split(" ")[0];
      return first ? absUrl(first, base) : null;
    }
    return absUrl(src, base);
  }

  function pickTitle(card, recipe) {
    let t = textOf(card, recipe && recipe.title);
    if (t) return t;
    const h = card.querySelector("h1,h2,h3,h4,[class*='title' i],[class*='name' i],[class*='nome' i],[class*='titulo' i]");
    if (h && clean(h.textContent).length > 1) return clean(h.textContent);
    let best = "";
    for (const a of card.querySelectorAll("a")) {
      const s = clean(a.getAttribute("title") || a.textContent);
      if (s.length > best.length && !PRICE_RE.test(s)) best = s;
    }
    if (best) return best;
    const img = card.querySelector("img[alt]");
    return img ? clean(img.getAttribute("alt")) : "";
  }

  function buildItem(card, recipe, base) {
    const title = pickTitle(card, recipe).slice(0, 160);
    const url = pickLink(card, recipe, base, title);
    const price = bestPriceIn(card, recipe && recipe.price);
    if (!url || !title) return null;
    let key = itemKey(url, recipe);
    const asin = card.getAttribute && card.getAttribute("data-asin");
    if (asin) key = "asin:" + asin.toUpperCase();
    return {
      title,
      author: textOf(card, recipe && recipe.author).replace(/^(AUTOR\(A\):|por)\s*/i, "").slice(0, 120),
      extra: textOf(card, recipe && recipe.extra).slice(0, 120),
      price,
      url,
      img: pickImg(card, recipe, base),
      key,
      text: clean(card.textContent).slice(0, 600),
    };
  }

  function genericCards(doc) {
    const root = doc.querySelector("main") || doc.body;
    if (!root) return [];
    const cards = new Set();
    for (const pe of priceElements(root)) {
      if (pe.closest("header,nav,footer")) continue;
      let c = pe;
      for (let i = 0; i < 9 && c && c !== root; i++) {
        if (c.querySelector && c.querySelector("img") && (c.tagName === "A" || c.querySelector("a[href]"))) break;
        c = c.parentElement;
      }
      if (!c || c === root || c === doc.body) continue;
      if (clean(c.textContent).length > 1500) continue;
      cards.add(c);
    }
    // mantém só os cartões mais internos
    const list = [...cards];
    return list.filter((c) => !list.some((o) => o !== c && c.contains(o)));
  }

  function search(doc, recipe, base) {
    base = base || (doc.location && doc.location.href) || "";
    let cards = [];
    if (recipe && recipe.card) {
      try {
        cards = [...doc.querySelectorAll(recipe.card)];
      } catch (e) {}
    }
    let usedGeneric = false;
    if (!cards.length) {
      cards = genericCards(doc);
      usedGeneric = true;
    }
    const seen = new Set();
    const items = [];
    for (const c of cards) {
      const it = buildItem(c, usedGeneric ? null : recipe, base);
      if (!it || seen.has(it.key)) continue;
      seen.add(it.key);
      items.push(it);
      if (items.length >= 40) break;
    }
    return items;
  }

  function jsonLdPrice(doc) {
    const prices = [];
    const visit = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(visit);
      const type = [].concat(o["@type"] || []).join(",");
      if (/Offer/i.test(type)) {
        const p = parsePrice(o.lowPrice ?? o.price);
        const avail = String(o.availability || "");
        if (p && !/OutOfStock|Discontinued|SoldOut/i.test(avail)) prices.push(p);
      }
      for (const k of Object.keys(o)) if (typeof o[k] === "object") visit(o[k]);
    };
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        visit(JSON.parse(s.textContent));
      } catch (e) {}
    }
    return prices.length ? Math.min(...prices) : null;
  }

  function product(doc, recipe, url) {
    const title = clean((q(doc, "#productTitle") || q(doc, "h1") || {}).textContent || doc.title || "").slice(0, 160);
    if (recipe && recipe.productPrice) {
      const v = bestPriceIn(doc, recipe.productPrice, false);
      if (v) return { price: v, title, how: "loja" };
    }
    const ld = jsonLdPrice(doc);
    if (ld) return { price: ld, title, how: "dados" };
    const meta = doc.querySelector('meta[property="product:price:amount"],meta[property="og:price:amount"],meta[itemprop="price"],[itemprop="price"]');
    if (meta) {
      const p = parsePrice(meta.getAttribute("content") || meta.textContent);
      if (p) return { price: p, title, how: "meta" };
    }
    // Último recurso: o preço que aparece com maior destaque na página
    const root = doc.querySelector("main") || doc.body;
    if (!root) return { price: null, title };
    const view = doc.defaultView;
    let best = null;
    for (const el of priceElements(root)) {
      if (el.closest("header,nav,footer,aside")) continue;
      if (isStruck(el) || isInstallment(el)) continue;
      const p = parsePrice(el.textContent);
      if (!p) continue;
      let size = 0;
      if (view && view.getComputedStyle) {
        try {
          size = parseFloat(view.getComputedStyle(el).fontSize) || 0;
        } catch (e) {}
      }
      if (!best || size > best.size) best = { p, size };
      if (!view) break; // sem estilos: fica com o primeiro
    }
    return { price: best ? best.p : null, title, how: "destaque" };
  }

  function looksBlocked(doc) {
    const t = clean((doc.body && doc.body.innerText) || (doc.body && doc.body.textContent) || "").slice(0, 3000).toLowerCase();
    const title = (doc.title || "").toLowerCase();
    return (
      /captcha|robot|robô|não é possível acessar|access denied|acesso negado/.test(title + " " + t.slice(0, 600)) ||
      /para continuar, acesse|account-verification|verifique que você é humano|are you a human/.test(t)
    );
  }

  globalThis.RadarExtract = { search, product, parsePrice, itemKey, looksBlocked };
})();
