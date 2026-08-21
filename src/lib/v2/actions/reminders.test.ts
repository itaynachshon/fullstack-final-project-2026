import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

import {
  createRestockReminder,
  deleteRestockReminder,
  listRestockReminders,
  updateRestockReminder,
} from "./reminders";
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REMINDER_ID = "22222222-2222-4222-8222-222222222222";

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
function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REMINDER_ID,
    user_id: USER_ID,
    days_of_week: [0, 4],
    local_time: "18:30:00",
    timezone: "Asia/Jerusalem",
    enabled: true,
    email_enabled: true,
    in_app_enabled: true,
    last_sent_key: null,
    created_at: "2026-08-18T10:00:00Z",
    updated_at: "2026-08-18T10:00:00Z",
    ...overrides,
  };
}

const validCreate = {
  daysOfWeek: [0, 4] as [0, 4],
  localTime: "18:30",
  timezone: "Asia/Jerusalem",
  enabled: true,
  emailEnabled: true,
  inAppEnabled: true,
};

/* ─── Auth gate (all four actions) ────────────────────────────────────────── */

describe("reminder actions auth gate", () => {
  it("rejects unauthenticated callers before touching the database", async () => {
    anonymous();

    const results = [
      await listRestockReminders(),
      await createRestockReminder(validCreate),
      await updateRestockReminder({ id: REMINDER_ID, enabled: false }),
      await deleteRestockReminder({ id: REMINDER_ID }),
    ];

    for (const result of results) {
      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "unauthenticated" }),
      });
    }
    expect(stub.calls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/* ─── listRestockReminders ────────────────────────────────────────────────── */

describe("listRestockReminders", () => {
  it("maps rows to camelCase domain reminders", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "select",
        result: { data: [reminderRow()] },
      },
    ]);

    const result = await listRestockReminders();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual([
        {
          id: REMINDER_ID,
          userId: USER_ID,
          daysOfWeek: [0, 4],
          localTime: "18:30",
          timezone: "Asia/Jerusalem",
          enabled: true,
          emailEnabled: true,
          inAppEnabled: true,
          lastSentKey: null,
          createdAt: "2026-08-18T10:00:00Z",
          updatedAt: "2026-08-18T10:00:00Z",
        },
      ]);
    }
    const call = stub.calls[0];
    expect(call.order).toEqual([
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ]);
  });

  it("returns an empty list when the user has no reminders", async () => {
    authed([
      { table: "restock_reminders", op: "select", result: { data: [] } },
    ]);
    const result = await listRestockReminders();
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("maps DB failures to a generic internal error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    authed([
      {
        table: "restock_reminders",
        op: "select",
        result: { error: { message: "boom" } },
      },
    ]);

    const result = await listRestockReminders();
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "internal" }),
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

/* ─── createRestockReminder ───────────────────────────────────────────────── */

describe("createRestockReminder", () => {
  it("validates against the frozen schema before any DB call", async () => {
    const results = [
      await createRestockReminder({
        ...validCreate,
        daysOfWeek: [1, 1] as never,
      }),
      await createRestockReminder({ ...validCreate, localTime: "24:00" }),
      await createRestockReminder({ ...validCreate, timezone: "Not/A_Zone" }),
      await createRestockReminder({
        ...validCreate,
        emailEnabled: false,
        inAppEnabled: false,
      }),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("validation");
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("inserts a row owned by the session user and never writes last_sent_key", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "insert",
        result: { data: reminderRow() },
      },
    ]);

    const result = await createRestockReminder({
      ...validCreate,
      // A hostile client smuggling scheduler state: Zod strips it.
      lastSentKey: "forged",
      userId: "someone-else",
    } as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(REMINDER_ID);

    const insert = stub.calls.find((call) => call.op === "insert");
    expect(insert?.values).toEqual({
      user_id: USER_ID,
      days_of_week: [0, 4],
      local_time: "18:30",
      timezone: "Asia/Jerusalem",
      enabled: true,
      email_enabled: true,
      in_app_enabled: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/restock");
  });

  it("translates the channel CHECK violation into a friendly validation error", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "insert",
        result: { error: { code: "23514", message: "check violation" } },
      },
    ]);

    const result = await createRestockReminder(validCreate);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
  });
});

/* ─── updateRestockReminder ───────────────────────────────────────────────── */

describe("updateRestockReminder", () => {
  it("patches only the provided fields plus updated_at, scoped by id", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "update",
        result: { data: [reminderRow({ local_time: "07:15:00" })] },
      },
    ]);

    const result = await updateRestockReminder({
      id: REMINDER_ID,
      localTime: "07:15",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.localTime).toBe("07:15");

    const update = stub.calls.find((call) => call.op === "update");
    expect(update?.eq).toEqual({ id: REMINDER_ID });
    expect(update?.values).toEqual({
      local_time: "07:15",
      updated_at: expect.any(String),
    });
    // Untouched fields must not appear in the patch.
    expect(update?.values).not.toHaveProperty("days_of_week");
    expect(update?.values).not.toHaveProperty("enabled");
    expect(update?.values).not.toHaveProperty("last_sent_key");
    expect(revalidatePath).toHaveBeenCalledWith("/restock");
  });

  it("rejects enabling a reminder with both channels off (schema level)", async () => {
    const result = await updateRestockReminder({
      id: REMINDER_ID,
      enabled: true,
      emailEnabled: false,
      inAppEnabled: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
    expect(stub.calls).toHaveLength(0);
  });

  it("maps the merged-row CHECK violation to validation (re-enable with stored channels off)", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "update",
        result: { error: { code: "23514", message: "check violation" } },
      },
    ]);

    const result = await updateRestockReminder({
      id: REMINDER_ID,
      enabled: true,
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
  });

  it("returns not_found when RLS hides the row (foreign or missing id)", async () => {
    authed([
      { table: "restock_reminders", op: "update", result: { data: [] } },
    ]);

    const result = await updateRestockReminder({
      id: REMINDER_ID,
      enabled: false,
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/* ─── deleteRestockReminder ───────────────────────────────────────────────── */

describe("deleteRestockReminder", () => {
  it("deletes by id and reports the deleted id", async () => {
    authed([
      {
        table: "restock_reminders",
        op: "delete",
        result: { data: [{ id: REMINDER_ID }] },
      },
    ]);

    const result = await deleteRestockReminder({ id: REMINDER_ID });

    expect(result).toEqual({ ok: true, data: { id: REMINDER_ID } });
    const del = stub.calls.find((call) => call.op === "delete");
    expect(del?.eq).toEqual({ id: REMINDER_ID });
    expect(revalidatePath).toHaveBeenCalledWith("/restock");
  });

  it("returns not_found for a row RLS hides", async () => {
    authed([
      { table: "restock_reminders", op: "delete", result: { data: [] } },
    ]);

    const result = await deleteRestockReminder({ id: REMINDER_ID });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "not_found" }),
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed id without touching the database", async () => {
    const result = await deleteRestockReminder({ id: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation");
    expect(stub.calls).toHaveLength(0);
  });
});
