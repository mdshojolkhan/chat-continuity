/**
 * Minimal ambient types for Bun's built-in test runner.
 *
 * The project intentionally installs no test-runner dependency, so this shim
 * keeps `bun test` files type-checked without adding a package.
 */
declare module "bun:test" {
  export function describe(label: string, body: () => void): void;
  export function test(label: string, body: () => unknown): void;
  export function it(label: string, body: () => unknown): void;

  type Matchers = {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeInstanceOf(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    not: Omit<Matchers, "not" | "rejects" | "resolves">;
    rejects: Omit<Matchers, "rejects" | "resolves">;
    resolves: Omit<Matchers, "rejects" | "resolves">;
  };

  export function expect(actual: unknown): Matchers;
}
