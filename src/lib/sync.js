import { supabase } from "./supabaseClient.js";

// RADAR stores every collection (empresas, asientos, plan de cuentas, etc.)
// as JSON rows in one generic table, keyed by (user_id, collection, row_id).
// This keeps the data shape identical to what the UI already used with
// localStorage, so the components in App.jsx didn't need to change.

export async function loadCollection(userId, collection, fallback) {
  const { data, error } = await supabase
    .from("radar_data")
    .select("row_id,payload")
    .eq("user_id", userId)
    .eq("collection", collection);
  if (error) {
    console.error("[radar] load", collection, error);
    return fallback;
  }
  if (!data || data.length === 0) return fallback;
  return data.map((r) => r.payload);
}

// items: current in-memory array. prevIds: Set of row_ids this collection
// had the last time it was synced (used to know what to delete). Returns
// the new Set of row_ids to remember for next time.
export async function saveCollection(userId, collection, items, prevIds, idKey = "id") {
  const currentSet = new Set(items.map((i) => String(i[idKey])));
  const toDelete = [...prevIds].filter((id) => !currentSet.has(id));

  if (items.length) {
    const rows = items.map((item) => ({
      user_id: userId,
      collection,
      row_id: String(item[idKey]),
      payload: item,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("radar_data")
      .upsert(rows, { onConflict: "user_id,collection,row_id" });
    if (error) console.error("[radar] upsert", collection, error);
  }
  if (toDelete.length) {
    const { error } = await supabase
      .from("radar_data")
      .delete()
      .eq("user_id", userId)
      .eq("collection", collection)
      .in("row_id", toDelete);
    if (error) console.error("[radar] delete", collection, error);
  }
  return currentSet;
}
