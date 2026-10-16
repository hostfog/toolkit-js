/**
 * Uptime checks for HTTP endpoints and TCP ports.
 *
 * @module @hostfog/toolkit/health
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { performance } from 'node:perf_hooks';

/**
 * @typedef {object} HttpCheckResult
 * @property {string} url The URL that was checked.
 * @property {boolean} ok True for a 200–399 response.
 * @property {number | null} status HTTP status, or `null` on a network error.
 * @property {number} timeMs Elapsed time in whole milliseconds.
 * @property {string | null} error Error message on a network error, otherwise `null`.
 */

/**
 * @callback HealthTransport
 * @param {string} url
 * @param {number} timeout Timeout in milliseconds.
 * @returns {Promise<{ status: number }>} Rejects on a network error.
 */

/**
 * Default transport: a single GET with node:http/https, no redirects.
 *
 * @type {HealthTransport}
 */
function nodeTransport(url, timeout) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : target.protocol === 'http:' ? http : null;
    if (client === null) {
      reject(new Error(`Unsupported protocol "${target.protocol}"`));
      return;
    }

    const request = client.request(target, {
      method: 'GET',
      headers: { 'User-Agent': 'hostfog-toolkit-js/0.1.0' },
      timeout,
    });
    request.once('timeout', () => request.destroy(new Error(`Timed out after ${timeout} ms`)));
    request.once('error', reject);
    request.once('response', (response) => {
      response.resume();
      resolve({ status: response.statusCode ?? 0 });
      request.destroy();
    });
    request.end();
  });
}

/**
 * Check an HTTP(S) endpoint with a single GET (redirects are not followed).
 *
 * Never throws on network errors; they are reported in the result.
 *
 * @example
 * const result = await http('https://hostfog.com');
 * // { url, ok: true, status: 200, timeMs: 84, error: null }
 *
 * @param {string} url
 * @param {number} [timeout=10000] Timeout in milliseconds.
 * @param {HealthTransport} [transport] Custom transport, mainly for tests.
 * @returns {Promise<HttpCheckResult>}
 */
export async function httpCheck(url, timeout = 10_000, transport = nodeTransport) {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const { status } = await transport(url, timeout);
    return { url, ok: status >= 200 && status <= 399, status, timeMs: elapsed(), error: null };
  } catch (error) {
    return { url, ok: false, status: null, timeMs: elapsed(), error: error?.message || String(error) };
  }
}

/**
 * Check whether a TCP port accepts connections.
 *
 * @example
 * await port('127.0.0.1', 22); // true
 *
 * @param {string} host
 * @param {number} port
 * @param {number} [timeout=3000] Timeout in milliseconds.
 * @returns {Promise<boolean>}
 */
export function portCheck(host, port, timeout = 3_000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Health checks as a single namespace object. */
export const Health = Object.freeze({ http: httpCheck, port: portCheck });

export { httpCheck as http, portCheck as port };
