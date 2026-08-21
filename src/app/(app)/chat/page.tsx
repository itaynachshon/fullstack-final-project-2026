import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAIConversation, listAIConversations } from "@/lib/v2/actions/ai";
import type { AIConversationDetail } from "@/lib/v2/types";

export const metadata: Metadata = {
  title: "Chat",
};

/**
 * Fridge Assistant (docs/FEATURES_V2_PLAN.md, F4). Server component: auth is
 * checked here again after the proxy (defense in depth; RLS is the final
 * authority), then the conversation list — and, when ?c=<id> names a
 * conversation, its full thread — is fetched through the frozen F3 actions
 * so a reload restores the same thread. Everything interactive lives in the
 * ChatScreen client island.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  const { c } = await searchParams;
  const requestedId =
    typeof c === "string" && z.uuid().safeParse(c).success ? c : null;

  const conversationsResult = await listAIConversations();
  const conversations = conversationsResult.ok ? conversationsResult.data : [];

  // Unknown/foreign/malformed ids fall back to a fresh chat — the action
  // already enforces ownership (RLS), so nothing leaks and nothing crashes.
  let initialDetail: AIConversationDetail | null = null;
  if (requestedId) {
    const detailResult = await getAIConversation({
      conversationId: requestedId,
    });
    if (detailResult.ok) initialDetail = detailResult.data;
  }

  return (
    <ChatScreen
      initialConversations={conversations}
      initialDetail={initialDetail}
    />
  );
}
