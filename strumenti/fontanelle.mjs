// Scarica le fontanelle di Roma da OpenStreetMap e le salva in fontanelle.json,
// la copia pronta che l'app legge al primo avvio. La usa la GitHub Action settimanale.
// Uso: node strumenti/fontanelle.mjs
import { readFile, writeFile } from 'node:fs/promises';

const RIQUADRO = '41.65,12.23,42.10,12.86'; // sud, ovest, nord, est: lo stesso di app.js
const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const FILE = new URL('../fontanelle.json', import.meta.url);

const domanda = '[out:json][timeout:90];(' +
  'nwr["amenity"="drinking_water"](' + RIQUADRO + ');' +
  'nwr["amenity"="fountain"]["drinking_water"="yes"](' + RIQUADRO + ');' +
  ');out center tags qt;';

// Stesse regole di app.js: [lat, lon, tipo, nome], tipo n = nasone, f = fontanella, m = fontana.
function leggi(json) {
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
    punti.push([+lat.toFixed(5), +lon.toFixed(5), tipo, t.name || '']);
  }
  // ordine stabile, così il file cambia solo quando cambiano davvero i dati
  punti.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return punti;
}

let punti = null, errore = null;
for (const server of SERVER) {
  try {
    const r = await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sete-fontanelle/1.0' },
      body: 'data=' + encodeURIComponent(domanda),
      signal: AbortSignal.timeout(120000)
    });
    if (!r.ok) throw new Error(server + ': HTTP ' + r.status);
    punti = leggi(await r.json());
    if (punti.length < 500) throw new Error(server + ': solo ' + punti.length + ' punti, risposta sospetta');
    break;
  } catch (e) { errore = e; punti = null; console.error(String(e)); }
}
if (!punti) { console.error('Nessun server ha risposto.'); process.exit(1); }

let prima = null;
try { prima = JSON.parse(await readFile(FILE, 'utf8')); } catch { /* primo giro */ }
if (prima && JSON.stringify(prima.punti) === JSON.stringify(punti)) {
  console.log('Nessuna novità: ' + punti.length + ' punti, file invariato.');
} else {
  await writeFile(FILE, JSON.stringify({ quando: Date.now(), punti }) + '\n');
  console.log('Salvati ' + punti.length + ' punti in fontanelle.json.');
}
