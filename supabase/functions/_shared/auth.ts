import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthContext {
  userId: string;
  supabase: SupabaseClient;
}

/**
 * Verifies the JWT from the Authorization header and returns the user ID
 * along with an admin Supabase client (service role) for unrestricted DB access.
 */
export async function verifyAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Admin client — bypasses RLS for reading user data
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Verify the user JWT
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw new Error('Unauthorized: invalid or expired token');
  }

  return { userId: user.id, supabase };
}
