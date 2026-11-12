// FarejaLivro — preferências de conferência e avisos (padrões + leitura/gravação).
globalThis.FarejaConfig = (() => {
  const PADRAO = { freq: "dia", avisoAlvo: true, avisoMinimo: true, avisoQueda: true, quedaPct: 10, latido: true };
  async function ler() {
    const { config } = await chrome.storage.local.get("config");
    return { ...PADRAO, ...(config || {}) };
  }
  async function salvar(parcial) {
    const atual = await ler();
    await chrome.storage.local.set({ config: { ...atual, ...parcial } });
  }
  return { PADRAO, ler, salvar };
})();
