import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dns, DnsError, InvalidDomain, RESOLVERS } from '../src/index.js';
import { Dns as DnsSubpath } from '../src/dns.js';
import { loadJson, readFixture } from './helpers.js';

const expected = loadJson('dns/expected.json');
const CASES = ['a_with_cname', 'mx', 'txt', 'nxdomain', 'no_answer', 'servfail'];

/**
 * Transport that records every request and answers with a fixed body.
 * @param {string | ((url: string) => {status: number, body: string})} reply
 */
function fakeTransport(reply) {
  const calls = [];
  const transport = async (url, headers) => {
    calls.push({ url, headers });
    return typeof reply === 'function' ? reply(url) : { status: 200, body: reply };
  };
  return { transport, calls };
}

describe('Dns.lookup with fixtures', () => {
  for (const name of CASES) {
    const testCase = expected[name];
    const [domain, type] = testCase.query;

    it(`parses ${name}.json`, async () => {
      const { transport } = fakeTransport(readFixture(`dns/${name}.json`));
      const dns = new Dns({ transport });
      if (testCase.error) {
        await assert.rejects(dns.lookup(domain, type), DnsError);
      } else {
        assert.deepEqual(await dns.lookup(domain, type), testCase.records);
      }
    });
  }
});

describe('Dns requests', () => {
  it('builds the Cloudflare URL and Accept header by default', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    await new Dns({ transport }).lookup('www.example.com', 'A');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, expected.request_url_cloudflare);
    const [header, value] = expected.request_header;
    assert.equal(calls[0].headers[header], value);
  });

  it('uses the Google resolver by name', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    const dns = new Dns({ resolver: 'google', transport });
    assert.equal(dns.resolver, RESOLVERS.google);
    await dns.lookup('www.example.com');
    assert.equal(calls[0].url, expected.request_url_google);
  });

  it('accepts a full resolver URL', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    await new Dns({ resolver: 'https://doh.example.net/resolve', transport }).lookup('www.example.com');
    assert.equal(calls[0].url, 'https://doh.example.net/resolve?name=www.example.com&type=A');
  });

  it('rejects an unknown resolver name', () => {
    assert.throws(() => new Dns({ resolver: 'quad9' }), DnsError);
  });

  it('normalizes the domain before querying', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    await new Dns({ transport }).lookup('HTTPS://WWW.Example.com/path');
    assert.equal(calls[0].url, expected.request_url_cloudflare);
  });

  it('defaults the type to A', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    await new Dns({ transport }).lookup('www.example.com');
    assert.match(calls[0].url, /&type=A$/);
  });

  it('accepts lowercase type names', async () => {
    const { transport } = fakeTransport(readFixture('dns/mx.json'));
    assert.deepEqual(await new Dns({ transport }).lookup('example.com', 'mx'), expected.mx.records);
  });

  it('throws DnsError for an unsupported type before any request', async () => {
    const { transport, calls } = fakeTransport('{}');
    await assert.rejects(new Dns({ transport }).lookup('example.com', 'SRV'), DnsError);
    assert.equal(calls.length, 0);
  });

  it('throws InvalidDomain for an invalid domain', async () => {
    const { transport } = fakeTransport('{}');
    await assert.rejects(new Dns({ transport }).lookup('localhost'), InvalidDomain);
  });

  it('throws DnsError on a non-200 HTTP status', async () => {
    const { transport } = fakeTransport(() => ({ status: 500, body: '' }));
    await assert.rejects(new Dns({ transport }).lookup('example.com'), /HTTP 500/);
  });

  it('throws DnsError on invalid JSON', async () => {
    const { transport } = fakeTransport('<html>');
    await assert.rejects(new Dns({ transport }).lookup('example.com'), DnsError);
  });

  it('wraps transport failures in DnsError', async () => {
    const dns = new Dns({
      transport: async () => {
        throw new Error('socket hang up');
      },
    });
    await assert.rejects(dns.lookup('example.com'), (error) => {
      assert.ok(error instanceof DnsError);
      assert.match(error.message, /socket hang up/);
      return true;
    });
  });

  it('supports a synchronous transport', async () => {
    const dns = new Dns({ transport: () => ({ status: 200, body: readFixture('dns/mx.json') }) });
    assert.equal((await dns.lookup('example.com', 'MX')).length, 2);
  });
});

describe('Dns record parsing', () => {
  const answer = (type, typeCode, data) =>
    JSON.stringify({ Status: 0, Answer: [{ name: 'example.com.', type: typeCode, TTL: 60, data }] });

  it('keeps CAA data as-is', async () => {
    const { transport } = fakeTransport(answer('CAA', 257, '0 issue "letsencrypt.org"'));
    const [record] = await new Dns({ transport }).lookup('example.com', 'CAA');
    assert.deepEqual(record, {
      type: 'CAA',
      name: 'example.com',
      value: '0 issue "letsencrypt.org"',
      ttl: 60,
      priority: null,
    });
  });

  it('strips trailing dots from NS and CNAME values', async () => {
    let { transport } = fakeTransport(answer('NS', 2, 'ns1.hostfog.io.'));
    assert.equal((await new Dns({ transport }).lookup('example.com', 'NS'))[0].value, 'ns1.hostfog.io');
    ({ transport } = fakeTransport(answer('CNAME', 5, 'target.example.net.')));
    assert.equal((await new Dns({ transport }).lookup('example.com', 'CNAME'))[0].value, 'target.example.net');
  });

  it('parses AAAA records', async () => {
    const { transport } = fakeTransport(answer('AAAA', 28, '2001:db8::1'));
    assert.equal((await new Dns({ transport }).lookup('example.com', 'AAAA'))[0].value, '2001:db8::1');
  });

  it('joins a single quoted TXT chunk', async () => {
    const { transport } = fakeTransport(answer('TXT', 16, '"v=spf1 -all"'));
    assert.equal((await new Dns({ transport }).lookup('example.com', 'TXT'))[0].value, 'v=spf1 -all');
  });
});

describe('Dns.pointsTo', () => {
  it('matches an IPv4 address using an A lookup', async () => {
    const { transport, calls } = fakeTransport(readFixture('dns/a_with_cname.json'));
    const dns = new Dns({ transport });
    assert.equal(await dns.pointsTo('www.example.com', '93.184.216.35'), true);
    assert.equal(await dns.pointsTo('www.example.com', '10.0.0.1'), false);
    assert.match(calls[0].url, /type=A$/);
  });

  it('uses an AAAA lookup for IPv6', async () => {
    const body = JSON.stringify({
      Status: 0,
      Answer: [{ name: 'example.com.', type: 28, TTL: 300, data: '2001:db8::1' }],
    });
    const { transport, calls } = fakeTransport(body);
    assert.equal(await new Dns({ transport }).pointsTo('example.com', '2001:db8::1'), true);
    assert.match(calls[0].url, /type=AAAA$/);
  });
});

describe('Dns.propagation', () => {
  const aBody = (...ips) =>
    JSON.stringify({
      Status: 0,
      Answer: ips.map((ip) => ({ name: 'example.com.', type: 1, TTL: 300, data: ip })),
    });

  it('queries both resolvers and reports consistency', async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      body: aBody('2.2.2.2', '1.1.1.1'),
    }));
    const result = await new Dns({ transport }).propagation('example.com');
    assert.deepEqual(result, {
      results: { cloudflare: ['1.1.1.1', '2.2.2.2'], google: ['1.1.1.1', '2.2.2.2'] },
      consistent: true,
    });
    const urls = calls.map((call) => call.url).sort();
    assert.deepEqual(urls, [
      `${RESOLVERS.cloudflare}?name=example.com&type=A`,
      `${RESOLVERS.google}?name=example.com&type=A`,
    ]);
  });

  it('queries both resolvers even when constructed with a custom one', async () => {
    const { transport, calls } = fakeTransport(() => ({ status: 200, body: aBody('1.1.1.1') }));
    await new Dns({ resolver: 'https://doh.example.net/q', transport }).propagation('example.com');
    assert.ok(calls.some((c) => c.url.startsWith(RESOLVERS.cloudflare)));
    assert.ok(calls.some((c) => c.url.startsWith(RESOLVERS.google)));
  });

  it('reports inconsistency when answers differ', async () => {
    const { transport } = fakeTransport((url) => ({
      status: 200,
      body: url.startsWith(RESOLVERS.google) ? aBody('9.9.9.9') : aBody('1.1.1.1'),
    }));
    const result = await new Dns({ transport }).propagation('example.com', 'A');
    assert.deepEqual(result.results, { cloudflare: ['1.1.1.1'], google: ['9.9.9.9'] });
    assert.equal(result.consistent, false);
  });
});

describe('subpath import', () => {
  it('exports the same Dns class from @hostfog/toolkit/dns', () => {
    assert.equal(DnsSubpath, Dns);
  });
});
