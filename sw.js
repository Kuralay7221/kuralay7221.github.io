const V = "dk-v10";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg"];
const SHARE = "dk-share";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      // dosyalardan biri alınamasa bile kurulum başarısız olmasın
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k.startsWith("dk-") && k !== V && k !== SHARE).map(k => caches.delete(k))
      ))
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable())
      .then(() => self.clients.claim())
  );
});

// Sayfadan "hemen güncelle" komutu için
self.addEventListener("message", e => {
  if (e.data === "skip") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);

  // Paylaş → Dosya Kasası: dosyaları geçici önbelleğe al, uygulamaya yönlendir
  if (r.method === "POST" && u.searchParams.has("share")) {
    e.respondWith((async () => {
      const back = new URL("./", self.registration.scope).href;
      try {
        const fd = await r.formData(), c = await caches.open(SHARE);
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of fd.getAll("files")) {
          if (f instanceof File) {
            await c.put("share-" + i++, new Response(f, {
              headers: {
                "x-name": encodeURIComponent(f.name),
                "content-type": f.type || "application/octet-stream"
              }
            }));
          }
        }
        return Response.redirect(back + (i ? "?shared=1" : ""), 303);
      } catch {
        return Response.redirect(back, 303);
      }
    })());
    return;
  }

  // GitHub API ve diğer siteler: hiç dokunma
  if (r.method !== "GET" || u.origin !== location.origin) return;

  // Önce ağ (güncellemeler hemen gelsin), çevrimdışıysa önbellek
  e.respondWith((async () => {
    try {
      const pre = r.mode === "navigate" && e.preloadResponse ? await e.preloadResponse : null;
      const res = pre || await fetch(r);
      if (res.ok) {
        const cp = res.clone();
        caches.open(V).then(c => c.put(r, cp));
      }
      return res;
    } catch {
      return (await caches.match(r, { ignoreSearch: true })) ||
             (await caches.match("index.html")) ||
             (await caches.match("./")) ||
             new Response("Çevrimdışısın", { status: 503, headers: { "content-type": "text/plain;charset=utf-8" } });
    }
  })());
});