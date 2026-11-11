const E = RadarEngine;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PALETTE = {
  light: ["#1b4db0", "#e0662a", "#0a8a5a", "#7c3aed", "#0891b2", "#be185d", "#b45309", "#4d7c0f"],
  dark: ["#7aa5ff", "#ff9159", "#3fd394", "#b896ff", "#41c9e3", "#f272b0", "#e6a74a", "#a3d65f"],
};
const colors = () => PALETTE[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmtDay = (d) => d.split("-").reverse().slice(0, 2).join("/");
const SVGNS = "http://www.w3.org/2000/svg";

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
  return el;
}
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const k of kids) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

const params = new URLSearchParams(location.search);
let month = params.get("m") || E.today().slice(0, 7);

function shiftMonth(m, delta) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
document.getElementById("prev").onclick = () => (location.search = "?m=" + shiftMonth(month, -1));
document.getElementById("next").onclick = () => (location.search = "?m=" + shiftMonth(month, 1));
document.getElementById("print").onclick = () => window.print();

function chart(rows, colorOf) {
  const [y, mo] = month.split("-").map(Number);
  const days = new Date(y, mo, 0).getDate();
  const W = 680, H = 190, L = 62, R = 14, T = 12, B = 26;
  const all = rows.flatMap((r) => r.history.map((p) => p.p));
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min = min * 0.9; max = max * 1.1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const x = (d) => L + ((d - 1) / (days - 1)) * (W - L - R);
  const yv = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Variação de preço no mês" });
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    svg.append(s("line", { x1: L, x2: W - R, y1: yv(v), y2: yv(v), style: "stroke: var(--chart-grid)" }));
    svg.append(s("text", { x: L - 8, y: yv(v) + 4, "text-anchor": "end" }, brl(v).replace(/,\d\d$/, "")));
  }
  for (const d of [1, 8, 15, 22, days]) svg.append(s("text", { x: x(d), y: H - 6, "text-anchor": "middle" }, String(d).padStart(2, "0") + "/" + String(mo).padStart(2, "0")));
  for (const r of rows) {
    const c = colorOf(r);
    // linha em degraus: o preço vale até a próxima leitura
    let dpath = "";
    r.history.forEach((p, i) => {
      const day = +p.d.slice(8);
      const px = x(day), py = yv(p.p);
      if (i === 0) dpath += `M${px},${py}`;
      else dpath += `H${px}V${py}`;
    });
    const lastDay = +r.history[r.history.length - 1].d.slice(8);
    const isCurrent = month === E.today().slice(0, 7);
    const endDay = isCurrent ? Math.max(lastDay, +E.today().slice(8)) : days;
    dpath += `H${x(Math.min(endDay, days))}`;
    svg.append(s("path", { d: dpath, fill: "none", stroke: c, "stroke-width": 2.2, "stroke-linejoin": "round" }));
    for (const p of r.history) {
      const dot = s("circle", { cx: x(+p.d.slice(8)), cy: yv(p.p), r: 3, fill: c });
      dot.append(s("title", {}, `${r.item.storeName} · ${fmtDay(p.d)} · ${brl(p.p)}`));
      svg.append(dot);
    }
  }
  return svg;
}

async function render() {
  const [y, mo] = month.split("-");
  document.getElementById("title").textContent = `Seus livros em ${MONTHS[+mo - 1]} de ${y}`;
  document.getElementById("monthLabel").textContent = `${MONTHS[+mo - 1]} ${y}`;
  document.getElementById("next").disabled = month >= E.today().slice(0, 7);
  const { books, stores } = await E.getState();
  const storeName = Object.fromEntries(stores.map((st) => [st.id, st.name]));
  const content = document.getElementById("content");
  content.textContent = "";
  const withData = books.filter((b) => E.monthSummary(b, month).some((r) => !r.empty));
  document.getElementById("subtitle").textContent = `${withData.length} ${withData.length === 1 ? "livro" : "livros"} com preços registrados neste mês`;
  if (!withData.length) {
    content.append(h("section", { class: "card" }, h("div", { class: "empty" }, h("img", { src: "icons/logo-mark.png", alt: "" }), h("b", {}, "Nada farejado neste mês"), "Ainda não há preços registrados para este mês.")));
    return;
  }
  for (const b of withData) {
    const rows = E.monthSummary(b, month);
    const data = rows.filter((r) => !r.empty);
    const colorIdx = new Map();
    data.forEach((r, i) => colorIdx.set(r, colors()[i % colors().length]));
    const name = (r) => storeName[r.item.storeId] || r.item.storeName;
    const bestEnd = data.reduce((a, r) => (!a || r.end < a.end ? r : a), null);
    const bestMin = data.reduce((a, r) => (!a || r.min < a.min ? r : a), null);
    const startBest = Math.min(...data.map((r) => r.start));
    const delta = bestEnd.end - startBest;

    const table = h("table", { class: "rep" },
      h("tr", {}, h("th", {}, "Loja"), h("th", {}, "Início do mês"), h("th", {}, month === E.today().slice(0, 7) ? "Hoje" : "Fim do mês"), h("th", {}, "Menor"), h("th", {}, "Maior"), h("th", {}, "Variação"))
    );
    for (const r of [...data].sort((a, b) => a.end - b.end)) {
      const cls = r.change < -0.005 ? "chg down" : r.change > 0.005 ? "chg up" : "chg";
      const sign = r.change > 0.005 ? "+" : "";
      table.append(
        h("tr", {},
          h("td", {}, h("span", { class: "chip", style: `background:${colorIdx.get(r)}` }), h("a", { href: r.item.url, target: "_blank" }, name(r)),
            r.item.extra ? h("span", { class: "muted", style: "font-size:12px" }, " · " + r.item.extra.slice(0, 40)) : null),
          h("td", {}, brl(r.start)),
          h("td", {}, h("b", {}, brl(r.end))),
          h("td", {}, brl(r.min), h("span", { class: "muted", style: "font-size:11.5px" }, " " + fmtDay(r.minDay))),
          h("td", {}, brl(r.max)),
          h("td", { class: cls }, Math.abs(r.change) < 0.005 ? "estável" : `${sign}${brl(r.change)} (${sign}${r.changePct.toFixed(1).replace(".", ",")}%)`)
        )
      );
    }
    for (const r of rows.filter((r) => r.empty)) {
      table.append(h("tr", {}, h("td", {}, name(r)), h("td", { colspan: 5, class: "muted", style: "text-align:left" }, "sem leitura neste mês")));
    }

    content.append(
      h("section", { class: "card book-rep" },
        h("h2", {}, b.title),
        b.author ? h("div", { class: "muted", style: "font-size:14px" }, b.author) : null,
        h("div", { class: "kpis" },
          h("div", { class: "kpi main" }, h("div", { class: "v" }, brl(bestEnd.end)), h("div", { class: "l" }, (month === E.today().slice(0, 7) ? "mais barato agora · " : "mais barato no fim do mês · ") + name(bestEnd))),
          h("div", { class: "kpi" }, h("div", { class: "v" }, brl(bestMin.min)), h("div", { class: "l" }, `menor preço do mês · ${name(bestMin)} em ${fmtDay(bestMin.minDay)}`)),
          h("div", { class: "kpi" }, h("div", { class: "v " + (delta < -0.005 ? "down" : delta > 0.005 ? "up" : "") }, Math.abs(delta) < 0.005 ? "estável" : (delta > 0 ? "+" : "") + brl(delta)), h("div", { class: "l" }, "melhor preço vs. início do mês")),
          b.target ? h("div", { class: "kpi" }, h("div", { class: "v" }, brl(b.target)), h("div", { class: "l" }, bestEnd.end <= b.target ? "seu preço-alvo · atingido" : "seu preço-alvo")) : null
        ),
        chart(data, (r) => colorIdx.get(r)),
        table
      )
    );
  }
}
render();
window.addEventListener("themechange", () => render());
