import { createClient } from "@supabase/supabase-js"

export type DeviceRole = "anziano" | "volontario"
export type AlleyQr = { qrToken: string; name: string }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const pushApplicationServerKey =
  "BInfgWRyebr8H4rChLKjM2KkKOi5N7t9s3tqs7OT3j6JBiwNjSkNIpQlhNr9BOlEm5CBm1BFElFw_1cAYs7tK8M"

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null

export async function getRegisteredRole(): Promise<DeviceRole | null> {
  if (!supabase) throw new Error("Configurazione Supabase mancante.")

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const user = sessionData.session?.user
  if (!user) return null

  const { data, error } = await supabase
    .from("devices")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (error) throw error
  return data?.role === "anziano" || data?.role === "volontario"
    ? data.role
    : null
}

export async function registerDevice(role: DeviceRole) {
  if (!supabase) {
    throw new Error("Configurazione Supabase mancante.")
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError) throw sessionError

  let user = sessionData.session?.user
  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    user = data.user
  }

  const { data: existingDevice, error: lookupError } = await supabase
    .from("devices")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existingDevice) {
    if (existingDevice.role !== role) {
      const existingRole =
        existingDevice.role === "volontario" ? "volontario" : "persona anziana"
      throw new Error(
        `Questo dispositivo è già registrato come ${existingRole}.`,
      )
    }

    return { deviceId: existingDevice.id, alreadyRegistered: true }
  }

  const { data: deviceId, error: registrationError } = await supabase.rpc(
    "register_device",
    { p_role: role },
  )

  if (registrationError) throw registrationError
  return { deviceId, alreadyRegistered: false }
}

function qrTokenFromValue(value: string) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const directValue = value.trim()
  if (uuidPattern.test(directValue)) return directValue

  try {
    const url = new URL(directValue)
    const queryToken =
      url.searchParams.get("qr_token") ?? url.searchParams.get("token")
    if (queryToken && uuidPattern.test(queryToken)) return queryToken

    const pathToken = url.pathname.split("/").filter(Boolean).at(-1)
    if (pathToken && uuidPattern.test(pathToken)) return pathToken
  } catch {
    // QR payload isn't a URL; report it as an invalid alley code below.
  }

  throw new Error("Questo QR non contiene un codice vicolo valido.")
}

export async function findAlleyByQr(value: string): Promise<AlleyQr> {
  if (!supabase) throw new Error("Configurazione Supabase mancante.")
  const qrToken = qrTokenFromValue(value)
  const { data, error } = await supabase
    .from("alleys")
    .select("name")
    .eq("qr_token", qrToken)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Questo QR non corrisponde a un vicolo attivo.")
  return { qrToken, name: data.name }
}

export async function createCrossingRequest(qrToken: string) {
  if (!supabase) throw new Error("Configurazione Supabase mancante.")
  const { data, error } = await supabase.functions.invoke(
    "create-crossing-request",
    { body: { qrToken } },
  )

  if (error) {
    const response = error.context
    if (response instanceof Response) {
      let body: { error?: unknown } | null = null
      try {
        body = await response.clone().json()
      } catch {
        body = null
      }
      if (typeof body?.error === "string") throw new Error(body.error)
    }
    throw error
  }

  return data as {
    requestId: string
    status: RequestStatus
    notifiedVolunteerCount: number
  }
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export async function enableVolunteerPushNotifications() {
  if (!supabase) throw new Error("Configurazione Supabase mancante.")
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Questo browser non supporta le notifiche push.")
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (isIos && !isInstalled) {
    throw new Error(
      "Su iPhone aggiungi prima Passo Sicuro alla schermata Home, poi attiva le notifiche dall’app installata.",
    )
  }
  if (!("PushManager" in window)) {
    throw new Error(
      "Su iPhone le notifiche sono disponibili solo installando l'app sulla schermata Home.",
    )
  }
  if (!pushApplicationServerKey) {
    throw new Error("Le notifiche push non sono ancora configurate.")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Consenti le notifiche per ricevere le richieste di aiuto.")
  }

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(pushApplicationServerKey),
    }))
  const keys = subscription.toJSON().keys
  if (!subscription.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("Non è stato possibile preparare le notifiche push.")
  }

  const { error } = await supabase.rpc("register_volunteer_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_expiration_time: subscription.expirationTime
      ? new Date(subscription.expirationTime).toISOString()
      : null,
  })
  if (error) throw error
}

type RequestStatus = "in_attesa" | "in_arrivo" | "completata"
