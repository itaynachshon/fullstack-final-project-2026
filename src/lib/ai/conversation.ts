/**
 * Canonical conversation persistence over the F0 `ai_*` tables.
 *
 * The provider-neutral message parts in `ai_messages.parts` are the single
 * source of truth for chat history — no provider session ids are stored, so
 * a failover (or a vendor swap) never loses context. History is append-only
 * and never deleted here; context BOUNDING happens at read time in
 * messages.ts.
 *
 * All queries run on the caller's RLS-scoped client: cross-user rows are
 * simply invisible, so no user_id filters appear in code.
 */

import type { createClient } from "@/lib/supabase/server";
import {
  addItemProposalPayloadSchema,
  aiMessagePartsSchema,
  consumeRecipeProposalPayloadSchema,
} from "@/lib/v2/schemas";
import type {
  AIActionProposal,
  AIActionStatus,
  AIConversationSummary,
  AIMessage,
  AIMessageRole,
  AIMessagePart,
} from "@/lib/v2/types";

import type { ProposalDraft } from "./types";

export type DbClient = Awaited<ReturnType<typeof createClient>>;

/** Thrown for unexpected database failures; callers map it to `internal`. */
export class ConversationStoreError extends Error {
  constructor(context: string, cause: unknown) {
    super(`${context}: ${cause instanceof Error ? cause.message : "db error"}`);
    this.name = "ConversationStoreError";
  }
}

const UNIQUE_VIOLATION = "23505";
const CONVERSATION_SELECT = "id, title, created_at, updated_at";
const MESSAGE_SELECT = "id, conversation_id, role, parts, seq, created_at";
const PROPOSAL_SELECT =
  "id, conversation_id, user_id, kind, payload, status, created_at, updated_at";

/* ─── Row mapping ─────────────────────────────────────────────────────────── */

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  parts: unknown;
  seq: number;
  created_at: string;
}

export interface ProposalRow {
  id: string;
  conversation_id: string;
  user_id: string;
  kind: string;
  payload: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapConversationRow(row: ConversationRow): AIConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Returns null (and logs) when stored parts fail the frozen schema. */
function mapMessageRow(row: MessageRow): AIMessage | null {
  const parts = aiMessagePartsSchema.safeParse(row.parts);
  if (!parts.success) {
    console.error(`ai_messages ${row.id}: stored parts failed validation.`);
    return null;
  }
  if (
    row.role !== "user" &&
    row.role !== "assistant" &&
    row.role !== "system"
  ) {
    return null;
  }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    parts: parts.data,
    seq: row.seq,
    createdAt: row.created_at,
  };
}

/** Returns null (and logs) when a stored payload fails its frozen schema. */
export function mapProposalRow(row: ProposalRow): AIActionProposal | null {
  const base = {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    status: row.status as AIActionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.kind === "add_item") {
    const payload = addItemProposalPayloadSchema.safeParse(row.payload);
    if (!payload.success) {
      console.error(`ai_action_proposals ${row.id}: invalid add payload.`);
      return null;
    }
    return { ...base, kind: "add_item", payload: payload.data };
  }
  if (row.kind === "consume_recipe") {
    const payload = consumeRecipeProposalPayloadSchema.safeParse(row.payload);
    if (!payload.success) {
      console.error(`ai_action_proposals ${row.id}: invalid consume payload.`);
      return null;
    }
    return { ...base, kind: "consume_recipe", payload: payload.data };
  }
  return null;
}

/* ─── Conversations ───────────────────────────────────────────────────────── */

export async function getConversationSummary(
  db: DbClient,
  conversationId: string,
): Promise<AIConversationSummary | null> {
  const { data, error } = await db
    .from("ai_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new ConversationStoreError("load conversation", error);
  return data ? mapConversationRow(data as ConversationRow) : null;
}

export async function listConversationSummaries(
  db: DbClient,
): Promise<AIConversationSummary[]> {
  const { data, error } = await db
    .from("ai_conversations")
    .select(CONVERSATION_SELECT)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new ConversationStoreError("list conversations", error);
  return ((data ?? []) as ConversationRow[]).map(mapConversationRow);
}

export async function createConversation(
  db: DbClient,
  userId: string,
  title: string,
): Promise<AIConversationSummary> {
  const { data, error } = await db
    .from("ai_conversations")
    .insert({ user_id: userId, title })
    .select(CONVERSATION_SELECT)
    .single();
  if (error || !data) {
    throw new ConversationStoreError("create conversation", error);
  }
  return mapConversationRow(data as ConversationRow);
}

/** Bumps updated_at so the conversation list sorts by recency. Best-effort. */
export async function touchConversation(
  db: DbClient,
  conversationId: string,
): Promise<void> {
  const { error } = await db
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) console.error("touchConversation failed:", error);
}

/** Titles come from the first user message; CHECK constraint allows 1–80. */
export function deriveConversationTitle(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "New chat";
  return collapsed.length > 80 ? `${collapsed.slice(0, 79)}…` : collapsed;
}

/* ─── Messages ────────────────────────────────────────────────────────────── */

export async function loadMessages(
  db: DbClient,
  conversationId: string,
): Promise<AIMessage[]> {
  const { data, error } = await db
    .from("ai_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("seq", { ascending: true });
  if (error) throw new ConversationStoreError("load messages", error);
  return ((data ?? []) as MessageRow[])
    .map(mapMessageRow)
    .filter((message): message is AIMessage => message !== null);
}

/**
 * Appends one message with the next `seq`. The unique (conversation_id, seq)
 * constraint arbitrates concurrent turns; on a collision the insert retries
 * with a freshly read seq.
 */
export async function appendMessage(
  db: DbClient,
  conversationId: string,
  role: AIMessageRole,
  parts: AIMessagePart[],
): Promise<AIMessage> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: latest, error: seqError } = await db
      .from("ai_messages")
      .select("seq")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: false })
      .limit(1);
    if (seqError) throw new ConversationStoreError("read seq", seqError);
    const nextSeq =
      ((latest as Array<{ seq: number }> | null)?.[0]?.seq ?? -1) + 1;

    const { data, error } = await db
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role,
        parts,
        seq: nextSeq,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (!error && data) {
      const mapped = mapMessageRow(data as MessageRow);
      if (!mapped) throw new ConversationStoreError("map message", null);
      return mapped;
    }
    if ((error as { code?: string } | null)?.code === UNIQUE_VIOLATION) {
      continue; // Concurrent writer took this seq — re-read and retry.
    }
    throw new ConversationStoreError("append message", error);
  }
  throw new ConversationStoreError(
    "append message",
    new Error("seq conflict retries exhausted"),
  );
}

/* ─── Proposals ───────────────────────────────────────────────────────────── */

export async function loadProposals(
  db: DbClient,
  conversationId: string,
): Promise<AIActionProposal[]> {
  const { data, error } = await db
    .from("ai_action_proposals")
    .select(PROPOSAL_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new ConversationStoreError("load proposals", error);
  return ((data ?? []) as ProposalRow[])
    .map(mapProposalRow)
    .filter((proposal): proposal is AIActionProposal => proposal !== null);
}

/** Inserts drafts as PENDING rows (RLS also enforces `status = 'pending'`). */
export async function insertProposals(
  db: DbClient,
  conversationId: string,
  userId: string,
  drafts: ProposalDraft[],
): Promise<AIActionProposal[]> {
  if (drafts.length === 0) return [];
  const rows = drafts.map((draft) => ({
    conversation_id: conversationId,
    user_id: userId,
    kind: draft.kind,
    payload: draft.payload,
    status: "pending",
  }));
  const { data, error } = await db
    .from("ai_action_proposals")
    .insert(rows)
    .select(PROPOSAL_SELECT);
  if (error) throw new ConversationStoreError("insert proposals", error);
  return ((data ?? []) as ProposalRow[])
    .map(mapProposalRow)
    .filter((proposal): proposal is AIActionProposal => proposal !== null);
}
