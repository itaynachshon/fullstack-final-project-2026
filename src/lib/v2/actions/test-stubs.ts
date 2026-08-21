/**
 * TEST-ONLY: in-memory stand-in for the Supabase PostgREST builder, shaped
 * around the call chains the V2 actions use. Adapted from
 * src/lib/actions/test-stubs.ts (kept separate so parallel feature agents
 * never edit the same test infra) with additions the V2 queries need:
 * `.is()` filters plus recorded `.order()` / `.limit()` calls.
 */

export type StubOp = "select" | "insert" | "update" | "delete";

export interface RecordedCall {
  table: string;
  op: StubOp;
  /** insert/update payload. */
  values?: unknown;
  /** Accumulated .eq() filters. */
  eq?: Record<string, unknown>;
  /** Accumulated .is() filters (e.g. read_at IS NULL). */
  is?: Record<string, unknown>;
  order?: Array<{ column: string; ascending: boolean }>;
  limit?: number;
  selected?: string;
  mode?: "maybeSingle" | "single" | "list";
}

export interface ProgrammedResponse {
  table: string;
  op: StubOp;
  result: { data?: unknown; error?: unknown };
}

export interface SupabaseStub {
  calls: RecordedCall[];
  client: {
    auth: {
      getUser: () => Promise<{ data: { user: { id: string } | null } }>;
    };
    from: (table: string) => unknown;
  };
}

export function createSupabaseStub(options: {
  user: { id: string } | null;
  responses?: ProgrammedResponse[];
}): SupabaseStub {
  const calls: RecordedCall[] = [];
  const queue = [...(options.responses ?? [])];

  function resolve(call: RecordedCall) {
    calls.push(call);
    const index = queue.findIndex(
      (response) => response.table === call.table && response.op === call.op,
    );
    if (index === -1) return { data: null, error: null };
    const { result } = queue.splice(index, 1)[0];
    return { data: result.data ?? null, error: result.error ?? null };
  }

  return {
    calls,
    client: {
      auth: {
        getUser: async () => ({ data: { user: options.user } }),
      },
      from(table: string) {
        const call: RecordedCall = { table, op: "select" };
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const builder: any = {
          select(selected: string) {
            call.selected = selected;
            return builder;
          },
          insert(values: unknown) {
            call.op = "insert";
            call.values = values;
            return builder;
          },
          update(values: unknown) {
            call.op = "update";
            call.values = values;
            return builder;
          },
          delete() {
            call.op = "delete";
            return builder;
          },
          eq(column: string, value: unknown) {
            call.eq = { ...call.eq, [column]: value };
            return builder;
          },
          is(column: string, value: unknown) {
            call.is = { ...call.is, [column]: value };
            return builder;
          },
          order(column: string, opts?: { ascending?: boolean }) {
            call.order = [
              ...(call.order ?? []),
              { column, ascending: opts?.ascending ?? true },
            ];
            return builder;
          },
          limit(count: number) {
            call.limit = count;
            return builder;
          },
          maybeSingle() {
            call.mode = "maybeSingle";
            return Promise.resolve(resolve(call));
          },
          single() {
            call.mode = "single";
            return Promise.resolve(resolve(call));
          },
          then(
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) {
            call.mode ??= "list";
            return Promise.resolve(resolve(call)).then(onFulfilled, onRejected);
          },
        };
        /* eslint-enable @typescript-eslint/no-explicit-any */
        return builder;
      },
    },
  };
}
