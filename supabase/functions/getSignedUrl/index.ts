// functions/getSignedUrl/index.ts
/**
 * Supabase Edge Function (Deno + TypeScript)
 * POST /getSignedUrl
 * Body: { "filePath": "path/inside/bucket.jpg" }
 * Auth: Authorization: Bearer <access_token>
 *
 * Behavior:
 *  - Validates incoming JWT (via anon client)
 *  - Confirms the file record exists and belongs to the user (via anon client query filtered by owner_id)
 *  - Uses service-role client to create a signed URL (expires ~60s)
 *  - Returns { signedUrl, expiresIn } on success
 */

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET_NAME = Deno.env.get("BUCKET_NAME") ?? "uploads";
const SIGNED_URL_EXPIRES = Number(Deno.env.get("SIGNED_URL_EXPIRES") ?? "60"); // seconds

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE env vars. Make sure SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set.");
}

// Create two clients:
// 1) anon client - used to validate user token & query files table (RLS-aware if you later attach token to it)
// 2) admin/service-role client - used only to create signed URLs (requires service role key)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

serve(async (req: Request) => {
  // Basic CORS preflight handling (helpful if testing from browser)
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  // Parse JSON body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const filePath: unknown = body?.filePath;
  if (!filePath || typeof filePath !== "string") {
    return jsonResponse({ error: "filePath is required and must be a string" }, 400);
  }

  // Extract bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }
  const token = m[1];

  try {
    // Validate token and retrieve the user (using anon client)
    // supabase.auth.getUser accepts the token and returns user if valid.
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      // token invalid or expired
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }
    const userId = userData.user.id;

    // Verify file record exists and belongs to this user.
    // We use the anon client but explicitly filter owner_id = userId.
    // Using the service role to query here would bypass RLS; we explicitly check ownership to be safe.
    const { data: fileRow, error: fileErr } = await supabase
      .from("files")
      .select("id, path, owner_id")
      .eq("path", filePath)
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();

    if (fileErr) {
      console.error("DB error checking file ownership:", fileErr);
      return jsonResponse({ error: "Internal server error" }, 500);
    }

    if (!fileRow) {
      // No such file owned by this user
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Create signed URL via admin client (service role)
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRES);

    if (signErr || !signedData) {
      console.error("Failed to create signed URL:", signErr);
      return jsonResponse({ error: "Failed to create signed URL" }, 500);
    }

    return jsonResponse({ signedUrl: signedData.signedUrl, expiresIn: SIGNED_URL_EXPIRES }, 200);
  } catch (err) {
    console.error("Unhandled error in function:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

/** Helper to consistently return JSON with appropriate headers */
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
