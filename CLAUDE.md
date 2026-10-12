# AttraversiAMO

Progetto per un hackathon aziendale: risposta a un bando di gara (volutamente satirico) del Comune di Gattapelata. Le foto del bando sono in `bando/`.

## Il bando in breve

- **Obiettivo:** un'app che aiuti le persone anziane ad attraversare la strada nei vicoli del centro storico e ad arrivare sane e salve dall'altra parte.
- **Vincoli della soluzione:**
  - usabile da anziani con poca dimestichezza con la tecnologia;
  - funzionante nei vicoli così come sono oggi (niente semafori, sensori o lavori stradali);
  - risultato misurabile in vite salvate e incidenti evitati;
  - rispetto della normativa sulla privacy.
- **Consegna:** demo entro le 20:00 del 12/10/2026, con relazione tecnica e offerta economica.
- **Punteggio (100 punti):**

| Criterio | Punti |
|---|---|
| Efficacia attesa, con un metodo per misurarla | 30 |
| Prezzo (costi di infrastruttura) | 20 |
| Facilità d'uso per gli anziani | 20 |
| Originalità | 15 |
| Fattibilità e rispetto dei tempi | 10 |
| Privacy degli utenti | 5 |

## La soluzione: AttraversiAMO

Il nome contiene un gioco di parole: "attraversiAMO", cioè attraversiamo insieme e "ci tengo a te". Nei testi il nome si scrive sempre **AttraversiAMO**.

L'idea è trasformare un problema tecnologico in un problema di comunità: la tecnologia serve solo a far incontrare le persone giuste nel vicolo giusto.

### Come funziona

1. All'imbocco di ogni vicolo c'è un **cartello con un codice QR**: è l'unico costo di infrastruttura. Lo inquadra l'anziano, oppure un familiare o il farmacista lo salva una volta sola sul suo telefono.
2. Si apre una pagina con **un solo grande pulsante: «Voglio attraversare»**. Non servono login né GPS, perché il vicolo è già indicato nel QR.
3. La richiesta arriva in tempo reale ai **volontari** della zona: cittadini, negozianti e vigili. Uno di loro risponde «Arrivo».
4. L'anziano vede lo stato con testo grande, colori e lettura vocale, ad esempio «Marco sta arrivando, aspetta qui».
5. Arrivato dall'altra parte, l'anziano preme **«Sono dall'altra parte»**: l'attraversamento risulta completato.

### Due esperienze separate

- **Anziano:** si apre solo dal QR, mostra solo il pulsante e lo stato, nessuna scelta da fare. L'anziano resta anonimo.
- **Volontario:** riceve le richieste, risponde, vede i suoi punti e la classifica. Indica almeno il proprio nome.

Il Comune ha in più una **dashboard** con i risultati.

### Misurare l'efficacia

La dashboard del Comune mostra:
- attraversamenti assistiti e completati;
- tempi di risposta dei volontari;
- vicoli con più richieste, cioè quelli più a rischio.

I dati sono conteggi anonimi per vicolo.

### Gamification (volutamente minima)

- **Passi:** 10 per ogni attraversamento completato. Vengono assegnati solo quando l'anziano conferma di essere arrivato dall'altra parte.
- **Volontario del mese:** chi ha più Passi nel mese viene pubblicato sul sito e sui social del Comune.
- Non ci sono gradi, badge o altri meccanismi: l'obiettivo è la massima semplicità.

### Privacy

- Niente registrazione per l'anziano e niente GPS: si sa solo da quale vicolo parte la richiesta.
- Le statistiche sono anonime.

## Parte tecnica

### Stack

- **React 19** + **TypeScript** (strict), build e dev server con **Vite 8**.
- **Tailwind CSS v4** tramite `@tailwindcss/vite`, ma lo stile è scritto quasi tutto in CSS puro: classi in stile BEM (`big-button--primary`, `status-card__icon`) e variabili CSS in `:root` dentro `src/index.css`.
- Font **Atkinson Hyperlegible** (Google Fonts), scelto per la leggibilità da parte degli anziani.
- Nessun backend e nessuna libreria di routing.
- Il progetto nasce da **Figma Make**: `AGENTS.md`, i plugin `figma*` in `vite.config.ts` e i segnaposto `<!-- figma:... -->` in `index.html` servono a quell'ambiente e vanno lasciati com'è.

### Comandi

- Node 22 (`.nvmrc`, `.mise.toml`); come package manager è previsto pnpm (`.mise.toml`), ma nel repo ci sono sia `pnpm-lock.yaml` sia `package-lock.json`.
- `dev`: avvia il dev server sulla porta `PORT`, di default **8443**.
- `build` / `preview`: build di produzione e anteprima.
- `format`: formattazione con oxfmt.

### Struttura del codice

- `src/main.tsx`: punto di ingresso, monta `App` e importa `src/index.css`.
- `src/App.tsx`: tutta l'app in un unico file (componenti, dati di esempio, routing).
- `src/index.css`: design token (colori, spaziature, raggi, bordi spessi con ombra piena) e stili di tutti i componenti, con breakpoint a 560, 760 e 1100 px e supporto a `prefers-reduced-motion`.
- Alias `@` → `src/` (in `vite.config.ts` e `tsconfig.json`).
- Convenzioni da `AGENTS.md`: componenti esportati come default; stringhe con apostrofo tra doppi apici.

### Pagine

Il routing è fatto a mano in `App` leggendo `window.location.pathname`:

| Percorso | Pagina | Contenuto |
|---|---|---|
| `/v/<vicolo>` | `ElderPage` (anziano) | Nome del vicolo, pulsante «Voglio attraversare» con conferma, stato della richiesta, «Leggi ad alta voce», link «Segnala un pericolo» |
| `/angeli` | `VolunteersPage` (volontari) | Richieste in attesa ordinate per tempo di attesa, pulsante «Arrivo io», poi «Attraversamento completato» |
| `/comune` | `MunicipalityPage` (Comune) | Indicatori del giorno e tabella dei vicoli più a rischio |
| altro | `NotFoundPage` | Link alle tre aree |

### Dati e stato

- Le richieste di attraversamento (`CrossingRequest`: vicolo, minuti di attesa, stato `in_attesa` → `in_arrivo` → `completata`, volontario) stanno in `localStorage` con chiave `passo-sicuro-requests`.
- Le pagine si aggiornano tra loro con l'evento `storage` e con un evento personalizzato `passo-sicuro:update`: funziona tra schede dello **stesso browser**, non tra dispositivi diversi.
- La lettura vocale usa la Web Speech API del browser (`speechSynthesis`, lingua `it-IT`, velocità ridotta).

### Limiti del prototipo

- Il vicolo della pagina anziano è fisso («Vicolo dei Gatti»), anche se il percorso è `/v/<vicolo>`.
- Il volontario che risponde è sempre «Marco».
- I dati della dashboard del Comune e le richieste iniziali sono valori di esempio scritti nel codice.
- «Segnala un pericolo» mostra solo un messaggio di conferma.
- L'attraversamento lo chiude il volontario, non l'anziano.
- Passi e Volontario del mese non sono implementati.
- Nell'interfaccia il servizio si chiama ancora **Passo Sicuro**, che compare anche nelle chiavi di `localStorage`.

## Linee guida

- **Tono:** civico e istituzionale. Niente giochi di parole sui gatti nonostante il nome del Comune.
- **Testi per gli utenti:** in italiano e semplici.
- **Chi aiuta** si chiama sempre semplicemente **volontario**.

## Materiali già pronti

- `depliant/depliant.html`: depliant A4 di due pagine da stampare, una per gli anziani e una per i volontari.
