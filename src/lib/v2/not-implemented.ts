import type { V2ActionResult } from "./types";

/** Shared stub result. Feature agents replace the calling action body. */
export function notImplemented<T>(feature: string): V2ActionResult<T> {
  return {
    ok: false,
    error: {
      code: "not_implemented",
      message: `${feature} is not implemented yet.`,
    },
  };
}
