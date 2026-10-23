// Service worker for the public help pages in ONE folder (help/ or ayuda/),
// written into that folder by scripts/prerender.mjs with the "__X__" values
// filled in. It exists only after someone taps "Save all pages" (client.js
// registers it then) and "Remove saved pages" deletes it again.
//
// Rules, for a privacy-first site whose pages carry legal facts:
//  - Only the listed pages of this folder, and the shared stylesheet and page
//    script they use (help-assets/, content-hashed names), are ever handled or
//    stored: never the map app, its data, anything typed, or the address's ?query.
//  - Network first. A saved copy is shown only when there is no connection,
//    the host fails (5xx) or the network takes over WAIT_MS, and it carries a
//    "saved copy from <date>" banner.
//  - A saved copy is shown only if its bytes match this build's hash, so a
//    copy can't be planted or go stale across an update unnoticed.
//  - A page the site no longer has (404/410) is dropped, not served.
//
// Kill switch: publish a sw.js that deletes its caches and unregisters
// (README, "Free help tools").
/* eslint-disable */
var SCOPE = "__SCOPE__";
var CACHE = "__CACHE__";
var LANG = "__LANG__";
/** [path, sha256 hex of the exact published HTML] */
var PAGES = __PAGES__;
/** [path, sha256 hex] of the shared stylesheet and script the pages load. */
var ASSETS = __ASSETS__;
var WAIT_MS = 4000;
var ORIGIN = self.location.origin;
var MARKER = ORIGIN + SCOPE + "__saved__";

var WORDS = {
  en: {
    banner: "Saved copy from {date}. Facts may have changed: open this page with internet to update it.",
    offlineTitle: "You’re offline",
    offlineText: "This page isn’t saved on this device. The pages you saved still open.",
    home: "Free help pages",
  },
  es: {
    banner: "Copia guardada del {date}. La información pudo cambiar: abra esta página con internet para actualizarla.",
    offlineTitle: "Está sin conexión",
    offlineText: "Esta página no está guardada en este aparato. Las páginas que guardó siguen abriéndose.",
    home: "Páginas de ayuda gratis",
  },
}[LANG];

var EXPECTED = {};
PAGES.forEach(function (p) {
  EXPECTED[ORIGIN + p[0]] = p[1];
});
var ASSET = {};
ASSETS.forEach(function (a) {
  ASSET[ORIGIN + a[0]] = a[1];
});
/** The hash a saved copy of `key` must have (page or shared file), if any. */
function expected(key) {
  return EXPECTED[key] || ASSET[key];
}
var ASSET_TYPES = { css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8" };

/** The cache key for a URL: origin + path, with a trailing slash for pages. */
function keyFor(url) {
  var u = new URL(url, ORIGIN);
  var path = /\/[^/.]+$/.test(u.pathname) ? u.pathname + "/" : u.pathname;
  return u.origin + path;
}

function hex(buf) {
  return crypto.subtle.digest("SHA-256", buf).then(function (d) {
    return Array.prototype.map
      .call(new Uint8Array(d), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        // Pages the site no longer lists are forgotten.
        return cache.keys().then(function (reqs) {
          return Promise.all(
            reqs
              .filter(function (r) {
                return r.url !== MARKER && !expected(r.url);
              })
              .map(function (r) {
                return cache.delete(r);
              }),
          );
        });
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

/** Keep a downloaded page or shared file, only if it is exactly this build's. */
function keep(cache, key, res) {
  if (!res.ok || res.redirected || res.type !== "basic") return Promise.reject(new Error("fetch"));
  return res.arrayBuffer().then(function (buf) {
    return hex(buf).then(function (h) {
      if (h !== expected(key)) {
        self.registration.update(); // the site is newer than this worker
        throw new Error("version");
      }
      var type = ASSET[key] ? ASSET_TYPES[key.split(".").pop()] : "text/html; charset=utf-8";
      // A fresh Response: the stored copy keeps no URL or query string.
      return cache.put(key, new Response(buf, { headers: { "Content-Type": type, "X-Saved-At": today() } }));
    });
  });
}

function savePage(cache, key) {
  return fetch(key, { cache: "no-cache" }).then(function (res) {
    return keep(cache, key, res);
  });
}

/** Only a plain date is ever put into a page (the header isn't covered by the hash). */
function safeDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "";
}

function saveAll() {
  return caches.open(CACHE).then(function (cache) {
    return Promise.all(
      Object.keys(EXPECTED)
        .concat(Object.keys(ASSET))
        .map(function (key) {
          return savePage(cache, key);
        }),
    ).then(function () {
      return cache.put(MARKER, new Response(today()));
    });
  });
}

/** The saved copy of `key` with a "saved copy" banner, or null if missing or not this build's. */
function savedCopy(key) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(key).then(function (hit) {
      if (!hit) return null;
      var date = safeDate(hit.headers.get("X-Saved-At"));
      return hit.arrayBuffer().then(function (buf) {
        return hex(buf).then(function (h) {
          if (h !== EXPECTED[key]) return null;
          var html = new TextDecoder().decode(buf);
          var banner = '<p class="savedcopy" role="note">' + WORDS.banner.replace("{date}", date) + "</p>";
          html = html.replace(/(<main\b[^>]*>)/, "$1" + banner);
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        });
      });
    });
  });
}

/** The saved copy of a shared file, or null if missing or not this build's. */
function savedAsset(key) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(key).then(function (hit) {
      if (!hit) return null;
      return hit.arrayBuffer().then(function (buf) {
        return hex(buf).then(function (h) {
          return h === ASSET[key] ? new Response(buf, { headers: { "Content-Type": hit.headers.get("Content-Type") } }) : null;
        });
      });
    });
  });
}

function offlinePage() {
  var html =
    '<!doctype html><html lang="' + LANG + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + WORDS.offlineTitle + "</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 16px}</style></head><body>" +
    "<h1>" + WORDS.offlineTitle + "</h1><p>" + WORDS.offlineText + '</p><p><a href="' + SCOPE + '">' + WORDS.home + "</a></p></body></html>";
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  // The shared stylesheet and script: their names change with their content,
  // so a verified saved copy is always right (and works offline).
  var asset = new URL(req.url).origin === ORIGIN ? ORIGIN + new URL(req.url).pathname : "";
  if (ASSET[asset]) {
    event.respondWith(
      savedAsset(asset).then(function (copy) {
        return copy || fetch(req);
      }),
    );
    return;
  }
  if (req.mode !== "navigate") return;
  var key = keyFor(req.url);
  if (!EXPECTED[key]) return; // not one of this folder's pages: the browser handles it
  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(MARKER).then(function (saved) {
        if (!saved) return fetch(req); // nothing saved: behave like a normal page load
        // Always ask the site (a 304 when nothing changed), never the browser's
        // own short-term cache: offline, that would show a page without the
        // "saved copy" banner. Redirects (…/page → …/page/) go back to the browser.
        var network = fetch(req.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" });
        // Keep the saved copy current (verified), and drop pages the site removed.
        event.waitUntil(
          network
            .then(function (res) {
              if (res.status === 404 || res.status === 410) return cache.delete(key);
              if (res.ok) return keep(cache, key, res.clone());
            })
            .catch(function () {}),
        );
        var fromNetwork = network.then(
          function (res) {
            if (res.status >= 500) {
              return savedCopy(key).then(function (copy) {
                return copy || res;
              });
            }
            return res;
          },
          function () {
            return savedCopy(key).then(function (copy) {
              return copy || offlinePage();
            });
          },
        );
        var slow = new Promise(function (resolve) {
          setTimeout(resolve, WAIT_MS);
        }).then(function () {
          return savedCopy(key).then(function (copy) {
            return copy || fromNetwork;
          });
        });
        return Promise.race([fromNetwork, slow]);
      });
    }),
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  var reply = function (msg) {
    if (event.source) event.source.postMessage(msg);
  };
  if (data.type === "status") {
    event.waitUntil(
      caches.open(CACHE).then(function (cache) {
        return cache.match(MARKER).then(function (m) {
          if (!m) return reply({ type: "status", saved: false });
          return m.text().then(function (date) {
            reply({ type: "status", saved: true, date: safeDate(date) });
            // After a site update, quietly bring saved pages up to this build.
            return Promise.all(
              Object.keys(EXPECTED)
                .map(function (key) {
                  return savedCopy(key);
                })
                .concat(
                  Object.keys(ASSET).map(function (key) {
                    return savedAsset(key);
                  }),
                ),
            ).then(function (copies) {
              if (copies.some(function (c) { return !c; })) return saveAll().catch(function () {});
            });
          });
        });
      }),
    );
  } else if (data.type === "save") {
    event.waitUntil(
      saveAll().then(
        function () {
          reply({ type: "saved", date: today() });
        },
        function (err) {
          reply({ type: "failed", reason: err && err.name === "QuotaExceededError" ? "space" : "network" });
        },
      ),
    );
  } else if (data.type === "clear") {
    event.waitUntil(
      caches
        .delete(CACHE)
        .then(function () {
          return self.registration.unregister();
        })
        .then(function () {
          reply({ type: "cleared" });
        }),
    );
  }
});
