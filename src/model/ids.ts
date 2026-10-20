/** Short random id, e.g. "k3f9x0q2ab". */
export function uid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
