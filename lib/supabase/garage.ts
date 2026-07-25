/**
 * lib/supabase/garage.ts
 *
 * Shared helper for reading a signed-in user's primary garage vehicle.
 * Works with either the browser client (createBrowserSupabaseClient) or the
 * server client (createServerSupabaseClient) — both are SupabaseClient
 * instances, so the query logic only needs to live once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type PrimaryVehicle = {
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  modelCode: string | null;
  nickname: string | null;
};

export async function getPrimaryVehicle(
  supabase: SupabaseClient<Database>
): Promise<PrimaryVehicle | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("user_garage")
    .select("nickname, vehicles(id, year, make, model, model_code)")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (!row?.vehicles) return null;

  return {
    vehicleId: row.vehicles.id,
    year: row.vehicles.year,
    make: row.vehicles.make,
    model: row.vehicles.model,
    modelCode: row.vehicles.model_code ?? null,
    nickname: row.nickname ?? null,
  };
}
