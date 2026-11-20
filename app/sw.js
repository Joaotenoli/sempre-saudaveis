// Sempre Saudáveis — funciona offline. Mude VERSION a cada publicação para atualizar os aparelhos.
const VERSION = "ss-v9";
const SHELL = [
  "./", "./index.html", "./app.js", "./config.js", "./vendor/supabase.js", "./manifest.webmanifest",
  "../icons/icon-192.png", "../icons/icon-512.png", "../icons/apple-touch-icon.png", "../icons/favicon.png",
  "../fonts/intertight-500.woff2", "../fonts/intertight-600.woff2", "../fonts/intertight-700.woff2",
  "../fonts/touche-400.woff2", "../fonts/touche-500.woff2", "../fonts/touche-600.woff2", "../fonts/touche-700.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return; // Supabase e outros: direto na rede

  // Páginas e código do app: rede primeiro (pega atualização), cache se estiver offline.
  if (!fonts && (req.mode === "navigate" || /\.(js|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/"))) {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  // Ícones e fontes: cache primeiro.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
