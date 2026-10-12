import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Camera, Check, CircleHelp, X } from "lucide-react"
import {
  createCrossingRequest,
  enableVolunteerPushNotifications,
  findAlleyByQr,
  getRegisteredRole,
  registerDevice,
  type AlleyQr,
  type DeviceRole,
} from "./lib/supabase"

type RequestStatus = "in_attesa" | "in_arrivo" | "completata"
type IconName = "walk" | "volume" | "clock" | "person" | "check" | "warning" | "location" | "arrow" | "shield" | "chart"

function appPath(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`
}

type CrossingRequest = {
  id: number
  vicolo: string
  minutes: number
  status: RequestStatus
  volunteer?: string
}

const initialRequests: CrossingRequest[] = [
  { id: 1, vicolo: "Vicolo dei Gatti", minutes: 12, status: "in_attesa" },
  { id: 2, vicolo: "Vicolo del Fico", minutes: 8, status: "in_attesa" },
  { id: 3, vicolo: "Vicolo delle Rose", minutes: 4, status: "in_attesa" },
]

const STORAGE_KEY = "passo-sicuro-requests"

function getRequests(): CrossingRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : initialRequests
  } catch {
    return initialRequests
  }
}

function saveRequests(requests: CrossingRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
  window.dispatchEvent(new CustomEvent("passo-sicuro:update"))
}

function useRequests() {
  const [requests, setRequests] = useState<CrossingRequest[]>(getRequests)

  useEffect(() => {
    const update = () => setRequests(getRequests())
    window.addEventListener("storage", update)
    window.addEventListener("passo-sicuro:update", update)
    return () => {
      window.removeEventListener("storage", update)
      window.removeEventListener("passo-sicuro:update", update)
    }
  }, [])

  const updateRequest = (id: number, patch: Partial<CrossingRequest>) => {
    saveRequests(
      getRequests().map((request) =>
        request.id === id ? { ...request, ...patch } : request,
      ),
    )
  }

  const createRequest = (vicolo: string) => {
    const current = getRequests()
    const existing = current.find(
      (request) => request.vicolo === vicolo && request.status !== "completata",
    )
    if (existing) return existing

    const request: CrossingRequest = {
      id: Date.now(),
      vicolo,
      minutes: 0,
      status: "in_attesa",
    }
    saveRequests([request, ...current])
    return request
  }

  return { requests, updateRequest, createRequest }
}

function Icon({
  name,
  size = "medium",
}: {
  name: IconName
  size?: "medium" | "large"
}) {
  const paths: Record<IconName, ReactNode> = {
    walk: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <path d="m10 22 1.5-6 2.5-3 2 3 4 1" />
        <path d="m8 12 3.5-3 3.5 2 3-1" />
        <path d="m14 13-3 3-4 5" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    warning: (
      <>
        <path d="M12 3 2.5 21h19L12 3Z" />
        <path d="M12 9v5M12 18h.01" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    shield: (
      <>
        <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Z" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className={`icon icon--${size}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

type BigButtonProps = {
  children: ReactNode
  icon: IconName
  variant?: "primary" | "success" | "danger" | "secondary"
  size?: "L" | "XL"
  onClick?: () => void
  disabled?: boolean
}

function BigButton({
  children,
  icon,
  variant = "primary",
  size = "L",
  onClick,
  disabled,
}: BigButtonProps) {
  return (
    <button
      className={`big-button big-button--${variant} big-button--${size.toLowerCase()}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={size === "XL" ? "large" : "medium"} />
      <span>{children}</span>
    </button>
  )
}

function AppName() {
  return (
    <>
      Attraversi<span className="app-name__accent">AMO</span>
    </>
  )
}

function TopBar({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <header className="top-bar">
      <div className="brand-mark" aria-hidden="true">
        <Icon name="shield" />
      </div>
      <h1>{title}</h1>
      {action && <div className="top-bar__action">{action}</div>}
    </header>
  )
}

function VicoloHeader({ name }: { name: string }) {
  return (
    <header className="vicolo-header">
      <div className="eyebrow">
        <Icon name="location" />
        <span>Sei qui</span>
      </div>
      <h1>{name}</h1>
      <p>Quando sei pronto, chiedi una mano per attraversare in sicurezza.</p>
    </header>
  )
}

const statusContent: Record<RequestStatus, {
  icon: IconName
  label: string
  title: string
  subtitle: string
}> = {
  in_attesa: {
    icon: "clock",
    label: "Richiesta inviata",
    title: "Abbiamo avvisato i volontari.",
    subtitle: "Attendi qui: ti aggiorneremo appena qualcuno sarà disponibile.",
  },
  in_arrivo: {
    icon: "person",
    label: "Aiuto in arrivo",
    title: "Marco sta arrivando.",
    subtitle: "Aspettalo qui.",
  },
  completata: {
    icon: "check",
    label: "Attraversamento completato",
    title: "Sei arrivato dall’altra parte.",
    subtitle: "Bravo!",
  },
}

function StatusCard({
  status,
  notifiedVolunteerCount,
}: {
  status: RequestStatus
  notifiedVolunteerCount?: number | null
}) {
  const content = statusContent[status]
  const waitingTitle =
    status === "in_attesa" && notifiedVolunteerCount === 0
      ? "Richiesta registrata."
      : content.title
  const waitingSubtitle =
    status !== "in_attesa" || notifiedVolunteerCount == null
      ? content.subtitle
      : notifiedVolunteerCount === 0
        ? "Nessun volontario ha attivato le notifiche push. Resta qui e chiedi aiuto a qualcuno vicino."
        : `Abbiamo avvisato ${notifiedVolunteerCount} volontari. Attendi qui: ti aggiorneremo appena qualcuno sarà disponibile.`
  return (
    <section
      className={`status-card status-card--${status}`}
      aria-live="polite"
    >
      <div className="status-card__icon">
        <Icon name={content.icon} size="large" />
      </div>
      <div>
        <p className="status-card__label">{content.label}</p>
        <h2>{waitingTitle}</h2>
        <p className="status-card__subtitle">{waitingSubtitle}</p>
      </div>
    </section>
  )
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = "it-IT"
  utterance.rate = 0.82
  window.speechSynthesis.speak(utterance)
}

function ReadAloudButton({ text }: { text: string }) {
  return (
    <button className="read-button" type="button" onClick={() => speak(text)}>
      <Icon name="volume" />
      <span>Leggi ad alta voce</span>
    </button>
  )
}

function ConfirmDialog({
  open,
  onYes,
  onNo,
}: {
  open: boolean
  onYes: () => void
  onNo: () => void
}) {
  if (!open) return null
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="confirm-dialog__icon">
          <Icon name="person" size="large" />
        </div>
        <h2 id="confirm-title">Vuoi che qualcuno venga ad aiutarti?</h2>
        <p>Un volontario vicino riceverà la tua richiesta.</p>
        <div className="confirm-dialog__actions">
          <BigButton icon="check" variant="primary" onClick={onYes}>
            Sì, aiutami
          </BigButton>
          <BigButton icon="arrow" variant="secondary" onClick={onNo}>
            No, torna indietro
          </BigButton>
        </div>
      </div>
    </div>
  )
}

function AlertBanner({
  type,
  children,
}: {
  type: "info" | "danger"
  children: ReactNode
}) {
  return (
    <div
      className={`alert alert--${type}`}
      role={type === "danger" ? "alert" : "status"}
    >
      <Icon name={type === "danger" ? "warning" : "shield"} />
      <span>{children}</span>
    </div>
  )
}

function RequestListItem({
  request,
  onAccept,
}: {
  request: CrossingRequest
  onAccept: () => void
}) {
  return (
    <article className="request-item">
      <div className="request-item__place">
        <div className="request-item__pin">
          <Icon name="location" />
        </div>
        <div>
          <h2>{request.vicolo}</h2>
          <p>
            <strong>{request.minutes} minuti</strong> di attesa
          </p>
        </div>
      </div>
      {request.status === "in_attesa" ? (
        <BigButton icon="arrow" onClick={onAccept}>
          Arrivo io
        </BigButton>
      ) : (
        <div className="assigned-label">
          <Icon name="check" />
          <span>Te ne occupi tu</span>
        </div>
      )}
    </article>
  )
}

function KpiTile({
  value,
  label,
  variation,
  tone = "blue",
}: {
  value: string
  label: string
  variation: string
  tone?: "blue" | "green" | "orange" | "red"
}) {
  return (
    <article className={`kpi-tile kpi-tile--${tone}`}>
      <p className="kpi-tile__value">{value}</p>
      <h2>{label}</h2>
      <p className="kpi-tile__variation">{variation}</p>
    </article>
  )
}

function ElderPage() {
  const vicolo = "Vicolo dei Gatti"
  const { requests, createRequest } = useRequests()
  const activeRequest = requests.find((request) => request.vicolo === vicolo)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [status, setStatus] = useState<RequestStatus | null>(
    activeRequest?.status ?? null,
  )

  useEffect(() => {
    if (activeRequest?.status && activeRequest.status !== status) {
      setStatus(activeRequest.status)
      const content = statusContent[activeRequest.status]
      speak(`${content.title} ${content.subtitle}`)
    }
  }, [activeRequest?.status, status])

  const confirm = () => {
    const request = createRequest(vicolo)
    setDialogOpen(false)
    setStatus(request.status)
    const content = statusContent[request.status]
    speak(`${content.title} ${content.subtitle}`)
  }

  const spokenText = status
    ? `${statusContent[status].title} ${statusContent[status].subtitle}`
    : `${vicolo}. Quando sei pronto, premi Voglio attraversare.`

  return (
    <main className="elder-page page-shell">
      <div className="elder-page__content">
        <VicoloHeader name={vicolo} />
        {status ? (
          <StatusCard status={status} />
        ) : (
          <BigButton icon="walk" size="XL" onClick={() => setDialogOpen(true)}>
            Voglio attraversare
          </BigButton>
        )}
        <ReadAloudButton text={spokenText} />
      </div>
      <button
        className="danger-link"
        type="button"
        onClick={() => window.alert("Segnalazione registrata. Grazie.")}
      >
        <Icon name="warning" />
        <span>Segnala un pericolo</span>
      </button>
      <ConfirmDialog
        open={dialogOpen}
        onYes={confirm}
        onNo={() => setDialogOpen(false)}
      />
    </main>
  )
}

function VolunteersPage() {
  const { requests, updateRequest } = useRequests()
  const [selectedId, setSelectedId] = useState<number | null>(
    requests.find((request) => request.status === "in_arrivo")?.id ?? null,
  )
  const selected = requests.find((request) => request.id === selectedId)
  const waiting = useMemo(
    () =>
      requests
        .filter((request) => request.status === "in_attesa")
        .sort((a, b) => b.minutes - a.minutes),
    [requests],
  )

  const accept = (request: CrossingRequest) => {
    updateRequest(request.id, { status: "in_arrivo", volunteer: "Marco" })
    setSelectedId(request.id)
  }

  const complete = () => {
    if (!selectedId) return
    updateRequest(selectedId, { status: "completata" })
    setSelectedId(null)
  }

  return (
    <main className="page-shell">
      <TopBar title="Richieste vicino a te" />
      <div className="content-shell">
        <VolunteerPushSetup />
        {selected?.status === "in_arrivo" && (
          <section className="active-mission">
            <div>
              <p className="eyebrow">Stai andando da</p>
              <h2>{selected.vicolo}</h2>
              <p>La persona sa che stai arrivando.</p>
            </div>
            <BigButton icon="check" variant="success" onClick={complete}>
              Attraversamento completato
            </BigButton>
          </section>
        )}

        <div className="section-heading">
          <div>
            <p className="eyebrow">In attesa</p>
            <h2>{waiting.length} richieste da aiutare</h2>
          </div>
          <div className="count-badge">{waiting.length}</div>
        </div>

        <div className="request-list">
          {waiting.map((request) => (
            <RequestListItem
              key={request.id}
              request={request}
              onAccept={() => accept(request)}
            />
          ))}
          {waiting.length === 0 && (
            <AlertBanner type="info">
              Non ci sono nuove richieste. Ottimo lavoro.
            </AlertBanner>
          )}
        </div>
      </div>
    </main>
  )
}

function VolunteerPushSetup() {
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active && subscription) setEnabled(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const enable = async () => {
    setSaving(true)
    setMessage("")
    try {
      await enableVolunteerPushNotifications()
      setEnabled(true)
      setMessage("Notifiche attive: riceverai un avviso quando qualcuno chiede aiuto.")
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Non è stato possibile attivare le notifiche.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="push-setup" aria-live="polite">
      <div>
        <h2>Ricevi le richieste</h2>
        <p>Attiva le notifiche per essere avvisato anche con l’app chiusa.</p>
      </div>
      {!enabled && (
        <BigButton
          icon="check"
          variant="primary"
          disabled={saving}
          onClick={() => void enable()}
        >
          {saving ? "Attivazione…" : "Attiva notifiche"}
        </BigButton>
      )}
      {message && <p role="status">{message}</p>}
      {enabled && !message && <p role="status">Notifiche push attive.</p>}
    </section>
  )
}

const riskyAlleys = [
  {
    name: "Vicolo dei Gatti",
    requests: 18,
    response: "6 min",
    reports: 4,
    level: "Alta",
  },
  {
    name: "Vicolo del Fico",
    requests: 14,
    response: "5 min",
    reports: 2,
    level: "Alta",
  },
  {
    name: "Vicolo delle Rose",
    requests: 9,
    response: "4 min",
    reports: 1,
    level: "Media",
  },
  {
    name: "Vicolo San Luca",
    requests: 6,
    response: "3 min",
    reports: 0,
    level: "Bassa",
  },
]

function MunicipalityPage() {
  return (
    <main className="page-shell dashboard">
      <TopBar
        title={<AppName />}
        action={<span className="admin-label">Comune · Oggi</span>}
      />
      <div className="content-shell">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">Quadro operativo</p>
            <h2>La città, a colpo d’occhio</h2>
            <p>Dati aggiornati in tempo reale sulle richieste di assistenza.</p>
          </div>
          <div className="live-badge">
            <span className="live-badge__dot" />
            Aggiornato ora
          </div>
        </div>

        <section className="kpi-grid" aria-label="Indicatori principali">
          <KpiTile
            value="47"
            label="Attraversamenti assistiti oggi"
            variation="↑ 12% rispetto a ieri"
            tone="green"
          />
          <KpiTile
            value="4 min"
            label="Tempo medio di risposta"
            variation="↓ 1 min questa settimana"
            tone="blue"
          />
          <KpiTile
            value="3"
            label="Richieste senza risposta"
            variation="Richiedono attenzione"
            tone="orange"
          />
          <KpiTile
            value="7"
            label="Segnalazioni aperte"
            variation="2 nuove oggi"
            tone="red"
          />
        </section>

        <section className="risk-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Priorità di intervento</p>
              <h2>Vicoli più a rischio</h2>
            </div>
            <div className="table-icon">
              <Icon name="chart" />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vicolo</th>
                  <th>Richieste</th>
                  <th>Risposta media</th>
                  <th>Segnalazioni</th>
                  <th>Rischio</th>
                </tr>
              </thead>
              <tbody>
                {riskyAlleys.map((alley) => (
                  <tr key={alley.name}>
                    <td>
                      <strong>{alley.name}</strong>
                    </td>
                    <td>{alley.requests}</td>
                    <td>{alley.response}</td>
                    <td>{alley.reports}</td>
                    <td>
                      <span
                        className={`risk risk--${alley.level.toLowerCase()}`}
                      >
                        {alley.level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function QrScanner({
  onClose,
  onScan,
}: {
  onClose: () => void
  onScan: (value: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraError, setCameraError] = useState("")
  const [cameraStarting, setCameraStarting] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "La fotocamera non è disponibile. Apri AttraversiAMO con una connessione HTTPS o da localhost.",
      )
      return
    }

    let active = true
    let foundCode = false
    let controls: { stop: () => void } | undefined
    let reader: { reset: () => void } | undefined

    import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (!active) return
        const qrReader = new BrowserQRCodeReader()
        reader = qrReader
        return qrReader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (result) => {
            if (!active || foundCode || !result) return
            foundCode = true
            onScan(result.getText())
            controls?.stop()
          },
        )
      })
      .then((cameraControls) => {
        if (!cameraControls) return
        controls = cameraControls
        setCameraStarting(false)
        if (!active) cameraControls.stop()
      })
      .catch(() => {
        if (active) {
          setCameraStarting(false)
          setCameraError(
            "Non riesco ad aprire la fotocamera. Controlla i permessi del browser e riprova.",
          )
        }
      })

    return () => {
      active = false
      controls?.stop()
      reader?.reset()
    }
  }, [onScan])

  return (
    <div className="scanner-backdrop" role="presentation">
      <section
        className="scanner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
      >
        <button
          className="scanner-close"
          type="button"
          onClick={onClose}
          aria-label="Chiudi fotocamera"
        >
          <X aria-hidden="true" />
        </button>
        <div className="scanner-dialog__heading">
          <Camera aria-hidden="true" />
          <div>
            <p className="eyebrow">AttraversiAMO</p>
            <h2 id="scanner-title">Inquadra il QR del vicolo</h2>
          </div>
        </div>
        {cameraError ? (
          <div className="scanner-error" role="alert">
            <CircleHelp aria-hidden="true" />
            <p>{cameraError}</p>
          </div>
        ) : (
          <div className="scanner-preview">
            <video ref={videoRef} muted playsInline aria-label="Fotocamera" />
            <div className="scanner-frame" aria-hidden="true" />
            {cameraStarting && (
              <p className="scanner-starting" role="status">
                Avvio della fotocamera…
              </p>
            )}
          </div>
        )}
        <p className="scanner-dialog__hint">
          La fotocamera serve solo a leggere il codice. Non scattiamo né
          salviamo immagini.
        </p>
      </section>
    </div>
  )
}

function HomePage({
  registeringRole,
  registrationError,
  registeredRole,
  checkingRegistration,
  onSelectRole,
}: {
  registeringRole: DeviceRole | null
  registrationError: string
  registeredRole: DeviceRole | null
  checkingRegistration: boolean
  onSelectRole: (role: DeviceRole, destination: string) => void
}) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selectedAlley, setSelectedAlley] = useState<AlleyQr | null>(null)
  const [lookingUpAlley, setLookingUpAlley] = useState(false)
  const [savingRequest, setSavingRequest] = useState(false)
  const [requestStatus, setRequestStatus] = useState<RequestStatus | null>(null)
  const [notifiedVolunteerCount, setNotifiedVolunteerCount] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [scanError, setScanError] = useState("")
  const handleScan = useCallback(async (value: string) => {
    setScannerOpen(false)
    setScanError("")
    setSelectedAlley(null)
    setLookingUpAlley(true)
    try {
      setSelectedAlley(await findAlleyByQr(value))
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "Non riesco a riconoscere questo QR. Riprova.",
      )
    } finally {
      setLookingUpAlley(false)
    }
  }, [])

  const submitCrossingRequest = async () => {
    if (!selectedAlley) return
    setSavingRequest(true)
    setConfirmOpen(false)
    setScanError("")
    try {
      const request = await createCrossingRequest(selectedAlley.qrToken)
      setRequestStatus(request.status)
      setNotifiedVolunteerCount(request.notifiedVolunteerCount)
      const content = statusContent[request.status]
      const confirmation =
        request.status === "in_attesa" && request.notifiedVolunteerCount === 0
          ? "La richiesta è registrata, ma nessun volontario ha le notifiche attive. Resta qui e chiedi aiuto a qualcuno vicino."
          : request.status === "in_attesa"
            ? `Abbiamo avvisato ${request.notifiedVolunteerCount} volontari. Attendi qui.`
            : `${content.title} ${content.subtitle}`
      speak(confirmation)
    } catch (error) {
      setScanError(
        error instanceof Error
          ? error.message
          : "Non è stato possibile inviare la richiesta. Riprova.",
      )
    } finally {
      setSavingRequest(false)
    }
  }

  return (
    <main className="page-shell centered-page">
      <Icon name="shield" size="large" />
      <h1>
        <AppName />
      </h1>
      {checkingRegistration ? (
        <p role="status">Controllo della registrazione…</p>
      ) : registeredRole === "anziano" ? (
        <>
          {requestStatus ? (
            <StatusCard
              status={requestStatus}
              notifiedVolunteerCount={notifiedVolunteerCount}
            />
          ) : selectedAlley ? (
            <>
              <VicoloHeader name={selectedAlley.name} />
              <BigButton
                icon="walk"
                size="XL"
                disabled={savingRequest}
                onClick={() => setConfirmOpen(true)}
              >
                {savingRequest ? "Invio richiesta…" : "Chiedi aiuto"}
              </BigButton>
              <button
                className="read-button"
                type="button"
                onClick={() => setSelectedAlley(null)}
              >
                Scansiona un altro vicolo
              </button>
            </>
          ) : (
            <>
              <p>Per chiedere aiuto, scansiona il QR del vicolo.</p>
              <button
                className="camera-button"
                type="button"
                onClick={() => {
                  setScanError("")
                  setScannerOpen(true)
                }}
                disabled={lookingUpAlley}
              >
                <Camera aria-hidden="true" className="camera-button__icon" />
                <span>Scansiona il QR</span>
                <span className="camera-button__hint">Apri la fotocamera</span>
              </button>
              {lookingUpAlley && <p role="status">Cerco il vicolo…</p>}
            </>
          )}
          {scanError && <p className="registration-message" role="alert">{scanError}</p>}
          <ConfirmDialog
            open={confirmOpen}
            onYes={() => void submitCrossingRequest()}
            onNo={() => setConfirmOpen(false)}
          />
        </>
      ) : registeredRole === "volontario" ? (
        <>
          <p>Il dispositivo è registrato come volontario.</p>
          <button
            className="camera-button camera-button--volunteer"
            type="button"
            onClick={() => window.location.assign(appPath("volontari"))}
          >
            <Icon name="person" size="large" />
            <span>Apri le richieste</span>
          </button>
        </>
      ) : (
        <>
          <p>Apri una delle aree del servizio.</p>
          <nav className="route-list" aria-label="Pagine disponibili">
            <button
              type="button"
              onClick={() =>
                onSelectRole("anziano", appPath(""))
              }
              disabled={registeringRole !== null}
            >
              {registeringRole === "anziano" ? "Registrazione…" : "Persona anziana"}
            </button>
            <button
              type="button"
              onClick={() =>
                onSelectRole("volontario", appPath("volontari"))
              }
              disabled={registeringRole !== null}
            >
              {registeringRole === "volontario" ? "Registrazione…" : "Volontari"}
            </button>
          </nav>
        </>
      )}
      <a className="home-municipality-link" href={appPath("comune")}>
        Comune
      </a>
      {registrationError && (
        <p className="registration-message" role="alert">
          {registrationError}
        </p>
      )}
      {scannerOpen && (
        <QrScanner onClose={() => setScannerOpen(false)} onScan={handleScan} />
      )}
    </main>
  )
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function PwaInstallControl() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  )
  const [showHelp, setShowHelp] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsInstalled(standalone)

    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => setIsInstalled(true)

    window.addEventListener("beforeinstallprompt", onInstallPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const installOrExplain = async () => {
    if (isIos || !installPrompt) {
      setShowHelp(true)
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    if (choice.outcome === "accepted") setIsInstalled(true)
    else setShowHelp(true)
  }

  if (isInstalled) return null

  return (
    <>
      <button
        className="pwa-install-button"
        type="button"
        onClick={installOrExplain}
        aria-haspopup="dialog"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
        </svg>
        <span>Installa l’app</span>
      </button>

      {showHelp && (
        <div
          className="pwa-help-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false)
          }}
        >
          <section
            className="pwa-help"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-help-title"
          >
            <button
              className="pwa-help__close"
              type="button"
              onClick={() => setShowHelp(false)}
              aria-label="Chiudi istruzioni"
            >
              ×
            </button>
            <div className="pwa-help__icon" aria-hidden="true">
              <Icon name="shield" size="large" />
            </div>
            <p className="eyebrow">AttraversiAMO sul tuo telefono</p>
            <h2 id="pwa-help-title">
              {isIos ? "Aggiungila alla schermata Home" : "Installa AttraversiAMO"}
            </h2>
            {isIos ? (
              <ol>
                <li>Apri questa pagina in Safari.</li>
                <li>Tocca il pulsante Condividi, il quadrato con la freccia.</li>
                <li>Scegli “Aggiungi alla schermata Home”, poi tocca “Aggiungi”.</li>
              </ol>
            ) : (
              <ol>
                <li>Apri il menu del browser, ⋮ in alto a destra.</li>
                <li>Tocca “Installa app” o “Aggiungi a schermata Home”.</li>
                <li>Conferma con “Installa” o “Aggiungi”.</li>
              </ol>
            )}
            <button
              className="big-button big-button--primary"
              type="button"
              onClick={() => setShowHelp(false)}
            >
              Ho capito
            </button>
          </section>
        </div>
      )}
    </>
  )
}

export default function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "")
  const currentPath = window.location.pathname
  const path = basePath && currentPath.startsWith(basePath)
    ? currentPath.slice(basePath.length) || "/"
    : currentPath
  const legacyLaunchPath = path.replace(/\/$/, "") === "/v/vicolo-dei-gatti"

  useEffect(() => {
    if (legacyLaunchPath) window.location.replace(appPath(""))
  }, [legacyLaunchPath])

  const [registeringRole, setRegisteringRole] = useState<DeviceRole | null>(null)
  const [registrationError, setRegistrationError] = useState("")
  const [registeredRole, setRegisteredRole] = useState<DeviceRole | null>(null)
  const [checkingRegistration, setCheckingRegistration] = useState(path === "/")

  useEffect(() => {
    if (path !== "/") return
    let active = true
    getRegisteredRole()
      .then((role) => {
        if (active) setRegisteredRole(role)
      })
      .catch((error) => {
        if (active) {
          setRegistrationError(
            error instanceof Error
              ? error.message
              : "Non riesco a controllare la registrazione. Riprova.",
          )
        }
      })
      .finally(() => {
        if (active) setCheckingRegistration(false)
      })
    return () => {
      active = false
    }
  }, [path])

  const selectRole = async (role: DeviceRole, destination: string) => {
    setRegistrationError("")
    setRegisteringRole(role)
    try {
      await registerDevice(role)
      setRegisteredRole(role)
      window.location.assign(destination)
    } catch (error) {
      setRegistrationError(
        error instanceof Error
          ? error.message
          : "Non è stato possibile registrare il dispositivo. Riprova.",
      )
      setRegisteringRole(null)
    }
  }

  let page: ReactNode
  if (legacyLaunchPath) page = null
  else if (path.startsWith("/v/")) page = <ElderPage />
  else if (path === "/volontari") page = <VolunteersPage />
  else if (path === "/comune") page = <MunicipalityPage />
  else {
    page = (
      <HomePage
        registeringRole={registeringRole}
        registrationError={registrationError}
        registeredRole={registeredRole}
        checkingRegistration={checkingRegistration}
        onSelectRole={selectRole}
      />
    )
  }

  return (
    <>
      {page}
      <PwaInstallControl />
    </>
  )
}
