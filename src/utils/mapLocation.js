function mapLocation(value) {
  const text = String(value || "").trim();
  const coordinates = text.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (coordinates) {
    const [, latitude, longitude] = coordinates;
    if (Math.abs(Number(latitude)) > 90 || Math.abs(Number(longitude)) > 180) return "";
    const url = new URL("https://www.google.com/maps/search/");
    url.search = new URLSearchParams({ api: "1", query: latitude + "," + longitude });
    return url.href;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (url.hostname === "maps.app.goo.gl" && url.pathname.length > 1) return url.href;
    if (["google.com", "www.google.com", "maps.google.com"].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname)) return url.href;
  } catch { return ""; }
  return "";
}
module.exports = mapLocation;
