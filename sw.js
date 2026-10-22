const V = "dk-v5";
const SHELL = ["./", "index.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("dk-v") && k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);

  // Telefondan "Paylaş → Dosya Kasası": dosyaları geçici olarak önbelleğe al, uygulamaya yönlendir
  if (r.method === "POST" && u.searchParams.has("share")) {
    e.respondWith((async () => {
      const fd = await r.formData(), c = await caches.open("dk-share");
      for (const k of await c.keys()) await c.delete(k);
      let i = 0;
      for (const f of fd.getAll("files")) {
        if (f instanceof File) {
          await c.put("share-" + i++, new Response(f, {
            headers: { "x-name": encodeURIComponent(f.name), "content-type": f.type || "application/octet-stream" }
          }));
        }
      }
      return Response.redirect(new URL("./?shared=1", self.registration.scope).href, 303);
    })());
    return;
  }

  // GitHub API ve diğer siteler: hiç dokunma
  if (r.method !== "GET" || u.origin !== location.origin) return;

  // Önce ağ (güncellemeler hemen gelsin), çevrimdışıysa önbellek
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("index.html")))
  );
});
