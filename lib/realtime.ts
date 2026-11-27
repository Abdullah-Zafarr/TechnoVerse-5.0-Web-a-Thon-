import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}

function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!serverClient) {
    serverClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverClient;
}

export async function broadcastExamEvent(
  examId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const client = getSupabaseServerClient();
  if (!client) return;

  // Dispatch broadcast in the background so API responses are never blocked by Realtime latency.
  void (async () => {
    const channel = client.channel(`exam:${examId}:events`);
    try {
      await channel.send({
        type: "broadcast",
        event,
        payload,
      });
    } catch {
      // Graceful degradation: polling endpoints keep working without Realtime
    } finally {
      await client.removeChannel(channel).catch(() => {});
    }
  })();
}
