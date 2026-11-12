// FarejaLivro — aba Indicações (usa h, $, prefill e selectTab do app.js).
(() => {
  const I = globalThis.FarejaIndicacoes;
  const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const CORES = {
    terror: ["#26272f", "#ece4d4"], romance: ["#a8344a", "#fff4f2"], romantasia: ["#55287f", "#f3e9ff"],
    fantasia: ["#1d5a46", "#e6f5ee"], ficcao: ["#0d3a5a", "#dcefff"], suspense: ["#3a3a3a", "#f4f4f4"],
    classicos: ["#75582c", "#fbf3e4"], naoficcao: ["#b45f17", "#fff8ef"], ya: ["#1f6f8b", "#e6f7fd"],
    hq: ["#8c1d2f", "#fff0f0"], poesia: ["#4b5d2a", "#f2f7e6"],
  };

  const st = { cats: [], itens: [], sel: [], vistoAntes: null, offline: false, carregado: false, carregando: false, q: "" };
  const nomeCat = (id) => (st.cats.find((c) => c.id === id) || {}).nome || id;

  function capa(item, cls) {
    const [bg, ink] = CORES[item.categoria] || ["#1b4db0", "#eaf1ff"];
    const box = h("div", { class: "ind-cover " + (cls || ""), "aria-hidden": "true" });
    box.style.background = bg;
    box.style.color = ink;
    const txt = () => { box.textContent = item.titulo || ""; };
    if (item.capa_url && /^https:\/\//i.test(item.capa_url)) {
      const img = h("img", { src: item.capa_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.onerror = () => { img.remove(); txt(); };
      box.append(img);
    } else txt();
    return box;
  }

  function monitorar(item) {
    selectTab("tab-books");
    prefill({ title: item.titulo, author: item.autor, target: "" });
    $("#formSearch").requestSubmit();
  }

  const ehNova = (x) => st.vistoAntes && x.publicada_em && x.publicada_em > st.vistoAntes;

  // ---------- Categorias ----------
  function desenharCategorias() {
    const line = $("#catLine");
    line.textContent = "";
    line.append(h("span", { class: "catline-label" }, "Categorias:"));
    if (!st.sel.length) line.append(h("span", { class: "muted" }, "todas"));
    for (const id of st.sel) {
      line.append(
        h("span", { class: "cat" }, nomeCat(id),
          h("button", { type: "button", class: "catx", "aria-label": "Remover " + nomeCat(id), onclick: () => remover(id) },
            svgX()))
      );
    }
    const sel = $("#iCat");
    const atual = sel.value;
    sel.textContent = "";
    sel.append(h("option", { value: "" }, "Escolha uma categoria"));
    for (const c of st.cats) sel.append(h("option", { value: c.id }, c.nome));
    sel.value = atual;
  }
  function svgX() {
    const s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2.6"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("aria-hidden", "true");
    for (const d of ["M6 6l12 12", "M18 6L6 18"]) { const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); s.append(p); }
    return s;
  }

  async function adicionar(id) {
    if (!st.sel.includes(id)) st.sel.push(id);
    await I.salvarCategorias(st.sel);
    $("#catSearch").value = ""; st.q = "";
    fecharDrop(); desenharCategorias(); desenharListas();
    $("#catSearch").focus();
  }
  async function remover(id) {
    st.sel = st.sel.filter((x) => x !== id);
    await I.salvarCategorias(st.sel);
    desenharCategorias(); desenharListas();
  }

  const opcoes = () => st.cats.filter((c) => !st.sel.includes(c.id) && fold(c.nome).includes(fold(st.q)));
  function abrirDrop() {
    const drop = $("#catDrop");
    drop.textContent = "";
    const ops = opcoes();
    if (!ops.length) drop.append(h("div", { class: "catempty" }, st.cats.length ? "Nenhuma categoria encontrada" : "Carregando categorias…"));
    for (const c of ops) {
      drop.append(h("button", { type: "button", role: "option", class: "catopt", onmousedown: (e) => { e.preventDefault(); adicionar(c.id); } }, c.nome));
    }
    drop.hidden = false;
    $("#catSearch").setAttribute("aria-expanded", "true");
  }
  function fecharDrop() { $("#catDrop").hidden = true; $("#catSearch").setAttribute("aria-expanded", "false"); }

  $("#catSearch").addEventListener("focus", abrirDrop);
  $("#catSearch").addEventListener("input", (e) => { st.q = e.target.value; abrirDrop(); });
  $("#catSearch").addEventListener("blur", () => setTimeout(fecharDrop, 120));
  $("#catSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); const o = opcoes()[0]; if (o) adicionar(o.id); }
    else if (e.key === "Escape") fecharDrop();
    else if (e.key === "ArrowDown") { e.preventDefault(); const b = $("#catDrop .catopt"); if (b) b.focus(); }
  });
  $("#catDrop").addEventListener("keydown", (e) => {
    const bs = [...$("#catDrop").querySelectorAll(".catopt")]; const i = bs.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? bs[i - 1] : $("#catSearch")).focus(); }
    if (e.key === "Enter" && i >= 0) { e.preventDefault(); bs[i].dispatchEvent(new MouseEvent("mousedown")); }
    if (e.key === "Escape") { fecharDrop(); $("#catSearch").focus(); }
  });
  $("#catDrop").addEventListener("focusout", (e) => { if (!$(".catsearch").contains(e.relatedTarget)) fecharDrop(); });

  // ---------- Listas ----------
  function desenharListas() {
    const filtro = (x) => !st.sel.length || st.sel.includes(x.categoria);
    const equipe = st.itens.filter((x) => x.tipo === "equipe" && filtro(x));
    const leitores = st.itens.filter((x) => x.tipo === "leitor" && filtro(x));

    const team = $("#indTeam");
    team.textContent = "";
    if (!st.carregado) team.append(h("p", { class: "muted" }, "Carregando indicações…"));
    else if (!equipe.length) team.append(h("p", { class: "muted" }, st.sel.length ? "A equipe ainda não indicou livros nessas categorias." : "A equipe ainda não publicou indicações."));
    for (const x of equipe) {
      team.append(
        h("article", { class: "ind-card" },
          capa(x, "big"),
          h("div", { class: "ind-body" },
            h("div", { class: "ind-tags" }, h("span", { class: "pill" }, nomeCat(x.categoria)), ehNova(x) ? h("span", { class: "pill new" }, "Nova") : null),
            h("h3", {}, x.titulo),
            h("div", { class: "by" }, x.autor),
            x.texto ? h("p", { class: "ind-text" }, x.texto) : null,
            x.mais_leitores ? h("div", { class: "muted small" }, "+" + x.mais_leitores + (x.mais_leitores > 1 ? " leitores também indicaram" : " leitor também indicou")) : null,
            h("div", { class: "ind-actions" },
              x.link_afiliado ? h("a", { class: "btn ml", href: x.link_afiliado, target: "_blank", rel: "noopener noreferrer sponsored" }, "Comprar no Mercado Livre") : null,
              h("button", { class: "btn soft", type: "button", onclick: () => monitorar(x) }, "Monitorar preço")
            ),
            x.link_afiliado ? h("div", { class: "muted small" }, "Link de afiliado · você não paga a mais") : null
          )
        )
      );
    }

    const rd = $("#indReaders");
    rd.textContent = "";
    if (!st.carregado) rd.append(h("p", { class: "muted" }, "Carregando…"));
    else if (!leitores.length) rd.append(h("p", { class: "muted" }, st.sel.length ? "Nenhum leitor indicou livros nessas categorias ainda. Que tal ser o primeiro?" : "Nenhuma indicação de leitor ainda. Que tal ser o primeiro?"));
    for (const x of leitores) {
      rd.append(
        h("article", { class: "ind-row" },
          capa(x, "small"),
          h("div", { class: "ind-body" },
            h("div", { class: "ind-top" }, h("h3", {}, x.titulo), h("span", { class: "by" }, x.autor), h("span", { class: "pill" }, nomeCat(x.categoria)), ehNova(x) ? h("span", { class: "pill new" }, "Nova") : null),
            x.texto ? h("p", { class: "ind-text" }, "“" + x.texto + "”") : null,
            h("div", { class: "muted small" }, (x.indicado_por ? "Indicado por " + x.indicado_por : "Indicação anônima") + (x.mais_leitores ? " · +" + x.mais_leitores + (x.mais_leitores > 1 ? " leitores também indicaram" : " leitor também indicou") : ""))
          ),
          h("button", { class: "btn soft", type: "button", onclick: () => monitorar(x) }, "Monitorar preço")
        )
      );
    }

    const pill = $("#indStatus");
    pill.hidden = !st.offline;
    pill.textContent = st.offline ? "Sem conexão: mostrando a última lista" : "";
  }

  // ---------- Carregar ----------
  async function carregar(forcar) {
    if (st.carregando) return;
    st.carregando = true;
    try {
      const p = await I.prefs();
      st.sel = p.categorias;
      $("#indAvisar").checked = p.avisar;
      if (st.vistoAntes === null) st.vistoAntes = p.vistoAte || "";
      const cache = await I.lerCache();
      if (cache && !st.carregado) { st.cats = cache.categorias; st.itens = cache.itens; st.carregado = true; desenharCategorias(); desenharListas(); }
      const dados = await I.obter(forcar ? 0 : 5);
      st.cats = dados.categorias; st.itens = dados.itens; st.offline = dados.offline; st.carregado = true;
    } catch (_) {
      st.offline = true; st.carregado = true;
    } finally {
      st.carregando = false;
      desenharCategorias(); desenharListas(); contarNovas();
    }
  }

  async function contarNovas() {
    const p = await I.prefs();
    const n = I.novasDesde(st.itens, p.vistoAte, p.categorias).length;
    const c = $("#countInd");
    c.textContent = n; c.hidden = n === 0;
  }

  async function aoAbrirAba() {
    await carregar(true);
    await I.marcarVistas();
    $("#countInd").hidden = true;
    try { await chrome.action.setBadgeText({ text: "" }); } catch (_) {}
  }

  $("#tab-ind").addEventListener("click", aoAbrirAba);
  $("#indAvisar").addEventListener("change", (e) => I.salvarAvisar(e.target.checked));

  // ---------- Indicar um livro ----------
  const modal = $("#indModal");
  let antesDoModal = null;
  function abrirModal() {
    antesDoModal = document.activeElement;
    $("#formIndicar").reset(); $("#iCount").textContent = "0"; $("#iMsg").textContent = "";
    $("#formIndicar").hidden = false; $("#indDone").hidden = true;
    desenharCategorias();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(() => $("#iTitulo").focus(), 30);
  }
  function fecharModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (antesDoModal) antesDoModal.focus();
  }
  $("#btnIndicar").addEventListener("click", abrirModal);
  $("#btnIndCancelar").addEventListener("click", fecharModal);
  $("#btnIndFechar").addEventListener("click", fecharModal);
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) fecharModal(); });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); fecharModal(); }
    if (e.key === "Tab") {
      const f = [...modal.querySelectorAll("button, input, select, textarea")].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  $("#iTexto").addEventListener("input", (e) => { $("#iCount").textContent = e.target.value.length; });

  $("#formIndicar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#iMsg"); msg.textContent = "";
    const b = $("#btnIndEnviar"); b.disabled = true; b.textContent = "Enviando…";
    try {
      await I.enviar({ titulo: $("#iTitulo").value, autor: $("#iAutor").value, categoria: $("#iCat").value, texto: $("#iTexto").value, indicado_por: $("#iNome").value });
      $("#formIndicar").hidden = true; $("#indDone").hidden = false;
      $("#btnIndFechar").focus();
    } catch (err) {
      msg.textContent = err.message;
    } finally { b.disabled = false; b.textContent = "Enviar indicação"; }
  });

  // ---------- Início ----------
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.indCache && st.carregado) { const c = ch.indCache.newValue; if (c) { st.cats = c.categorias; st.itens = c.itens; desenharCategorias(); desenharListas(); contarNovas(); } }
  });
  if (location.hash === "#indicacoes") { selectTab("tab-ind"); aoAbrirAba(); }
  else carregar(false);
})();
