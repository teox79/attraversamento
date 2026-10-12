# Schema Supabase di Passo Sicuro

La proposta è implementata nella migration `migrations/20261012000000_create_passo_sicuro_schema.sql`.

## Modello dati

- **devices** associa un utente Supabase Auth anonimo a un dispositivo e a un ruolo (`anziano` o `volontario`). Non salva nome, email o telefono. Gli UUID sono identificativi pseudonimi e non vanno trattati come dati anonimi in senso assoluto.
- **alleys** contiene il nome del vicolo e un `qr_token` casuale. Il QR contiene solo quel token; la pagina lo usa per recuperare il vicolo attivo. Nessun dato personale è codificato nel QR.
- **crossing_requests** registra vicolo, stato e orari del flusso. Le sole associazioni sono gli UUID dei dispositivi richiedente e volontario assegnato. Non registra coordinate, indirizzi, note libere o dati di contatto.
- **crossing_stats_by_alley** e **crossing_daily_stats_by_alley** aggregano volumi, esiti e tempi per vicolo. Le viste non restituiscono identificativi dei dispositivi o delle richieste.

Gli stati sono `in_attesa`, `in_arrivo`, `completata` e `annullata`. Le statistiche giornaliere usano il fuso `Europe/Rome`.

## Flusso applicativo

1. Il client crea una sessione con Supabase Anonymous Auth. Quando la persona sceglie “Anziano” o “Volontario” all'avvio, il client chiama `register_device(p_role)` con `anziano` o `volontario`. La funzione crea la riga dispositivo e restituisce il suo UUID.
2. Il QR contiene il `qr_token` di `alleys`. Il client legge il vicolo attivo e presenta il nome alla persona.
3. Alla richiesta, il client chiama `request_crossing(p_qr_token)`. La funzione verifica il ruolo, risolve il token e crea la richiesta con timestamp e dispositivo richiedente impostati dal database.
4. Tutti i client volontario autenticati si iscrivono agli eventi `INSERT` di `public.crossing_requests` su Supabase Realtime. La policy RLS permette ai volontari di vedere le richieste, e al richiedente e al volontario assegnato di vedere la propria richiesta.
5. Un volontario chiama `claim_crossing_request(p_request_id)`; quando l'attraversamento è finito, lo stesso volontario chiama `complete_crossing_request(p_request_id)`. Il richiedente può annullare solo una richiesta ancora in attesa con `cancel_crossing_request(p_request_id)`.

Esempio dopo la scelta nell'app:

    await supabase.rpc("register_device", { p_role: "volontario" })

Esempio di sottoscrizione lato volontario con supabase-js:

    supabase
      .channel("volunteer-crossing-requests")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crossing_requests" },
        ({ new: request }) => {
          // Aggiorna la lista e mostra un avviso nell'app.
        },
      )
      .subscribe()

La migration aggiunge `crossing_requests` alla publication `supabase_realtime`; le modifiche di tabella da sole non attivano una sottoscrizione client. Realtime avvisa i volontari connessi. Per avvisare anche un'app chiusa serve un canale push separato (per esempio Web Push), non una sottoscrizione Realtime.

## Ruolo scelto all'avvio

Il ruolo viene determinato dalla scelta nell'app, come richiesto. La registrazione è idempotente: se la sessione anonima ha già un dispositivo con quel ruolo, la funzione restituisce lo stesso UUID senza creare una seconda riga. Se la sessione è già registrata con l'altro ruolo, la funzione rifiuta la modifica e l'app mostra un messaggio. Questa scelta è una classificazione funzionale, non una verifica dell'identità o dell'affidabilità della persona.

## Dati iniziali dei vicoli

I vicoli si inseriscono da una migration di seed o da un backend amministrativo. Per ottenere i token da stampare nei QR:

    select name, qr_token
    from public.alleys
    where is_active
    order by name;

## Applicazione delle migration

Dalla root del progetto puoi usare la toolbox copiata e adattata da
`volley_2026/scripts/supabase-toolbox.sh`:

    npm run supabase:toolbox

Oppure lanciare i comandi direttamente:

    npm run supabase:toolbox -- status
    npm run supabase:toolbox -- migrations
    npm run supabase:toolbox -- link
    npm run supabase:toolbox -- push --dry-run
    npm run supabase:toolbox -- push

La toolbox ricava il riferimento del progetto da `VITE_SUPABASE_URL` in
`.env.local` (oppure legge `SUPABASE_PROJECT_REF`). Il comando `push` mostra
il progetto e chiede conferma prima di inviare le migration; `--dry-run` non
collega la CLI e non modifica il database. Serve la Supabase CLI installata e
autenticata. La chiave publishable dell'app non viene usata per operazioni
amministrative e il token CLI, se configurato, non viene mai stampato.

Per applicare una migration dopo averla esaminata:

    npm run supabase:toolbox -- push

Le tabelle `devices` e `crossing_requests` hanno RLS attiva. Le viste statistiche espongono solo aggregati ai client autenticati; la tabella delle richieste resta accessibile solo secondo le policy indicate.
