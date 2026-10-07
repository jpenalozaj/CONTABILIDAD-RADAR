import { supabase } from "./supabaseClient.js";

// Portal del Trabajador -- ver supabase/portal_trabajador.sql para el
// esquema y las politicas RLS que hacen posible todo esto. Este archivo
// solo arma las llamadas; toda la validacion de seguridad real vive en
// la base de datos (RLS + la funcion canjear_codigo_portal).

const genCodigo = () => {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para dictarlo sin ambiguedad
  let c = "";
  for (let i = 0; i < 10; i++) c += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return c;
};

// ── Lado del contador ──

export async function listarInvitaciones(userId, empresaId) {
  const { data, error } = await supabase
    .from("portal_links")
    .select("id,trabajador_id,codigo,trabajador_auth_id,activo,created_at")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId);
  if (error) { console.error("[portal] listarInvitaciones", error); return []; }
  return data || [];
}

export async function crearInvitacion(userId, empresaId, trabajadorId) {
  const codigo = genCodigo();
  const { data, error } = await supabase
    .from("portal_links")
    .insert({ user_id: userId, empresa_id: empresaId, trabajador_id: trabajadorId, codigo })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revocarInvitacion(linkId) {
  const { error } = await supabase.from("portal_links").update({ activo: false }).eq("id", linkId);
  if (error) throw error;
}

export async function reactivarInvitacion(linkId) {
  const { error } = await supabase.from("portal_links").update({ activo: true }).eq("id", linkId);
  if (error) throw error;
}

// ── Lado del trabajador ──

export async function canjearCodigoPortal(codigo) {
  const { data, error } = await supabase.rpc("canjear_codigo_portal", { p_codigo: codigo.trim().toUpperCase() });
  if (error) throw error;
  return data?.[0] || null;
}

export async function obtenerMiVinculo() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data, error } = await supabase
    .from("portal_links")
    .select("user_id,empresa_id,trabajador_id,activo")
    .eq("trabajador_auth_id", auth.user.id)
    .eq("activo", true)
    .maybeSingle();
  if (error) { console.error("[portal] obtenerMiVinculo", error); return null; }
  return data;
}

// Trae, ya filtrado por las mismas RLS que protegen todo lo demas, la
// empresa, la ficha del trabajador y sus liquidaciones de periodos
// marcados "Pagado". Si el contador no ha marcado ningun periodo como
// Pagado todavia, "liquidaciones" vuelve vacio -- es la visibilidad
// controlada por el contador, no un error.
export async function cargarDatosPortal(vinculo) {
  const { user_id, empresa_id, trabajador_id } = vinculo;
  const [{ data: empRows }, { data: trabRows }, { data: remRows }] = await Promise.all([
    supabase.from("radar_data").select("payload").eq("user_id", user_id).eq("collection", "empresas").eq("row_id", empresa_id),
    supabase.from("radar_data").select("payload").eq("user_id", user_id).eq("collection", "trabajadores").eq("row_id", trabajador_id),
    supabase.from("radar_data").select("payload").eq("user_id", user_id).eq("collection", "remuneraciones"),
  ]);
  return {
    empresa: empRows?.[0]?.payload || null,
    trabajador: trabRows?.[0]?.payload || null,
    liquidaciones: (remRows || []).map((r) => r.payload).filter((r) => r.trabajadorId === trabajador_id),
  };
}
