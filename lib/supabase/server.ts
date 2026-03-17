import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing Supabase service configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
  );
}

// Service role keys are JWTs and typically start with "eyJ".
if (!serviceKey.startsWith("eyJ")) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY looks invalid. Make sure you copied the Service Role key from Supabase for the same project as NEXT_PUBLIC_SUPABASE_URL."
  );
}

export const supabase = createClient(
  supabaseUrl,
  serviceKey
);

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Missing Supabase publishable/anon key. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server components should not set cookies here.
        },
      },
    }
  );
}
