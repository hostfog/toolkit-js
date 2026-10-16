import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CertificateInfo, Ssl, SslError } from '../src/index.js';
import { fixturePath, loadJson, readFixture } from './helpers.js';

const expected = loadJson('ssl/expected.json');
const CERT = readFixture('ssl/test-cert.pem');
const KEY = readFixture('ssl/test-key.pem');
const CA_FILE = fileURLToPath(fixturePath('ssl/test-cert.pem'));

const info = (overrides = {}, now = new Date('2026-01-01T00:00:00Z')) =>
  new CertificateInfo(
    {
      subject: 'example.com',
      issuer: 'Test CA',
      sans: ['example.com'],
      validFrom: '2025-01-01T00:00:00Z',
      validTo: '2026-01-31T00:00:00Z',
      serialNumber: '01',
      ...overrides,
    },
    now,
  );

describe('Ssl.parsePem', () => {
  const cert = Ssl.parsePem(CERT);

  for (const field of ['subject', 'issuer', 'sans', 'validFrom', 'validTo', 'serialNumber']) {
    it(`parses ${field}`, () => {
      assert.deepEqual(cert[field], expected[field]);
    });
  }

  it('returns a CertificateInfo', () => {
    assert.ok(cert instanceof CertificateInfo);
  });

  it('computes daysLeft and expired from validTo', () => {
    const remaining = (Date.parse(expected.validTo) - Date.now()) / 86_400_000;
    assert.ok(Number.isInteger(cert.daysLeft));
    assert.ok(Math.abs(cert.daysLeft - Math.floor(remaining)) <= 1);
    assert.equal(cert.expired, false);
  });

  for (const [host, covered] of Object.entries(expected.coversHost)) {
    it(`coversHost(${host}) === ${covered}`, () => {
      assert.equal(cert.coversHost(host), covered);
    });
  }

  it('accepts a Buffer', () => {
    assert.equal(Ssl.parsePem(Buffer.from(CERT)).serialNumber, expected.serialNumber);
  });

  it('throws SslError for invalid PEM', () => {
    assert.throws(() => Ssl.parsePem('not a certificate'), SslError);
  });

  it('serializes to JSON with every field', () => {
    const json = JSON.parse(JSON.stringify(cert));
    assert.deepEqual(
      Object.keys(json).sort(),
      ['daysLeft', 'expired', 'issuer', 'sans', 'serialNumber', 'subject', 'validFrom', 'validTo'],
    );
  });
});

describe('CertificateInfo', () => {
  it('floors daysLeft', () => {
    assert.equal(info({}, new Date('2026-01-30T12:00:00Z')).daysLeft, 0);
    assert.equal(info({}, new Date('2026-01-01T00:00:00Z')).daysLeft, 30);
  });

  it('reports negative daysLeft and expired once past validTo', () => {
    const cert = info({}, new Date('2026-02-02T00:00:00Z'));
    assert.equal(cert.daysLeft, -2);
    assert.equal(cert.expired, true);
  });

  it('expiresWithin compares against daysLeft', () => {
    const cert = info();
    assert.equal(cert.expiresWithin(30), true);
    assert.equal(cert.expiresWithin(29), false);
  });

  it('matches hosts case-insensitively and ignores a trailing dot', () => {
    const cert = info({ sans: ['*.Example.com'] });
    assert.equal(cert.coversHost('WWW.example.com.'), true);
    assert.equal(cert.coversHost(''), false);
    assert.equal(cert.coversHost('.example.com'), false);
  });
});

describe('Ssl.certificate (local TLS server)', () => {
  let server;
  let port;

  before(async () => {
    server = tls.createServer({ cert: CERT, key: KEY }, (socket) => socket.end());
    server.on('tlsClientError', () => {});
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('returns the certificate when the CA file is trusted', async () => {
    const cert = await Ssl.certificate('test.hostfog.dev', port, 5000, CA_FILE, {
      connectHost: '127.0.0.1',
    });
    assert.ok(cert instanceof CertificateInfo);
    assert.equal(cert.subject, expected.subject);
    assert.equal(cert.issuer, expected.issuer);
    assert.deepEqual(cert.sans, expected.sans);
    assert.equal(cert.validFrom, expected.validFrom);
    assert.equal(cert.validTo, expected.validTo);
    assert.equal(cert.serialNumber, expected.serialNumber);
  });

  it('throws SslError when the certificate is not trusted', async () => {
    await assert.rejects(
      Ssl.certificate('test.hostfog.dev', port, 5000, undefined, { connectHost: '127.0.0.1' }),
      (error) => {
        assert.ok(error instanceof SslError);
        assert.match(error.message, /self[- ]signed|unable to verify|certificate/i);
        return true;
      },
    );
  });

  it('throws SslError when the host does not match the certificate', async () => {
    await assert.rejects(
      Ssl.certificate('other.example.com', port, 5000, CA_FILE, { connectHost: '127.0.0.1' }),
      SslError,
    );
  });

  it('throws SslError when the connection is refused', async () => {
    const closed = await freePort();
    await assert.rejects(
      Ssl.certificate('test.hostfog.dev', closed, 2000, CA_FILE, { connectHost: '127.0.0.1' }),
      SslError,
    );
  });

  it('throws SslError on a handshake timeout', async () => {
    const silent = net.createServer(() => {});
    await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(
        Ssl.certificate('test.hostfog.dev', silent.address().port, 200, CA_FILE, {
          connectHost: '127.0.0.1',
        }),
        /timed out/,
      );
    } finally {
      silent.close();
    }
  });

  it('throws SslError when the CA file is missing', async () => {
    await assert.rejects(
      Ssl.certificate('test.hostfog.dev', port, 5000, '/nonexistent/ca.pem'),
      SslError,
    );
  });
});

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
