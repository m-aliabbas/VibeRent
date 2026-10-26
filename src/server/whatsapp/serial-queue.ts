/**
 * Runs async operations one at a time per key, in call order. Signal session state must be written
 * in the order Baileys produces it: two overlapping writes on a connection pool can commit out of
 * order, leaving an older ratchet in storage that the recipient's phone can no longer decrypt.
 */
export function createSerialQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return result;
  };
}
