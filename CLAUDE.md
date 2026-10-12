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
3. La richiesta arriva in tempo reale agli **Angeli del vicolo**: volontari, negozianti e vigili della zona. Uno di loro risponde «Arrivo».
4. L'anziano vede lo stato con testo grande, colori e lettura vocale, ad esempio «Marco sta arrivando, aspetta qui».
5. Arrivato dall'altra parte, l'anziano preme **«Sono dall'altra parte»**: l'attraversamento risulta completato.

### Due esperienze separate

- **Anziano:** si apre solo dal QR, mostra solo il pulsante e lo stato, nessuna scelta da fare. L'anziano resta anonimo.
- **Angelo:** riceve le richieste, risponde, vede i suoi punti e la classifica. Indica almeno il proprio nome.

Il Comune ha in più una **dashboard** con i risultati.

### Misurare l'efficacia

La dashboard del Comune mostra:
- attraversamenti assistiti e completati;
- tempi di risposta degli angeli;
- vicoli con più richieste, cioè quelli più a rischio.

I dati sono conteggi anonimi per vicolo.

### Gamification (volutamente minima)

- **Passi:** 10 per ogni attraversamento completato, più 5 se l'angelo arriva entro 2 minuti. Vengono assegnati solo quando l'anziano conferma di essere arrivato dall'altra parte.
- **Angelo del mese:** chi ha più Passi nel mese viene pubblicato sul sito e sui social del Comune.
- Non ci sono gradi, badge o altri meccanismi: l'obiettivo è la massima semplicità.

### Privacy

- Niente registrazione per l'anziano e niente GPS: si sa solo da quale vicolo parte la richiesta.
- Le statistiche sono anonime.

## Linee guida

- **Tono:** civico e istituzionale. Niente giochi di parole sui gatti nonostante il nome del Comune.
- **Testi per gli utenti:** in italiano e semplici.

## Materiali già pronti

- `logo/`: logo in SVG (orizzontale, versione per sfondi scuri, verticale, icona app, solo simbolo). Il simbolo è un cuore fatto di strisce pedonali.
- `depliant/depliant.html`: depliant A4 di due pagine da stampare, una per gli anziani e una per gli Angeli del vicolo.
