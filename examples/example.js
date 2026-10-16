// Run with: node examples/example.js [domain]
// Uses the network for the DNS, SSL and health checks.
import {
  Dns,
  Domain,
  Health,
  NginxConfig,
  Ssl,
  ToolkitError,
  Util,
} from '@hostfog/toolkit';

const domain = Domain.normalize(process.argv[2] ?? 'https://HostFog.com/pricing');
console.log(`Domain:      ${domain}`);

try {
  const dns = new Dns();
  const a = await dns.lookup(domain, 'A');
  console.log(`A records:   ${a.map((r) => r.value).join(', ') || '(none)'}`);

  const { consistent } = await dns.propagation(domain);
  console.log(`Propagated:  ${consistent ? 'yes' : 'not yet'}`);

  const cert = await Ssl.certificate(domain);
  console.log(`SSL issuer:  ${cert.issuer}, expires ${cert.validTo} (${cert.daysLeft} days)`);
  if (cert.expiresWithin(14)) console.log('             Renew soon!');

  const health = await Health.http(`https://${domain}`);
  console.log(`HTTP check:  ${health.status ?? health.error} in ${health.timeMs} ms`);
  console.log(`Port 443:    ${(await Health.port(domain, 443)) ? 'open' : 'closed'}`);
} catch (error) {
  if (!(error instanceof ToolkitError)) throw error;
  console.error(`${error.name}: ${error.message}`);
}

console.log(`\nDisk used:   ${Util.formatBytes(1_234_567_890, 2)}`);
console.log(`DB password: ${Util.generatePassword(24)}\n`);

console.log(
  new NginxConfig()
    .serverNames(domain, `www.${domain}`)
    .root(`/home/${domain}/public_html`)
    .php('/run/php/php8.3-fpm.sock')
    .ssl(`/etc/ssl/${domain}/fullchain.pem`, `/etc/ssl/${domain}/privkey.pem`)
    .gzip()
    .render(),
);
