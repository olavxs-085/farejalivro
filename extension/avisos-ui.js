// FarejaLivro — card "Conferência e avisos" (aba Lojas).
(() => {
  const C = globalThis.FarejaConfig;
  const freqBtns = [...document.querySelectorAll("[data-freq]")];
  let somTeste = null;
  let msgTimer;

  function avisar(texto) {
    const m = $("#cfgMsg");
    m.textContent = texto;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (m.textContent = ""), 2500);
  }

  async function desenhar() {
    const cfg = await C.ler();
    for (const b of freqBtns) b.setAttribute("aria-checked", String(b.dataset.freq === cfg.freq));
    $("#cAlvo").checked = cfg.avisoAlvo;
    $("#cMinimo").checked = cfg.avisoMinimo;
    $("#cQueda").checked = cfg.avisoQueda;
    $("#cQuedaPct").value = String(cfg.quedaPct);
    $("#cQuedaPct").disabled = !cfg.avisoQueda;
    $("#cLatido").checked = cfg.latido;
  }

  freqBtns.forEach((b, i) => {
    b.addEventListener("click", async () => {
      await C.salvar({ freq: b.dataset.freq });
      await desenhar();
      avisar(b.dataset.freq === "semana" ? "Pronto: confiro os preços uma vez por semana." : "Pronto: confiro os preços todo dia.");
    });
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const n = freqBtns[(i + 1) % freqBtns.length];
      n.focus(); n.click();
    });
  });

  const salvarCampo = (id, chave, texto) =>
    $(id).addEventListener("change", async (e) => {
      await C.salvar({ [chave]: e.target.checked });
      await desenhar();
      avisar(e.target.checked ? texto + " ligado." : texto + " desligado.");
    });
  salvarCampo("#cAlvo", "avisoAlvo", "Aviso de preço-alvo");
  salvarCampo("#cMinimo", "avisoMinimo", "Aviso de menor preço");
  salvarCampo("#cQueda", "avisoQueda", "Aviso de queda");
  salvarCampo("#cLatido", "latido", "Latido");
  $("#cQuedaPct").addEventListener("change", async (e) => {
    await C.salvar({ quedaPct: Number(e.target.value) });
    avisar("Aviso a partir de " + e.target.value + "% de queda.");
  });

  $("#btnOuvir").addEventListener("click", () => {
    somTeste = somTeste || new Audio("sounds/latido.mp3");
    somTeste.currentTime = 0;
    somTeste.play().catch(() => {});
  });

  desenhar();
})();
