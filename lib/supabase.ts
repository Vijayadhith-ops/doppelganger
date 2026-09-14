/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";

let supabaseClient: SupabaseClient | null = null;
let sqlClient: any = null;

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  try {
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return supabaseClient;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
}

export function getSql() {
  if (sqlClient) return sqlClient;
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) return null;
  try {
    sqlClient = postgres(dbUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: "require",
      prepare: false, // Crucial for Supabase transaction pooler (port 6543 / pgbouncer)
    });
    return sqlClient;
  } catch (err) {
    console.error("Failed to initialize postgres client:", err);
    return null;
  }
}
