import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveKey(...values: (string | undefined)[]) {
  for (const value of values) {
    if (!value) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && "default" in parsed && typeof parsed.default === "string") {
        return parsed.default;
      }
    } catch {
      return value;
    }
    return value;
  }
  return undefined;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { message: "Metode tidak diizinkan." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return jsonResponse(401, { message: "Sesi login tidak ditemukan." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = resolveKey(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
  );
  const serviceRoleKey = resolveKey(
    Deno.env.get("SUPABASE_SECRET_KEY"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    Deno.env.get("SUPABASE_SECRET_KEYS"),
  );
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { message: "Konfigurasi fungsi penghapusan belum lengkap." });
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return jsonResponse(401, { message: "Sesi login tidak valid." });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller, error: callerError } = await adminClient
      .from("profiles")
      .select("role, approval_status, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (callerError) return jsonResponse(500, { message: "Peran Admin tidak dapat diverifikasi." });
    if (!caller || caller.role !== "admin" || caller.approval_status !== "approved" || !caller.is_active) {
      return jsonResponse(403, { message: "Hanya Admin aktif yang dapat menghapus akun." });
    }

    let body: { userId?: unknown };
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { message: "Permintaan tidak valid." });
    }
    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    if (!targetUserId) return jsonResponse(400, { message: "Akun yang akan dihapus tidak valid." });
    if (targetUserId === user.id) return jsonResponse(400, { message: "Admin tidak dapat menghapus akun yang sedang digunakan." });

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetError) return jsonResponse(500, { message: "Data akun tidak dapat diperiksa." });
    if (!target) return jsonResponse(404, { message: "Akun tidak ditemukan." });
    if (target.role === "admin") return jsonResponse(403, { message: "Akun Admin tidak dapat dihapus dari menu ini." });

    const [bookings, tickets] = await Promise.all([
      adminClient.from("room_bookings").select("id", { count: "exact", head: true }).eq("requested_by", targetUserId),
      adminClient.from("damage_tickets").select("id", { count: "exact", head: true }).eq("reported_by", targetUserId),
    ]);
    if (bookings.error || tickets.error) {
      return jsonResponse(500, { message: "Riwayat akun tidak dapat diperiksa." });
    }
    if ((bookings.count ?? 0) > 0 || (tickets.count ?? 0) > 0) {
      return jsonResponse(409, {
        message: "Akun memiliki riwayat booking atau laporan, jadi tidak dapat dihapus. Nonaktifkan akun untuk mencabut akses sambil menyimpan riwayat.",
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return jsonResponse(409, { message: "Akun tidak dapat dihapus. Periksa apakah akun masih terkait dengan data lain." });
    }
    return jsonResponse(200, { message: "Akun berhasil dihapus." });
  } catch {
    return jsonResponse(500, { message: "Terjadi kesalahan saat menghapus akun." });
  }
});
