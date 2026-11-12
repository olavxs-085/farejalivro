/* FarejaLivro Equipe — painel de gestão das indicações.
   Conversa com o banco (Supabase) pela chave pública + login da equipe.
   Todo texto vindo de leitores entra na tela como texto puro (nunca como HTML). */
(() => {
  "use strict";

  // ---------- Utilidades ----------
  const $ = (id) => document.getElementById(id);
  const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const ML_RE = /^https:\/\/([a-z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com)(\/|$)/i;
  const isML = (u) => ML_RE.test(String(u || "").trim());
  const isHttps = (u) => /^https:\/\/\S+$/i.test(String(u || "").trim());

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "checked") el.checked = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const CORES = {
    terror: ["#26272f", "#ece4d4"], romance: ["#a8344a", "#fff4f2"], romantasia: ["#55287f", "#f3e9ff"],
    fantasia: ["#1d5a46", "#e6f5ee"], ficcao: ["#0d3a5a", "#dcefff"], suspense: ["#3a3a3a", "#f4f4f4"],
    classicos: ["#75582c", "#fbf3e4"], naoficcao: ["#b45f17", "#fff8ef"], ya: ["#1f6f8b", "#e6f7fd"],
    hq: ["#8c1d2f", "#fff0f0"], poesia: ["#4b5d2a", "#f2f7e6"]
  };
  function capa(item, size) {
    const [bg, ink] = CORES[item.categoria] || ["#1b4db0", "#eaf1ff"];
    const box = h("div", { class: "cover" + (size ? " " + size : ""), "aria-hidden": "true" });
    box.style.background = bg; box.style.color = ink;
    if (item.capa_url && isHttps(item.capa_url)) {
      const img = h("img", { src: item.capa_url, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("error", () => { img.remove(); if (size !== "mini") box.textContent = item.titulo || ""; });
      box.append(img);
    } else if (size !== "mini") {
      box.textContent = item.titulo || "";
    }
    return box;
  }

  let toastTimer;
  function toast(msg, bad) {
    const t = $("toast");
    t.textContent = msg; t.classList.toggle("bad", !!bad); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 5000 : 2800);
  }

  function quando(iso) {
    if (!iso) return "";
    const d = new Date(iso); const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return "agora";
    if (min < 60) return "há " + min + " min";
    const hrs = Math.round(min / 60);
    if (hrs < 24) return "há " + hrs + " h";
    const dias = Math.round(hrs / 24);
    if (dias === 1) return "ontem";
    if (dias < 30) return "há " + dias + " dias";
    return d.toLocaleDateString("pt-BR");
  }

  function erroAmigavel(e) {
    const m = String((e && (e.message || e.error_description || e.msg)) || e || "");
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha errados.";
    if (/Email not confirmed/i.test(m)) return "Esse e-mail ainda não foi confirmado no Supabase.";
    if (/link_afiliado_check/i.test(m)) return "O link não é do Mercado Livre (use https://meli.la/...).";
    if (/capa_url_check/i.test(m)) return "O endereço da capa precisa começar com https://";
    if (/row-level security|permission denied/i.test(m)) return "Sem permissão. Confira se seu e-mail está na lista da equipe (tabela admins).";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o banco. Confira a internet e tente de novo.";
    return m || "Algo deu errado.";
  }

  // Capa automática pela Open Library (base aberta de livros, sem chave).
  async function buscarCapa(titulo, autor) {
    try {
      const q = new URLSearchParams({ title: titulo, author: autor, limit: "8", fields: "cover_i" });
      const r = await fetch("https://openlibrary.org/search.json?" + q.toString());
      if (!r.ok) return null;
      const j = await r.json();
      const doc = (j.docs || []).find((d) => d.cover_i);
      return doc ? "https://covers.openlibrary.org/b/id/" + doc.cover_i + "-L.jpg" : null;
    } catch (_) { return null; }
  }

  // ---------- Acesso aos dados ----------
  const CFG = window.FAREJA_CFG || {};
  const DEMO = /[?&]demo\b/.test(location.search) || !CFG.url || !CFG.key || !window.supabase;

  function apiReal() {
    const sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    const CAMPOS = "id,tipo,status,no_ar,titulo,autor,categoria,texto,indicado_por,link_afiliado,capa_url,mais_leitores,bloqueio,criada_em,publicada_em";
    return {
      async sessao() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.email : null; },
      async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); },
      async sair() { await sb.auth.signOut(); },
      async ehEquipe() { return ok(await sb.from("admins").select("email").limit(1)).length > 0; },
      async categorias() { return ok(await sb.from("categorias").select("id,nome,ordem,ativa").order("ordem")); },
      async pendentes() { return ok(await sb.from("indicacoes").select(CAMPOS).eq("status", "pendente").order("criada_em", { ascending: true }).limit(500)); },
      async publicadas() { return ok(await sb.from("indicacoes").select(CAMPOS).eq("status", "publicada").order("publicada_em", { ascending: false }).limit(2000)); },
      async bloqueadasHoje() {
        const ini = new Date(); ini.setHours(0, 0, 0, 0);
        const r = await sb.from("indicacoes").select("id", { count: "exact", head: true }).not("bloqueio", "is", null).gte("criada_em", ini.toISOString());
        if (r.error) throw r.error; return r.count || 0;
      },
      async atualizar(id, patch) { ok(await sb.from("indicacoes").update(patch).eq("id", id)); },
      async atualizarVarios(ids, patch) { ok(await sb.from("indicacoes").update(patch).in("id", ids)); },
      async inserir(linhas) { ok(await sb.from("indicacoes").insert(linhas)); },
      async apagar(id) { ok(await sb.from("indicacoes").delete().eq("id", id)); }
    };
  }

  function apiDemo() {
    const agora = Date.now(); const iso = (h) => new Date(agora - h * 3600e3).toISOString();
    let id = 100; const novoId = () => "d" + (id++);
    const db = [
      { id: "d1", tipo: "leitor", status: "pendente", no_ar: true, titulo: "Gótico Mexicano", autor: "Silvia Moreno-Garcia", categoria: "terror", texto: "Casa assombrada com clima de anos 50. Terminei e fiquei olhando pras paredes do meu quarto.", indicado_por: "Lu", criada_em: iso(2) },
      { id: "d2", tipo: "leitor", status: "pendente", no_ar: true, titulo: "Trono de Vidro", autor: "Sarah J. Maas", categoria: "fantasia", texto: "Uma assassina disputando um torneio pro rei.", indicado_por: "Gabriel", criada_em: iso(5) },
      { id: "d3", tipo: "leitor", status: "pendente", no_ar: true, titulo: "Corte de Espinhos e Rosas", autor: "Sarah J. Maas", categoria: "romantasia", texto: "Li a série inteira em duas semanas.", indicado_por: null, criada_em: iso(26) },
      { id: "d4", tipo: "equipe", status: "publicada", no_ar: true, titulo: "Bird Box", autor: "Josh Malerman", categoria: "terror", texto: "Uma mãe e duas crianças descem um rio de olhos vendados.", link_afiliado: "https://meli.la/exemplo-1", criada_em: iso(80), publicada_em: iso(80) },
      { id: "d5", tipo: "equipe", status: "publicada", no_ar: false, titulo: "Dom Casmurro", autor: "Machado de Assis", categoria: "classicos", texto: "Capitu traiu ou não traiu?", link_afiliado: "https://meli.la/exemplo-4", criada_em: iso(90), publicada_em: iso(90) },
      { id: "d6", tipo: "leitor", status: "publicada", no_ar: true, titulo: "Corte de Espinhos e Rosas", autor: "Sarah J. Maas", categoria: "romantasia", texto: "Virou a série que eu mais indico.", indicado_por: "Bia", mais_leitores: 0, criada_em: iso(100), publicada_em: iso(99) }
    ];
    const cats = [["terror", "Terror"], ["romance", "Romance"], ["romantasia", "Romantasia"], ["fantasia", "Fantasia"], ["ficcao", "Ficção científica"], ["suspense", "Suspense"], ["classicos", "Clássicos"], ["naoficcao", "Não ficção"], ["ya", "Jovem adulto"], ["hq", "HQ e mangá"], ["poesia", "Poesia"]].map(([id, nome], i) => ({ id, nome, ordem: i + 1, ativa: true }));
    let logado = null;
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const checar = (r) => { if (r.link_afiliado && !isML(r.link_afiliado)) throw new Error("link_afiliado_check"); };
    return {
      async sessao() { return logado; },
      async entrar(email) { logado = email; },
      async sair() { logado = null; },
      async ehEquipe() { return true; },
      async categorias() { return clone(cats); },
      async pendentes() { return clone(db.filter((x) => x.status === "pendente")); },
      async publicadas() { return clone(db.filter((x) => x.status === "publicada").sort((a, b) => (b.publicada_em || "").localeCompare(a.publicada_em || ""))); },
      async bloqueadasHoje() { return 3; },
      async atualizar(id, patch) { const x = db.find((y) => y.id === id); checar(patch); Object.assign(x, patch); if (patch.status === "publicada" && !x.publicada_em) x.publicada_em = new Date().toISOString(); },
      async atualizarVarios(ids, patch) { for (const i of ids) await this.atualizar(i, patch); },
      async inserir(linhas) { for (const l of linhas) { checar(l); db.push(Object.assign({ id: novoId(), no_ar: true, mais_leitores: 0, criada_em: new Date().toISOString(), publicada_em: l.status === "publicada" ? new Date().toISOString() : null }, l)); } },
      async apagar(id) { const i = db.findIndex((x) => x.id === id); if (i >= 0) db.splice(i, 1); }
    };
  }

  const api = DEMO ? apiDemo() : apiReal();

  // ---------- Estado ----------
  const S = {
    cats: [], catNome: {}, catPorNome: {},
    pend: [], pub: [], bloq: 0,
    marcadas: new Set(),
    tab: "pendentes",
    form: { id: null, modo: "equipe", origem: null },
    ocupado: false
  };
  const chaveLivro = (x) => fold(x.titulo) + "|" + fold(x.autor);

  // ---------- Login ----------
  async function iniciar() {
    if (DEMO) { $("demoNote").hidden = false; }
    const email = await api.sessao().catch(() => null);
    if (email) await entrouComo(email); else mostrarLogin();
  }

  function mostrarLogin(msg) {
    $("vApp").hidden = true; $("btnSair").hidden = true; $("vLogin").hidden = false;
    $("who").textContent = "Gestão das indicações";
    $("loginMsg").textContent = msg || "";
    setTimeout(() => $("lEmail").focus(), 50);
  }

  $("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = $("btnEntrar"); b.disabled = true; b.textContent = "Entrando…"; $("loginMsg").textContent = "";
    try {
      await api.entrar($("lEmail").value.trim(), $("lSenha").value);
      $("lSenha").value = "";
      await entrouComo($("lEmail").value.trim());
    } catch (err) {
      $("loginMsg").textContent = erroAmigavel(err);
    } finally { b.disabled = false; b.textContent = "Entrar"; }
  });

  async function entrouComo(email) {
    let equipe = false;
    try { equipe = await api.ehEquipe(); } catch (_) { equipe = false; }
    if (!equipe) {
      await api.sair();
      mostrarLogin("Esse e-mail não está na lista da equipe. Adicione na tabela admins do Supabase.");
      return;
    }
    $("vLogin").hidden = true; $("vApp").hidden = false; $("btnSair").hidden = false;
    $("who").textContent = "Conectado como " + email;
    await carregarCategorias();
    limparForm();
    abrirAba(lerHash());
    await recarregar();
  }

  $("btnSair").addEventListener("click", async () => { await api.sair(); mostrarLogin(); });

  // ---------- Dados ----------
  async function carregarCategorias() {
    S.cats = (await api.categorias()).filter((c) => c.ativa);
    S.catNome = {}; S.catPorNome = {};
    for (const c of S.cats) { S.catNome[c.id] = c.nome; S.catPorNome[fold(c.nome)] = c.id; S.catPorNome[fold(c.id)] = c.id; }
    const sel = $("fCat"); sel.textContent = "";
    for (const c of S.cats) sel.append(h("option", { value: c.id, text: c.nome }));
  }

  async function recarregar() {
    try {
      const [pend, pub, bloq] = await Promise.all([api.pendentes(), api.publicadas(), api.bloqueadasHoje().catch(() => 0)]);
      S.pend = pend; S.pub = pub; S.bloq = bloq;
      for (const id of [...S.marcadas]) if (!pend.some((p) => p.id === id)) S.marcadas.delete(id);
      desenharTudo();
    } catch (err) {
      toast(erroAmigavel(err), true);
    }
  }

  function desenharTudo() { desenharKpis(); desenharPendentes(); desenharPublicadas(); atualizarImport(); }

  function desenharKpis() {
    const noAr = S.pub.filter((x) => x.no_ar);
    $("kPend").textContent = S.pend.length;
    $("kTeam").textContent = noAr.filter((x) => x.tipo === "equipe").length;
    $("kReaders").textContent = noAr.filter((x) => x.tipo === "leitor").length;
    $("kOff").textContent = S.pub.filter((x) => !x.no_ar).length;
    const c = $("countPend"); c.textContent = S.pend.length; c.hidden = S.pend.length === 0;
    $("bloqHoje").textContent = S.bloq + (S.bloq === 1 ? " bloqueada" : " bloqueadas") + " automaticamente hoje (link ou palavrão)";
  }

  // ---------- Abas ----------
  const ABAS = ["pendentes", "publicadas", "nova", "importar"];
  const lerHash = () => { const x = location.hash.replace("#", ""); return ABAS.includes(x) ? x : "pendentes"; };
  function abrirAba(tab) {
    S.tab = tab;
    for (const t of ABAS) {
      $("tab-" + t).setAttribute("aria-selected", String(t === tab));
      $("panel-" + t).hidden = t !== tab;
    }
    if (location.hash.replace("#", "") !== tab) history.replaceState(null, "", "#" + tab);
  }
  document.querySelectorAll(".seg [data-tab]").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.tab)));
  window.addEventListener("hashchange", () => abrirAba(lerHash()));

  // ---------- Pendentes ----------
  function duplicadaDe(p) {
    const k = chaveLivro(p);
    return S.pub.find((x) => chaveLivro(x) === k) || null;
  }

  function desenharPendentes() {
    const box = $("pendList"); box.textContent = "";
    if (!S.pend.length) {
      box.append(h("div", { class: "empty" }, h("img", { src: "logo-mark.png", alt: "" }), h("b", { text: "Fila zerada" }), "Nenhuma indicação esperando revisão."));
    }
    for (const p of S.pend) {
      const dup = duplicadaDe(p);
      box.append(h("article", { class: "item" },
        h("label", { class: "chk" }, h("input", { type: "checkbox", checked: S.marcadas.has(p.id), "aria-label": "Selecionar " + p.titulo, onchange: (e) => { e.target.checked ? S.marcadas.add(p.id) : S.marcadas.delete(p.id); desenharBulk(); } })),
        capa(p),
        h("div", { class: "item-body" },
          h("div", { class: "item-top" },
            h("h3", { text: p.titulo }),
            h("span", { class: "by", text: p.autor }),
            h("span", { class: "pill", text: S.catNome[p.categoria] || p.categoria }),
            dup ? h("span", { class: "pill warn", text: "Já publicado: vira “+1 leitor indicou”" }) : null
          ),
          p.texto ? h("p", { class: "quote", text: "“" + p.texto + "”" }) : null,
          h("div", { class: "meta", text: (p.indicado_por ? "Indicado por " + p.indicado_por : "Anônimo") + " · enviado " + quando(p.criada_em) })
        ),
        h("div", { class: "item-actions" },
          h("button", { class: "btn ok", type: "button", onclick: () => aprovar([p.id]) }, "Aprovar"),
          h("button", { class: "btn soft", type: "button", onclick: () => editar(p, "leitor") }, "Editar"),
          h("button", { class: "btn no", type: "button", onclick: () => recusar([p.id]) }, "Recusar")
        )
      ));
    }
    desenharBulk();
  }

  function desenharBulk() {
    const n = S.marcadas.size;
    $("bulk").hidden = n === 0;
    $("bulkTxt").textContent = n + (n === 1 ? " selecionada" : " selecionadas");
  }
  $("btnBulkOk").addEventListener("click", () => aprovar([...S.marcadas]));
  $("btnBulkNo").addEventListener("click", () => recusar([...S.marcadas]));

  async function aprovar(ids) {
    if (S.ocupado || !ids.length) return; S.ocupado = true;
    try {
      let n = 0;
      for (const id of ids) {
        const p = S.pend.find((x) => x.id === id); if (!p) continue;
        const dup = duplicadaDe(p);
        if (dup) {
          await api.atualizar(dup.id, { mais_leitores: (dup.mais_leitores || 0) + 1 });
          await api.atualizar(p.id, { status: "recusada", bloqueio: "duplicada" });
          dup.mais_leitores = (dup.mais_leitores || 0) + 1;
        } else {
          const capaUrl = p.capa_url || await buscarCapa(p.titulo, p.autor);
          await api.atualizar(p.id, { status: "publicada", capa_url: capaUrl || null });
        }
        n++;
      }
      S.marcadas.clear();
      toast(n === 1 ? "Aprovada e publicada em “Dos leitores”" : n + " indicações aprovadas e publicadas");
      await recarregar();
    } catch (err) { toast(erroAmigavel(err), true); }
    finally { S.ocupado = false; }
  }

  async function recusar(ids) {
    if (S.ocupado || !ids.length) return; S.ocupado = true;
    try {
      await api.atualizarVarios(ids, { status: "recusada" });
      S.marcadas.clear();
      toast(ids.length === 1 ? "Indicação recusada" : ids.length + " indicações recusadas");
      await recarregar();
    } catch (err) { toast(erroAmigavel(err), true); }
    finally { S.ocupado = false; }
  }

  // ---------- Publicadas ----------
  $("pubQ").addEventListener("input", desenharPublicadas);
  function desenharPublicadas() {
    const q = fold($("pubQ").value);
    const box = $("pubList"); box.textContent = "";
    const lista = S.pub.filter((b) => !q || fold(b.titulo + " " + b.autor + " " + (S.catNome[b.categoria] || "")).includes(q));
    if (!lista.length) box.append(h("p", { class: "sub", text: q ? "Nada encontrado com esse filtro." : "Nenhuma indicação publicada ainda." }));
    for (const b of lista) {
      box.append(h("div", { class: "prow" },
        capa(b, "mini"),
        h("div", { style: "min-width:0" }, h("div", { class: "t", text: b.titulo }), h("div", { class: "a", text: b.autor + (b.mais_leitores ? " · +" + b.mais_leitores + " leitor" + (b.mais_leitores > 1 ? "es" : "") : "") })),
        h("div", {}, h("span", { class: "pill", text: S.catNome[b.categoria] || b.categoria })),
        h("div", {}, h("span", { class: b.tipo === "equipe" ? "pill team" : "pill", text: b.tipo === "equipe" ? "Equipe" : "Leitor" })),
        h("div", { class: "l mono", title: b.link_afiliado || "", text: b.link_afiliado ? b.link_afiliado.replace(/^https?:\/\//, "") : "— sem link" }),
        h("div", {}, h("label", { class: "switch" },
          h("input", { type: "checkbox", checked: b.no_ar, "aria-label": (b.no_ar ? "Tirar do ar: " : "Colocar no ar: ") + b.titulo, onchange: (e) => alternarNoAr(b, e.target) }),
          h("span", {})
        )),
        h("div", {}, h("button", { class: "btn soft small", type: "button", onclick: () => editar(b, b.tipo) }, "Editar"))
      ));
    }
  }

  async function alternarNoAr(b, input) {
    const novo = input.checked; input.disabled = true;
    try {
      await api.atualizar(b.id, { no_ar: novo });
      b.no_ar = novo; desenharKpis();
      toast(novo ? "“" + b.titulo + "” voltou pro ar" : "“" + b.titulo + "” saiu do ar");
    } catch (err) { input.checked = !novo; toast(erroAmigavel(err), true); }
    finally { input.disabled = false; }
  }

  // ---------- Formulário ----------
  const F = { link: $("fLink"), titulo: $("fTitle"), autor: $("fAuthor"), cat: $("fCat"), capa: $("fCover"), texto: $("fText") };

  function editar(item, modo) {
    S.form = { id: item.id, modo, origem: item.status };
    F.link.value = item.link_afiliado || ""; F.titulo.value = item.titulo || ""; F.autor.value = item.autor || "";
    F.cat.value = item.categoria; F.capa.value = item.capa_url || ""; F.texto.value = item.texto || "";
    abrirAba("nova"); atualizarForm(); F.titulo.focus();
  }

  function limparForm() {
    S.form = { id: null, modo: "equipe", origem: null };
    for (const k of ["link", "titulo", "autor", "capa", "texto"]) F[k].value = "";
    if (S.cats[0]) F.cat.value = S.cats.find((c) => c.id === "fantasia") ? "fantasia" : S.cats[0].id;
    $("formMsg").textContent = "";
    atualizarForm();
  }
  $("btnLimpar").addEventListener("click", limparForm);

  function atualizarForm() {
    const { id, modo, origem } = S.form;
    const leitor = modo === "leitor";
    $("wrapLink").hidden = leitor;
    $("formTitle").textContent = !id ? "Nova indicação da equipe" : (leitor && origem === "pendente" ? "Revisar indicação de leitor" : "Editar indicação");
    $("formSub").textContent = leitor
      ? "Ajuste o texto se precisar. Indicação de leitor aparece em “Dos leitores”, sem link de afiliado."
      : "Preencha, confira a prévia ao lado e publique. Aparece na extensão de todo mundo na hora.";
    $("btnPublicar").textContent = !id ? "Publicar" : (origem === "pendente" ? "Aprovar e publicar" : "Salvar alterações");
    $("btnExcluir").hidden = !id || origem === "pendente";

    const linkTxt = F.link.value.trim();
    const linkRuim = !leitor && linkTxt !== "" && !isML(linkTxt);
    F.link.setAttribute("aria-invalid", String(linkRuim));
    $("linkHint").textContent = linkRuim ? "Esse link não é do Mercado Livre. Use o link curto https://meli.la/... gerado no portal de afiliados." : "Gere no portal de afiliados do ML e cole aqui.";
    $("linkHint").style.color = linkRuim ? "var(--up)" : "";
    $("textCount").textContent = F.texto.value.length;

    // Prévia
    const pv = { titulo: F.titulo.value.trim() || "Nome do livro", categoria: F.cat.value, capa_url: isHttps(F.capa.value) ? F.capa.value.trim() : null };
    const old = $("pvCover"); const novo = capa(pv, "big"); novo.id = "pvCover"; old.replaceWith(novo);
    $("pvCat").textContent = S.catNome[F.cat.value] || "Categoria";
    $("pvTitle").textContent = pv.titulo;
    $("pvAuthor").textContent = F.autor.value.trim() || "Autor";
    $("pvText").textContent = F.texto.value.trim() || "O texto da equipe aparece aqui.";
    $("pvBuy").hidden = leitor;
  }
  for (const el of Object.values(F)) el.addEventListener("input", atualizarForm);
  F.cat.addEventListener("change", atualizarForm);

  $("formNova").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (S.ocupado) return;
    const msg = $("formMsg"); msg.textContent = "";
    const { id, modo, origem } = S.form; const leitor = modo === "leitor";
    const d = {
      titulo: F.titulo.value.trim(), autor: F.autor.value.trim(), categoria: F.cat.value,
      texto: F.texto.value.trim(), capa_url: F.capa.value.trim() || null,
      link_afiliado: leitor ? null : (F.link.value.trim() || null)
    };
    if (!d.titulo || !d.autor) { msg.textContent = "Preencha o nome do livro e o autor."; return; }
    if (!leitor && !d.link_afiliado) { msg.textContent = "Cole o link de afiliado do Mercado Livre."; F.link.focus(); return; }
    if (d.link_afiliado && !isML(d.link_afiliado)) { msg.textContent = "Esse link não é do Mercado Livre."; F.link.focus(); return; }
    if (d.capa_url && !isHttps(d.capa_url)) { msg.textContent = "O endereço da capa precisa começar com https://"; F.capa.focus(); return; }

    const b = $("btnPublicar"); const txt = b.textContent; S.ocupado = true; b.disabled = true;
    try {
      if (!d.capa_url) { b.textContent = "Buscando capa…"; d.capa_url = await buscarCapa(d.titulo, d.autor); }
      b.textContent = "Publicando…";
      if (id) {
        const patch = Object.assign({}, d);
        if (origem === "pendente") patch.status = "publicada";
        await api.atualizar(id, patch);
      } else {
        await api.inserir([Object.assign({ tipo: "equipe", status: "publicada" }, d)]);
      }
      toast(id ? (origem === "pendente" ? "Aprovada e publicada" : "Alterações salvas") : "Publicada! Já aparece na extensão de todo mundo");
      limparForm(); await recarregar(); abrirAba("publicadas");
    } catch (err) { msg.textContent = erroAmigavel(err); }
    finally { S.ocupado = false; b.disabled = false; b.textContent = txt; atualizarForm(); }
  });

  // Excluir (só publicadas). Confirmação em dois cliques, sem caixa de diálogo do navegador.
  let excluirArmado = null;
  $("btnExcluir").addEventListener("click", async () => {
    const b = $("btnExcluir"); const id = S.form.id; if (!id) return;
    if (excluirArmado !== id) {
      excluirArmado = id; b.textContent = "Clique de novo pra excluir de vez";
      setTimeout(() => { if (excluirArmado === id) { excluirArmado = null; b.textContent = "Excluir"; } }, 4000);
      return;
    }
    excluirArmado = null; b.textContent = "Excluir";
    try { await api.apagar(id); toast("Indicação excluída"); limparForm(); await recarregar(); abrirAba("publicadas"); }
    catch (err) { $("formMsg").textContent = erroAmigavel(err); }
  });

  // ---------- Importar lista ----------
  let linhasImp = [];
  function lerLista(texto) {
    const jaPub = new Set(S.pub.map(chaveLivro));
    const vistos = new Set();
    return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((linha) => {
      const partes = (linha.includes("|") ? linha.split("|") : linha.split("\t")).map((x) => x.trim());
      const [titulo = "", autor = "", catNome = "", link = "", ...resto] = partes;
      const texto = resto.join(" | ").trim();
      const categoria = S.catPorNome[fold(catNome)];
      let erro = "";
      if (!titulo || !autor) erro = "Faltam título ou autor";
      else if (titulo.length > 200 || autor.length > 200) erro = "Título ou autor longo demais";
      else if (!categoria) erro = "Categoria “" + catNome + "” não existe";
      else if (!isML(link)) erro = "Link não é do Mercado Livre";
      else if (texto.length > 280) erro = "Texto passa de 280 caracteres";
      else if (jaPub.has(fold(titulo) + "|" + fold(autor))) erro = "Já está publicado";
      else if (vistos.has(fold(titulo) + "|" + fold(autor))) erro = "Repetido na lista";
      vistos.add(fold(titulo) + "|" + fold(autor));
      return { linha, titulo, autor, catNome, categoria, link, texto, erro };
    });
  }

  function atualizarImport() {
    linhasImp = lerLista($("impText").value);
    const boas = linhasImp.filter((r) => !r.erro); const ruins = linhasImp.length - boas.length;
    $("impOk").textContent = boas.length + (boas.length === 1 ? " pronta" : " prontas");
    $("impErr").hidden = ruins === 0; $("impErr").textContent = ruins + " com erro";
    const b = $("btnImp"); if (!S.ocupado) { b.disabled = boas.length === 0; b.textContent = "Publicar " + boas.length + (boas.length === 1 ? " indicação" : " indicações"); }
    const box = $("impList"); box.textContent = "";
    if (!linhasImp.length) box.append(h("p", { class: "sub", text: "Cole a lista na caixa acima pra ver a prévia." }));
    for (const r of linhasImp) {
      box.append(h("div", { class: "irow" },
        h("span", { class: r.erro ? "dot bad" : "dot", "aria-hidden": "true" }),
        h("span", { style: "font-weight:600", text: r.titulo || "—" }),
        h("span", { style: "color:var(--ink-2)", text: r.autor || "—" }),
        h("span", { text: r.categoria ? S.catNome[r.categoria] : (r.catNome || "—") }),
        h("span", { class: "l mono", text: (r.link || "—").replace(/^https?:\/\//, "") }),
        h("span", { class: r.erro ? "st-bad" : "st-ok", text: r.erro || "Pronta pra publicar" })
      ));
    }
  }
  $("impText").addEventListener("input", atualizarImport);

  $("btnImp").addEventListener("click", async () => {
    const boas = linhasImp.filter((r) => !r.erro); if (!boas.length || S.ocupado) return;
    const b = $("btnImp"); S.ocupado = true; b.disabled = true;
    try {
      const novas = [];
      for (let i = 0; i < boas.length; i++) {
        b.textContent = "Buscando capas " + (i + 1) + "/" + boas.length + "…";
        const r = boas[i];
        novas.push({ tipo: "equipe", status: "publicada", titulo: r.titulo, autor: r.autor, categoria: r.categoria, link_afiliado: r.link, texto: r.texto, capa_url: await buscarCapa(r.titulo, r.autor) });
      }
      b.textContent = "Publicando…";
      await api.inserir(novas);
      $("impText").value = linhasImp.filter((r) => r.erro).map((r) => r.linha).join("\n");
      toast(novas.length + (novas.length === 1 ? " indicação publicada" : " indicações publicadas"));
      S.ocupado = false; await recarregar();
    } catch (err) { toast(erroAmigavel(err), true); }
    finally { S.ocupado = false; atualizarImport(); }
  });

  // ---------- Início ----------
  limparForm();
  iniciar();
})();
