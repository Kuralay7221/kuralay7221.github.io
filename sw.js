const V = "dk-v15", SHARE = "dk-share", SHELL = ["./", "index.html"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith("dk-") && k !== V && k !== SHARE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });

const net = (r, ms) => Promise.race([fetch(r), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);

  // Paylaş → Dosya Kasası: dosyalar ve metin/bağlantı
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
              headers: { "x-name": encodeURIComponent(f.name), "content-type": f.type || "application/octet-stream" }
            }));
          }
        }
        const t = { title: fd.get("title") || "", text: fd.get("text") || "", url: fd.get("url") || "" };
        if (t.title || t.text || t.url) {
          await c.put("share-t", new Response(JSON.stringify(t), { headers: { "x-text": "1", "content-type": "application/json" } }));
          i++;
        }
        return Response.redirect(back + (i ? "?shared=1" : ""), 303);
      } catch {
        return Response.redirect(back, 303);
      }
    })());
    return;
  }

  if (r.method !== "GET" || u.origin !== location.origin) return;

  // Önce ağ (4 sn zaman aşımı), olmazsa önbellek
  e.respondWith((async () => {
    try {
      const res = await net(r, 4000);
      if (res.ok && res.type === "basic") { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
      return res;
    } catch {
      return (await caches.match(r, { ignoreSearch: true })) ||
             (await caches.match("index.html")) ||
             (await caches.match("./")) ||
             new Response("Çevrimdışısın", { status: 503, headers: { "content-type": "text/plain;charset=utf-8" } });
    }
  })());
});
