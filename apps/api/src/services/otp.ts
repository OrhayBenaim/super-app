import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, lte } from "drizzle-orm";
import { OTP } from "@grocer/shared/otp";
import type { Db } from "#/db/index.ts";
import { verification } from "#/db/schema.ts";
import type { ErrorHandler } from "#/services/error-handler.ts";
import type { Email, MailerService } from "#/services/mailer.ts";
import type { Clock } from "#/utils/clock.ts";

/** What a code is for. Each purpose keeps its own code per email, so a code never works for another purpose. */
export type OtpPurpose = "password-reset" | "delete-account" | "delete-data";

export type OtpResult = "ok" | "wrong" | "tooManyTries" | "expired";

/**
 * Emailed one-time codes: the Reset code and the Deletion code (CONTEXT.md). Every code follows the shared OTP rule: 6 digits,
 * valid 5 minutes, dead after 3 wrong tries. One live code per purpose and email, stored in better-auth's verification
 * table as "<code>:<wrong tries>"; each call is one SQLite transaction, so concurrent tries can't outrun the count.
 */
export class OtpService {
  #db: Db;
  #mailer: MailerService;
  #clock: Clock;
  #errorHandler: ErrorHandler;

  constructor({ db, mailer, clock, errorHandler }: { db: Db; mailer: MailerService; clock: Clock; errorHandler: ErrorHandler }) {
    this.#db = db;
    this.#mailer = mailer;
    this.#clock = clock;
    this.#errorHandler = errorHandler;
  }

  /**
   * A new code for `email`, replacing any earlier one for the same purpose. Also deletes every expired verification
   * row: codes for emails with no account are never used again, so nothing else would remove them.
   */
  create(purpose: OtpPurpose, email: string): string {
    const code = String(randomInt(10 ** OTP.length)).padStart(OTP.length, "0");
    const now = this.#clock.now();
    const identifier = key(purpose, email);
    // this.revoke inside the transaction is safe: better-sqlite3 has one connection, so it runs in the open transaction.
    this.#db.transaction((tx) => {
      tx.delete(verification).where(lte(verification.expiresAt, now)).run();
      this.revoke(purpose, email);
      tx.insert(verification)
        .values({
          id: randomUUID(),
          identifier,
          value: `${code}:0`,
          expiresAt: new Date(now.getTime() + OTP.minutes * 60_000),
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
    return code;
  }

  /**
   * Checks a code. The right one is used up. Each wrong try counts, and the last allowed one revokes the code
   * ("tooManyTries"). A code that is past its time, used up or revoked, or was never sent, is "expired".
   */
  verify(purpose: OtpPurpose, email: string, code: string): OtpResult {
    return this.#try(purpose, email, code, true);
  }

  /** Like verify, but the right code stays live: for a step that checks it before a later step uses it up. */
  check(purpose: OtpPurpose, email: string, code: string): OtpResult {
    return this.#try(purpose, email, code, false);
  }

  #try(purpose: OtpPurpose, email: string, code: string, useUp: boolean): OtpResult {
    const identifier = key(purpose, email);
    const now = this.#clock.now().getTime();
    return this.#db.transaction((tx) => {
      const row = tx.select().from(verification).where(eq(verification.identifier, identifier)).get();
      if (!row) return "expired";
      const revoke = () => this.revoke(purpose, email);
      if (row.expiresAt.getTime() <= now) {
        revoke();
        return "expired";
      }
      const [stored = "", tries] = row.value.split(":");
      // Byte lengths: timingSafeEqual throws on unequal buffers, and a multi-byte "code" can match in characters.
      const [a, b] = [Buffer.from(stored), Buffer.from(code)];
      if (a.length === b.length && timingSafeEqual(a, b)) {
        if (useUp) revoke();
        return "ok";
      }
      const wrongTries = Number(tries) + 1;
      if (wrongTries >= OTP.maxTries) {
        revoke();
        return "tooManyTries";
      }
      tx.update(verification).set({ value: `${stored}:${wrongTries}`, updatedAt: new Date(now) }).where(eq(verification.identifier, identifier)).run();
      return "wrong";
    });
  }

  /** Kills the live code for `email`, if any. */
  revoke(purpose: OtpPurpose, email: string) {
    this.#db.delete(verification).where(eq(verification.identifier, key(purpose, email))).run();
  }

  /**
   * Emails a code without waiting, so a request answers as fast whether or not the email has an account, and a failed
   * send can't become an error only real accounts see. A failure goes to the error handler.
   */
  send(email: Email) {
    this.#mailer.send(email).catch((error: unknown) => {
      console.error("otp: code email not sent", error);
      this.#errorHandler.report(error);
    });
  }
}

const key = (purpose: OtpPurpose, email: string) => `otp:${purpose}:${email}`;
