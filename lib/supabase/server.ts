import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function requireSuperadmin() {
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();

  if (!user.user) {
    throw new Error("Unauthorized: User not found");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.user.id)
    .single();

  if (error || !profile?.is_superadmin) {
    throw new Error("Unauthorized: Admin access required");
  }

  return { user: user.user, profile };
}
