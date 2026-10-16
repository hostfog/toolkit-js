<p align="center">
  <a href="https://hostfog.com"><img src="https://raw.githubusercontent.com/hostfog/panel/main/assets/logo.svg" alt="HostFog" width="220"></a>
</p>

<h1 align="center">HostFog Toolkit for JavaScript</h1>

<p align="center">
  Zero-dependency helpers for web developers and server admins: domains, DNS-over-HTTPS, SSL certificates, nginx configs, health checks and utilities.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@hostfog/toolkit"><img src="https://img.shields.io/npm/v/@hostfog/toolkit.svg" alt="npm version"></a>
  <a href="https://github.com/hostfog/toolkit-js/actions/workflows/ci.yml"><img src="https://github.com/hostfog/toolkit-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licence"></a>
  <a href="https://www.npmjs.com/package/@hostfog/toolkit"><img src="https://img.shields.io/npm/dm/@hostfog/toolkit.svg" alt="npm downloads"></a>
</p>

---

## Install

```bash
npm install @hostfog/toolkit
```

## Quick start

```js
import { Domain, Dns, Ssl, NginxConfig, Health, Util } from '@hostfog/toolkit';

const domain = Domain.normalize('https://Bücher.de/shop?q=1'); // 'xn--bcher-kva.de'

const records = await new Dns().lookup('example.com', 'MX');
const cert = await Ssl.certificate('hostfog.com');
console.log(cert.daysLeft, cert.expiresWithin(14));

const conf = new NginxConfig()
  .serverNames('example.com', 'www.example.com')
  .root('/home/example/public_html')
  .php('/run/php/php8.3-fpm.sock')
  .ssl('/etc/ssl/example.com/fullchain.pem', '/etc/ssl/example.com/privkey.pem')
  .render();

const check = await Health.http('https://example.com');
console.log(Util.formatBytes(1572864)); // '1.5 MB'
```

Every module is also available as a subpath import, so you only load what you use:

```js
import { Dns } from '@hostfog/toolkit/dns';
import { normalize, isValid } from '@hostfog/toolkit/domain';
import { Ssl, CertificateInfo, parsePem, certificate } from '@hostfog/toolkit/ssl';
import { NginxConfig } from '@hostfog/toolkit/nginx';
import { Health, http, port } from '@hostfog/toolkit/health';
import { Util, formatBytes, generatePassword } from '@hostfog/toolkit/util';
import { ToolkitError, InvalidDomain, DnsError, SslError, ConfigError } from '@hostfog/toolkit/errors';
```

## Usage

### Domain

#### `Domain.normalize(input)`

Trims and lowercases the input, strips the scheme, userinfo, port, path, query, fragment and trailing dot, then converts IDNs to punycode. Throws `InvalidDomain` if the result isn't a valid domain.

```js
import { Domain } from '@hostfog/toolkit';

Domain.normalize('  HTTPS://user@Example.COM:8443/path?q=1#top  '); // 'example.com'
Domain.normalize('www.example.com.');                                // 'www.example.com'
Domain.normalize('bücher.de');                                       // 'xn--bcher-kva.de'
Domain.normalize('localhost');                                       // throws InvalidDomain
```

#### `Domain.isValid(input)`

Returns `true` or `false` without stripping schemes or paths. Lowercasing and IDN conversion still apply. The rules are: 253 characters or fewer in total, at least 2 labels, each label 1–63 characters of `[a-z0-9-]` that doesn't start or end with `-`, and a TLD that isn't all digits.

```js
Domain.isValid('sub.example.co.uk');   // true
Domain.isValid('xn--bcher-kva.de');    // true
Domain.isValid('Bücher.de');           // true
Domain.isValid('https://example.com'); // false (no normalising)
Domain.isValid('-bad.example.com');    // false
Domain.isValid('192.168.0.1');         // false (numeric TLD)
```

### DNS (DNS-over-HTTPS)

Lookups go through the Cloudflare or Google JSON API, so the results are the same on every machine. Supported types: `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `CAA`.

#### `new Dns({ resolver?, transport? })`

```js
import { Dns } from '@hostfog/toolkit';

const dns = new Dns();                                         // Cloudflare (default)
const google = new Dns({ resolver: 'google' });
const custom = new Dns({ resolver: 'https://doh.example.net/resolve' });

// Inject a transport for tests: (url, headers) => { status, body }
const offline = new Dns({
  transport: async (url, headers) => ({ status: 200, body: '{"Status":3}' }),
});
```

#### `dns.lookup(domain, type = 'A')`

The domain goes through `Domain.normalize` first. NXDOMAIN and empty answers return `[]`. CNAME chain entries are skipped when you ask for another type.

```js
const mx = await dns.lookup('example.com', 'MX');
// [
//   { type: 'MX', name: 'example.com', value: 'mail.example.com', ttl: 300, priority: 10 },
//   { type: 'MX', name: 'example.com', value: 'backup-mail.example.com', ttl: 300, priority: 20 },
// ]

const txt = await dns.lookup('example.com', 'TXT');
// [{ type: 'TXT', name: 'example.com', value: 'v=spf1 include:_spf.hostfog.io -all', ttl: 3600, priority: null }]

const caa = await dns.lookup('example.com', 'CAA');
// [{ type: 'CAA', ..., value: '0 issue "letsencrypt.org"', priority: null }]
```

#### `dns.pointsTo(domain, ip)`

Looks up A records when `ip` contains a `.`, otherwise AAAA.

```js
await dns.pointsTo('example.com', '93.184.216.34');   // true
await dns.pointsTo('example.com', '2606:2800:220:1::'); // AAAA lookup
```

#### `dns.propagation(domain, type = 'A')`

Queries both Cloudflare and Google and compares the sorted values.

```js
const { results, consistent } = await dns.propagation('example.com', 'A');
// results: { cloudflare: ['93.184.216.34'], google: ['93.184.216.34'] }
// consistent: true
```

### SSL

#### `Ssl.certificate(host, port = 443, timeout = 10000, caFile?, options?)`

Connects over TLS with SNI set to `host` and certificate verification on. Throws `SslError` if the connection or handshake fails or the certificate isn't trusted.

```js
import { Ssl } from '@hostfog/toolkit';

const cert = await Ssl.certificate('hostfog.com');
// CertificateInfo {
//   subject: 'hostfog.com',
//   issuer: 'R11',
//   sans: ['hostfog.com', 'www.hostfog.com'],
//   validFrom: '2026-09-01T00:00:00Z',
//   validTo: '2026-11-30T23:59:59Z',
//   daysLeft: 45,
//   expired: false,
//   serialNumber: '1A2B3C4D'
// }

// Trust a private CA instead of the system store:
await Ssl.certificate('internal.example.com', 8443, 5000, '/etc/ssl/my-ca.pem');

// Check a server before DNS points at it. SNI and verification still use the first argument:
await Ssl.certificate('example.com', 443, 10000, undefined, { connectHost: '203.0.113.10' });
```

The `options.connectHost` option is a JavaScript extra. It sets the address to connect to while keeping `host` for SNI and verification, which helps with pre-DNS checks and local tests.

#### `Ssl.parsePem(pem)`

Parses a PEM certificate offline (using `crypto.X509Certificate`) into the same `CertificateInfo`. You can pass a string or a `Buffer`.

```js
import { readFileSync } from 'node:fs';

const info = Ssl.parsePem(readFileSync('/etc/ssl/example.com/fullchain.pem', 'utf8'));
console.log(info.subject, info.validTo, info.serialNumber);
```

#### `CertificateInfo.coversHost(host)`

Matches the host against the SANs, with wildcard support. `*.example.com` matches `a.example.com`, but not `example.com` or `a.b.example.com`.

```js
info.coversHost('test.hostfog.dev'); // true
info.coversHost('a.hostfog.dev');    // true  (*.hostfog.dev)
info.coversHost('hostfog.dev');      // false
info.coversHost('a.b.hostfog.dev');  // false
```

#### `CertificateInfo.expiresWithin(days)`

```js
if (info.expiresWithin(14)) console.warn(`Renew: ${info.daysLeft} days left`);
```

### Nginx config builder

#### `new NginxConfig()`

Every setter returns the builder: `serverNames(...names)`, `root(path)`, `index(...files)`, `php(socket)`, `proxyPass(url)`, `ssl(certPath, keyPath)`, `redirectHttps(bool = true)`, `gzip(bool = true)` and `clientMaxBodySize(size)`. `render()` returns the config string.

PHP site with HTTPS (by default plain HTTP gets a separate redirect block):

```js
import { NginxConfig } from '@hostfog/toolkit';

const conf = new NginxConfig()
  .serverNames('Example.com', 'www.example.com')
  .root('/home/example/public_html')
  .php('/run/php/php8.3-fpm.sock')
  .ssl('/etc/ssl/example.com/fullchain.pem', '/etc/ssl/example.com/privkey.pem')
  .gzip()
  .clientMaxBodySize('64M')
  .render();
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    root /home/example/public_html;
    index index.php index.html;

    ssl_certificate /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 64M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }
}
```

Static site over plain HTTP, with a custom index:

```js
new NginxConfig()
  .serverNames('static.example.com')
  .root('/var/www/static')
  .index('index.html')
  .render();
```

Reverse proxy for a Node or Python app, serving HTTP and HTTPS from one block with no redirect:

```js
new NginxConfig()
  .serverNames('app.example.com')
  .proxyPass('http://127.0.0.1:3000')
  .ssl('/etc/ssl/app/fullchain.pem', '/etc/ssl/app/privkey.pem')
  .redirectHttps(false)
  .render();
```

`render()` throws `ConfigError` in these cases:
- no server names are set
- neither `root` nor `proxyPass` is set
- `proxyPass` is combined with `root` or `php`
- any value contains `;`, `{`, `}` or a newline (this guards against injection)

### Health

#### `Health.http(url, timeout = 10000, transport?)`

Sends a single GET and doesn't follow redirects. A status from 200 to 399 counts as `ok`. Network errors never throw; they come back in the result.

```js
import { Health } from '@hostfog/toolkit';

await Health.http('https://hostfog.com');
// { url: 'https://hostfog.com', ok: true, status: 200, timeMs: 84, error: null }

await Health.http('http://127.0.0.1:9', 2000);
// { url: 'http://127.0.0.1:9', ok: false, status: null, timeMs: 1, error: 'connect ECONNREFUSED 127.0.0.1:9' }
```

#### `Health.port(host, port, timeout = 3000)`

```js
await Health.port('example.com', 443); // true
await Health.port('127.0.0.1', 9);     // false
```

### Util

#### `Util.formatBytes(bytes, decimals = 1)`

Uses base 1024 with the units `B`, `KB`, `MB`, `GB`, `TB` and `PB`, and removes trailing zeros. Negative input throws a `RangeError`.

```js
import { Util } from '@hostfog/toolkit';

Util.formatBytes(0);             // '0 B'
Util.formatBytes(1023);          // '1023 B'
Util.formatBytes(1024);          // '1 KB'
Util.formatBytes(1536);          // '1.5 KB'
Util.formatBytes(1073741824);    // '1 GB'
Util.formatBytes(1234567890, 2); // '1.15 GB'
```

#### `Util.generatePassword(length = 20, symbols = true)`

Uses a cryptographically secure RNG. The password always contains at least one uppercase letter, one lowercase letter and one digit, plus one of `!@#$%^&*-_=+` when symbols are on. A length under 8 throws a `RangeError`.

```js
Util.generatePassword();          // e.g. 'q7T!vZ2-mK9=xP4@bN8h'
Util.generatePassword(12, false); // e.g. 'h4Kp9TzQ2mWx'
```

## Error handling

Every error the toolkit throws on purpose extends `ToolkitError`:

| Error | Thrown by |
|---|---|
| `InvalidDomain` | `Domain.normalize`, `Dns` lookups, `NginxConfig.serverNames` |
| `DnsError` | unsupported record type, HTTP or JSON errors, resolver failure (e.g. SERVFAIL) |
| `SslError` | connection, handshake, trust or PEM parse failures |
| `ConfigError` | `NginxConfig.render()` validation |

Invalid arguments to `Util` throw a standard `RangeError`.

```js
import { Dns, ToolkitError, DnsError, InvalidDomain } from '@hostfog/toolkit';

try {
  await new Dns().lookup('broken.example.com', 'A');
} catch (error) {
  if (error instanceof InvalidDomain) console.error('Bad domain:', error.message);
  else if (error instanceof DnsError) console.error('DNS failed:', error.message);
  else if (error instanceof ToolkitError) console.error(error.name, error.message);
  else throw error;
}
```

## TypeScript

The package ships hand-written `.d.ts` declarations for the root export and every subpath, so you don't need an `@types` package. The useful types include `DnsRecord`, `RecordType`, `HttpCheckResult` and `CertificateInfo`:

```ts
import { Dns, type DnsRecord } from '@hostfog/toolkit';

const records: DnsRecord[] = await new Dns().lookup('example.com', 'MX');
```

## Requirements

- Node.js 18 or newer
- ESM only (`import`, not `require`)
- No runtime dependencies

## Other languages

| | Toolkit | API client |
|---|---|---|
| PHP | [hostfog/toolkit-php](https://github.com/hostfog/toolkit-php) | [hostfog/hostfog-php](https://github.com/hostfog/hostfog-php) |
| JavaScript | **this package** | [hostfog/hostfog-js](https://github.com/hostfog/hostfog-js) |
| Python | [hostfog/toolkit-python](https://github.com/hostfog/toolkit-python) | [hostfog/hostfog-python](https://github.com/hostfog/hostfog-python) |

All three toolkits follow the same specification and pass the same fixtures, so they behave the same.

## Development

```bash
npm install
npm test          # node --test
npm run typecheck # tsc --noEmit against the .d.ts files
```

## Licence

[MIT](LICENSE) © 2026 HostFog
