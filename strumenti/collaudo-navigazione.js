#!/usr/bin/env node
'use strict';
/*
 * Banco di collaudo della navigazione guidata di Sete ("Vai").
 *
 *   node strumenti/collaudo-navigazione.js <cartella-repo> <cartella-output> [opzioni]
 *
 * Opzioni:
 *   --scenario partenza|cammino|salto|svolta-sbagliata|completo|tutti   (anche elenco con virgole; predefinito: tutti)
 *   --fattore N     accelera i fix GPS di N volte (predefinito 1 = tempo reale). Attenzione: l'app usa i suoi
 *                   timer reali (ricalcolo ogni 10 s, animazioni da 1 s), quindi con N > 1 le misure sono solo indicative.
 *   --seme N        seme del generatore casuale (predefinito: SEME qui sotto)
 *   --paralleli N   quanti scenari eseguire insieme (predefinito 1: in parallelo il carico della CPU falsa i tempi)
 *   --tassello F    immagine PNG usata per i tasselli della mappa (predefinito strumenti/dati-collaudo/griglia.png)
 *
 * Serve il repo su https://sete.test/ (https serve per la geolocalizzazione), simula percorsi OSRM, luoghi, Wikipedia
 * e tasselli, simula un telefono 390x800 con tracce GPS a 1 Hz rumorose e misura banner, richieste, segno dell'utente.
 * Esce con codice 1 se le soglie qui sotto non sono rispettate, 2 se il banco stesso si rompe.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// ===================== SOGLIE DI ACCETTAZIONE (modificabili) =====================
const SOGLIE = {
  falsiFuoriStradaMax: 0,        // secondi totali di "fuori strada" quando non lo si è davvero
  rilevazioneSvoltaMaxS: 20,     // la svolta sbagliata vera va segnalata entro questi secondi dall'inizio della deviazione
  erroreSegnoPx: 80,             // il segno dell'utente non deve stare oltre questi pixel dal punto atteso...
  erroreSegnoQuotaMax: 0.10,     // ...per più di questa quota dei campioni dopo l'avvio
  erroriConsoleMax: 0            // errori in console o pageerror
};

// ===================== PARAMETRI DEL BANCO =====================
const SEME = 20241122;
const VIEWPORT = { width: 390, height: 800 };
const VELOCITA = 1.3;            // m/s, passo a piedi
const SIGMA_GPS = 8;             // m, deviazione standard del rumore del GPS
const RHO_GPS = 0.6;             // correlazione tra fix consecutivi (l'errore vero del GPS non è bianco); 0 = indipendenti
const ACCURATEZZA = [15, 40];    // m, intervallo dell'accuratezza dichiarata
const DISTANZA_CORTILE = 35;     // m, partenza lontana dalla strada
const SALTO_M = 65;              // m, salto singolo (un solo fix)
const SOSTA_S = 20;              // s, sosta con oscillazioni
const OSCILLAZIONE_SOSTA_M = 4;  // m, oscillazione in più durante la sosta
const SVOLTA_ERRATA_M = 150;     // m percorsi oltre la svolta prima di tornare indietro
const DEVIAZIONE_VERA_M = 50;    // m dal percorso previsto: oltre, si è davvero fuori strada
const VICINO_M = 25;             // m dal percorso previsto: entro, si è davvero sulla strada (zona grigia in mezzo)
const ATTESA_AVVIO_S = 4;        // s fermi in partenza dopo "Vai"
const CODA_S = 25;               // s dopo l'ultimo punto, per far scattare l'arrivo
const STACCO_AVVIO_S = 3;        // s dopo "Vai" esclusi dalla misura del segno (volo iniziale della camera da 2,2 s)
const PUNTO_ATTESO_Y = 0.64;     // altezza attesa del segno, frazione dell'altezza della mappa
const SALTO_SEGNO_PX = 30;       // salto del segno tra due campioni
const LATENZA_PERCORSI_MS = 350; // ritardo del finto servizio percorsi
const SCENARI = ['partenza', 'cammino', 'salto', 'svolta-sbagliata', 'completo'];

// ===================== UTILITÀ =====================
const RAD = Math.PI / 180;
const dormi = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
function metri(la1, lo1, la2, lo2) {
  const dla = (la2 - la1) * RAD, dlo = (lo2 - lo1) * RAD;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dlo / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}
const piano = (la, lo) => [lo * RAD * Math.cos(41.9 * RAD) * 6371000, la * RAD * 6371000];
function dalPiano(x, y) { return [y / (RAD * 6371000), x / (RAD * Math.cos(41.9 * RAD) * 6371000)]; }
function gradi(la1, lo1, la2, lo2) {
  const a = piano(la1, lo1), b = piano(la2, lo2);
  return (Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD + 360) % 360;
}
const angoloRel = (d) => ((d % 360) + 540) % 360 - 180;
function mulberry32(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussiana(rnd) {
  let u = 0; while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const arr = (n, d = 1) => (n == null || !isFinite(n) ? null : +n.toFixed(d));
function stat(v) {
  const x = v.filter((n) => n != null && isFinite(n)).sort((a, b) => a - b);
  if (!x.length) return { n: 0, media: null, max: null, p95: null, mediana: null };
  return { n: x.length, media: arr(x.reduce((s, n) => s + n, 0) / x.length), max: arr(x[x.length - 1]), p95: arr(x[Math.min(x.length - 1, Math.floor(x.length * 0.95))]), mediana: arr(x[Math.floor(x.length / 2)]) };
}

// ===================== MONDO FINTO: STRADE DEL CENTRO DI ROMA =====================
// Coordinate plausibili (non rilievi): Piazza Venezia, Via del Corso verso nord, Via delle Muratte verso Trevi.
const GIUNZIONE = [41.90040, 12.47968];                      // dove Via delle Muratte si stacca dal Corso
const DEST = [41.90105, 12.48298];                           // la fontanella di destinazione, accanto a Trevi
const STRADE_GREZZE = [
  { nome: 'Piazza Venezia', pts: [[41.89600, 12.48300], [41.89625, 12.48200], [41.89660, 12.48110]] },
  { nome: 'Via del Corso', id: 'corso-sud', pts: [[41.89660, 12.48110], [41.89720, 12.48080], [41.89800, 12.48045], [41.89880, 12.48015], [41.89960, 12.47990], GIUNZIONE] },
  { nome: 'Via del Corso', id: 'corso-nord', pts: [GIUNZIONE, [41.90120, 12.47945], [41.90200, 12.47925], [41.90280, 12.47905]] },
  { nome: 'Via delle Muratte', pts: [GIUNZIONE, [41.90046, 12.48040], [41.90060, 12.48110], [41.90074, 12.48190], [41.90086, 12.48260], [41.90095, 12.48315]] }
];
const r6 = (n) => +n.toFixed(6);
// Ogni strada diventa una linea con un punto circa ogni 12 m (decine di punti, come OSRM).
const STRADE = STRADE_GREZZE.map((s) => {
  const pts = [];
  for (let k = 0; k < s.pts.length - 1; k++) {
    const [a, b] = [s.pts[k], s.pts[k + 1]], n = Math.max(1, Math.round(metri(a[0], a[1], b[0], b[1]) / 12));
    for (let i = 0; i < n; i++) pts.push([r6(a[0] + (b[0] - a[0]) * i / n), r6(a[1] + (b[1] - a[1]) * i / n)]);
  }
  pts.push([r6(s.pts[s.pts.length - 1][0]), r6(s.pts[s.pts.length - 1][1])]);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + metri(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]));
  return { nome: s.nome, id: s.id || s.nome, pts, cum, lung: cum[cum.length - 1] };
});
const strada = (id) => STRADE.find((s) => s.id === id);

// Punto a m metri dall'inizio della strada e direzione di marcia lì.
function sulla(s, m) {
  m = Math.max(0, Math.min(s.lung, m));
  for (let k = 0; k < s.pts.length - 1; k++) {
    if (s.cum[k + 1] >= m) {
      const t = s.cum[k + 1] > s.cum[k] ? (m - s.cum[k]) / (s.cum[k + 1] - s.cum[k]) : 0;
      return { lat: s.pts[k][0] + t * (s.pts[k + 1][0] - s.pts[k][0]), lon: s.pts[k][1] + t * (s.pts[k + 1][1] - s.pts[k][1]), dir: gradi(s.pts[k][0], s.pts[k][1], s.pts[k + 1][0], s.pts[k + 1][1]) };
    }
  }
  const u = s.pts[s.pts.length - 1];
  return { lat: u[0], lon: u[1], dir: 0 };
}
// Punti campionati ogni ~4 m tra da e a (anche all'indietro).
function tratto(s, da, a, fase) {
  const n = Math.max(2, Math.ceil(Math.abs(a - da) / 4)), out = [];
  for (let i = 0; i <= n; i++) { const p = sulla(s, da + (a - da) * i / n); out.push({ lat: p.lat, lon: p.lon, fase }); }
  return out;
}
function proiezione(s, lat, lon) {
  const q = piano(lat, lon);
  let mig = { d: Infinity, m: 0 };
  for (let k = 0; k < s.pts.length - 1; k++) {
    const a = piano(s.pts[k][0], s.pts[k][1]), b = piano(s.pts[k + 1][0], s.pts[k + 1][1]);
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    const d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
    if (d < mig.d) mig = { d, m: s.cum[k] + t * (s.cum[k + 1] - s.cum[k]) };
  }
  return mig;
}
// Punto a "d" metri a destra della direzione di marcia (un cortile sul lato est della strada).
function aDestra(p, d) {
  const q = piano(p.lat, p.lon), r = (p.dir + 90) * RAD;
  const [la, lo] = dalPiano(q[0] + d * Math.sin(r), q[1] + d * Math.cos(r));
  return { lat: la, lon: lo };
}

// ----- il finto OSRM: grafo delle strade, aggancio al punto più vicino, Dijkstra -----
const NODI = [], IDX = new Map(), ARCHI = [];
function nodo(la, lo) { const k = la.toFixed(6) + ',' + lo.toFixed(6); if (!IDX.has(k)) { IDX.set(k, NODI.length); NODI.push([la, lo]); } return IDX.get(k); }
STRADE.forEach((s) => { for (let k = 0; k < s.pts.length - 1; k++) ARCHI.push({ a: nodo(s.pts[k][0], s.pts[k][1]), b: nodo(s.pts[k + 1][0], s.pts[k + 1][1]), nome: s.nome }); });

function percorsoOsrm(oLat, oLon, dLat, dLon) {
  const nodi = NODI.slice(), archi = ARCHI.slice();
  function aggancia(la, lo) {
    const q = piano(la, lo);
    let mig = { d: Infinity };
    archi.forEach((e, i) => {
      const a = piano(nodi[e.a][0], nodi[e.a][1]), b = piano(nodi[e.b][0], nodi[e.b][1]);
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      const d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
      if (d < mig.d) mig = { d, i, t };
    });
    const e = archi[mig.i], A = nodi[e.a], B = nodi[e.b];
    const id = nodi.length;
    nodi.push([A[0] + mig.t * (B[0] - A[0]), A[1] + mig.t * (B[1] - A[1])]);
    archi.splice(mig.i, 1, { a: e.a, b: id, nome: e.nome }, { a: id, b: e.b, nome: e.nome });
    return id;
  }
  const so = aggancia(oLat, oLon), sd = aggancia(dLat, dLon);
  const adj = nodi.map(() => []);
  archi.forEach((e) => {
    const l = metri(nodi[e.a][0], nodi[e.a][1], nodi[e.b][0], nodi[e.b][1]);
    adj[e.a].push({ a: e.a, b: e.b, nome: e.nome, l }); adj[e.b].push({ a: e.b, b: e.a, nome: e.nome, l });
  });
  const dist = nodi.map(() => Infinity), prev = nodi.map(() => null), fatto = nodi.map(() => false);
  dist[so] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodi.length; i++) if (!fatto[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === sd) break;
    fatto[u] = true;
    adj[u].forEach((e) => { if (dist[u] + e.l < dist[e.b]) { dist[e.b] = dist[u] + e.l; prev[e.b] = e; } });
  }
  const sequenza = [];
  for (let c = sd; c !== so; c = prev[c].a) sequenza.unshift(prev[c]);
  const geom = [[nodi[so][1], nodi[so][0]]];
  sequenza.forEach((e) => {
    const p = nodi[e.b], u = geom[geom.length - 1];
    if (Math.abs(u[0] - p[1]) > 1e-9 || Math.abs(u[1] - p[0]) > 1e-9) geom.push([p[1], p[0]]);
  });
  // passi: un passo per ogni cambio di nome di strada
  const passi = [], reali = sequenza.filter((e) => e.l > 0.01);
  const direzione = (e) => gradi(nodi[e.a][0], nodi[e.a][1], nodi[e.b][0], nodi[e.b][1]);
  let corrente = { distance: 0, name: reali.length ? reali[0].nome : '', duration: 0, maneuver: { type: 'depart', modifier: 'straight', location: geom[0] } };
  reali.forEach((e, i) => {
    if (i > 0 && e.nome !== reali[i - 1].nome) {
      passi.push(corrente);
      const diff = angoloRel(direzione(e) - direzione(reali[i - 1])), ad = Math.abs(diff), lato = diff > 0 ? 'right' : 'left';
      const mod = ad < 20 ? 'straight' : ad < 60 ? 'slight ' + lato : ad < 120 ? lato : ad < 165 ? 'sharp ' + lato : 'uturn';
      corrente = { distance: 0, name: e.nome, duration: 0, maneuver: { type: ad < 20 ? 'new name' : 'turn', modifier: mod, location: [nodi[e.a][1], nodi[e.a][0]] } };
    }
    corrente.distance += e.l; corrente.duration += e.l / 1.3;
  });
  passi.push(corrente);
  const ult = reali[reali.length - 1], fin = geom[geom.length - 1];
  const dirU = ult ? direzione(ult) : 0, rel = angoloRel(gradi(fin[1], fin[0], dLat, dLon) - dirU);
  passi.push({ distance: 0, name: ult ? ult.nome : '', duration: 0, maneuver: { type: 'arrive', modifier: Math.abs(rel) < 20 ? 'straight' : rel > 0 ? 'right' : 'left', location: fin } });
  let tot = 0;
  for (let k = 1; k < geom.length; k++) tot += metri(geom[k - 1][1], geom[k - 1][0], geom[k][1], geom[k][0]);
  return {
    code: 'Ok',
    routes: [{ distance: tot, duration: tot / 1.3, weight: tot / 1.3, geometry: { type: 'LineString', coordinates: geom },
      legs: [{ distance: tot, duration: tot / 1.3, summary: passi.length > 1 ? passi[0].name : '', steps: passi }] }],
    waypoints: [{ name: passi[0].name, location: geom[0] }, { name: ult ? ult.nome : '', location: fin }]
  };
}

// ----- luoghi notevoli e riassunti -----
// [lat, lon, nome, "it:Titolo", raggio_m, genere]; generi: c chiesa, m palazzo/museo, p piazza, f fontana, n monumento
const LUOGHI = [
  [41.89460, 12.48320, 'Vittoriano', 'it:Vittoriano', 70, 'n'],
  [41.89640, 12.48030, 'Palazzo Venezia', 'it:Palazzo Venezia', 45, 'm'],
  [41.89720, 12.48060, 'Galleria Doria Pamphilj', 'it:Galleria Doria Pamphilj', 50, 'm'],
  [41.89810, 12.48000, 'Santa Maria in Via Lata', 'it:Santa Maria in Via Lata', 18, 'c'],
  [41.89960, 12.48060, 'San Marcello al Corso', 'it:San Marcello al Corso', 25, 'c'],
  [41.90070, 12.48000, 'Galleria Alberto Sordi', 'it:Galleria Alberto Sordi', 30, 'm'],
  [41.90095, 12.48010, 'Colonna di Marco Aurelio', 'it:Colonna di Marco Aurelio', 12, 'n'],
  [41.90105, 12.47960, 'Palazzo Chigi', 'it:Palazzo Chigi', 30, 'm'],
  [41.90085, 12.48300, 'Santi Vincenzo e Anastasio a Trevi', 'it:Santi Vincenzo e Anastasio a Trevi', 15, 'c'],
  [41.90093, 12.48331, 'Fontana di Trevi', 'it:Fontana di Trevi', 25, 'f'],
  [41.90100, 12.48350, 'Palazzo Poli', 'it:Palazzo Poli', 25, 'm'],
  // lontani dal percorso: non vanno annunciati
  [41.89860, 12.47690, 'Pantheon', 'it:Pantheon (Roma)', 40, 'm'],
  [41.90150, 12.47860, 'Piazza di Montecitorio', 'it:Piazza di Montecitorio', 40, 'p'],
  [41.90330, 12.47360, 'Mausoleo di Augusto', 'it:Mausoleo di Augusto', 50, 'n']
];
const RIASSUNTI = {
  'Vittoriano': 'Il Vittoriano, o Altare della Patria, è un monumento nazionale eretto a Roma in onore di Vittorio Emanuele II. Si affaccia su Piazza Venezia.',
  'Palazzo Venezia': 'Palazzo Venezia è un edificio rinascimentale di Roma, costruito a partire dal 1455. Fu sede dell’ambasciata della Repubblica di Venezia.',
  'Galleria Doria Pamphilj': 'La Galleria Doria Pamphilj è una pinacoteca privata di Roma, tra le più ricche collezioni d’arte della città. Si trova lungo Via del Corso.',
  'Santa Maria in Via Lata': 'Santa Maria in Via Lata è una chiesa di Roma che si affaccia su Via del Corso. Sotto la chiesa si trovano ambienti di epoca romana.',
  'San Marcello al Corso': 'San Marcello al Corso è una chiesa di Roma, rifatta nel Cinquecento, nota per il Crocifisso ligneo e per la facciata barocca.',
  'Galleria Alberto Sordi': 'La Galleria Alberto Sordi, già Galleria Colonna, è una galleria commerciale coperta di Roma, inaugurata nel 1922. Si affaccia su Piazza Colonna.',
  'Colonna di Marco Aurelio': 'La colonna di Marco Aurelio (in latino Columna Centenaria) è una colonna coclide eretta a Roma tra il 176 e il 192. Altro testo che viene tagliato.',
  'Palazzo Chigi': 'Palazzo Chigi è un edificio di Roma, sede della Presidenza del Consiglio dei ministri. Sorge su Piazza Colonna.',
  'Santi Vincenzo e Anastasio a Trevi': 'La chiesa dei Santi Vincenzo e Anastasio a Trevi è una chiesa barocca di Roma, di fronte alla Fontana di Trevi.',
  'Fontana di Trevi': 'La Fontana di Trevi è la più grande fontana barocca di Roma, progettata da Nicola Salvi e ultimata nel 1762. Altro testo.',
  'Palazzo Poli': 'Palazzo Poli è un edificio di Roma, la cui facciata fa da fondale alla Fontana di Trevi.'
};

function fontanelle(rnd) {
  const pts = [[DEST[0], DEST[1], 'n', '', 'Via delle Muratte', 'b']];
  const vie = ['Via Appia', 'Via Nomentana', 'Viale Trastevere', 'Via Tiburtina', 'Via Prenestina', 'Via Cassia', 'Viale Marconi', 'Via Salaria', 'Via Casilina', 'Via Ostiense'];
  const tipi = ['n', 'n', 'n', 'f', 'f', 'm'];
  while (pts.length < 400) {
    const la = 41.80 + rnd() * 0.19, lo = 12.40 + rnd() * 0.20;
    // lontano da tutta la zona del test, così la più vicina è sempre quella di destinazione
    if (metri(la, lo, DEST[0], DEST[1]) < 1600 || metri(la, lo, 41.8960, 12.4830) < 1600) continue;
    pts.push([r6(la), r6(lo), tipi[Math.floor(rnd() * tipi.length)], '', vie[Math.floor(rnd() * vie.length)], '']);
  }
  return { quando: Date.now(), punti: pts };
}

// ===================== TRACCE GPS =====================
// "tappe": [{pts:[{lat,lon,fase}]}, {sosta:s, fase}, {salto:true}] -> un punto vero per ogni secondo.
function espandi(tappe, attesaIniziale, coda) {
  const out = [];
  let ultimo = null, resto = 0, saltoPendente = false;
  const metti = (p, extra) => { out.push(Object.assign({ lat: p.lat, lon: p.lon, fase: p.fase }, extra || {})); ultimo = p; };
  tappe.forEach((t) => {
    if (t.salto) { saltoPendente = true; return; }
    if (t.sosta) { for (let i = 0; i < t.sosta; i++) metti({ lat: ultimo.lat, lon: ultimo.lon, fase: t.fase }, { sosta: true, i }); return; }
    const pts = t.pts;
    if (!ultimo) { for (let i = 0; i < attesaIniziale; i++) metti(pts[0]); ultimo = pts[0]; }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], L = metri(a.lat, a.lon, b.lat, b.lon);
      let d = resto;
      while (d < L) {
        const f = L > 0 ? d / L : 0;
        metti({ lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon), fase: b.fase }, saltoPendente ? { salto: true } : null);
        saltoPendente = false;
        d += VELOCITA;
      }
      resto = d - L;
    }
  });
  for (let i = 0; i < coda; i++) metti({ lat: ultimo.lat, lon: ultimo.lon, fase: 'arrivo' });
  return out;
}
// Aggiunge rumore gaussiano correlato (sigma, rho), accuratezza, oscillazioni della sosta e il salto.
function letture(vero, rnd) {
  const k = Math.sqrt(1 - RHO_GPS * RHO_GPS);
  let nx = gaussiana(rnd) * SIGMA_GPS, ny = gaussiana(rnd) * SIGMA_GPS;
  const fx = rnd() * 6.28, fy = rnd() * 6.28;
  return vero.map((v, i) => {
    nx = RHO_GPS * nx + k * SIGMA_GPS * gaussiana(rnd);
    ny = RHO_GPS * ny + k * SIGMA_GPS * gaussiana(rnd);
    let ex = nx, ey = ny;
    if (v.sosta) { ex += OSCILLAZIONE_SOSTA_M * Math.sin(i * 0.9 + fx); ey += OSCILLAZIONE_SOSTA_M * Math.sin(i * 0.7 + fy); }
    let acc = ACCURATEZZA[0] + rnd() * (ACCURATEZZA[1] - ACCURATEZZA[0]);
    if (v.salto) { ex += SALTO_M; acc = 25; }  // salto verso est, di lato alla strada
    const q = piano(v.lat, v.lon), [la, lo] = dalPiano(q[0] + ex, q[1] + ey);
    return { latitude: la, longitude: lo, accuracy: acc };
  });
}

function costruisciScenario(nome) {
  const PV = strada('Piazza Venezia'), CS = strada('corso-sud'), CN = strada('corso-nord'), MU = strada('Via delle Muratte');
  const sulMuratte = proiezione(MU, DEST[0], DEST[1]).m;     // dove la strada passa più vicino alla fontanella
  const ver = (l) => ({ lat: l[0], lon: l[1], fase: 'arrivo' });
  const arrivo = [{ pts: tratto(MU, 0, sulMuratte, 'muratte').concat([ver(DEST)]) }];
  let tappe, attesa = ATTESA_AVVIO_S, deviazione = false;
  if (nome === 'partenza') {
    // cortile a 35 m dal Corso: si esce in strada e si va avanti per un po'
    const s0 = 120, p = sulla(CS, s0), c = aDestra(p, DISTANZA_CORTILE);
    tappe = [{ pts: [{ lat: c.lat, lon: c.lon, fase: 'cortile' }, { lat: p.lat, lon: p.lon, fase: 'cortile' }] }, { pts: tratto(CS, s0, s0 + 110, 'cammino') }];
  } else if (nome === 'cammino') {
    const sosta = CS.lung * 0.5;
    tappe = [{ pts: tratto(PV, 0, PV.lung, 'cammino') }, { pts: tratto(CS, 0, sosta, 'cammino') }, { sosta: SOSTA_S, fase: 'sosta' },
      { pts: tratto(CS, sosta, CS.lung, 'cammino') }].concat(arrivo);
  } else if (nome === 'salto') {
    const s0 = CS.lung - 260;
    tappe = [{ pts: tratto(CS, s0, s0 + 30, 'cammino') }, { salto: true }, { pts: tratto(CS, s0 + 30, s0 + 130, 'cammino') }];
  } else if (nome === 'svolta-sbagliata') {
    deviazione = true;
    tappe = [{ pts: tratto(CS, CS.lung - 70, CS.lung, 'cammino') }, { pts: tratto(CN, 0, SVOLTA_ERRATA_M, 'sbagliata') },
      { pts: tratto(CN, SVOLTA_ERRATA_M, 0, 'rientro') }, { pts: tratto(MU, 0, 140, 'muratte') }];
  } else if (nome === 'completo') {
    deviazione = true;
    const c = aDestra(sulla(PV, PV.lung * 0.4), DISTANZA_CORTILE), p0 = sulla(PV, PV.lung * 0.4);
    tappe = [{ pts: [{ lat: c.lat, lon: c.lon, fase: 'cortile' }, { lat: p0.lat, lon: p0.lon, fase: 'cortile' }] },
      { pts: tratto(PV, PV.lung * 0.4, PV.lung, 'cammino') }, { pts: tratto(CS, 0, 190, 'cammino') }, { sosta: SOSTA_S, fase: 'sosta' },
      { pts: tratto(CS, 190, 250, 'cammino') }, { salto: true }, { pts: tratto(CS, 250, CS.lung, 'cammino') },
      { pts: tratto(CN, 0, SVOLTA_ERRATA_M, 'sbagliata') }, { pts: tratto(CN, SVOLTA_ERRATA_M, 0, 'rientro') }].concat(arrivo);
  } else throw new Error('scenario sconosciuto: ' + nome);
  const coda = nome === 'cammino' || nome === 'completo' ? CODA_S : 0;
  const vero = espandi(tappe, attesa, coda);
  const rnd = mulberry32(SEME_CORRENTE ^ hash(nome));
  const gps = letture(vero, rnd);
  // percorso "previsto" dall'utente: quello che il servizio darebbe dal vero punto di partenza
  const prev = percorsoOsrm(vero[0].lat, vero[0].lon, DEST[0], DEST[1]).routes[0].geometry.coordinates;
  const dalPrevisto = (la, lo) => {
    const q = piano(la, lo);
    let m = Infinity;
    for (let k = 0; k < prev.length - 1; k++) {
      const a = piano(prev[k][1], prev[k][0]), b = piano(prev[k + 1][1], prev[k + 1][0]);
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      m = Math.min(m, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
    }
    return m;
  };
  vero.forEach((v) => { v.dPrev = dalPrevisto(v.lat, v.lon); });
  return { nome, vero, gps, deviazione };
}
let SEME_CORRENTE = SEME;

// ===================== ESECUZIONE DI UNO SCENARIO =====================
// Funzione eseguita nella pagina: legge banner, segno dell'utente, luogo.
function leggiPagina(atteso) {
  const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : null; };
  const nasc = (s) => { const e = document.querySelector(s); return !e || e.hidden || e.offsetParent === null && getComputedStyle(e).position !== 'fixed'; };
  const mappa = document.getElementById('map').getBoundingClientRect();
  const io = document.querySelector('.io');
  const r = { banner: { dist: t('#guida-dist'), frase: t('#guida-frase'), poi: t('#guida-poi'), visibile: !nasc('#guida') },
    naviga: document.body.classList.contains('naviga'), arrivo: !nasc('#arrivo'),
    luogo: { visibile: !nasc('#luogo'), lato: t('#luogo-lato'), nome: t('#luogo-nome'), descr: t('#luogo-descr') },
    mappa: { x: mappa.left, y: mappa.top, w: mappa.width, h: mappa.height }, io: null };
  if (io) {
    const rc = io.getBoundingClientRect();
    const cs = getComputedStyle(io).transform;
    const M = cs && cs !== 'none' ? new DOMMatrix(cs) : new DOMMatrix();
    const pt = (m, x, y) => { const p = m.transformPoint(new DOMPoint(x, y, 0, 1)); return [p.x, p.y]; };
    const o0 = pt(M, 0, 0), su = pt(M, 0, -50);
    // MapLibre compone rotateX(inclinazione) e rotateZ(rotazione): m33 = cos(inclinazione)
    const cosInc = Math.max(-1, Math.min(1, M.m33)), incl = Math.acos(cosInc) * 180 / Math.PI;
    const fr = document.getElementById('freccia-io');
    let angFreccia = null, bboxF = null, frVisibile = false;
    if (fr) {
      const fcs = getComputedStyle(fr), F = fcs.transform && fcs.transform !== 'none' ? new DOMMatrix(fcs.transform) : new DOMMatrix();
      // punta della freccia (0,-50 nel suo riquadro 54x54 centrato in 0,0) dopo la rotazione propria e quella del segno
      const FM = M.multiply(F), n = pt(FM, 0, -50), z = pt(FM, 0, 0);
      angFreccia = Math.atan2(n[0] - z[0], -(n[1] - z[1])) * 180 / Math.PI;
      const b = fr.getBoundingClientRect();
      bboxF = [b.width, b.height];
      frVisibile = fcs.display !== 'none' && b.width > 0;
    }
    r.io = { x: rc.left, y: rc.top, nelloSchermo: rc.left >= 0 && rc.left <= innerWidth && rc.top >= 0 && rc.top <= innerHeight,
      appiattimento: cosInc, inclinazioneSegno: incl,
      rotazioneSegno: Math.atan2(-M.m21, M.m11) * 180 / Math.PI, angoloFreccia: angFreccia, bboxFreccia: bboxF, frecciaVisibile: frVisibile };
  }
  return r;
}

async function eseguiScenario(browser, nome, opz) {
  const sc = costruisciScenario(nome);
  const rnd = mulberry32(SEME_CORRENTE ^ hash('fontanelle'));
  const dati = fontanelle(rnd);
  const S = { vai: false, tSim: -1, richieste: [], abortite: new Set(), errori: [], avviso: [] };
  const N = sc.vero.length, intervallo = 1000 / opz.fattore;
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, serviceWorkers: 'block',
    geolocation: sc.gps[0], permissions: ['geolocation'] });
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'sete.test') {
      if (u.pathname === '/fontanelle.json') return route.fulfill({ json: dati });
      if (u.pathname === '/luoghi.json') return route.fulfill({ json: { quando: Date.now(), luoghi: LUOGHI } });
      const f = path.join(opz.repo, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      return fs.existsSync(f) && fs.statSync(f).isFile() ? route.fulfill({ path: f }) : route.fulfill({ status: 404, body: '' });
    }
    if (u.hostname === 'routing.openstreetmap.de') {
      const coord = u.pathname.split('/').pop().split(';').map((c) => c.split(',').map(Number));
      S.richieste.push({ dopoVai: !!S.vai, tSim: S.tSim, tReale: Date.now(), guida: u.search.includes('steps=true'), origine: [coord[0][1], coord[0][0]],
        vero: S.tSim >= 0 && sc.vero[Math.min(S.tSim, N - 1)] ? [sc.vero[Math.min(S.tSim, N - 1)].lat, sc.vero[Math.min(S.tSim, N - 1)].lon] : null });
      await dormi(LATENZA_PERCORSI_MS);
      try { return await route.fulfill({ json: percorsoOsrm(coord[0][1], coord[0][0], coord[1][1], coord[1][0]) }); } catch (e) { return route.abort(); }
    }
    if (u.hostname.endsWith('wikipedia.org') && u.pathname.includes('/page/summary/')) {
      const titolo = decodeURIComponent(u.pathname.split('/page/summary/')[1]).replace(/_/g, ' ');
      const testo = RIASSUNTI[titolo] || (titolo + ' è un luogo notevole di Roma. Altro testo.');
      return route.fulfill({ json: { extract: testo, content_urls: { mobile: { page: 'https://it.m.wikipedia.org/wiki/' + encodeURIComponent(titolo.replace(/ /g, '_')) } } } });
    }
    if (u.hostname === 'tile.openstreetmap.org') return route.fulfill({ path: opz.tassello });
    S.abortite.add(u.hostname);
    return route.abort();
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => S.errori.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to (load|fetch)|ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) S.errori.push('console: ' + m.text()); });

  await p.goto('https://sete.test/', { waitUntil: 'load' });
  await p.waitForFunction(() => { const b = document.getElementById('btn-vai'); return b && !b.hidden; }, null, { timeout: 40000 });
  await dormi(3500);                                   // la mappa e le anteprime dei percorsi si assestano
  const foto = [];
  let numFoto = 0;
  async function scatta(momento, clipSegno) {
    if (numFoto > 24) return;
    numFoto++;
    const nomeF = nome + '-' + momento + '.png';
    try { await p.screenshot({ path: path.join(opz.out, nomeF) }); foto.push(nomeF); } catch (e) { S.avviso.push('screenshot ' + momento + ': ' + e.message); }
    if (clipSegno) {
      try {
        const r = await p.evaluate(() => { const e = document.querySelector('.io'); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top]; });
        if (r) {
          const x = Math.max(0, Math.min(VIEWPORT.width - 180, r[0] - 90)), y = Math.max(0, Math.min(VIEWPORT.height - 180, r[1] - 90));
          const nomeC = nome + '-segno-' + momento + '.png';
          await p.screenshot({ path: path.join(opz.out, nomeC), clip: { x, y, width: 180, height: 180 } });
          foto.push(nomeC);
        }
      } catch (e) { S.avviso.push('ritaglio ' + momento + ': ' + e.message); }
    }
  }
  await scatta('0-prima-di-vai');
  const nRichiestePrima = S.richieste.length;
  S.vai = true;
  await p.click('#btn-vai');
  const t0Reale = Date.now();

  const campioni = [];
  let primoFuori = false, primoFalso = false, luoghiFoto = 0, arrivoFoto = false, arrivoContatore = 0, ultimoLuogo = null;
  const luoghiAnnunciati = [];
  for (let k = 0; k < N; k++) {
    const inizio = Date.now();
    S.tSim = k;
    await ctx.setGeolocation(sc.gps[k]);
    await dormi(intervallo * 0.9 - (Date.now() - inizio));
    const pag = await p.evaluate(leggiPagina);
    const v = sc.vero[k];
    const testoBanner = ((pag.banner.frase || '') + ' ' + (pag.banner.dist || '')).trim();
    const fuori = /fuori strada/i.test(testoBanner);
    const fasiDev = v.fase === 'sbagliata' || v.fase === 'rientro';
    // "su" = si sta facendo ciò che si deve (il banner "fuori strada" sarebbe falso); "fuori" = deviazione vera; "grigio" = zona intermedia
    const verita = !sc.deviazione || !fasiDev ? 'su'
      : v.dPrev > DEVIAZIONE_VERA_M ? 'fuori'
      : (v.fase === 'rientro' && v.dPrev <= VICINO_M ? 'su' : 'grigio');
    const atteso = [pag.mappa.x + pag.mappa.w / 2, pag.mappa.y + PUNTO_ATTESO_Y * pag.mappa.h];
    const c = { t: k, fase: v.fase, verita, gps: [+sc.gps[k].latitude.toFixed(6), +sc.gps[k].longitude.toFixed(6)], acc: +sc.gps[k].accuracy.toFixed(1),
      errGps: arr(metri(sc.gps[k].latitude, sc.gps[k].longitude, v.lat, v.lon)), vera: [+v.lat.toFixed(6), +v.lon.toFixed(6)], dPercorso: arr(v.dPrev),
      salto: !!v.salto, sosta: !!v.sosta, naviga: pag.naviga, bannerDist: pag.banner.dist, bannerFrase: pag.banner.frase, bannerPoi: pag.banner.poi, fuori,
      richiesteGuida: S.richieste.filter((r) => r.guida).length, richiesteTutte: S.richieste.length,
      io: pag.io && pag.io.nelloSchermo ? { x: arr(pag.io.x), y: arr(pag.io.y) } : null,
      errPx: pag.io && pag.io.nelloSchermo ? arr(Math.hypot(pag.io.x - atteso[0], pag.io.y - atteso[1])) : null,
      appiattimento: pag.io ? arr(pag.io.appiattimento, 3) : null, inclinazioneSegno: pag.io ? arr(pag.io.inclinazioneSegno) : null, rotazioneSegno: pag.io ? arr(pag.io.rotazioneSegno) : null,
      angoloFreccia: pag.io ? arr(pag.io.angoloFreccia) : null, bboxFreccia: pag.io && pag.io.bboxFreccia ? pag.io.bboxFreccia.map((n) => arr(n)) : null,
      frecciaVisibile: pag.io ? pag.io.frecciaVisibile : false,
      luogo: pag.luogo.visibile ? { lato: pag.luogo.lato, nome: pag.luogo.nome, descr: pag.luogo.descr } : null, arrivo: pag.arrivo };
    campioni.push(c);
    if (c.luogo && (!ultimoLuogo || ultimoLuogo !== c.luogo.nome)) { luoghiAnnunciati.push({ t: k, nome: c.luogo.nome, lato: c.luogo.lato, trueDist: arr(distanzaMinima(sc.vero, k, c.luogo.nome)) }); }
    ultimoLuogo = c.luogo ? c.luogo.nome : null;
    // momenti chiave
    if (k === 1) await scatta('1-avvio-t1', true);
    else if (k === 5) await scatta('2-avvio-t5', true);
    if (k === Math.floor(N * 0.4)) await scatta('3-cammino', true);
    if (fuori && !primoFuori) { primoFuori = true; await scatta('4-primo-fuori-strada-t' + k, true); }
    if (fuori && verita === 'su' && !primoFalso) { primoFalso = true; await scatta('5-falso-fuori-strada-t' + k, true); }
    if (c.luogo && luoghiFoto < 2 && luoghiAnnunciati.length && luoghiAnnunciati[luoghiAnnunciati.length - 1].t === k) { luoghiFoto++; await scatta('6-luogo' + luoghiFoto + '-t' + k); }
    if (pag.arrivo && !arrivoFoto) { arrivoFoto = true; await scatta('7-arrivo-t' + k); }
    if (pag.arrivo) arrivoContatore++;
    if (k === N - 1) await scatta('9-fine-t' + k, true);
    if (!pag.naviga && k > 5 && !pag.arrivo) { S.avviso.push('la navigazione è finita da sola a t=' + k); if (arrivoContatore > 0 || k > 10) { if (k < N - 1) { campioni[campioni.length - 1].fineAnticipata = true; break; } } }
    if (arrivoContatore >= 8) break;
    await dormi(intervallo - (Date.now() - inizio));
  }
  const durataReale = (Date.now() - t0Reale) / 1000;
  await ctx.close();
  return { sc, S, campioni, foto, luoghiAnnunciati, nRichiestePrima, durataReale };
}
function distanzaMinima(vero, fino, nomeLuogo) {
  const l = LUOGHI.find((x) => x[2] === nomeLuogo);
  if (!l) return null;
  let m = Infinity;
  for (let i = 0; i <= fino && i < vero.length; i++) m = Math.min(m, metri(vero[i].lat, vero[i].lon, l[0], l[1]) - l[4]);
  return m;
}

// ===================== ANALISI =====================
function analizza(r, opz) {
  const { sc, S, campioni } = r;
  const fuoriSecondi = campioni.filter((c) => c.fuori).length;
  const falsi = campioni.filter((c) => c.fuori && c.verita === 'su');
  const perFase = {};
  falsi.forEach((c) => { perFase[c.fase] = (perFase[c.fase] || 0) + 1; });
  const episodi = [];
  campioni.forEach((c) => {
    if (c.fuori && c.verita === 'su') {
      const ult = episodi[episodi.length - 1];
      if (ult && ult.fine === c.t - 1) { ult.fine = c.t; ult.durata++; ult.dMax = Math.max(ult.dMax, c.dPercorso); ult.errGpsMax = Math.max(ult.errGpsMax, c.errGps); }
      else episodi.push({ inizio: c.t, fine: c.t, durata: 1, fase: c.fase, dMax: c.dPercorso, errGpsMax: c.errGps, banner: c.bannerFrase });
    }
  });
  // svolta sbagliata vera
  let rilevazione = null;
  if (sc.deviazione) {
    const t0 = campioni.find((c) => c.verita === 'fuori');
    const tr = campioni.find((c) => c.fuori && (c.fase === 'sbagliata' || c.fase === 'rientro'));
    rilevazione = { inizioDeviazione: t0 ? t0.t : null, primoBanner: tr ? tr.t : null,
      ritardoS: t0 && tr ? Math.max(0, tr.t - t0.t) : null, rilevata: !!(t0 && tr),
      primaFaseSbagliata: (campioni.find((c) => c.fase === 'sbagliata') || {}).t,
      ritardoDaImboccoS: tr && campioni.find((c) => c.fase === 'sbagliata') ? tr.t - campioni.find((c) => c.fase === 'sbagliata').t : null,
      distanzaAlBanner: tr ? tr.dPercorso : null,
      secondiFuoriVeri: campioni.filter((c) => c.verita === 'fuori').length, secondiFuoriVeriSegnalati: campioni.filter((c) => c.verita === 'fuori' && c.fuori).length };
    // dopo il rientro il banner deve sparire
    const rientrati = campioni.filter((c) => c.fase === 'muratte' && c.t > 0);
    rilevazione.bannerNellaFaseFinale = rientrati.filter((c) => c.fuori).length;
  }
  // richieste
  const dopo = S.richieste.filter((q) => q.dopoVai);
  const guida = dopo.filter((q) => q.guida), anteprime = dopo.filter((q) => !q.guida);
  const richieste = { prima: r.nRichiestePrima, dopoVai: dopo.length, guida: guida.length, anteprimeDuranteNavigazione: anteprime.length,
    ogniMinuto: arr(guida.length / Math.max(1, campioni.length / 60), 2), elenco: dopo.map((q) => ({ t: Math.max(0, q.tSim), guida: q.guida, origine: q.origine.map((n) => +n.toFixed(5)),
      distanzaOrigineDalVero: q.vero ? arr(metri(q.origine[0], q.origine[1], q.vero[0], q.vero[1])) : null })) };
  // segno
  const misura = campioni.filter((c) => c.t >= STACCO_AVVIO_S);
  const errs = misura.map((c) => (c.errPx == null ? Infinity : c.errPx));
  const presenti = misura.filter((c) => c.errPx != null);
  const oltre = errs.filter((e) => e > SOGLIE.erroreSegnoPx).length;
  const segno = { campioniMisurati: misura.length, assenteDalloSchermo: misura.length - presenti.length, scartoMedioPx: stat(presenti.map((c) => c.errPx)).media,
    scartoMassimoPx: stat(presenti.map((c) => c.errPx)).max, scartoMedianoPx: stat(presenti.map((c) => c.errPx)).mediana, scartoP95Px: stat(presenti.map((c) => c.errPx)).p95,
    quotaOltreSoglia: misura.length ? arr(oltre / misura.length, 3) : 0 };
  const salti = [];
  for (let i = 1; i < campioni.length; i++) {
    const a = campioni[i - 1].io, b = campioni[i].io;
    if (a && b) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > SALTO_SEGNO_PX) salti.push({ t: campioni[i].t, px: arr(d), gpsSalto: campioni[i].salto || campioni[i - 1].salto }); }
    else if (!!a !== !!b) salti.push({ t: campioni[i].t, px: null, nota: a ? 'il segno esce dallo schermo' : 'il segno rientra nello schermo' });
  }
  // forma del segno e camera indiretta
  const app = misura.filter((c) => c.appiattimento != null).map((c) => c.appiattimento);
  const angoli = misura.filter((c) => c.angoloFreccia != null && c.frecciaVisibile).map((c) => c.angoloFreccia);
  const salti_ang = [];
  for (let i = 1; i < misura.length; i++) {
    const a = misura[i - 1].angoloFreccia, b = misura[i].angoloFreccia;
    if (a != null && b != null) { const d = Math.abs(((b - a) % 360 + 540) % 360 - 180); if (d > 45) salti_ang.push({ t: misura[i].t, gradi: arr(d) }); }
  }
  const forma = { appiattimento: stat(app), inclinazioneSegnoGradi: stat(misura.filter((c) => c.inclinazioneSegno != null).map((c) => c.inclinazioneSegno)), angoloFrecciaSulloSchermo: stat(angoli.map(Math.abs)), frecciaVisibileQuota: misura.length ? arr(misura.filter((c) => c.frecciaVisibile).length / misura.length, 3) : 0,
    rotazioniBrusche: salti_ang.length, elencoRotazioniBrusche: salti_ang.slice(0, 15),
    rotazioneSegno: stat(misura.filter((c) => c.rotazioneSegno != null).map((c) => Math.abs(c.rotazioneSegno))) };
  // luoghi
  // attesi: il bordo passa a meno di 35 m dal cammino vero, e non era già a meno di 50 m dal punto di partenza (ambiguo: potrebbe essere alle spalle)
  const attesi = LUOGHI.filter((l) => { let m = Infinity; sc.vero.forEach((v) => { m = Math.min(m, metri(v.lat, v.lon, l[0], l[1]) - l[4]); }); return m <= 35 && metri(sc.vero[0].lat, sc.vero[0].lon, l[0], l[1]) - l[4] > 50; }).map((l) => l[2]);
  const annunciati = [...new Set(r.luoghiAnnunciati.map((x) => x.nome))];
  const luoghi = { attesi, annunciati, eventi: r.luoghiAnnunciati, mancanti: attesi.filter((n) => !annunciati.includes(n)),
    inattesi: annunciati.filter((n) => { const e = r.luoghiAnnunciati.find((x) => x.nome === n); return e && e.trueDist != null && e.trueDist > 70; }) };
  const arrivo = campioni.find((c) => c.arrivo);
  const verifiche = [];
  if (falsi.length > SOGLIE.falsiFuoriStradaMax) verifiche.push(`falsi "fuori strada": ${falsi.length} s (max ${SOGLIE.falsiFuoriStradaMax})`);
  if (sc.deviazione && !(rilevazione.rilevata && rilevazione.ritardoS <= SOGLIE.rilevazioneSvoltaMaxS)) verifiche.push(rilevazione.rilevata ? `svolta sbagliata rilevata in ${rilevazione.ritardoS} s (max ${SOGLIE.rilevazioneSvoltaMaxS})` : 'svolta sbagliata NON rilevata');
  if (segno.quotaOltreSoglia > SOGLIE.erroreSegnoQuotaMax) verifiche.push(`segno oltre ${SOGLIE.erroreSegnoPx} px nel ${(segno.quotaOltreSoglia * 100).toFixed(0)}% dei campioni (max ${(SOGLIE.erroreSegnoQuotaMax * 100).toFixed(0)}%)`);
  if (S.errori.length > SOGLIE.erroriConsoleMax) verifiche.push(`errori in console: ${S.errori.length}`);
  return { scenario: sc.nome, durataSimulataS: campioni.length, durataRealeS: arr(r.durataReale), esito: verifiche.length ? 'NON SUPERATO' : 'SUPERATO', verificheFallite: verifiche,
    fuoriStrada: { secondiTotali: fuoriSecondi, falsiPositiviS: falsi.length, falsiPerFase: perFase, episodiFalsi: episodi }, svoltaSbagliata: rilevazione, richieste, segno, forma, saltiSegno: salti, luoghi,
    arrivoAt: arrivo ? arrivo.t : null, errori: S.errori, avvisi: S.avviso, hostBloccati: [...S.abortite], foto: r.foto,
    gps: { erroreMedioM: stat(campioni.map((c) => c.errGps)).media, erroreMassimoM: stat(campioni.map((c) => c.errGps)).max } };
}

// ===================== RAPPORTO =====================
function rapportoMd(res, opz, avvio) {
  const L = [];
  const pct = (x) => (x == null ? '-' : (x * 100).toFixed(0) + '%');
  L.push('# Rapporto del collaudo della navigazione', '');
  L.push(`Eseguito il ${avvio.toISOString()} su \`${opz.repo}\` (seme ${SEME_CORRENTE}, fattore tempo ${opz.fattore}, viewport ${VIEWPORT.width}x${VIEWPORT.height}).`, '');
  L.push('## Soglie di accettazione', '');
  L.push(`- Falsi "fuori strada": al massimo ${SOGLIE.falsiFuoriStradaMax} s`, `- Svolta sbagliata vera segnalata entro ${SOGLIE.rilevazioneSvoltaMaxS} s dall'inizio della deviazione (oltre ${DEVIAZIONE_VERA_M} m dal percorso)`,
    `- Segno dell'utente a più di ${SOGLIE.erroreSegnoPx} px dal punto atteso (centro, ${PUNTO_ATTESO_Y * 100}% dell'altezza della mappa) per non più del ${SOGLIE.erroreSegnoQuotaMax * 100}% dei campioni dopo i primi ${STACCO_AVVIO_S} s`,
    `- Errori in console / pageerror: al massimo ${SOGLIE.erroriConsoleMax}`, '');
  L.push('## Riepilogo', '');
  L.push('| Scenario | Esito | Falsi "fuori strada" (s) | Rilevazione svolta (s) | Richieste guida | Scarto segno medio / max (px) | Segno > soglia | Salti segno | Luoghi annunciati/attesi | Errori |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  res.forEach((a) => {
    const rl = a.svoltaSbagliata ? (a.svoltaSbagliata.rilevata ? a.svoltaSbagliata.ritardoS : 'NON rilevata') : 'n/d';
    L.push(`| ${a.scenario} | **${a.esito}** | ${a.fuoriStrada.falsiPositiviS} | ${rl} | ${a.richieste.guida} | ${a.segno.scartoMedioPx} / ${a.segno.scartoMassimoPx} | ${pct(a.segno.quotaOltreSoglia)} | ${a.saltiSegno.length} | ${a.luoghi.annunciati.length}/${a.luoghi.attesi.length} | ${a.errori.length} |`);
  });
  L.push('');
  res.forEach((a) => {
    L.push(`## Scenario: ${a.scenario}`, '');
    L.push(`Durata simulata ${a.durataSimulataS} s (reale ${a.durataRealeS} s). Esito: **${a.esito}**.`, '');
    if (a.verificheFallite.length) { L.push('Soglie non rispettate:'); a.verificheFallite.forEach((v) => L.push('- ' + v)); L.push(''); }
    L.push(`**Fuori strada.** Secondi con il banner "fuori strada": ${a.fuoriStrada.secondiTotali}, di cui falsi (non si era davvero fuori): **${a.fuoriStrada.falsiPositiviS}**` +
      (Object.keys(a.fuoriStrada.falsiPerFase).length ? ' (per fase: ' + Object.entries(a.fuoriStrada.falsiPerFase).map(([f, n]) => f + ' ' + n + ' s').join(', ') + ')' : '') + '.');
    if (a.fuoriStrada.episodiFalsi.length) {
      L.push('', '| Da t (s) | Durata (s) | Fase | Distanza vera dal percorso (m) | Errore GPS max (m) |', '|---|---|---|---|---|');
      a.fuoriStrada.episodiFalsi.slice(0, 20).forEach((e) => L.push(`| ${e.inizio} | ${e.durata} | ${e.fase} | ${e.dMax} | ${e.errGpsMax} |`));
    }
    L.push('');
    if (a.svoltaSbagliata) {
      const s = a.svoltaSbagliata;
      L.push(`**Svolta sbagliata.** La deviazione vera (oltre ${DEVIAZIONE_VERA_M} m dal percorso) inizia a t=${s.inizioDeviazione} s; ` + (s.rilevata ? `il primo banner "fuori strada" arriva a t=${s.primoBanner} s (ritardo ${s.ritardoS} s dall'inizio della deviazione vera, ${s.ritardoDaImboccoS} s da quando si imbocca la strada sbagliata; a ${s.distanzaAlBanner} m dal percorso).` : 'il banner "fuori strada" NON compare mai durante la deviazione.') +
        ` Dei ${s.secondiFuoriVeri} s realmente fuori strada, ${s.secondiFuoriVeriSegnalati} sono segnalati. Banner "fuori strada" dopo il rientro, sul percorso giusto: ${s.bannerNellaFaseFinale} s.`, '');
    }
    L.push(`**Richieste al servizio percorsi.** Prima di "Vai": ${a.richieste.prima}. Dopo "Vai": ${a.richieste.dopoVai} (di cui con indicazioni, \`steps=true\`: ${a.richieste.guida}; ${a.richieste.ogniMinuto} al minuto).`);
    if (a.richieste.elenco.length) {
      L.push('', '| t (s) | Tipo | Origine richiesta | Distanza origine-vero (m) |', '|---|---|---|---|');
      a.richieste.elenco.slice(0, 25).forEach((q) => L.push(`| ${q.t} | ${q.guida ? 'guida' : 'anteprima'} | ${q.origine.join(', ')} | ${q.distanzaOrigineDalVero} |`));
    }
    L.push('');
    L.push(`**Segno dell'utente (\`.io\`).** Scarto dal punto atteso su ${a.segno.campioniMisurati} campioni: medio ${a.segno.scartoMedioPx} px, mediano ${a.segno.scartoMedianoPx} px, 95° percentile ${a.segno.scartoP95Px} px, massimo ${a.segno.scartoMassimoPx} px; fuori dallo schermo in ${a.segno.assenteDalloSchermo} campioni; oltre ${SOGLIE.erroreSegnoPx} px nel ${pct(a.segno.quotaOltreSoglia)}. Salti > ${SALTO_SEGNO_PX} px tra campioni: **${a.saltiSegno.length}**` +
      (a.saltiSegno.length ? ' (t: ' + a.saltiSegno.slice(0, 20).map((s) => s.t + (s.px != null ? ' ' + s.px + ' px' : '')).join(', ') + (a.saltiSegno.length > 20 ? ', ...' : '') + ')' : '') + '.', '');
    L.push(`**Forma e orientamento.** Il segno è steso sulla mappa: inclinazione media ${a.forma.inclinazioneSegnoGradi.media}° (massima ${a.forma.inclinazioneSegnoGradi.max}°), cioè altezza/larghezza a schermo pari a ${a.forma.appiattimento.media} (1 = non schiacciato). Freccia visibile nel ${pct(a.forma.frecciaVisibileQuota)} dei campioni; angolo della freccia rispetto all'alto dello schermo (0 = punta in su, come in un navigatore): medio ${a.forma.angoloFrecciaSulloSchermo.media}°, massimo ${a.forma.angoloFrecciaSulloSchermo.max}°; rotazioni brusche (>45° in un secondo): ${a.forma.rotazioniBrusche}.`, '');
    L.push(`**Luoghi.** Annunciati: ${a.luoghi.annunciati.join(', ') || 'nessuno'}. Attesi (entro 35 m dal bordo): ${a.luoghi.attesi.join(', ') || 'nessuno'}. Mancanti: ${a.luoghi.mancanti.join(', ') || 'nessuno'}. Inattesi (lontani oltre 70 m): ${a.luoghi.inattesi.join(', ') || 'nessuno'}.`, '');
    L.push(`**GPS simulato.** Errore medio ${a.gps.erroreMedioM} m, massimo ${a.gps.erroreMassimoM} m.` + (a.arrivoAt != null ? ` Arrivo mostrato a t=${a.arrivoAt} s.` : ''), '');
    L.push(`**Errori in console:** ${a.errori.length ? '\n' + a.errori.slice(0, 10).map((e) => '- ' + e).join('\n') : 'nessuno'}.`, '');
    if (a.avvisi.length) L.push('Avvisi del banco: ' + a.avvisi.join('; '), '');
    L.push('Screenshot: ' + a.foto.map((f) => `[${f}](${f})`).join(', '), '');
  });
  L.push('## Limiti del banco', '',
    '- Il servizio percorsi, Wikipedia e i tasselli sono finti; la geometria e i nomi delle strade sono plausibili ma non rilievi.',
    '- Il GPS simulato non fornisce direzione né velocità (Playwright imposta solo posizione e accuratezza) e non c\'è bussola: la direzione del segno dipende solo dal percorso.',
    '- I timer dell\'app sono reali: con `--fattore` > 1 i risultati sono solo indicativi.',
    '- La camera della mappa non è osservabile direttamente: la si deduce dalla posizione e dalla trasformazione del segno `.io`.',
    '- Chromium headless usa il rendering software (SwiftShader), più lento di un telefono: i frame persi possono falsare i campioni a 1 Hz.');
  return L.join('\n') + '\n';
}

// ===================== MAIN =====================
async function main() {
  const a = process.argv.slice(2), pos = [], opz = { fattore: 1, scenari: SCENARI.slice(), paralleli: 1, tassello: path.join(__dirname, 'dati-collaudo', 'griglia.png') };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--scenario') { const v = a[++i]; opz.scenari = v === 'tutti' ? SCENARI.slice() : v.split(','); }
    else if (a[i] === '--fattore') opz.fattore = Math.max(0.1, Number(a[++i]) || 1);
    else if (a[i] === '--seme') SEME_CORRENTE = Number(a[++i]) || SEME;
    else if (a[i] === '--paralleli') opz.paralleli = Math.max(1, Number(a[++i]) || 1);
    else if (a[i] === '--tassello') opz.tassello = path.resolve(a[++i]);
    else pos.push(a[i]);
  }
  if (pos.length < 2) { console.error('uso: node strumenti/collaudo-navigazione.js <cartella-repo> <cartella-output> [--scenario ...] [--fattore N]'); process.exit(2); }
  opz.repo = path.resolve(pos[0]); opz.out = path.resolve(pos[1]);
  opz.scenari.forEach((s) => { if (!SCENARI.includes(s)) { console.error('scenario sconosciuto: ' + s + ' (validi: ' + SCENARI.join(', ') + ')'); process.exit(2); } });
  if (!fs.existsSync(path.join(opz.repo, 'index.html'))) { console.error('index.html non trovato in ' + opz.repo); process.exit(2); }
  if (!fs.existsSync(opz.tassello)) { console.error('immagine dei tasselli non trovata: ' + opz.tassello); process.exit(2); }
  fs.mkdirSync(opz.out, { recursive: true });
  const avvio = new Date();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const risultati = new Array(opz.scenari.length);
  let prossimo = 0;
  async function lavora() {
    while (prossimo < opz.scenari.length) {
      const i = prossimo++, nome = opz.scenari[i];
      console.log(`[${nome}] avvio`);
      try {
        const grezzo = await eseguiScenario(browser, nome, opz);
        fs.writeFileSync(path.join(opz.out, 'campioni-' + nome + '.json'), JSON.stringify(grezzo.campioni));
        risultati[i] = analizza(grezzo, opz);
        const r = risultati[i];
        console.log(`[${nome}] ${r.esito}: falsi ${r.fuoriStrada.falsiPositiviS} s, rilevazione ${r.svoltaSbagliata ? (r.svoltaSbagliata.rilevata ? r.svoltaSbagliata.ritardoS + ' s' : 'NO') : 'n/d'}, richieste guida ${r.richieste.guida}, segno ${r.segno.scartoMedioPx}/${r.segno.scartoMassimoPx} px, salti ${r.saltiSegno.length}, errori ${r.errori.length}`);
      } catch (e) {
        console.error(`[${nome}] ERRORE DEL BANCO:`, e);
        risultati[i] = { scenario: nome, esito: 'NON SUPERATO', verificheFallite: ['il banco si è interrotto: ' + e.message], fuoriStrada: { falsiPositiviS: 0, secondiTotali: 0, falsiPerFase: {}, episodiFalsi: [] }, richieste: { guida: 0, elenco: [], prima: 0, dopoVai: 0, ogniMinuto: 0 }, segno: {}, forma: { appiattimento: {}, angoloFrecciaSulloSchermo: {} }, saltiSegno: [], luoghi: { annunciati: [], attesi: [], mancanti: [], inattesi: [] }, errori: [], avvisi: [], foto: [], gps: {}, rottoIlBanco: true };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(opz.paralleli, opz.scenari.length) }, lavora));
  await browser.close();
  const complessivo = risultati.every((r) => r.esito === 'SUPERATO') ? 'SUPERATO' : 'NON SUPERATO';
  fs.writeFileSync(path.join(opz.out, 'rapporto.json'), JSON.stringify({ eseguito: avvio.toISOString(), repo: opz.repo, seme: SEME_CORRENTE, fattoreTempo: opz.fattore, soglie: SOGLIE,
    parametri: { VELOCITA, SIGMA_GPS, RHO_GPS, ACCURATEZZA, DISTANZA_CORTILE, SALTO_M, SOSTA_S, SVOLTA_ERRATA_M, DEVIAZIONE_VERA_M, VICINO_M, PUNTO_ATTESO_Y, STACCO_AVVIO_S }, esito: complessivo, scenari: risultati }, null, 2));
  fs.writeFileSync(path.join(opz.out, 'rapporto.md'), rapportoMd(risultati, opz, avvio));
  console.log('Esito complessivo: ' + complessivo + ' - rapporto in ' + opz.out);
  process.exit(complessivo === 'SUPERATO' && !risultati.some((r) => r.rottoIlBanco) ? 0 : (risultati.some((r) => r.rottoIlBanco) ? 2 : 1));
}
main().catch((e) => { console.error(e); process.exit(2); });
