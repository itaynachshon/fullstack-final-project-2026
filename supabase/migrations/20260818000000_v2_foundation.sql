-- ============================================================================
-- Fridge Tracker — V2 foundation (additive; historical migrations are frozen)
--
-- docs/FEATURES_V2_PLAN.md is the product/architecture source of truth.
--
-- This migration:
--   1. Adds fridge_items.restocked_from_item_id (nullable self-FK, SET NULL)
--      and tightens INSERT/UPDATE RLS so the source unit must be the caller's.
--   2. Creates restock_reminders (many schedules per user) with weekday CHECKs
--      and own-user CRUD RLS.
--   3. Creates notifications with SELECT + UPDATE(read_at) for the owner.
--      Ordinary clients cannot INSERT (no policy, no INSERT grant).
--   4. Creates ai_conversations / ai_messages / ai_action_proposals with
--      strict own-user RLS. Messages are append-only. Proposal payload cannot
--      be rewritten by authenticated clients (column-level UPDATE grant).
--   5. Grants Data API privileges explicitly (same platform requirement as
--      20260816000100_data_api_grants.sql — new tables get no auto-grants).
--
-- Existing fridge_items rows stay valid: restocked_from_item_id defaults NULL.
-- added_at / last-consumed / finished_at are NOT duplicated; F1 derives them.
-- ============================================================================


-- ── 1. Fridge lineage ───────────────────────────────────────────────────────
-- A restocked physical unit points at the finished unit it replaced.
-- ON DELETE SET NULL: deleting the finished source keeps the live unit and
-- simply forgets lineage (history UI treats NULL as "unknown source").

alter table public.fridge_items
  add column restocked_from_item_id uuid
    references public.fridge_items (id)
    on delete set null;

alter table public.fridge_items
  add constraint fridge_items_restocked_from_not_self
    check (
      restocked_from_item_id is null
      or restocked_from_item_id <> id
    );

-- F1: "which live unit restocked this finished id?"
-- Partial: the common case is NULL (ordinary adds), so keep the index small.
create index fridge_items_restocked_from_idx
  on public.fridge_items (restocked_from_item_id)
  where restocked_from_item_id is not null;

-- Recreate INSERT/UPDATE policies so a caller cannot point lineage at a
-- foreign row. Foreign keys are checked with table-owner rights (they bypass
-- RLS) — the same class of gap Wave 5 closed on consumption_events.

drop policy "fridge_items: users insert their own items"
  on public.fridge_items;

drop policy "fridge_items: users update their own items"
  on public.fridge_items;

create policy "fridge_items: users insert their own items"
  on public.fridge_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      restocked_from_item_id is null
      or exists (
        select 1
        from public.fridge_items src
        where src.id = restocked_from_item_id
          and src.user_id = auth.uid()
      )
    )
  );

create policy "fridge_items: users update their own items"
  on public.fridge_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      restocked_from_item_id is null
      or exists (
        select 1
        from public.fridge_items src
        where src.id = restocked_from_item_id
          and src.user_id = auth.uid()
      )
    )
  );


-- ── 2. restock_reminders — many schedules per user ──────────────────────────
-- Weekdays are JavaScript Date.getDay() values: 0 = Sunday … 6 = Saturday.

-- Postgres rejects subqueries inside CHECK constraints (SQLSTATE 0A000), so
-- weekday distinctness lives in an IMMUTABLE helper the constraint calls.
-- (F5 integration fix — the original inline subquery failed `db push`.)
create function public.smallint_array_is_distinct(values_in smallint[])
returns boolean
language sql
immutable
as $$
  select count(distinct d) = cardinality(values_in)
  from unnest(values_in) as d
$$;

create table public.restock_reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  days_of_week   smallint[] not null,
  local_time     time not null,
  timezone       text not null,
  enabled        boolean not null default true,
  email_enabled  boolean not null default false,
  in_app_enabled boolean not null default true,
  -- Scheduler idempotency (F2). Suggested value: '{yyyy-mm-dd}T{HH:MM}' in
  -- the reminder's local zone. Never accepted from client Zod schemas.
  last_sent_key  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint restock_reminders_days_of_week_valid check (
    cardinality(days_of_week) between 1 and 7
    and array_position(days_of_week, null) is null
    and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    and public.smallint_array_is_distinct(days_of_week)
  ),
  constraint restock_reminders_timezone_len check (
    char_length(timezone) between 1 and 64
  ),
  constraint restock_reminders_last_sent_key_len check (
    last_sent_key is null
    or char_length(last_sent_key) between 1 and 64
  ),
  constraint restock_reminders_channel_when_enabled check (
    not enabled
    or email_enabled
    or in_app_enabled
  )
);

create index restock_reminders_user_idx
  on public.restock_reminders (user_id);

-- F2 cron loads enabled rows and evaluates local day/time in application code.
create index restock_reminders_enabled_idx
  on public.restock_reminders (timezone, local_time)
  where enabled;

alter table public.restock_reminders enable row level security;

create policy "restock_reminders: users read their own"
  on public.restock_reminders
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "restock_reminders: users insert their own"
  on public.restock_reminders
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "restock_reminders: users update their own"
  on public.restock_reminders
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "restock_reminders: users delete their own"
  on public.restock_reminders
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ── 3. notifications — server-generated, client may only mark read ──────────

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  metadata   jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_type_valid check (
    type in ('restock_reminder', 'ai_proposal')
  ),
  constraint notifications_title_len check (
    char_length(title) between 1 and 120
  ),
  constraint notifications_body_len check (
    char_length(body) between 1 and 2000
  )
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: users read their own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- UPDATE is further restricted by GRANT UPDATE (read_at) below. RLS still
-- requires ownership so a leaked id cannot mark someone else's row read.
create policy "notifications: users mark their own read"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT policy and no DELETE policy for authenticated: forging or wiping
-- server-generated notifications is impossible through the Data API as a user.
-- service_role (F2 cron only) bypasses RLS and has full grants.


-- ── 4. AI persistence — provider-neutral chat + pending action proposals ────

create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ai_conversations_title_len check (
    char_length(title) between 1 and 80
  )
);

create index ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.ai_conversations (id) on delete cascade,
  role            text not null,
  -- Provider-neutral parts array (see src/lib/v2/types.ts AIMessagePart).
  parts           jsonb not null,
  seq             int not null,
  created_at      timestamptz not null default now(),

  constraint ai_messages_role_valid check (
    role in ('user', 'assistant', 'system')
  ),
  constraint ai_messages_seq_nonnegative check (seq >= 0),
  constraint ai_messages_parts_is_array check (jsonb_typeof(parts) = 'array'),
  constraint ai_messages_conversation_seq_key unique (conversation_id, seq)
);

create index ai_messages_conversation_seq_idx
  on public.ai_messages (conversation_id, seq);

create table public.ai_action_proposals (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.ai_conversations (id) on delete cascade,
  -- Denormalized so RLS is a direct column comparison (same reason as
  -- consumption_events.user_id). INSERT still requires conversation ownership.
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null,
  payload         jsonb not null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_action_proposals_kind_valid check (
    kind in ('add_item', 'consume_recipe')
  ),
  constraint ai_action_proposals_status_valid check (
    status in ('pending', 'accepted', 'rejected', 'expired')
  ),
  constraint ai_action_proposals_payload_object check (
    jsonb_typeof(payload) = 'object'
  )
);

create index ai_action_proposals_user_status_idx
  on public.ai_action_proposals (user_id, status);

create index ai_action_proposals_conversation_idx
  on public.ai_action_proposals (conversation_id);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_action_proposals enable row level security;

-- Conversations: own-user CRUD.

create policy "ai_conversations: users read their own"
  on public.ai_conversations
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "ai_conversations: users insert their own"
  on public.ai_conversations
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "ai_conversations: users update their own"
  on public.ai_conversations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ai_conversations: users delete their own"
  on public.ai_conversations
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Messages: visible / insertable only through an owned conversation.
-- Append-only: no UPDATE/DELETE policies (rows vanish via conversation CASCADE).

create policy "ai_messages: users read messages in their conversations"
  on public.ai_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "ai_messages: users insert messages in their conversations"
  on public.ai_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Proposals: own user_id + owned conversation. INSERT only as pending.
-- UPDATE column grant below prevents payload forgery; RLS still scopes rows.

create policy "ai_action_proposals: users read their own"
  on public.ai_action_proposals
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "ai_action_proposals: users insert pending for their conversations"
  on public.ai_action_proposals
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "ai_action_proposals: users update status of their own"
  on public.ai_action_proposals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 5. Data API grants (authenticated + service_role; anon gets nothing) ────
-- Table privileges are broad; RLS is the per-row layer — except notifications
-- INSERT/DELETE and proposal column updates, which are constrained here.

grant select, insert, update, delete
  on table public.restock_reminders,
           public.ai_conversations,
           public.ai_messages
  to authenticated, service_role;

grant select
  on table public.notifications
  to authenticated;

grant update (read_at)
  on table public.notifications
  to authenticated;

grant select, insert, update, delete
  on table public.notifications
  to service_role;

grant select, insert
  on table public.ai_action_proposals
  to authenticated;

grant update (status, updated_at)
  on table public.ai_action_proposals
  to authenticated;

grant select, insert, update, delete
  on table public.ai_action_proposals
  to service_role;
