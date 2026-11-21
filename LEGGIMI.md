# Sete, le fontanelle di Roma

Una web app che si installa sul telefono come un'app vera. Mostra le fontanelle di Roma e dintorni,
trova la più vicina a te e apre le indicazioni a piedi in Apple Maps o Google Maps.

Non ha server, account o tracciamento. Le fontanelle arrivano da OpenStreetMap e restano salvate sul telefono.

## Metterla online con GitHub Pages (gratis)

Serve un indirizzo HTTPS, altrimenti il telefono non concede la posizione.

1. Crea un account su github.com, se non ce l'hai.
2. Crea un nuovo repository pubblico, per esempio `sete`.
3. Nella pagina del repository scegli "uploading an existing file" e trascina **il contenuto** di questa
   cartella (non la cartella stessa): `index.html` deve stare al primo livello. Conferma con "Commit changes".
4. Vai su Settings, poi Pages. In "Build and deployment" scegli "Deploy from a branch", ramo `main`,
   cartella `/ (root)`, e salva.
5. Dopo un paio di minuti l'app è su `https://TUONOME.github.io/sete/`.

Va bene anche qualunque altro hosting di file statici (Netlify, Cloudflare Pages, il tuo spazio web).

## Installarla sul telefono

- **iPhone**: apri l'indirizzo in Safari, tocca Condividi, poi "Aggiungi alla schermata Home".
- **Android**: apri l'indirizzo in Chrome, tocca il menu con i tre puntini, poi "Aggiungi a schermata Home"
  o "Installa app".

Al primo avvio concedi la posizione. Le fontanelle arrivano subito dalla copia pubblicata con l'app
(`fontanelle.json`), poi si aggiornano da sole.

## Vederla subito sul computer

Scompatta la cartella e apri `index.html` con un doppio clic (meglio in Chrome). Vedi la mappa, le fontanelle
e tutta l'interfaccia. Se il browser non concede la posizione, l'app mostra la fontanella più vicina al centro
della mappa: basta spostarla.

## Come si usa

- La scheda scura in basso mostra la fontanella più vicina, la distanza, i minuti a piedi e il tipo.
  Distanza e "più vicina" sono calcolate sul percorso a piedi vero, non in linea d'aria: una fontanella
  oltre un raccordo o un fiume non viene più indicata come vicina. La linea tratteggiata segue le strade.
  Se il servizio dei percorsi non risponde, la scheda lo dice ("in linea d'aria").
- Sotto il nome compaiono, quando OpenStreetMap li conosce, piccoli segni: Borraccia (si riempie bene), Cani
  (c'è una ciotola), Carrozzina (accessibile; "Non in carrozzina" se non lo è), Stagionale (può essere chiusa
  in certi periodi o avere degli orari). Se non c'è nulla, non compare niente.
- Trascina la scheda verso l'alto (o tocca la maniglia) per leggere com'è fatta e vedere le altre vicine.
- Trascinala verso il basso per ridurla a una barra sottile e liberare la mappa. La freccia nella barra punta verso
  la fontanella mentre giri il telefono: quando diventa azzurra ce l'hai davanti. Tocca la barra per riaprire la scheda.
- "Vai" avvia la navigazione dentro Sete. La mappa si inclina, ruota nella direzione in cui cammini e ti segue,
  con te in basso e la strada davanti; il percorso diventa una linea azzurra e il tuo punto una freccia.
  - In alto un banner dice la prossima svolta e quanto manca ("Tra 80 m, gira a destra in Via del Corso"),
    con "Poi…" quando due svolte sono vicine. Se esci dal percorso lo ricalcola da solo.
  - Lungo la strada compaiono i luoghi notevoli (monumenti, chiese, piazze, musei). Quando ci passi accanto una
    scheda dice "Alla tua destra: Colosseo" con una riga da Wikipedia; toccala per leggere di più.
  - Il pulsante con l'altoparlante nel banner attiva le indicazioni a voce (spente all'inizio, l'app ricorda la scelta).
    Prima di ogni svolta il telefono vibra.
  - In basso restano la distanza, i minuti e l'orario di arrivo. Se sposti la mappa a mano smette di seguirti:
    tocca la freccia dorata in basso a destra per tornare alla vista di navigazione.
  - Sotto i 15 m compare "Sei arrivato" e la navigazione finisce da sola; la X nella barra la chiude prima.
    Lo schermo resta acceso finché navighi, dove il telefono lo permette.
- Sotto "Vai", "Apri in Google Maps" (su iPhone "Apri in Mappe") passa le indicazioni al navigatore del telefono.
- "Condividi" (nella scheda aperta) invia un link come `.../sete/?f=41.90060,12.47690`: chi lo apre
  trova la fontanella già scelta sulla mappa. Se il telefono non ha il foglio di condivisione, il link viene copiato
  ("Link copiato").
- I tre filtri in alto mostrano solo nasoni, fontanelle o fontane. Tocca di nuovo il filtro per rivederle tutte.
  L'app ricorda il filtro alla prossima apertura.
- La mappa si ingrandisce con due dita, con il doppio tocco o con i pulsanti + e −.
  Da lontano le fontanelle sono punti colorati, da vicino diventano segni animati, diversi per tipo.
- La freccia a destra riporta la mappa su di te.
- Il fascio dorato attorno al tuo punto mostra dove sta puntando il telefono, come in Google Maps.
  Sull'iPhone la bussola si attiva dopo il primo tocco (Safari chiede il permesso per "movimento e orientamento").
  Se il fascio è largo, la bussola è incerta: muovi il telefono disegnando un 8 per calibrarla.
- Senza posizione, la "più vicina" è quella rispetto al centro della mappa: sposta la mappa per esplorare.
- Il pulsante "i" mostra la legenda, quante fontanelle ci sono e permette di riscaricarle.
- Se una fontanella non funziona, apri la scheda e tocca "Non funziona". Puoi nasconderla sul tuo telefono
  (sparisce da mappa ed elenco, e per qualche secondo c'è "Annulla") oppure segnalarla su OpenStreetMap, così la
  correggono per tutti. Nel pulsante "i" vedi quante ne hai nascoste e puoi farle riapparire tutte.
  Le nascoste sono ricordate per coordinate, quindi restano nascoste anche dopo un aggiornamento dei dati.
- Il testo si può ingrandire: l'app segue la dimensione del testo impostata nel telefono e si può anche
  ingrandire la pagina con il pizzico; la mappa ha i suoi gesti e non viene toccata.

## Offline

Dopo la prima apertura l'app e le fontanelle funzionano senza rete. Lo sfondo stradale resta disponibile
solo per le zone che hai già guardato.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | La struttura della pagina |
| `app.css` | Colori, caratteri, impaginazione |
| `app.js` | Dati, posizione, calcolo della più vicina. Le impostazioni sono in cima al file |
| `sw.js` | Funzionamento offline |
| `fontanelle.json` | Copia pronta delle fontanelle, aggiornata dalla GitHub Action |
| `luoghi.json` | Luoghi notevoli per la navigazione, aggiornati dalla GitHub Action |
| `strumenti/` | Script che scarica le fontanelle per `fontanelle.json` |
| `manifest.webmanifest` | Nome e icona dell'app installata |
| `icons/` | Logo (`logo.svg`) e icone |
| `fonts/`, `vendor/` | Caratteri (Big Shoulders, Hanken Grotesk) e libreria della mappa (MapLibre), inclusi nel pacchetto |

Se modifichi i file dopo averla installata, cambia `sete-v11` in `sete-v12` in cima a `sw.js`,
così il telefono scarica la versione nuova.

## Fontanelle sempre aggiornate

La GitHub Action `.github/workflows/fontanelle.yml` scarica ogni lunedì le fontanelle da OpenStreetMap con
`strumenti/fontanelle.mjs` e aggiorna `fontanelle.json`, solo se qualcosa è cambiato. Puoi farla partire a mano
dalla scheda Actions del repository: "Aggiorna le fontanelle", poi "Run workflow".
Lo stesso giro aggiorna `luoghi.json` con `strumenti/luoghi.mjs`: i luoghi notevoli di Roma che hanno una pagina
Wikipedia (monumenti, chiese, piazze, musei, parchi), usati dalla navigazione.

Lo script calcola anche la strada di ogni fontanella: scarica da Overpass le strade, le piazze e le aree pedonali
con nome e assegna a ogni punto quella più vicina, entro 60 metri (altrimenti niente). Così l'indirizzo è già nel
file, l'app lo mostra anche offline e non manda la tua posizione a nessun servizio. Se le strade non si scaricano,
si tengono quelle del giro precedente. Ogni punto è `[lat, lon, tipo, nome, strada, extra]`; `extra` è una stringa
di lettere: `b` borraccia, `c` cani, `r` carrozzina sì, `x` carrozzina no, `s` stagionale o con orari.
Per provare lo script senza rete: `SETE_PROVA=risposte.json SETE_USCITA=/percorso/uscita.json node strumenti/fontanelle.mjs`.

## Dati e licenze

- Fontanelle: © collaboratori di OpenStreetMap, licenza ODbL. Sono gli elementi `amenity=drinking_water`
  (nasoni se hanno `fountain=nasone`, altrimenti fontanelle) e le fontane `amenity=fountain` con `drinking_water=yes`.
  Dai tag si leggono anche `bottle`, `dog`, `wheelchair`, `seasonal` e `opening_hours`. Le strade con nome
  (`highway`, `place=square`, `leisure=pedestrian`) sono sempre di OpenStreetMap, ODbL.
- Mappa: stile Liberty servito da OpenFreeMap, gratuito e senza chiave. Se non risponde, l'app passa da sola
  alla mappa classica di OpenStreetMap.
- Indirizzi: già calcolati nel file delle fontanelle; Nominatim (OpenStreetMap) solo per i punti che non ce l'hanno,
  adatto a un uso leggero e personale.
- Percorsi a piedi: server OSRM di FOSSGIS (routing.openstreetmap.de), lo stesso di openstreetmap.org,
  per un uso leggero. In navigazione si chiede il percorso con le svolte una volta, e di nuovo solo se esci di strada.
- Descrizioni dei luoghi: riassunti di Wikipedia, chiesti solo quando un luogo compare durante la navigazione.
- MapLibre GL JS: licenza BSD. Caratteri: SIL Open Font License.

I dati sono curati da volontari: una fontanella può essere chiusa, spostata o mancare, e molti nasoni
sono registrati come semplici fontanelle.
