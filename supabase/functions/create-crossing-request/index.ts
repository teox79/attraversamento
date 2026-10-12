import { createClient } from "jsr:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Metodo non supportato." }, 405)
  }

  const authorization = request.headers.get("Authorization")
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!authorization || !accessToken) {
    return jsonResponse({ error: "Sessione richiesta. Riapri l'app e riprova." }, 401)
  }

  let body: { qrToken?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: "Richiesta non valida." }, 400)
  }

  if (
    typeof body.qrToken !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.qrToken,
    )
  ) {
    return jsonResponse({ error: "Codice QR del vicolo non valido." }, 400)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")
  const publishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse({ error: "Configurazione Supabase incompleta." }, 500)
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } =
    await userClient.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return jsonResponse({ error: "Sessione non valida. Accedi di nuovo." }, 401)
  }

  const { data, error } = await userClient.rpc("request_crossing", {
    p_qr_token: body.qrToken,
  })
  if (error) {
    const denied = error.code === "42501"
    const notFound = error.code === "22023"
    return jsonResponse(
      {
        error: denied
          ? "Questo dispositivo non è registrato come persona anziana."
          : notFound
            ? "Questo QR non corrisponde a un vicolo attivo."
            : "Non è stato possibile registrare la richiesta. Riprova.",
      },
      denied ? 403 : notFound ? 404 : 500,
    )
  }

  let notifiedVolunteerCount = 0
  if (serviceRoleKey && vapidPublicKey && vapidPrivateKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_secret")

    if (subscriptionsError) {
      console.error("Impossibile leggere le sottoscrizioni push", subscriptionsError)
    } else if (subscriptions?.length) {
      webpush.setVapidDetails(
        "https://cslcpywrlfwtqqfrlvse.supabase.co",
        vapidPublicKey,
        vapidPrivateKey,
      )
      const expiredEndpoints: string[] = []
      const results = await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth_secret,
                },
              },
              JSON.stringify({
                title: "Nuova richiesta di aiuto",
                body: "Una persona ha chiesto aiuto per attraversare. Apri Passo Sicuro.",
                url: "/volontari",
                requestId: data.id,
              }),
              { TTL: 60 },
            )
          } catch (error) {
            const statusCode = (error as { statusCode?: number })?.statusCode
            if (statusCode === 404 || statusCode === 410) {
              expiredEndpoints.push(subscription.endpoint)
            }
            throw error
          }
        }),
      )
      notifiedVolunteerCount = results.filter((result) => result.status === "fulfilled").length
      if (expiredEndpoints.length) {
        await adminClient
          .from("push_subscriptions")
          .delete()
          .in("endpoint", expiredEndpoints)
      }
      const failedCount = results.length - notifiedVolunteerCount
      if (failedCount) {
        console.error(`Invio push non riuscito per ${failedCount} sottoscrizioni.`)
      }
    }
  } else {
    console.error("Configurazione Web Push mancante: richiesta salvata senza inviare push.")
  }

  return jsonResponse({
    requestId: data.id,
    status: data.status,
    createdAt: data.created_at,
    notifiedVolunteerCount,
  }, 201)
})
