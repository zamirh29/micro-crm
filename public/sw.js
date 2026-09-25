/* MicroCRM service worker — offline read support */
const VERSION = "v2";
const PAGES = `microcrm-pages-${VERSION}`;
const STATIC = `microcrm-static-${VERSION}`;
const API = `microcrm-api-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      try {
        const res = await fetch(OFFLINE_URL);
        if (res.ok) {
          const html = await res.clone().text();
          await pages.put(OFFLINE_URL, res);
          const assets = new Set();
          for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+/g)) {
            assets.add(m[0]);
          }
          await Promise.all(
            Array.from(assets).map(async (url) => {
              try {
                const assetRes = await fetch(url, { cache: "reload" });
                if (assetRes.ok) await pages.put(url, assetRes.clone());
              } catch {
                /* ignore */
              }
            })
          );
        }
      } catch {
        /* offline page will be cached on first successful visit */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("microcrm-") && !key.includes(`-${VERSION}`))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request, cacheName, timeoutMs, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const fetchPromise = fetch(request).then((res) => {
      const isRedirectedToLogin =
        res.redirected && new URL(res.url).pathname.startsWith("/login");
      if (res.ok && !isRedirectedToLogin) {
        Promise.resolve(cache.put(request, res.clone())).catch(() => {});
      }
      return res;
    });
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve("__timeout__"), timeoutMs)
    );
    const result = await Promise.race([fetchPromise, timeout]);
    if (result === "__timeout__") throw new Error("network timeout");
    return result;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return fallback();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.signal && request.signal.aborted) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isRsc =
    request.headers.get("rsc") === "1" || url.searchParams.has("_rsc");
  const isNavigation = request.mode === "navigate" || isRsc;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }

  if (isNavigation) {
    event.respondWith(
      networkFirst(request, PAGES, 8000, async () => {
        if (request.mode === "navigate") {
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return Response.error();
      })
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      networkFirst(request, API, 8000, async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "You are offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  if (
    [".css", ".js", ".woff2", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico"].some(
      (ext) => url.pathname.endsWith(ext)
    )
  ) {
    event.respondWith(cacheFirst(request, STATIC));
  }
});
