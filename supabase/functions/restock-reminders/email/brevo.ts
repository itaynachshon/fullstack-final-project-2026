/**
 * Brevo transactional email adapter — a plain authenticated fetch against
 * https://api.brevo.com/v3/smtp/email (no SDK; the dependency set is frozen
 * and one POST does not justify a package).
 *
 * Failure policy ("Brevo 429/5xx graceful handling"):
 * - 429 and 5xx are retried ONCE after a short delay, then reported as a
 *   retryable failure. The worker logs it and continues — an email failure
 *   never blocks the in-app notification, and because the occurrence was
 *   already claimed, a later tick will not double-send.
 * - Other 4xx (bad key, unverified sender…) fail immediately: retrying the
 *   same request cannot help.
 * - Network errors / timeouts behave like 5xx.
 * `send` never throws.
 */

import type { EmailSender, EmailSendResult, OutgoingEmail } from "./types.ts";

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface BrevoOptions {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  /** Injectable for tests; defaults to the platform fetch. */
  fetchFn?: typeof fetch;
  /** Delay before the single retry; 0 in tests. */
  retryDelayMs?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
}

const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_TIMEOUT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class BrevoEmailSender implements EmailSender {
  readonly id = "brevo";

  private readonly fetchFn: typeof fetch;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: BrevoOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send(email: OutgoingEmail): Promise<EmailSendResult> {
    let lastFailure: EmailSendResult & { ok: false } = {
      ok: false,
      retryable: true,
      status: null,
      error: "not attempted",
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (attempt > 1) await sleep(this.retryDelayMs);
      const result = await this.attempt(email);
      if (result.ok || !result.retryable) return result;
      lastFailure = result;
    }
    return lastFailure;
  }

  private async attempt(email: OutgoingEmail): Promise<EmailSendResult> {
    let response: Response;
    try {
      response = await this.fetchFn(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": this.options.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: this.options.fromName ?? "Fridge Tracker",
            email: this.options.fromEmail,
          },
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        status: null,
        error: `network error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (response.ok) {
      let providerMessageId: string | null = null;
      try {
        const body = (await response.json()) as { messageId?: unknown };
        if (typeof body.messageId === "string") {
          providerMessageId = body.messageId;
        }
      } catch {
        // 2xx with a non-JSON body still counts as sent.
      }
      return { ok: true, providerMessageId };
    }

    const detail = (await response.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      retryable: isRetryableStatus(response.status),
      status: response.status,
      error: `brevo responded ${response.status}${detail ? `: ${detail}` : ""}`,
    };
  }
}
