/**
 * Normalise input (domain or URL) into a bare, lowercase, ASCII domain.
 * @throws {InvalidDomain} When the result is not a valid domain.
 */
export function normalize(input: string): string;

/** Check whether a string is a valid domain without stripping schemes or paths. */
export function isValid(input: string): boolean;

/** Domain helpers. */
export const Domain: {
  readonly normalize: typeof normalize;
  readonly isValid: typeof isValid;
};
