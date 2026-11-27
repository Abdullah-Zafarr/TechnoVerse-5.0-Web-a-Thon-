import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(url, anonKey);
  }
  return browserClient;
}

export async function broadcastExamEvent(
  examId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  try {
    const client = createClient(url, anonKey);
    const channel = client.channel(`exam:${examId}:events`);
    await channel.send({
      type: "broadcast",
      event,
      payload,
    });
    await client.removeChannel(channel);
  } catch {
    // Graceful degradation: polling endpoints keep working without Realtime
  }
}
