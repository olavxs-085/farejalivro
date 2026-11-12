// FarejaLivro — indicações de livros (equipe e leitores).
// Lê do banco só o que a equipe publicou e envia a indicação do leitor para revisão.
// A chave abaixo é PÚBLICA (publishable): quem protege os dados são as regras do banco.
globalThis.FarejaIndicacoes = (() => {
  const BASE = "https://qcdgjkzyfroqvuoxslgv.supabase.co/rest/v1/";
  const KEY = "sb_publishable_gDulGnB80DG8P66bi7C7gg_S8s63lpD";
  const ML_RE = /^https:\/\/([a-z0-9-]+\.)*(meli\.la|mercadolivre\.com\.br|mercadolivre\.com)(\/|$)/i;
  const CAMPOS = "id,tipo,titulo,autor,categoria,texto,indicado_por,link_afiliado,capa_url,mais_leitores,publicada_em";

  async function rest(path, opts = {}) {
    const r = await fetch(BASE + path, {
      ...opts,
      headers: { apikey: KEY, "Content-Type": "application/json", Accept: "application/json", ...(opts.headers || {}) },
    });
    if (!r.ok) {
      let msg = "";
      try { const j = await r.json(); msg = j.message || j.hint || ""; } catch (_) {}
      const err = new Error(msg || "HTTP " + r.status);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 || r.status === 201 ? null : r.json();
  }

  const get = (k) => chrome.storage.local.get(k);
  const set = (o) => chrome.storage.local.set(o);

  // Baixa categorias e indicações publicadas; guarda uma cópia para usar sem internet.
  async function atualizar() {
    const [categorias, itens] = await Promise.all([
      rest("categorias?select=id,nome,ordem&ativa=eq.true&order=ordem"),
      rest("indicacoes?select=" + CAMPOS + "&status=eq.publicada&no_ar=eq.true&order=publicada_em.desc&limit=500"),
    ]);
    const limpos = itens.map((x) => ({ ...x, link_afiliado: x.tipo === "equipe" && ML_RE.test(x.link_afiliado || "") ? x.link_afiliado : null }));
    const cache = { at: Date.now(), categorias, itens: limpos };
    await set({ indCache: cache });
    return cache;
  }

  async function lerCache() {
    const { indCache } = await get("indCache");
    return indCache || null;
  }

  // Usa a cópia se ela tiver menos de maxIdadeMin minutos; senão busca de novo.
  async function obter(maxIdadeMin = 0) {
    const c = await lerCache();
    if (c && maxIdadeMin > 0 && Date.now() - c.at < maxIdadeMin * 60000) return { ...c, offline: false };
    try { return { ...(await atualizar()), offline: false }; }
    catch (e) { if (c) return { ...c, offline: true }; throw e; }
  }

  async function instalacao() {
    let { indInstalacao } = await get("indInstalacao");
    if (!indInstalacao) {
      indInstalacao = crypto.randomUUID();
      await set({ indInstalacao });
    }
    return indInstalacao;
  }

  async function enviar({ titulo, autor, categoria, texto, indicado_por }) {
    const body = {
      titulo: String(titulo || "").trim().slice(0, 200),
      autor: String(autor || "").trim().slice(0, 200),
      categoria,
      texto: String(texto || "").trim().slice(0, 280),
      indicado_por: String(indicado_por || "").trim().slice(0, 60) || null,
      instalacao: await instalacao(),
    };
    try {
      await rest("indicacoes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
    } catch (e) {
      if (/limite_diario/.test(e.message)) throw new Error("Você já mandou 3 indicações hoje. Amanhã dá pra mandar mais.");
      if (/categoria_invalida/.test(e.message)) throw new Error("Escolha uma categoria da lista.");
      if (e instanceof TypeError) throw new Error("Sem conexão. Confira a internet e tente de novo.");
      throw new Error("Não deu pra enviar agora. Tente de novo em alguns minutos.");
    }
  }

  // ----- Preferências e novidades -----
  async function prefs() {
    const r = await get(["indCategorias", "indAvisar", "indVistoAte"]);
    return { categorias: r.indCategorias || [], avisar: !!r.indAvisar, vistoAte: r.indVistoAte || null };
  }
  const salvarCategorias = (lista) => set({ indCategorias: lista });
  const salvarAvisar = (on) => set({ indAvisar: !!on });

  // Na primeira vez, nada conta como novo (evita "50 novas" logo ao instalar).
  async function garantirVistoAte() {
    const { indVistoAte } = await get("indVistoAte");
    if (!indVistoAte) await set({ indVistoAte: new Date().toISOString() });
  }
  const marcarVistas = () => set({ indVistoAte: new Date().toISOString() });

  function novasDesde(itens, desde, categorias) {
    if (!desde) return [];
    return itens.filter((x) => x.publicada_em && x.publicada_em > desde && (!categorias.length || categorias.includes(x.categoria)));
  }

  return { obter, lerCache, enviar, prefs, salvarCategorias, salvarAvisar, garantirVistoAte, marcarVistas, novasDesde, ML_RE };
})();
