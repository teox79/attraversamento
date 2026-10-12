import { useEffect, useMemo, useState, type ReactNode } from "react"

type RequestStatus = "in_attesa" | "in_arrivo" | "completata"
type IconName = "walk" | "volume" | "clock" | "person" | "check" | "warning" | "location" | "arrow" | "shield" | "chart"

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

function TopBar({ title, action }: { title: string action?: ReactNode }) {
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
    title: "Stiamo chiamando un aiuto.",
    subtitle: "Resta qui.",
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

function StatusCard({ status }: { status: RequestStatus }) {
  const content = statusContent[status]
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
        <h2>{content.title}</h2>
        <p className="status-card__subtitle">{content.subtitle}</p>
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
        title="Passo Sicuro"
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

function NotFoundPage() {
  return (
    <main className="page-shell centered-page">
      <Icon name="shield" size="large" />
      <h1>Passo Sicuro</h1>
      <p>Apri una delle aree del servizio.</p>
      <nav className="route-list" aria-label="Pagine disponibili">
        <a href="/v/vicolo-dei-gatti">Persona anziana</a>
        <a href="/angeli">Volontari</a>
        <a href="/comune">Comune</a>
      </nav>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname
  if (path.startsWith("/v/")) return <ElderPage />
  if (path === "/angeli") return <VolunteersPage />
  if (path === "/comune") return <MunicipalityPage />
  return <NotFoundPage />
}
