/**
 * English strings of user-facing API errors: errors.<code> from src/api/types.ts, plus errors.network and errors.timeout.
 * Owned by package A: account, plan, paywall. Keys use the prefix "errors." and define the set the other
 * languages translate.
 */
export const errors = {} as const satisfies Record<string, string>;
