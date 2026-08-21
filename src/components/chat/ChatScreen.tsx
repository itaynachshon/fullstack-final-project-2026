"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CircleAlertIcon,
  HistoryIcon,
  SquarePenIcon,
} from "@/components/icons";
import { useToast } from "@/components/app-shell/Toaster";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import {
  acceptAIAddProposal,
  acceptAIConsumptionProposal,
  getAIConversation,
  listAIConversations,
  rejectAIProposal,
} from "@/lib/v2/actions/ai";
import { V2_ROUTES } from "@/lib/v2/routes";
import type {
  AIActionProposal,
  AIConversationDetail,
  AIConversationSummary,
} from "@/lib/v2/types";

import { postChatMessage } from "./chat-api";
import {
  applySendOutcome,
  dismissComposerNotice,
  emptyThreadState,
  mergeDetail,
  setProposalNotice,
  setProposalStatus,
  setTurnError,
  startSend,
  threadStateFromDetail,
  classifyReconciledSend,
  type ChatThreadState,
} from "./chat-store";
import { ChatMessageItem } from "./ChatMessage";
import { Composer } from "./Composer";
import { ConversationsSheet } from "./ConversationsSheet";
import { COPY, RETRY_TURN_MESSAGE } from "./copy";
import { acceptProposal, rejectProposal } from "./proposal-controller";
import { StarterPrompts } from "./StarterPrompts";

/**
 * The Fridge Assistant screen (F4). One client island: local React state +
 * the frozen F3 boundaries (POST /api/ai/chat, listAIConversations,
 * getAIConversation, accept/reject actions) — no client-side AI logic.
 *
 * Layout: the thread scrolls with the document (like every other page);
 * the composer is sticky above the mobile bottom nav / viewport bottom, so
 * it never sits under the nav and stays visible with the mobile keyboard.
 * The active conversation id is mirrored to ?c=<id> via replaceState so a
 * reload restores the same thread server-side.
 */
export function ChatScreen({
  initialConversations,
  initialDetail,
}: {
  initialConversations: AIConversationSummary[];
  initialDetail: AIConversationDetail | null;
}) {
  const { toast } = useToast();

  const [thread, setThread] = useState<ChatThreadState>(() =>
    initialDetail ? threadStateFromDetail(initialDetail) : emptyThreadState(),
  );
  // Event handlers read the freshest thread through this mirror (updated in
  // an effect — never during render). Handlers only run after commit, so the
  // mirror is current by the time any user gesture fires.
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  const [draft, setDraft] = useState("");
  const [conversations, setConversations] =
    useState<AIConversationSummary[]>(initialConversations);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  const [busyProposal, setBusyProposal] = useState<{
    id: string;
    action: "accept" | "reject";
  } | null>(null);

  const localIdCounter = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const busy = thread.pending !== null;

  /* ── Scrolling: keep the latest entry in view (instant — no forced
        smooth-scroll, respecting reduced motion by default). ─────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [
    thread.messages.length,
    thread.pending,
    thread.turnError,
    thread.conversationId,
  ]);

  const syncUrl = useCallback((conversationId: string | null) => {
    const url = conversationId
      ? `${V2_ROUTES.chat}?c=${conversationId}`
      : V2_ROUTES.chat;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  /* ── Sending ──────────────────────────────────────────────────────── */

  const sendText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || threadRef.current.pending) return;

      const conversationId = threadRef.current.conversationId ?? undefined;
      setDraft("");
      setThread((state) => startSend(state, text));

      const outcome = await postChatMessage({ conversationId, message: text });

      const context = {
        localId: `local-${++localIdCounter.current}`,
        nowIso: new Date().toISOString(),
      };
      setThread((state) => applySendOutcome(state, text, outcome, context));

      if (outcome.kind === "ok" || outcome.kind === "turn_failed") {
        if (!conversationId) syncUrl(outcome.conversationId);
      } else {
        // Message not (provably) persisted — restore the draft for editing.
        setDraft(rawText);
      }
    },
    [syncUrl],
  );

  const handleSend = useCallback(() => {
    void sendText(draft);
  }, [draft, sendText]);

  /**
   * Retry for a failed-but-persisted turn (provider_unavailable/internal):
   * the original message is already stored, so re-sending its text would
   * duplicate it. Instead this sends a short follow-up turn — the model sees
   * the unanswered question in history and answers it.
   */
  const retryTurn = useCallback(() => {
    void sendText(RETRY_TURN_MESSAGE);
  }, [sendText]);

  /**
   * Retry from a composer notice. For network failures the send may or may
   * not have reached the server, so reconcile against server truth first and
   * only re-send when the message is provably absent.
   */
  const retryFromNotice = useCallback(async () => {
    const notice = threadRef.current.composerNotice;
    if (!notice?.retryText) return;
    const text = notice.retryText;

    const conversationId = threadRef.current.conversationId;
    if (notice.kind === "request_failed" && conversationId) {
      const result = await getAIConversation({ conversationId });
      if (result.ok) {
        const verdict = classifyReconciledSend(result.data, text);
        setThread((state) =>
          dismissComposerNotice(mergeDetail(state, result.data)),
        );
        if (verdict === "answered") {
          setDraft("");
          return;
        }
        if (verdict === "persisted_unanswered") {
          setDraft("");
          setThread((state) => setTurnError(state, "internal"));
          return;
        }
        // not_persisted → fall through to a normal re-send.
      }
      // Reconciliation itself failed (still offline): plain re-send attempt.
    }
    void sendText(text);
  }, [sendText]);

  /* ── Conversation switching ───────────────────────────────────────── */

  const openSheet = useCallback(async () => {
    setSheetOpen(true);
    setConversationsLoading(true);
    const result = await listAIConversations();
    setConversationsLoading(false);
    if (result.ok) {
      setConversations(result.data);
    } else if (result.error.code === "unauthenticated") {
      window.location.assign(ROUTES.login);
    } else {
      toast({ message: result.error.message, tone: "destructive" });
    }
  }, [toast]);

  const openConversation = useCallback(
    async (conversationId: string) => {
      if (threadRef.current.pending) return;
      if (conversationId === threadRef.current.conversationId) {
        setSheetOpen(false);
        return;
      }
      setOpeningConversationId(conversationId);
      const result = await getAIConversation({ conversationId });
      setOpeningConversationId(null);
      if (result.ok) {
        setThread(threadStateFromDetail(result.data));
        setDraft("");
        syncUrl(result.data.id);
        setSheetOpen(false);
      } else if (result.error.code === "unauthenticated") {
        window.location.assign(ROUTES.login);
      } else {
        toast({ message: result.error.message, tone: "destructive" });
      }
    },
    [syncUrl, toast],
  );

  const newChat = useCallback(() => {
    if (threadRef.current.pending) return;
    setThread(emptyThreadState());
    setDraft("");
    syncUrl(null);
    setSheetOpen(false);
    composerRef.current?.focus();
  }, [syncUrl]);

  /* ── Proposals ────────────────────────────────────────────────────── */

  // The most recent refresh result. React state commits asynchronously, so
  // code that continues right after an awaited refresh (the proposal-conflict
  // branch below) reads server truth from here instead of racing the commit.
  const lastRefreshRef = useRef<AIConversationDetail | null>(null);

  const refreshConversation = useCallback(async () => {
    const conversationId = threadRef.current.conversationId;
    if (!conversationId) return;
    const result = await getAIConversation({ conversationId });
    if (result.ok) {
      lastRefreshRef.current = result.data;
      setThread((state) => mergeDetail(state, result.data));
    }
  }, []);

  const controllerDeps = useMemo(
    () => ({
      acceptAdd: acceptAIAddProposal,
      acceptConsumption: acceptAIConsumptionProposal,
      reject: rejectAIProposal,
      refreshConversation,
    }),
    [refreshConversation],
  );

  const handleAcceptProposal = useCallback(
    async (proposal: AIActionProposal) => {
      if (busyProposal) return;
      setBusyProposal({ id: proposal.id, action: "accept" });
      lastRefreshRef.current = null;
      const outcome = await acceptProposal(
        proposal.kind,
        proposal.id,
        controllerDeps,
      );
      setBusyProposal(null);

      switch (outcome.kind) {
        case "accepted":
          setThread((state) =>
            setProposalStatus(state, proposal.id, "accepted"),
          );
          toast({ message: outcome.toast });
          break;
        case "conflict": {
          // The controller already refreshed server truth into state. Still
          // pending after the refresh → the fridge changed underneath the
          // proposal (the server reverted it): hint inline on the card.
          // Resolved elsewhere → the card now shows its real status.
          // (Assertion: TS still sees the pre-await `= null` reset and
          // narrows `.current` to null across the mutation in the awaited
          // controller call.)
          const detail = lastRefreshRef.current as AIConversationDetail | null;
          const refreshed = detail?.proposals.find(
            (candidate) => candidate.id === proposal.id,
          );
          if (!refreshed || refreshed.status === "pending") {
            setThread((state) =>
              setProposalNotice(state, proposal.id, outcome.message),
            );
          } else {
            toast({ message: outcome.message });
          }
          break;
        }
        case "error":
          toast({ message: outcome.message, tone: "destructive" });
          break;
        case "signed_out":
          window.location.assign(ROUTES.login);
          break;
        case "rejected":
          break;
      }
    },
    [busyProposal, controllerDeps, toast],
  );

  const handleRejectProposal = useCallback(
    async (proposal: AIActionProposal) => {
      if (busyProposal) return;
      setBusyProposal({ id: proposal.id, action: "reject" });
      const outcome = await rejectProposal(proposal.id, controllerDeps);
      setBusyProposal(null);

      switch (outcome.kind) {
        case "rejected":
          setThread((state) =>
            setProposalStatus(state, proposal.id, "rejected"),
          );
          break;
        case "conflict":
          toast({ message: outcome.message });
          break;
        case "error":
          toast({ message: outcome.message, tone: "destructive" });
          break;
        case "signed_out":
          window.location.assign(ROUTES.login);
          break;
        case "accepted":
          break;
      }
    },
    [busyProposal, controllerDeps, toast],
  );

  /* ── Render ───────────────────────────────────────────────────────── */

  const sendFromCard = useCallback(
    (text: string) => void sendText(text),
    [sendText],
  );

  const isEmpty =
    thread.messages.length === 0 && !thread.pending && !thread.turnError;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <header className="flex items-start justify-between gap-3 pt-4 pb-2 md:pt-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {COPY.pageTitle}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {COPY.pageSubtitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Conversation history"
            title="Conversation history"
            disabled={busy}
            onClick={() => void openSheet()}
          >
            <HistoryIcon className="size-5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New chat"
            title="New chat"
            disabled={busy}
            onClick={newChat}
          >
            <SquarePenIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {isEmpty ? (
        <StarterPrompts onPick={sendFromCard} disabled={busy} />
      ) : (
        <ol aria-label="Conversation" className="flex flex-col gap-4 py-4">
          {thread.messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              proposals={thread.proposals}
              proposalNotices={thread.proposalNotices}
              busyProposal={busyProposal}
              onSendMessage={sendFromCard}
              onAcceptProposal={(proposal) =>
                void handleAcceptProposal(proposal)
              }
              onRejectProposal={(proposal) =>
                void handleRejectProposal(proposal)
              }
              actionsDisabled={busy || busyProposal !== null}
            />
          ))}

          {thread.pending ? (
            <li className="flex flex-col items-end">
              <span className="sr-only">You said:</span>
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5 opacity-70 md:max-w-[75%]">
                <p
                  dir="auto"
                  className="text-sm leading-relaxed break-words whitespace-pre-wrap"
                >
                  {thread.pending}
                </p>
              </div>
            </li>
          ) : null}
        </ol>
      )}

      {/* One polite status line for turn progress — individual messages are
          deliberately NOT live regions. */}
      <div role="status" className="min-h-0">
        {thread.pending ? (
          <div className="flex items-center gap-2 pb-4 text-sm text-muted-foreground">
            <ThinkingDots />
            {COPY.thinking}
          </div>
        ) : null}
      </div>

      {thread.turnError ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
          <p className="flex items-start gap-2 text-sm">
            <CircleAlertIcon
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>
              {thread.turnError.code === "provider_unavailable"
                ? COPY.providerUnavailable
                : COPY.turnInternalError}{" "}
              <span className="text-muted-foreground">{COPY.messageSaved}</span>
            </span>
          </p>
          <div>
            <Button variant="secondary" onClick={retryTurn} disabled={busy}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <div
        ref={bottomRef}
        className="sticky bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] mt-auto bg-transparent pb-1 md:bottom-4"
      >
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          busy={busy}
          notice={thread.composerNotice}
          onRetryNotice={() => void retryFromNotice()}
          onDismissNotice={() =>
            setThread((state) => dismissComposerNotice(state))
          }
          textareaRef={composerRef}
        />
      </div>

      <ConversationsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        conversations={conversations}
        loading={conversationsLoading}
        activeConversationId={thread.conversationId}
        openingConversationId={openingConversationId}
        onSelect={(conversationId) => void openConversation(conversationId)}
        onNewChat={newChat}
      />
    </div>
  );
}

function ThinkingDots() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
