/**
 * EmailSender abstraction (F0 §8.2: "email adapter behind an interface so the
 * vendor is replaceable"). The worker depends only on this contract; Brevo
 * specifics stay in ./brevo.ts.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null }
  | {
      ok: false;
      /** True when a later scheduler tick could plausibly succeed (429/5xx). */
      retryable: boolean;
      /** HTTP status when the provider answered; null on network failure. */
      status: number | null;
      error: string;
    };

export interface EmailSender {
  /** Short provider id for logs, e.g. "brevo". */
  readonly id: string;
  /** Never throws — failures are returned as `{ ok: false }`. */
  send(email: OutgoingEmail): Promise<EmailSendResult>;
}

/**
 * Stand-in used when the email secrets are absent (e.g. a project that only
 * uses in-app notifications). Sends nothing and reports a non-retryable
 * failure so the worker records the outcome without crashing.
 */
export class DisabledEmailSender implements EmailSender {
  readonly id = "disabled";

  constructor(private readonly reason: string) {}

  async send(): Promise<EmailSendResult> {
    return {
      ok: false,
      retryable: false,
      status: null,
      error: `email disabled: ${this.reason}`,
    };
  }
}
