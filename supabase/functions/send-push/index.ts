// supabase/functions/send-push/index.ts
// Server-side Expo push notification sender
// Deployed to Supabase Edge Functions — never runs on the client device
//
// Invoke from the app:
//   supabase.functions.invoke('send-push', {
//     body: { userIds, message, data, options }
//   })

import { createClient } from "npm:@supabase/supabase-js@2";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface PushPayload {
  userIds: string[];
  message: string;
  data?: Record<string, unknown>;
  options?: {
    pushTitle?: string;
    priority?: "high" | "default" | "normal";
    sound?: string;
    type?: string;
    screen?: string;
    senderId?: string;
    senderName?: string;
  };
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: string;
  priority: "high" | "default";
  channelId?: string;    // ✅ optional — only set on Android
  badge: number;
  ttl: number;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface TokenPair {
  uid: string;
  token: string;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// ✅ REMOVED: EXPO_RECEIPTS_URL — declared but never used (Deno errors on this)
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

const isValidExpoPushToken = (token: unknown): token is string =>
  typeof token === "string" &&
  (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const channelForType = (type?: string): string => {
  if (!type) return "default";
  if (type.includes("goal")) return "goals";
  if (type.includes("task")) return "tasks";
  if (type.includes("invite") || type.includes("joined")) return "collaboration";
  return "default";
};

/* ── Main handler ───────────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return respond(null, 204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  /* ── Auth: verify the caller is a signed-in Supabase user ── */
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  /* ── Supabase admin client (uses service role — never exposed to client) ── */
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  /* ── Verify JWT and get calling user ── */
  const jwt = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const callingUser = authData.user;

  /* ── Parse body ── */
  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // ✅ FIX: renamed `data` → `extraData` to avoid shadowing Supabase query results
  const { userIds, message, data: extraData = {}, options = {} } = payload;

  if (!message || typeof message !== "string") {
    return json({ error: "message is required" }, 400);
  }
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return json({ ok: true, sent: 0, message: "No recipients" });
  }

  /* ── Deduplicate and exclude the sender ── */
  const senderId = options.senderId ?? callingUser.id;
  const uniqueIds = [...new Set(userIds.filter((id) => id && id !== senderId))];

  if (uniqueIds.length === 0) {
    return json({ ok: true, sent: 0, message: "No recipients after filtering sender" });
  }

  /* ── Fetch push tokens from profiles table ── */
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, expo_push_token")
    .in("id", uniqueIds);

  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError);
    return json({ error: "Failed to fetch recipient tokens" }, 500);
  }

  // Build uid → token map, filtering out invalid / missing tokens
  const tokenPairs: TokenPair[] = (profiles ?? [])
    .filter((p) => isValidExpoPushToken(p.expo_push_token))
    .map((p) => ({ uid: p.id, token: p.expo_push_token as string }));

  if (tokenPairs.length === 0) {
    console.warn("No valid Expo push tokens found for recipients:", uniqueIds);
    return json({ ok: false, sent: 0, error: "NO_TOKENS" });
  }

  /* ── Build Expo messages ── */
  const notifType = options.type ?? (extraData.type as string | undefined);
  const channelId = channelForType(notifType);

  // ✅ FIX: extraData replaces old `data` var — no shadowing with Supabase responses
  const expoMessages: ExpoMessage[] = tokenPairs.map(({ token }) => ({
    to: token,
    title: options.pushTitle || "Momentum",
    body: message,
    data: {
      ...extraData,
      type: notifType ?? "general",
      screen: options.screen ?? (extraData.screen as string | undefined) ?? "Home",
      senderId,
      senderName: options.senderName || "Someone",
      timestamp: new Date().toISOString(),
    },
    sound: options.sound ?? "default",
    priority: options.priority === "high" ? "high" : "default",
    channelId,   // Expo ignores this on iOS — Android only
    badge: 1,
    ttl: 2_419_200,  // 28 days
  }));

  /* ── Send in batches of 100 with retry ── */
  const batches = chunk(expoMessages, BATCH_SIZE);
  const allTickets: ExpoTicket[] = [];
  let totalSent = 0;

  for (const batch of batches) {
    let retries = 0;
    let success = false;

    while (!success && retries < MAX_RETRIES) {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Expo API ${res.status}: ${errText}`);
        }

        const expoResponse = await res.json();
        const tickets: ExpoTicket[] = expoResponse?.data ?? [];
        allTickets.push(...tickets);
        totalSent += batch.length;

        /* ── Clean up dead tokens from the DB ── */
        const invalidUids: string[] = [];

        tickets.forEach((ticket, i) => {
          if (
            ticket.status === "error" &&
            (ticket.details?.error === "DeviceNotRegistered" ||
              ticket.message?.includes("invalid credentials"))
          ) {
            const failedToken = batch[i]?.to;
            const pair = tokenPairs.find((p) => p.token === failedToken);
            if (pair) invalidUids.push(pair.uid);
          }
        });

        if (invalidUids.length > 0) {
          console.log(`Clearing ${invalidUids.length} dead token(s):`, invalidUids);
          await supabaseAdmin
            .from("profiles")
            .update({ expo_push_token: null, updated_at: new Date().toISOString() })
            .in("id", invalidUids);
        }

        success = true;
        console.log(`✅ Sent batch of ${batch.length} messages`);
      } catch (err) {
        retries++;
        console.warn(`Push batch attempt ${retries} failed:`, (err as Error).message);
        if (retries < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * retries);
        } else {
          console.error("Max retries reached for push batch");
        }
      }
    }
  }

  console.log(`✅ Push complete — sent to ${totalSent} devices for ${uniqueIds.length} users`);

  return json({
    ok: true,
    sent: totalSent,
    recipients: uniqueIds.length,
    tickets: allTickets,
  });
});

/* ── Response helpers ──────────────────────────────────────────────────────── */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ✅ Used for CORS preflight — returns no body with custom headers
function respond(body: null, status: number, headers: Record<string, string>): Response {
  return new Response(body, { status, headers });
}