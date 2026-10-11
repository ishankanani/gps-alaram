// Answers from picker routes (ModalSheet, CountryPicker) back to whoever opened them. Route params
// stay serialisable: the caller gets a request id, the picker resolves it once, and leaving the
// picker any other way (back, swipe, close) resolves it with null.

const waiting = new Map<string, (value: unknown) => void>();
let counter = 0;

/** A new request id and a promise for its answer. */
export function createRequest<T>(): { requestId: string; result: Promise<T | null> } {
  counter += 1;
  const requestId = `req-${Date.now().toString(36)}-${counter}`;
  const result = new Promise<T | null>((resolve) => {
    waiting.set(requestId, resolve as (value: unknown) => void);
  });
  return { requestId, result };
}

/** Answers a request; later answers for the same id are ignored. */
export function resolveRequest<T>(requestId: string, value: T | null) {
  const resolve = waiting.get(requestId);
  if (!resolve) return;
  waiting.delete(requestId);
  resolve(value);
}
