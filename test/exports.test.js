import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as toolkit from '@hostfog/toolkit';
import * as domain from '@hostfog/toolkit/domain';
import * as dns from '@hostfog/toolkit/dns';
import * as ssl from '@hostfog/toolkit/ssl';
import * as nginx from '@hostfog/toolkit/nginx';
import * as health from '@hostfog/toolkit/health';
import * as util from '@hostfog/toolkit/util';
import * as errors from '@hostfog/toolkit/errors';

describe('package exports', () => {
  it('exposes every named export from the root', () => {
    for (const name of [
      'Domain', 'Dns', 'Ssl', 'CertificateInfo', 'NginxConfig', 'Health', 'Util',
      'ToolkitError', 'InvalidDomain', 'DnsError', 'SslError', 'ConfigError',
    ]) {
      assert.ok(toolkit[name], name);
    }
  });

  it('resolves every subpath to the same objects', () => {
    assert.equal(domain.Domain, toolkit.Domain);
    assert.equal(domain.normalize, toolkit.Domain.normalize);
    assert.equal(dns.Dns, toolkit.Dns);
    assert.equal(ssl.parsePem, toolkit.Ssl.parsePem);
    assert.equal(ssl.CertificateInfo, toolkit.CertificateInfo);
    assert.equal(nginx.NginxConfig, toolkit.NginxConfig);
    assert.equal(health.http, toolkit.Health.http);
    assert.equal(health.port, toolkit.Health.port);
    assert.equal(util.formatBytes, toolkit.Util.formatBytes);
    assert.equal(errors.ToolkitError, toolkit.ToolkitError);
  });

  it('builds an error hierarchy rooted at ToolkitError', () => {
    for (const ErrorClass of [errors.InvalidDomain, errors.DnsError, errors.SslError, errors.ConfigError]) {
      const error = new ErrorClass('boom');
      assert.ok(error instanceof errors.ToolkitError);
      assert.ok(error instanceof Error);
      assert.equal(error.name, ErrorClass.name);
      assert.equal(error.message, 'boom');
    }
  });

  it('freezes the namespace objects', () => {
    for (const ns of [toolkit.Domain, toolkit.Ssl, toolkit.Health, toolkit.Util]) {
      assert.ok(Object.isFrozen(ns));
    }
  });
});
