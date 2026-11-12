let audio = null;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== "offscreen" || msg.type !== "latir") return false;
  try {
    audio = audio || new Audio("sounds/latido.mp3");
    audio.currentTime = 0;
    audio.volume = 0.9;
    audio.onended = () => reply({ ok: true });
    audio.play().catch((e) => reply({ ok: false, error: String(e) }));
  } catch (e) { reply({ ok: false, error: String(e) }); }
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== "offscreen" || msg.type !== "parse") return false;
  try {
    const doc = new DOMParser().parseFromString(msg.html, "text/html");
    const blocked = RadarExtract.looksBlocked(doc);
    const data = msg.mode === "search" ? RadarExtract.search(doc, msg.recipe, msg.url) : RadarExtract.product(doc, msg.recipe, msg.url);
    reply({ blocked, data });
  } catch (e) {
    reply({ blocked: false, data: msg.mode === "search" ? [] : { price: null }, error: String(e) });
  }
  return false;
});
