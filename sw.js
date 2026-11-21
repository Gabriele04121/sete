// Sete: funzionamento offline.
// Cambia il numero di versione quando modifichi i file, così il telefono scarica quelli nuovi.
const VERSIONE = 'sete-v10';
const MAPPA = 'sete-mappa';
const MAX_TASSELLI = 1500;

const FILE = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css',
  'fonts/big-shoulders.woff2', 'fonts/hanken-grotesk.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE && n !== MAPPA).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function sfoltisci() {
  const c = await caches.open(MAPPA);
  const chiavi = await c.keys();
  for (let i = 0; i < chiavi.length - MAX_TASSELLI; i++) await c.delete(chiavi[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Mappa (stile, tasselli, caratteri): prima la rete per lo stile, prima la copia salvata per il resto.
  if (url.hostname === 'tiles.openfreemap.org' || url.hostname === 'tile.openstreetmap.org') {
    const stile = url.pathname.indexOf('/styles/') === 0;
    e.respondWith(
      caches.open(MAPPA).then(async (c) => {
        const salvato = await c.match(req);
        if (salvato && !stile) return salvato;
        try {
          const risposta = await fetch(req);
          if (risposta.ok) { c.put(req, risposta.clone()); sfoltisci(); }
          return risposta;
        } catch (err) {
          if (salvato) return salvato;
          throw err;
        }
      })
    );
    return;
  }

  // Fontanelle pronte: prima la rete, così l'app vede subito l'ultima copia pubblicata.
  if (url.origin === self.location.origin && url.pathname.endsWith('/fontanelle.json')) {
    e.respondWith(
      caches.open(VERSIONE).then(async (c) => {
        try {
          const r = await fetch(req.url, { cache: 'no-cache' });
          if (r.ok) c.put(req, r.clone());
          return r;
        } catch (err) {
          const salvato = await c.match(req, { ignoreSearch: true });
          if (salvato) return salvato;
          throw err;
        }
      })
    );
    return;
  }

  // File dell'app: copia salvata subito, aggiornamento in sottofondo.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(VERSIONE).then(async (c) => {
        const salvato = await c.match(req, { ignoreSearch: true });
        const rete = fetch(req.url, { cache: 'no-cache' }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => salvato);
        return salvato || rete;
      })
    );
  }
});
