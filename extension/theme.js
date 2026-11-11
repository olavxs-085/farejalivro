// Tema claro / escuro. Carregado no <head> para a página já abrir com a cor certa.
(function () {
  const KEY = "theme"; // "auto" | "light" | "dark"
  const media = matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  let printing = false;

  const getMode = () => {
    try {
      return localStorage.getItem(KEY) || "auto";
    } catch (e) {
      return "auto";
    }
  };
  const resolve = (mode) => (mode === "auto" ? (media.matches ? "dark" : "light") : mode);

  function apply(animate) {
    if (printing) return;
    const theme = resolve(getMode());
    if (root.dataset.theme === theme) return;
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theming");
      setTimeout(() => root.classList.remove("theming"), 450);
    }
    root.dataset.theme = theme;
    window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }
  apply(false);

  const ICONS = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  };
  const LABEL = { auto: "Tema automático (segue o computador)", light: "Tema claro", dark: "Tema escuro" };
  const NEXT = { auto: "light", light: "dark", dark: "auto" };

  function paintButton(btn) {
    const mode = getMode();
    btn.innerHTML = ICONS[mode];
    btn.title = LABEL[mode] + " · clique para trocar";
    btn.setAttribute("aria-label", LABEL[mode] + ". Clique para trocar.");
  }

  function setMode(mode) {
    try {
      localStorage.setItem(KEY, mode);
    } catch (e) {}
    apply(true);
    document.querySelectorAll("[data-theme-toggle]").forEach(paintButton);
  }

  media.addEventListener("change", () => apply(true));
  // outra aba da extensão trocou o tema
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      apply(true);
      document.querySelectorAll("[data-theme-toggle]").forEach(paintButton);
    }
  });
  // relatório sempre sai claro no PDF
  window.addEventListener("beforeprint", () => {
    printing = true;
    root.dataset.theme = "light";
    window.dispatchEvent(new CustomEvent("themechange", { detail: "light" }));
  });
  window.addEventListener("afterprint", () => {
    printing = false;
    root.dataset.theme = "";
    apply(false);
  });

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      paintButton(btn);
      btn.addEventListener("click", () => setMode(NEXT[getMode()]));
    });
  });

  window.Theme = { current: () => root.dataset.theme, setMode };
})();
