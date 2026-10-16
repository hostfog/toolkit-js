import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, describe, it } from 'node:test';
import { Health } from '../src/index.js';

describe('Health.http', () => {
  let server;
  let base;

  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(301, { Location: '/missing' });
        res.end();
      } else if (req.url === '/missing') {
        res.writeHead(404);
        res.end('not found');
      } else if (req.url === '/error') {
        res.writeHead(503);
        res.end();
      } else if (req.url === '/slow') {
        setTimeout(() => res.end('late'), 1000);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(req.method);
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.closeAllConnections?.();
    return new Promise((resolve) => server.close(resolve));
  });

  it('reports a healthy 200 response', async () => {
    const result = await Health.http(`${base}/`);
    assert.equal(result.url, `${base}/`);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.error, null);
    assert.ok(Number.isInteger(result.timeMs) && result.timeMs >= 0);
  });

  it('does not follow redirects and treats 3xx as ok', async () => {
    const result = await Health.http(`${base}/redirect`);
    assert.equal(result.status, 301);
    assert.equal(result.ok, true);
  });

  it('reports 4xx and 5xx as not ok', async () => {
    assert.deepEqual(
      [(await Health.http(`${base}/missing`)).ok, (await Health.http(`${base}/error`)).status],
      [false, 503],
    );
  });

  it('returns an error result on timeout without throwing', async () => {
    const result = await Health.http(`${base}/slow`, 100);
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.match(result.error, /timed out/i);
  });

  it('returns an error result when the connection is refused', async () => {
    const result = await Health.http(`http://127.0.0.1:${await closedPort()}/`);
    assert.equal(result.ok, false);
    assert.equal(result.status, null);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
  });

  it('returns an error result for an invalid URL or protocol', async () => {
    assert.equal((await Health.http('not a url')).ok, false);
    assert.match((await Health.http('ftp://127.0.0.1/')).error, /Unsupported protocol/);
  });

  it('uses an injected transport', async () => {
    const calls = [];
    const result = await Health.http('https://example.com', 1234, async (url, timeout) => {
      calls.push([url, timeout]);
      return { status: 204 };
    });
    assert.deepEqual(calls, [['https://example.com', 1234]]);
    assert.equal(result.ok, true);
    assert.equal(result.status, 204);
  });

  it('reports a transport rejection as an error result', async () => {
    const result = await Health.http('https://example.com', 1000, async () => {
      throw new Error('ECONNRESET');
    });
    assert.deepEqual({ ...result, timeMs: 0 }, {
      url: 'https://example.com',
      ok: false,
      status: null,
      timeMs: 0,
      error: 'ECONNRESET',
    });
  });
});

describe('Health.port', () => {
  let server;
  let openPort;

  before(async () => {
    server = net.createServer((socket) => socket.end());
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    openPort = server.address().port;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('returns true for an open port', async () => {
    assert.equal(await Health.port('127.0.0.1', openPort), true);
  });

  it('returns false for a closed port', async () => {
    assert.equal(await Health.port('127.0.0.1', await closedPort(), 1000), false);
  });
});

async function closedPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
