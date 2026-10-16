import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, InvalidDomain, NginxConfig } from '../src/index.js';
import { loadJson, readFixture } from './helpers.js';

/**
 * Apply a fixture input object to a fresh builder.
 * @param {Record<string, unknown>} input
 */
function build(input) {
  const config = new NginxConfig();
  if (input.serverNames) config.serverNames(...input.serverNames);
  if (input.root !== undefined) config.root(input.root);
  if (input.index !== undefined) config.index(...input.index);
  if (input.php !== undefined) config.php(input.php);
  if (input.proxyPass !== undefined) config.proxyPass(input.proxyPass);
  if (input.ssl !== undefined) config.ssl(...input.ssl);
  if (input.redirectHttps !== undefined) config.redirectHttps(input.redirectHttps);
  if (input.gzip !== undefined) config.gzip(input.gzip);
  if (input.clientMaxBodySize !== undefined) config.clientMaxBodySize(input.clientMaxBodySize);
  return config;
}

describe('NginxConfig fixtures (byte-exact)', () => {
  for (const name of ['php-ssl', 'proxy-ssl-noredirect', 'static-http']) {
    it(`renders ${name}.conf`, () => {
      const output = build(loadJson(`nginx/${name}.json`)).render();
      assert.equal(output, readFixture(`nginx/${name}.conf`));
      assert.ok(output.endsWith('}\n'));
    });
  }
});

describe('NginxConfig invalid fixtures', () => {
  const invalid = loadJson('nginx/invalid.json');
  for (const [name, input] of Object.entries(invalid)) {
    it(`throws ConfigError for ${name}`, () => {
      assert.throws(() => build(input).render(), ConfigError);
    });
  }
});

describe('NginxConfig behaviour', () => {
  it('returns this from every setter', () => {
    const config = new NginxConfig();
    for (const [method, args] of [
      ['serverNames', ['example.com']],
      ['root', ['/var/www']],
      ['index', ['index.html']],
      ['php', ['/run/php.sock']],
      ['proxyPass', ['http://127.0.0.1:3000']],
      ['ssl', ['/c.pem', '/k.pem']],
      ['redirectHttps', []],
      ['gzip', []],
      ['clientMaxBodySize', ['10M']],
    ]) {
      assert.equal(config[method](...args), config, method);
    }
  });

  it('normalizes server names and rejects invalid ones', () => {
    const conf = new NginxConfig().serverNames('https://WWW.Example.com/').root('/srv').render();
    assert.match(conf, /server_name www\.example\.com;/);
    assert.throws(() => new NginxConfig().serverNames('localhost'), InvalidDomain);
  });

  it('uses a custom index', () => {
    const conf = new NginxConfig().serverNames('example.com').root('/srv').index('app.html').render();
    assert.match(conf, /\n {4}index app\.html;\n/);
  });

  it('defaults redirectHttps to true when ssl is set', () => {
    const conf = new NginxConfig().serverNames('example.com').root('/srv').ssl('/c', '/k').render();
    assert.ok(conf.startsWith('server {\n    listen 80;\n    listen [::]:80;\n    server_name example.com;\n    return 301'));
    assert.equal(conf.match(/^server \{/gm).length, 2);
  });

  it('ignores redirectHttps without ssl', () => {
    const conf = new NginxConfig().serverNames('example.com').root('/srv').redirectHttps(true).render();
    assert.equal(conf.match(/^server \{/gm).length, 1);
    assert.doesNotMatch(conf, /443|return 301/);
  });

  it('can turn gzip back off', () => {
    const conf = new NginxConfig().serverNames('example.com').root('/srv').gzip().gzip(false).render();
    assert.doesNotMatch(conf, /gzip/);
  });

  it('rejects proxyPass combined with root', () => {
    const config = new NginxConfig().serverNames('example.com').root('/srv').proxyPass('http://x');
    assert.throws(() => config.render(), ConfigError);
  });

  it('rejects injection in every value', () => {
    const base = () => new NginxConfig().serverNames('example.com').root('/srv');
    for (const bad of ['a;b', 'a{b', 'a}b', 'a\nb', 'a\rb']) {
      assert.throws(() => base().clientMaxBodySize(bad).render(), ConfigError);
      assert.throws(() => base().ssl(bad, '/k').render(), ConfigError);
      assert.throws(() => base().ssl('/c', bad).render(), ConfigError);
      assert.throws(() => base().php(bad).render(), ConfigError);
      assert.throws(() => base().index(bad).render(), ConfigError);
      assert.throws(() => new NginxConfig().serverNames('example.com').proxyPass(bad).render(), ConfigError);
    }
  });
});
