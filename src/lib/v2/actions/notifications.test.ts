import { beforeEach, describe, expect, it, vi } from "vitest";

import { listNotifications, markNotificationRead } from "./notifications";
import {
  createSupabaseStub,
  type ProgrammedResponse,
  type SupabaseStub,
} from "./test-stubs";

/* ─── Module mocks ────────────────────────────────────────────────────────── */

let stub: SupabaseStub;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => stub.client,
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";

function authed(responses: ProgrammedResponse[] = []) {
  stub = createSupabaseStub({ user: { id: USER_ID }, responses });
}

function anonymous() {
  stub = createSupabaseStub({ user: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  authed();
});

/** A DB row as PostgREST would return it. */
function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION_ID,
    user_id: USER_ID,
    type: "restock_reminder",
    title: "Time to check what needs restocking",
    body: "Milk and Eggs are running low.",
    metadata: { lowCount: 2 },
    read_at: null,
    created_at: "2026-08-18T15:00:00Z",
    ...overrides,
  };
}

/* ─── listNotifications ───────────────────────────────────────────────────── */

describe("listNotifications", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    anonymous();
    const result = await listNotifications();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unauthenticated" }),
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("returns newest-first mapped notifications with a bounded limit", async () => {
    authed([
      {
        table: "notifications",
        op: "select",
        result: { data: [notificationRow()] },
      },
    ]);

    const result = await listNotifications();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          id: NOTIFICATION_ID,
          userId: USER_ID,
          type: "restock_reminder",
          title: "Time to check what needs restocking",
          body: "Milk and Eggs are running low.",
          metadata: { lowCount: 2 },
          readAt: null,
          createdAt: "2026-08-18T15:00:00Z",
        },
      ]);
    }

    const call = stub.calls[0];
    expect(call.order).toEqual([
      { column: "created_at", ascending: false },
      { column: "id", ascending: false },
    ]);
    expect(call.limit).toBe(50);
    expect(call.is).toBeUndefined();
  });

  it("filters to unread rows when unreadOnly is set", async () => {
    authed([{ table: "notifications", op: "select", result: { data: [] } }]);

    const result = await listNotifications({ unreadOnly: true });

    expect(result).toEqual({ ok: true, data: [] });
    expect(stub.calls[0].is).toEqual({ read_at: null });
  });

  it("maps DB failures to a generic internal error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    authed([
      {
        table: "notifications",
        op: "select",
        result: { error: { message: "boom" } },
      },
    ]);

    const result = await listNotifications();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "internal" }),
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

/* ─── markNotificationRead ────────────────────────────────────────────────── */

describe("markNotificationRead", () => {
  it("rejects unauthenticated callers and malformed ids", async () => {
    anonymous();
    const unauthenticated = await markNotificationRead({
      id: NOTIFICATION_ID,
    });
    expect(unauthenticated).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unauthenticated" }),
    });

    authed();
    const malformed = await markNotificationRead({ id: "nope" });
    expect(malformed).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("stamps read_at exactly once and writes only that column", async () => {
    const stamped = "2026-08-18T15:05:00.000Z";
    authed([
      {
        table: "notifications",
        op: "select",
        result: { data: { id: NOTIFICATION_ID, read_at: null } },
      },
      {
        table: "notifications",
        op: "update",
        result: { data: [{ id: NOTIFICATION_ID, read_at: stamped }] },
      },
    ]);

    const result = await markNotificationRead({ id: NOTIFICATION_ID });

    expect(result).toEqual({
      ok: true,
      data: { id: NOTIFICATION_ID, readAt: stamped },
    });

    const update = stub.calls.find((call) => call.op === "update");
    expect(update?.eq).toEqual({ id: NOTIFICATION_ID });
    // The authenticated role only has UPDATE (read_at); anything else here
    // would 403 in production even though the stub can't enforce it.
    expect(Object.keys(update?.values as object)).toEqual(["read_at"]);
  });

  it("is idempotent: an already-read notification keeps its original timestamp", async () => {
    const original = "2026-08-18T14:00:00Z";
    authed([
      {
        table: "notifications",
        op: "select",
        result: { data: { id: NOTIFICATION_ID, read_at: original } },
      },
    ]);

    const result = await markNotificationRead({ id: NOTIFICATION_ID });

    expect(result).toEqual({
      ok: true,
      data: { id: NOTIFICATION_ID, readAt: original },
    });
    // No update call: only the initial select ran.
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].op).toBe("select");
  });

  it("returns not_found for rows RLS hides (foreign or missing)", async () => {
    authed([{ table: "notifications", op: "select", result: { data: null } }]);

    const result = await markNotificationRead({ id: NOTIFICATION_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
  });
});
