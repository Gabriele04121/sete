// Scarica da OpenStreetMap i luoghi notevoli di Roma (monumenti, chiese, piazze, musei, parchi...)
// e li salva in luoghi.json. Durante la navigazione l'app li indica quando ci passi accanto:
// "Alla tua destra: Colosseo". Si tengono solo quelli con una pagina Wikipedia, così sono davvero notevoli
// e l'app può mostrare una riga di descrizione. La usa la GitHub Action settimanale.
// Uso: node strumenti/luoghi.mjs
// Prova senza rete: SETE_PROVA=risposta.json SETE_USCITA=prova.json node strumenti/luoghi.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const RIQUADRO = '41.65,12.23,42.10,12.86'; // sud, ovest, nord, est: lo stesso di app.js
const SERVER = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const FILE = process.env.SETE_USCITA ? new URL(process.env.SETE_USCITA, 'file://' + process.cwd() + '/') : new URL('../luoghi.json', import.meta.url);

// Una sola ricerca semplice e veloce: tutto ciò che ha nome e pagina Wikipedia nel riquadro.
// Le categorie che contano si scelgono dopo, qui nello script (vedi notevole()).
const domanda = '[out:json][timeout:300];nwr["wikipedia"]["name"](' + RIQUADRO + ');out center bb tags qt;';

// Monumenti, chiese, musei, parchi, piazze, fontane, ponti... ma non strade, fermate, scuole o negozi.
function notevole(t) {
  if (t.historic && !/^(memorial|wayside_cross|wayside_shrine|boundary_stone|milestone|stone|district)$/.test(t.historic)) return true;
  if (/^(attraction|museum|viewpoint|gallery|artwork)$/.test(t.tourism || '')) return true;
  if (/^(place_of_worship|fountain|theatre)$/.test(t.amenity || '')) return true;
  if (/^(park|garden)$/.test(t.leisure || '')) return true;
  if (t.place === 'square') return true;
  if (/^(church|cathedral|basilica|chapel|palace|castle)$/.test(t.building || '')) return true;
  if (/^(obelisk|bridge|lighthouse)$/.test(t.man_made || '')) return true;
  if (t.bridge && t.bridge !== 'no' && t.highway) return true;
  return false;
}

// Genere, per scegliere l'icona nell'app: c chiesa, m museo, p parco, f fontana, q piazza, n monumento, v panorama.
function genere(t) {
  if (t.amenity === 'place_of_worship' || /church|cathedral|basilica/.test(t.building || '') || t.landuse === 'religious') return 'c';
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'm';
  if (t.leisure === 'park' || t.leisure === 'garden') return 'p';
  if (t.amenity === 'fountain') return 'f';
  if (t.place === 'square') return 'q';
  if (t.tourism === 'viewpoint') return 'v';
  return 'n';
}

const RAD = Math.PI / 180;
function metri(aLat, aLon, bLat, bLon) {
  const x = (bLon - aLon) * RAD * Math.cos(((aLat + bLat) / 2) * RAD);
  const y = (bLat - aLat) * RAD;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Ogni luogo: [lat, lon, nome, wikipedia ("it:Colosseo"), raggio in metri, genere].
// Il raggio serve per le cose grandi (il Colosseo, un parco): si annunciano quando ne sei vicino al bordo.
export function leggiLuoghi(json) {
  const perTitolo = new Map();
  for (const el of json.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !t.name || !t.wikipedia || !notevole(t)) continue;
    if (!/^[a-z-]{2,12}:.+/.test(t.wikipedia)) continue;
    let raggio = 0;
    if (el.bounds) {
      const b = el.bounds;
      const larg = metri(b.minlat, b.minlon, b.minlat, b.maxlon);
      const alt = metri(b.minlat, b.minlon, b.maxlat, b.minlon);
      raggio = Math.min(250, Math.round(Math.sqrt(larg * alt) / 2));
    }
    const nome = t['name:it'] || t.name;
    const luogo = [+lat.toFixed(5), +lon.toFixed(5), nome, t.wikipedia, raggio, genere(t)];
    // lo stesso luogo può arrivare come punto, area e relazione: si tiene il più grande
    const prima = perTitolo.get(t.wikipedia);
    if (!prima || raggio > prima[4]) perTitolo.set(t.wikipedia, luogo);
  }
  // le aree enormi (parchi regionali, quartieri) non hanno senso come "alla tua destra"
  const luoghi = [...perTitolo.values()].filter((l) => l[4] < 250);
  luoghi.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));
  return luoghi;
}

async function principale() {
  let json = null;
  if (process.env.SETE_PROVA) {
    json = JSON.parse(await readFile(process.env.SETE_PROVA, 'utf8'));
  } else {
    for (const server of SERVER) {
      try {
        const r = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'sete-fontanelle/1.0' },
          body: 'data=' + encodeURIComponent(domanda),
          signal: AbortSignal.timeout(330000)
        });
        if (!r.ok) throw new Error(server + ': HTTP ' + r.status);
        json = await r.json();
        break;
      } catch (e) { console.error(String(e)); }
    }
  }
  if (!json) { console.error('Nessun server ha risposto: luoghi.json resta com\'era.'); return; }
  const luoghi = leggiLuoghi(json);
  if (!process.env.SETE_PROVA && luoghi.length < 200) {
    console.error('Solo ' + luoghi.length + ' luoghi, risposta sospetta: luoghi.json resta com\'era.');
    return;
  }
  let prima = null;
  try { prima = JSON.parse(await readFile(FILE, 'utf8')); } catch { /* primo giro */ }
  if (prima && JSON.stringify(prima.luoghi) === JSON.stringify(luoghi)) {
    console.log('Nessuna novità: ' + luoghi.length + ' luoghi, file invariato.');
    return;
  }
  await writeFile(FILE, JSON.stringify({ quando: Date.now(), luoghi }) + '\n');
  console.log('Salvati ' + luoghi.length + ' luoghi.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await principale();
