// Picking facts by id, kept apart from facts.ts so a tool can use it without
// loading every other tool's facts.

/** The facts with these ids, in this order. Throws if one is missing, so a renamed
 *  fact fails the build and the tests instead of silently disappearing. */
export function factsById<T extends { id: string }>(facts: readonly T[], ...ids: string[]): T[] {
  return ids.map((id) => {
    const f = facts.find((x) => x.id === id);
    if (!f) throw new Error(`help: no fact "${id}"`);
    return f;
  });
}
