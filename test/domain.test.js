import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Domain, InvalidDomain, ToolkitError } from '../src/index.js';
import { normalize, isValid } from '../src/domain.js';
import { loadJson } from './helpers.js';

const fixture = loadJson('domain.json');

describe('Domain.normalize', () => {
  for (const [input, expected] of fixture.normalize) {
    it(`normalizes ${JSON.stringify(input)} to ${expected}`, () => {
      assert.equal(Domain.normalize(input), expected);
    });
  }

  for (const input of fixture.normalize_invalid) {
    it(`throws InvalidDomain for ${JSON.stringify(input)}`, () => {
      assert.throws(() => Domain.normalize(input), InvalidDomain);
    });
  }

  it('throws an error that extends ToolkitError', () => {
    assert.throws(() => Domain.normalize('localhost'), ToolkitError);
  });

  it('rejects non-string input', () => {
    assert.throws(() => Domain.normalize(42), InvalidDomain);
  });

  it('strips an empty port and keeps subdomains', () => {
    assert.equal(normalize('HTTP://A.B.Example.com:/x'), 'a.b.example.com');
  });
});

describe('Domain.isValid', () => {
  for (const [input, expected] of fixture.is_valid) {
    it(`isValid(${JSON.stringify(input)}) === ${expected}`, () => {
      assert.equal(Domain.isValid(input), expected);
    });
  }

  it('rejects a 64-character label', () => {
    assert.equal(isValid(fixture.is_valid_long.label_64_chars_invalid), false);
  });

  it('accepts a 63-character label', () => {
    assert.equal(isValid(fixture.is_valid_long.label_63_chars_valid), true);
  });

  it('accepts IDNs by converting them', () => {
    assert.equal(isValid('bücher.de'), true);
  });

  it('enforces the 253 character total limit', () => {
    const label = 'a'.repeat(63);
    const ok = `${label}.${label}.${label}.${'a'.repeat(57)}.com`; // 253 chars
    assert.equal(ok.length, 253);
    assert.equal(isValid(ok), true);
    assert.equal(isValid(`a${ok}`), false);
  });

  it('does not strip whitespace', () => {
    assert.equal(isValid(' example.com'), false);
  });

  it('returns false for non-strings', () => {
    assert.equal(isValid(null), false);
  });
});
