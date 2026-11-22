// Prove della logica di navigazione (guida.js) con tracce GPS sintetiche.
// Si lancia con: node strumenti/prova-guida.mjs   (esce con codice 1 se una prova fallisce)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const G = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'guida.js'));

let falliti = 0, riusciti = 0;
function prova(nome, ok, dettaglio) {
  if (ok) riusciti++; else falliti++;
  console.log((ok ? '  ok     ' : '  FALLITA ') + nome + (dettaglio ? '  [' + dettaglio + ']' : ''));
}

// ---------- Strumenti per le tracce ----------
function rng(seme) {                      // mulberry32: ripetibile
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
const M_LAT = 111195, M_LON = 111195 * Math.cos(41.9 * Math.PI / 180);
const spostaM = (p, dNord, dEst) => [p[0] + dNord / M_LAT, p[1] + dEst / M_LON];   // p = [lat, lon]
const dist = (a, b) => G.metri(a[0], a[1], b[0], b[1]);

// Percorso a mano nel centro di Roma: da Piazza Venezia per Via del Corso, poi a destra in Via delle Muratte,
// a sinistra, a destra verso la Fontana di Trevi. Coordinate [lat, lon] approssimate lungo le strade vere.
const SVOLTE = [
  [41.89610, 12.48215],   // Piazza Venezia, inizio di Via del Corso
  [41.89750, 12.48060],
  [41.89860, 12.47980],
  [41.89920, 12.47950],   // svolta a destra (Via delle Muratte)
  [41.89985, 12.48120],
  [41.90030, 12.48140],   // svolta a sinistra
  [41.90070, 12.48135],
  [41.90090, 12.48330]    // Fontana di Trevi
];
const FONTANELLA = { lat: 41.90090, lon: 12.48330 };
function infittisci(punti, passo) {
  const r = [punti[0]];
  for (let k = 1; k < punti.length; k++) {
    const n = Math.max(1, Math.round(dist(punti[k - 1], punti[k]) / passo));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      r.push([punti[k - 1][0] + t * (punti[k][0] - punti[k - 1][0]), punti[k - 1][1] + t * (punti[k][1] - punti[k - 1][1])]);
    }
  }
  return r;
}
const LINEA = infittisci(SVOLTE, 12);       // decine di punti, come OSRM
function lunghezza(l) { let t = 0; for (let k = 1; k < l.length; k++) t += dist(l[k - 1], l[k]); return t; }
// risposta tipo OSRM, con la geometria [lon, lat] e i passi
function rispostaOsrm(linea) {
  const idx = SVOLTE.slice(1).map((p) => linea.findIndex((q) => q[0] === p[0] && q[1] === p[1]));
  const tagli = [0, idx[2], idx[3], idx[4], linea.length - 1];
  const distTratto = (a, b) => lunghezza(linea.slice(a, b + 1));
  const steps = [
    { name: 'Via del Corso', distance: distTratto(tagli[0], tagli[1]), maneuver: { type: 'depart', modifier: '' } },
    { name: 'Via delle Muratte', distance: distTratto(tagli[1], tagli[2]), maneuver: { type: 'turn', modifier: 'right' } },
    { name: 'Via della Stamperia', distance: distTratto(tagli[2], tagli[3]), maneuver: { type: 'turn', modifier: 'left' } },
    { name: 'Piazza di Trevi', distance: distTratto(tagli[3], tagli[4]), maneuver: { type: 'turn', modifier: 'right' } },
    { name: 'Piazza di Trevi', distance: 0, maneuver: { type: 'arrive', modifier: 'left' } }
  ];
  return {
    distance: lunghezza(linea),
    geometry: { coordinates: linea.map((p) => [p[1], p[0]]) },
    legs: [{ steps }]
  };
}
const VIA = rispostaOsrm(LINEA);
const LUNGO = lunghezza(LINEA);

// Punto a `s` metri dall'inizio di una linea [lat, lon]
function puntoSu(linea, s) {
  let resto = s;
  for (let k = 1; k < linea.length; k++) {
    const d = dist(linea[k - 1], linea[k]);
    if (resto <= d) { const t = d ? resto / d : 0; return [linea[k - 1][0] + t * (linea[k][0] - linea[k - 1][0]), linea[k - 1][1] + t * (linea[k][1] - linea[k - 1][1])]; }
    resto -= d;
  }
  return linea[linea.length - 1];
}
// Lettura GPS: posizione vera + rumore gaussiano; accuratezza dichiarata a caso tra 15 e 45 m
function lettura(r, vero, sigma) {
  const p = spostaM(vero, gauss(r) * sigma, gauss(r) * sigma);
  return { lat: p[0], lon: p[1], acc: 15 + r() * 30 };
}

// Un "giro" dell'app: per ogni lettura aggiorna progresso e stato come fa app.js
function nuovoCammino(guida) {
  return { guida, prog: null, stato: G.STATO_INIZIALE, t: 0, fuoriAl: [], eventi: [] };
}
function passa(c, l, t) {
  const prec = c.prog;
  c.prog = G.progresso(c.guida, l.lat, l.lon, prec, t);
  const eraFuori = c.stato.fuori;
  c.stato = G.statoStrada(c.stato, c.prog.off, l.acc, t);
  c.t = t;
  if (c.stato.fuori && !eraFuori) c.eventi.push({ t, fuori: true });
  if (!c.stato.fuori && eraFuori) c.eventi.push({ t, fuori: false });
  return { prec, prog: c.prog, stato: c.stato };
}

const V = 1.3;                                 // m/s a piedi
const T0 = 1_700_000_000_000;

// ---------- 1. Geometria e passi ----------
console.log('Costruzione della guida');
{
  const origine = { lat: spostaM(LINEA[0], 0, -35)[0], lon: spostaM(LINEA[0], 0, -35)[1] };
  const g = G.prepara(VIA, origine, FONTANELLA);
  const prima = g.geom[0];
  prova('la geometria parte dall’utente (a 35 m dal primo punto)', Math.abs(prima[1] - origine.lat) < 1e-9 && Math.abs(prima[0] - origine.lon) < 1e-9);
  prova('la geometria finisce sulla fontanella', G.metri(g.geom[g.geom.length - 1][1], g.geom[g.geom.length - 1][0], FONTANELLA.lat, FONTANELLA.lon) < 0.5);
  prova('lunghezza = percorso + 35 m di testa', Math.abs(g.tot - (LUNGO + 35)) < 2, g.tot.toFixed(1) + ' m contro ' + (LUNGO + 35).toFixed(1));
  prova('gli at dei passi sono spostati di 35 m e crescenti', g.passi[0].at === 0 && Math.abs(g.passi[1].at - (35 + VIA.legs[0].steps[0].distance)) < 2 && g.passi.every((p, n) => n === 0 || p.at >= g.passi[n - 1].at), g.passi.map((p) => p.at.toFixed(0)).join(' '));
  prova('il passo di arrivo è alla fine', Math.abs(g.passi[g.passi.length - 1].at - g.tot) < 0.01);
  const vicino = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
  prova('origine sul primo punto: niente punto in più', vicino.geom.length === LINEA.length && Math.abs(vicino.tot - LUNGO) < 1);
}

// ---------- 2. Partenza a 35 m dalla strada ----------
console.log('Partenza lontana dalla strada');
{
  let fuoriTot = 0, letture = 0;
  for (let seme = 1; seme <= 30; seme++) {
    const r = rng(seme);
    const lato = spostaM(LINEA[0], 0, -35);                   // 35 m a ovest dell'inizio, in un cortile
    const g = G.prepara(VIA, { lat: lato[0], lon: lato[1] }, FONTANELLA);
    const c = nuovoCammino(g);
    // fermo 20 s dove sei, poi cammini verso la strada e lungo il percorso
    let t = T0;
    for (let s = 0; s < 20; s++, t += 1000) { passa(c, lettura(r, lato, 10), t); letture++; }
    const tratto = [lato].concat(LINEA);
    const tutta = lunghezza(tratto);
    for (let d = 0; d < tutta; d += V, t += 1000) { passa(c, lettura(r, puntoSu(tratto, d), 10), t); letture++; }
    fuoriTot += c.eventi.filter((e) => e.fuori).length;
  }
  prova('30 partenze a 35 m: mai "fuori strada"', fuoriTot === 0, fuoriTot + ' eventi su ' + letture + ' letture');
}

// ---------- 3. Cammino sul percorso con rumore ----------
console.log('Cammino sul percorso (rumore 8-12 m, accuratezza 15-45 m)');
{
  let fuoriTot = 0, maxIndietro = 0, maxErrore = 0, risalite = 0, peggioreTratto = 0, serie = 0;
  let prima = null;
  for (let seme = 100; seme < 130; seme++) {
    const r = rng(seme);
    const sigma = 8 + r() * 4;
    const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
    const c = nuovoCammino(g);
    let t = T0, cumPrec = null;
    const distSvolta = [];
    for (let d = 0; d <= LUNGO; d += V, t += 1000) {
      const { prog } = passa(c, lettura(r, puntoSu(LINEA, d), sigma), t);
      if (cumPrec != null) maxIndietro = Math.max(maxIndietro, cumPrec - prog.cum);
      cumPrec = prog.cum;
      maxErrore = Math.max(maxErrore, Math.abs(prog.cum - d));
      const pp = G.prossimoPasso(g, prog);
      distSvolta.push({ k: pp.indice, d: pp.distanza });
    }
    fuoriTot += c.eventi.filter((e) => e.fuori).length;
    // la distanza dalla prossima svolta, a parità di svolta, deve scendere (confronto a 20 s)
    for (let n = 20; n < distSvolta.length; n++) {
      if (distSvolta[n].k === distSvolta[n - 20].k && distSvolta[n].k < g.passi.length - 1) {
        serie++;
        peggioreTratto = Math.max(peggioreTratto, distSvolta[n].d - distSvolta[n - 20].d);
        if (distSvolta[n].d >= distSvolta[n - 20].d + 2) risalite++;
      }
    }
    if (!prima) prima = distSvolta;
  }
  prova('30 cammini completi: zero "fuori strada"', fuoriTot === 0, fuoriTot + ' eventi');
  prova('il progresso non torna indietro di più di 6 m tra due letture', maxIndietro <= 6.001, 'massimo ' + maxIndietro.toFixed(1) + ' m');
  prova('l’errore di progresso resta sotto 30 m', maxErrore < 30, 'massimo ' + maxErrore.toFixed(1) + ' m');
  prova('la distanza dalla svolta scende (confronto a 20 s, tolleranza 2 m)', risalite === 0, serie + ' confronti, peggiore +' + peggioreTratto.toFixed(1) + ' m');
}

// ---------- 4. Salto GPS singolo ----------
console.log('Salto GPS singolo di 70 m');
{
  let fuoriTot = 0, prove = 0;
  for (let seme = 200; seme < 230; seme++) {
    const r = rng(seme);
    const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
    const c = nuovoCammino(g);
    const quale = 15 + Math.floor(r() * 100);
    let t = T0, n = 0;
    for (let d = 0; d <= LUNGO; d += V, t += 1000, n++) {
      let l = lettura(r, puntoSu(LINEA, d), 10);
      if (n === quale) {
        const lato = r() < 0.5 ? 1 : -1;
        const p = spostaM(puntoSu(LINEA, d), 70 * lato, 0);   // 70 m a nord o a sud (la strada è obliqua)
        l = { lat: p[0], lon: p[1], acc: 20 };
      }
      passa(c, l, t);
    }
    prove++;
    fuoriTot += c.eventi.filter((e) => e.fuori).length;
  }
  prova('un solo salto di 70 m: mai "fuori strada"', fuoriTot === 0, fuoriTot + ' eventi in ' + prove + ' cammini');
}

// ---------- 5. Svolta sbagliata vera ----------
console.log('Svolta sbagliata');
{
  // Alla svolta a destra (indice 3) si prosegue dritto lungo Via del Corso, poi si torna indietro.
  const iSvolta = SVOLTE.findIndex((p) => p === SVOLTE[3]);
  const dritto = spostaM(SVOLTE[3], 0, 0);
  const dirDritto = [SVOLTE[3][0] - SVOLTE[2][0], SVOLTE[3][1] - SVOLTE[2][1]];
  const lungDir = Math.hypot(dirDritto[0] * M_LAT, dirDritto[1] * M_LON);
  const verso = (m) => [SVOLTE[3][0] + dirDritto[0] / lungDir * m, SVOLTE[3][1] + dirDritto[1] / lungDir * m];
  const dSvolta = lunghezza(LINEA.slice(0, LINEA.findIndex((p) => p === SVOLTE[3]) + 1));
  const dettagli = [];
  let tutteDentro = true, rientriTutti = true;
  for (let seme = 300; seme < 320; seme++) {
    const r = rng(seme);
    const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
    const c = nuovoCammino(g);
    let t = T0, n = 0;
    // fino alla svolta sul percorso
    for (let d = 0; d < dSvolta; d += V, t += 1000) passa(c, lettura(r, puntoSu(LINEA, d), 10), t);
    // poi 160 m dritto, ognuno a 1,3 m/s
    let tSoglia = null, tFuori = null;
    for (let m = 0; m <= 160; m += V, t += 1000) {
      const l = lettura(r, verso(m), 10);
      passa(c, l, t);
      const offVero = m;                                  // la strada gira a destra: lo scarto cresce quasi come m
      if (tSoglia == null && c.prog.off > G.sogliaFuori(l.acc)) tSoglia = t;
      if (tFuori == null && c.stato.fuori) tFuori = t;
    }
    // poi si torna indietro verso la svolta e si riprende il percorso
    let tRientro = null, tPrimoVicino = null;
    for (let m = 160; m >= 0; m -= V, t += 1000) {
      const l = lettura(r, verso(m), 10);
      passa(c, l, t);
      if (tPrimoVicino == null && m < 12) tPrimoVicino = t;
      if (tRientro == null && !c.stato.fuori && tFuori != null) tRientro = t;
    }
    for (let d = dSvolta; d < dSvolta + 40; d += V, t += 1000) {
      passa(c, lettura(r, puntoSu(LINEA, d), 10), t);
    }
    if (tFuori == null) tutteDentro = false;
    else dettagli.push({ ritardo: (tFuori - tSoglia) / 1000, assoluto: (tFuori - T0 - dSvolta / V * 1000) / 1000 });
    if (c.stato.fuori) rientriTutti = false;
  }
  const rit = dettagli.map((d) => d.ritardo);
  const ass = dettagli.map((d) => d.assoluto);
  prova('20 svolte sbagliate: sempre dichiarato "fuori strada"', tutteDentro, dettagli.length + ' su 20');
  prova('allontanandosi a piedi: dichiarato entro 15 s da quando sei a 85 m dal percorso', Math.max(...ass) * V <= 85 + 15 * V, 'ritardo dalla soglia delle letture: medio ' + (rit.reduce((a, b) => a + b, 0) / rit.length).toFixed(1) + ' s, massimo ' + Math.max(...rit).toFixed(0) + ' s');
  prova('dichiarato prima di 100 m dalla svolta (cammino a 1,3 m/s)', Math.max(...ass) * V < 100, 'al più dopo ' + (Math.max(...ass) * V).toFixed(0) + ' m, in media ' + (ass.reduce((a, b) => a + b, 0) / ass.length * V).toFixed(0) + ' m');
  prova('rientrando sul percorso torna "in strada"', rientriTutti);

  // Scarto netto di 100 m (strada parallela): il tempo conta dalla prima lettura
  const ritardi = [];
  let tuttiDentro = true;
  for (let seme = 400; seme < 420; seme++) {
    const r = rng(seme);
    const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
    const c = nuovoCammino(g);
    let t = T0;
    for (let d = 0; d < 150; d += V, t += 1000) passa(c, lettura(r, puntoSu(LINEA, d), 10), t);
    const t0 = t;
    let tf = null;
    for (let d = 150; d < 300; d += V, t += 1000) {
      const p = spostaM(puntoSu(LINEA, d), 0, 110);       // 110 m a est
      passa(c, lettura(r, p, 10), t);
      if (tf == null && c.stato.fuori) tf = t;
    }
    if (tf == null) tuttiDentro = false; else ritardi.push((tf - t0) / 1000);
    // rientro
    let rientrato = false;
    for (let d = 300; d < 360; d += V, t += 1000) {
      passa(c, lettura(r, puntoSu(LINEA, Math.min(LUNGO, d - 150)), 10), t);
      if (!c.stato.fuori) rientrato = true;
    }
    if (!rientrato && tf != null) tuttiDentro = false;
  }
  prova('scarto netto di 110 m: "fuori strada" entro 15 s (e poi rientra)', tuttiDentro && Math.max(...ritardi) <= 15, 'tra ' + Math.min(...ritardi).toFixed(0) + ' e ' + Math.max(...ritardi).toFixed(0) + ' s');
}

// ---------- 6. Macchina a stati, isteresi ----------
console.log('Stato della strada');
{
  let s = G.STATO_INIZIALE;
  s = G.statoStrada(s, 60, 20, 0); prova('una lettura lontana non basta', !s.fuori);
  s = G.statoStrada(s, 60, 20, 3000); prova('due letture ma solo 3 s: non basta', !s.fuori);
  s = G.statoStrada(s, 60, 20, 8000); prova('due letture e 8 s: fuori strada', s.fuori);
  s = G.statoStrada(s, 30, 20, 9000); prova('a 30 m resta fuori (isteresi: serve scendere sotto la soglia di rientro)', s.fuori);
  s = G.statoStrada(s, 10, 20, 10000); prova('a 10 m torna in strada', !s.fuori);
  s = G.statoStrada(G.STATO_INIZIALE, 60, 20, 0); s = G.statoStrada(s, 10, 20, 2000); s = G.statoStrada(s, 60, 20, 9000);
  prova('una lettura buona in mezzo azzera il conteggio', !s.fuori);
  prova('con accuratezza 60 m la soglia sale', G.sogliaFuori(60) >= 87 && G.sogliaFuori(10) === 40, 'acc 60: ' + G.sogliaFuori(60) + ' m; acc 10: ' + G.sogliaFuori(10) + ' m');
}

// ---------- 7. Posizione agganciata e direzione ----------
console.log('Posizione agganciata e direzione');
{
  const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
  const pr = G.progresso(g, spostaM(LINEA[10], 0, 12)[0], spostaM(LINEA[10], 0, 12)[1], null, T0);
  const io = { lat: spostaM(LINEA[10], 0, 12)[0], lon: spostaM(LINEA[10], 0, 12)[1], acc: 30 };
  const a = G.posizioneAgganciata(pr, io, { fuori: false }, false);
  prova('in strada la posizione è quella sul percorso', a.agganciata && Math.abs(a.lat - pr.lat) < 1e-12 && G.metri(a.lat, a.lon, io.lat, io.lon) > 1);
  const lontano = { lat: spostaM(LINEA[10], 0, 80)[0], lon: spostaM(LINEA[10], 0, 80)[1], acc: 10 };
  const pl = G.progresso(g, lontano.lat, lontano.lon, null, T0);
  const b = G.posizioneAgganciata(pl, lontano, { fuori: false }, false);
  prova('lontano dal percorso resta quella del GPS', !b.agganciata && b.lat === lontano.lat);
  const c = G.posizioneAgganciata(pr, io, { fuori: true }, true);
  prova('fuori strada non si aggancia mai', !c.agganciata);
  const d = G.direzione(g, G.progresso(g, LINEA[2][0], LINEA[2][1], null, T0));
  const atteso = G.gradiVerso(LINEA[2][0], LINEA[2][1], puntoSu(LINEA, 12 * 2 + 25)[0], puntoSu(LINEA, 12 * 2 + 25)[1]);
  prova('la direzione segue il percorso (Via del Corso, verso nord-ovest)', d > 290 && d < 340 && Math.abs(d - atteso) < 12, d.toFixed(0) + ' gradi');
  const fine = G.direzione(g, G.progresso(g, FONTANELLA.lat, FONTANELLA.lon, null, T0));
  prova('alla fine la direzione resta quella dell’ultimo tratto (est)', fine > 70 && fine < 110, fine.toFixed(0) + ' gradi');
}

// ---------- 8. Percorso che torna vicino a sé stesso ----------
console.log('Tornante: andata e ritorno a 20 m');
{
  const base = [41.9, 12.48];
  const linea = infittisci([base, spostaM(base, 0, 300), spostaM(base, 20, 300), spostaM(base, 20, 0)], 10);
  const via = { distance: lunghezza(linea), geometry: { coordinates: linea.map((p) => [p[1], p[0]]) }, legs: [{ steps: [] }] };
  let maxErrore = 0;
  for (let seme = 500; seme < 520; seme++) {
    const r = rng(seme);
    const g = G.prepara(via, { lat: base[0], lon: base[1] }, { lat: linea[linea.length - 1][0], lon: linea[linea.length - 1][1] });
    const c = nuovoCammino(g);
    let t = T0;
    for (let d = 0; d <= 300; d += V, t += 1000) {          // solo l'andata
      const { prog } = passa(c, lettura(r, puntoSu(linea, d), 8), t);
      maxErrore = Math.max(maxErrore, Math.abs(prog.cum - d));
    }
  }
  prova('sull’andata il progresso non salta sul ritorno', maxErrore < 30, 'errore massimo ' + maxErrore.toFixed(1) + ' m');
}

// ---------- 9. Frasi ----------
console.log('Frasi italiane');
{
  const f = G.frase;
  const eq = (nome, a, b) => prova(nome, a === b, a === b ? '' : '"' + a + '" invece di "' + b + '"');
  eq('svolta a destra', f({ tipo: 'turn', mod: 'right', nome: 'Via delle Muratte' }), 'Gira a destra in Via delle Muratte');
  eq('svolta a sinistra senza nome', f({ tipo: 'turn', mod: 'left', nome: '' }), 'Gira a sinistra');
  eq('leggera a destra', f({ tipo: 'turn', mod: 'slight right', nome: 'Via Uno' }), 'Tieni la destra in Via Uno');
  eq('stretta a sinistra', f({ tipo: 'turn', mod: 'sharp left', nome: '' }), 'Svolta stretta a sinistra');
  eq('inversione', f({ tipo: 'turn', mod: 'uturn', nome: '' }), 'Torna indietro');
  eq('rotonda, seconda uscita', f({ tipo: 'roundabout', mod: 'right', nome: 'Via Nazionale', uscita: 2 }), 'Alla rotonda prendi la 2ª uscita in Via Nazionale');
  eq('rotonda senza uscita', f({ tipo: 'rotary', mod: '', nome: '' }), 'Alla rotonda prendi la uscita');
  eq('partenza', f({ tipo: 'depart', mod: '', nome: 'Via del Corso' }), 'Parti su Via del Corso');
  eq('prosegui', f({ tipo: 'continue', mod: 'straight', nome: 'Via del Corso' }), 'Prosegui su Via del Corso');
  eq('arrivo a sinistra', f({ tipo: 'arrive', mod: 'left', nome: '' }), 'La fontanella è sulla sinistra');
  eq('arrivo a destra', f({ tipo: 'arrive', mod: 'right', nome: '' }), 'La fontanella è sulla destra');
  eq('arrivo davanti', f({ tipo: 'arrive', mod: '', nome: '' }), 'La fontanella è davanti a te');
  const g = G.prepara(VIA, { lat: LINEA[0][0], lon: LINEA[0][1] }, FONTANELLA);
  const p1 = G.prossimoPasso(g, G.progresso(g, LINEA[3][0], LINEA[3][1], null, T0));
  prova('il prossimo passo dal metro 36 è la svolta a destra', p1.indice === 1 && f(p1.passo) === 'Gira a destra in Via delle Muratte' && p1.distanza > 0, 'a ' + p1.distanza.toFixed(0) + ' m');
  const fineP = G.prossimoPasso(g, G.progresso(g, FONTANELLA.lat, FONTANELLA.lon, null, T0));
  prova('alla fine il prossimo passo è l’arrivo, a distanza ~0', fineP.passo.tipo === 'arrive' && fineP.distanza < 3, fineP.distanza.toFixed(1) + ' m');
}

console.log('\n' + riusciti + ' prove riuscite, ' + falliti + ' fallite');
process.exit(falliti ? 1 : 0);
