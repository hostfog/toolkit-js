import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Util } from '../src/index.js';
import { loadJson } from './helpers.js';

const fixture = loadJson('util.json');
const SYMBOLS = fixture.password_symbols;

describe('Util.formatBytes', () => {
  for (const [bytes, decimals, expected] of fixture.format_bytes) {
    it(`formatBytes(${bytes}, ${decimals}) === ${expected}`, () => {
      assert.equal(Util.formatBytes(bytes, decimals), expected);
    });
  }

  it('defaults to one decimal place', () => {
    assert.equal(Util.formatBytes(1536), '1.5 KB');
    assert.equal(Util.formatBytes(1100), '1.1 KB');
  });

  for (const bytes of fixture.format_bytes_invalid) {
    it(`throws RangeError for ${bytes}`, () => {
      assert.throws(() => Util.formatBytes(bytes), RangeError);
    });
  }

  it('throws for non-finite input', () => {
    assert.throws(() => Util.formatBytes(Number.NaN), RangeError);
    assert.throws(() => Util.formatBytes(Number.POSITIVE_INFINITY), RangeError);
  });

  it('caps at PB', () => {
    assert.equal(Util.formatBytes(1024 ** 6), '1024 PB');
  });
});

describe('Util.generatePassword', () => {
  const classes = (password) => ({
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: [...password].some((ch) => SYMBOLS.includes(ch)),
  });

  it('defaults to 20 characters with every class', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = Util.generatePassword();
      assert.equal(password.length, 20);
      assert.deepEqual(classes(password), { upper: true, lower: true, digit: true, symbol: true });
    }
  });

  it('only uses the allowed character set', () => {
    const allowed = new RegExp(`^[A-Za-z0-9${SYMBOLS.replace(/[-^\\\]]/g, '\\$&')}]+$`);
    for (let i = 0; i < 200; i += 1) {
      assert.match(Util.generatePassword(32), allowed);
    }
  });

  it('omits symbols when disabled', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = Util.generatePassword(8, false);
      assert.equal(password.length, 8);
      assert.match(password, /^[A-Za-z0-9]+$/);
      const c = classes(password);
      assert.ok(c.upper && c.lower && c.digit);
    }
  });

  it('guarantees every class even at the minimum length', () => {
    for (let i = 0; i < 500; i += 1) {
      assert.deepEqual(classes(Util.generatePassword(8)), {
        upper: true,
        lower: true,
        digit: true,
        symbol: true,
      });
    }
  });

  it('produces different passwords', () => {
    const set = new Set(Array.from({ length: 50 }, () => Util.generatePassword()));
    assert.equal(set.size, 50);
  });

  it('throws RangeError for a length under 8', () => {
    assert.throws(() => Util.generatePassword(7), RangeError);
    assert.throws(() => Util.generatePassword(0), RangeError);
    assert.throws(() => Util.generatePassword(8.5), RangeError);
  });
});
