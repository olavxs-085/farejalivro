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
