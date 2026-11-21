// Scarica le fontanelle di Roma da OpenStreetMap e le salva in fontanelle.json,
// la copia pronta che l'app legge al primo avvio. La usa la GitHub Action settimanale.
// Per ogni fontanella calcola anche la strada con nome più vicina (con le strade scaricate da Overpass,
// niente Nominatim) e le cose che offre (borraccia, cani, carrozzina, stagionale).
// Uso: node strumenti/fontanelle.mjs
// Prova senza rete: SETE_PROVA=risposte.json node strumenti/fontanelle.mjs
//   dove risposte.json è {"fontanelle": <risposta Overpass>, "strade": <risposta Overpass con out geom>}
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RIQUADRO = '41.65,12.23,42.10,12.86'; // sud, ovest, nord, est: lo stesso di app.js
const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const FILE = new URL('../fontanelle.json', import.meta.url);
const LIMITE_STRADA = 60; // metri: oltre questa distanza la strada non conta

const domandaFontanelle = '[out:json][timeout:90];(' +
  'nwr["amenity"="drinking_water"](' + RIQUADRO + ');' +
  'nwr["amenity"="fountain"]["drinking_water"="yes"](' + RIQUADRO + ');' +
  ');out center tags qt;';

// Strade, piazze e aree pedonali con nome. Risposta grossa (decine di MB): timeout e maxsize generosi.
const domandaStrade = '[out:json][timeout:240][maxsize:1073741824];(' +
  'way["highway"]["name"](' + RIQUADRO + ');' +
  'way["place"="square"]["name"](' + RIQUADRO + ');' +
  'way["leisure"="pedestrian"]["name"](' + RIQUADRO + ');' +
  ');out geom tags qt;';

// Lettere dei servizi: b borraccia, c cani, r carrozzina sì, x carrozzina no, s stagionale o con orari.
function servizi(t) {
  let e = '';
  if (t.bottle === 'yes') e += 'b';
  if (t.dog === 'yes') e += 'c';
  if (t.wheelchair === 'yes') e += 'r';
  else if (t.wheelchair === 'no') e += 'x';
  if ((t.seasonal && t.seasonal !== 'no') || t.opening_hours) e += 's';
  return e;
}

// Stesse regole di app.js: [lat, lon, tipo, nome, strada, extra], tipo n = nasone, f = fontanella, m = fontana.
export function leggi(json) {
  const punti = [];
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags || {};
    if (t.access === 'private' || t.access === 'no' || t.access === 'customers') continue;
    let tipo = 'f';
    if (t.amenity === 'fountain') tipo = 'm';
    else if (t.fountain === 'nasone' || /nasone/i.test(t['drinking_water:type'] || '')) tipo = 'n';
    punti.push([+lat.toFixed(5), +lon.toFixed(5), tipo, t.name || '', '', servizi(t)]);
  }
  // ordine stabile, così il file cambia solo quando cambiano davvero i dati
  punti.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return punti;
}

// Per ogni punto trova la strada con nome più vicina (entro LIMITE_STRADA metri) e la scrive in p[4].
// Griglia spaziale sulle fontanelle: ogni segmento di strada controlla solo le celle che tocca.
export function assegnaStrade(punti, json, limite = LIMITE_STRADA) {
  if (!punti.length) return 0;
  const lat0 = punti.reduce((s, p) => s + p[0], 0) / punti.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const CELLA = 100; // metri
  const cx = (x) => Math.floor(x / CELLA);
  const griglia = new Map();
  const px = new Float64Array(punti.length), py = new Float64Array(punti.length);
  punti.forEach((p, i) => {
    px[i] = p[1] * kx; py[i] = p[0] * ky;
    const k = cx(px[i]) * 1e6 + cx(py[i]);
    const c = griglia.get(k);
    if (c) c.push(i); else griglia.set(k, [i]);
  });
  const migliore = new Float64Array(punti.length).fill(Infinity);
  const nome = new Array(punti.length).fill('');

  for (const w of json.elements || []) {
    const n = w.tags && w.tags.name, g = w.geometry;
    if (!n || !g || g.length < 1) continue;
    for (let s = 0; s < Math.max(1, g.length - 1); s++) {
      const a = g[s], b = g[Math.min(s + 1, g.length - 1)];
      if (!a || !b) continue;
      const ax = a.lon * kx, ay = a.lat * ky, bx = b.lon * kx, by = b.lat * ky;
      const x0 = cx(Math.min(ax, bx) - limite), x1 = cx(Math.max(ax, bx) + limite);
      const y0 = cx(Math.min(ay, by) - limite), y1 = cx(Math.max(ay, by) + limite);
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const c = griglia.get(gx * 1e6 + gy);
        if (!c) continue;
        for (const i of c) {
          let u = l2 ? ((px[i] - ax) * dx + (py[i] - ay) * dy) / l2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = px[i] - (ax + u * dx), ey = py[i] - (ay + u * dy);
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d < migliore[i]) { migliore[i] = d; nome[i] = n; }
        }
      }
    }
  }
  let trovate = 0;
  punti.forEach((p, i) => {
    if (migliore[i] <= limite) { p[4] = nome[i]; trovate++; }
  });
  return trovate;
}

async function chiedi(domanda, attesa) {
  let ultimo;
  for (const server of SERVER) {
    try {
      const r = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sete-fontanelle/1.0' },
        body: 'data=' + encodeURIComponent(domanda),
        signal: AbortSignal.timeout(attesa)
      });
      if (!r.ok) throw new Error(server + ': HTTP ' + r.status);
      return await r.json();
    } catch (e) { ultimo = e; console.error(String(e)); }
  }
  throw ultimo || new Error('nessun server');
}

async function principale() {
  let punti = null, jsonStrade = null;
  if (process.env.SETE_PROVA) {
    const prova = JSON.parse(await readFile(process.env.SETE_PROVA, 'utf8'));
    punti = leggi(prova.fontanelle);
    jsonStrade = prova.strade;
  } else {
    try {
      punti = leggi(await chiedi(domandaFontanelle, 120000));
      if (punti.length < 500) throw new Error('solo ' + punti.length + ' punti, risposta sospetta');
    } catch (e) { console.error(String(e)); console.error('Nessun server ha risposto.'); process.exit(1); }
  }

  let prima = null;
  try { prima = JSON.parse(await readFile(FILE, 'utf8')); } catch { /* primo giro */ }

  try {
    if (!jsonStrade) jsonStrade = await chiedi(domandaStrade, 300000);
    const n = assegnaStrade(punti, jsonStrade);
    console.log('Strade trovate per ' + n + ' punti su ' + punti.length + '.');
    jsonStrade = null; // libera la memoria
  } catch (e) {
    // Senza strade nuove si tengono quelle del giro precedente, dove il punto è lo stesso.
    console.error('Strade non scaricate (' + e + '): riuso quelle del file precedente.');
    const vecchie = new Map();
    for (const p of (prima && prima.punti) || []) if (p[4]) vecchie.set(p[0] + ',' + p[1], p[4]);
    for (const p of punti) p[4] = vecchie.get(p[0] + ',' + p[1]) || '';
  }

  if (prima && JSON.stringify(prima.punti) === JSON.stringify(punti)) {
    console.log('Nessuna novità: ' + punti.length + ' punti, file invariato.');
  } else {
    const uscita = process.env.SETE_USCITA ? new URL('file://' + process.env.SETE_USCITA) : FILE;
    await writeFile(uscita, JSON.stringify({ quando: Date.now(), punti }) + '\n');
    console.log('Salvati ' + punti.length + ' punti in ' + (process.env.SETE_USCITA || 'fontanelle.json') + '.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await principale();
