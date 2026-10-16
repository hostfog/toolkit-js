// Compile-only check of the hand-written declarations (npm run typecheck).
import {
  CertificateInfo,
  ConfigError,
  Dns,
  DnsError,
  Domain,
  Health,
  InvalidDomain,
  NginxConfig,
  RECORD_TYPES,
  RESOLVERS,
  Ssl,
  SslError,
  ToolkitError,
  Util,
  type DnsRecord,
  type DnsTransport,
  type HttpCheckResult,
  type PropagationResult,
  type RecordType,
} from '@hostfog/toolkit';
import { isValid, normalize } from '@hostfog/toolkit/domain';
import { Dns as DnsClass } from '@hostfog/toolkit/dns';
import { certificate, parsePem } from '@hostfog/toolkit/ssl';
import { NginxConfig as Builder } from '@hostfog/toolkit/nginx';
import { http, port } from '@hostfog/toolkit/health';
import { formatBytes, generatePassword } from '@hostfog/toolkit/util';
import { ToolkitError as BaseError } from '@hostfog/toolkit/errors';

const name: string = Domain.normalize('https://Bücher.de/');
const valid: boolean = Domain.isValid(name) && isValid(normalize('example.com'));

const transport: DnsTransport = async (url, headers) => ({ status: 200, body: `${url}${headers.Accept}` });
const dns = new Dns({ resolver: 'google', transport });
const custom = new DnsClass({ resolver: 'https://doh.example.net/resolve' });
const resolverUrl: string = dns.resolver + custom.resolver + RESOLVERS.cloudflare;
const code: number = RECORD_TYPES.MX;
const type: RecordType = 'CAA';

async function dnsChecks(): Promise<void> {
  const records: DnsRecord[] = await dns.lookup('example.com', 'MX');
  const priority: number | null = records[0].priority;
  const points: boolean = await dns.pointsTo('example.com', '203.0.113.10');
  const prop: PropagationResult = await dns.propagation('example.com', type);
  const google: string[] = prop.results.google;
  const consistent: boolean = prop.consistent;
  void [priority, points, google, consistent];
}

async function sslChecks(): Promise<void> {
  const live: CertificateInfo = await Ssl.certificate('hostfog.com');
  const local = await certificate('test.hostfog.dev', 8443, 5000, './ca.pem', { connectHost: '127.0.0.1' });
  const offline: CertificateInfo = parsePem('-----BEGIN CERTIFICATE-----');
  const fromBuffer = Ssl.parsePem(Buffer.from(''));
  const subject: string | null = live.subject;
  const issuer: string | null = local.issuer;
  const sans: string[] = offline.sans;
  const dates: string = fromBuffer.validFrom + fromBuffer.validTo + fromBuffer.serialNumber;
  const days: number = live.daysLeft;
  const expired: boolean = live.expired || live.coversHost('a.example.com') || live.expiresWithin(14);
  void [subject, issuer, sans, dates, days, expired];
}

const conf: string = new NginxConfig()
  .serverNames('example.com', 'www.example.com')
  .root('/var/www')
  .index('index.php', 'index.html')
  .php('/run/php/php8.3-fpm.sock')
  .ssl('/etc/ssl/fullchain.pem', '/etc/ssl/privkey.pem')
  .redirectHttps()
  .redirectHttps(false)
  .gzip()
  .clientMaxBodySize('64M')
  .render();
const proxy: string = new Builder().serverNames('app.example.io').proxyPass('http://127.0.0.1:3000').gzip(false).render();

async function healthChecks(): Promise<void> {
  const result: HttpCheckResult = await Health.http('https://hostfog.com', 5000);
  const status: number | null = result.status;
  const error: string | null = result.error;
  const viaTransport = await http('https://x.test', 100, async () => ({ status: 200 }));
  const open: boolean = (await Health.port('127.0.0.1', 22)) && (await port('127.0.0.1', 22, 1000));
  void [status, error, viaTransport.timeMs, open];
}

const sizes: string = Util.formatBytes(1536) + formatBytes(1234567890, 2);
const password: string = Util.generatePassword() + generatePassword(12, false);

function handle(error: unknown): string {
  if (error instanceof InvalidDomain || error instanceof DnsError) return error.message;
  if (error instanceof SslError || error instanceof ConfigError) return error.name;
  if (error instanceof ToolkitError && error instanceof BaseError) return 'toolkit';
  return 'unknown';
}

// @ts-expect-error unsupported record type
dns.lookup('example.com', 'SRV');
// @ts-expect-error serverNames requires strings
new NginxConfig().serverNames(42);

void [valid, resolverUrl, code, conf, proxy, sizes, password, handle, dnsChecks, sslChecks, healthChecks];
