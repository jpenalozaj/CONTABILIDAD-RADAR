import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when the project hasn't configured Supabase yet — callers must
// handle this (App.jsx shows a setup screen instead of crashing).
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
