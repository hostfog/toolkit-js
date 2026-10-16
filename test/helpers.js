import { readFileSync } from 'node:fs';

/**
 * Load a fixture file relative to test/fixtures.
 * @param {string} path
 */
export const fixturePath = (path) => new URL(`./fixtures/${path}`, import.meta.url);

export const readFixture = (path) => readFileSync(fixturePath(path), 'utf8');

export const loadJson = (path) => JSON.parse(readFixture(path));
