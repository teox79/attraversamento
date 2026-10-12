import { createClient } from "@supabase/supabase-js"

export type DeviceRole = "anziano" | "volontario"

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
