import { createClient } from "@supabase/supabase-js"

export type DeviceRole = "anziano" | "volontario"
export type AlleyQr = { qrToken: string; name: string }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

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

  return data as { requestId: string; status: RequestStatus }
}

type RequestStatus = "in_attesa" | "in_arrivo" | "completata"
