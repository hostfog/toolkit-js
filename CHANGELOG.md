# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-16

### Added

- `Domain.normalize()` and `Domain.isValid()` with IDN (punycode) support.
- `Dns` DNS-over-HTTPS client (Cloudflare and Google) with `lookup()`, `pointsTo()` and `propagation()`.
- `Ssl.certificate()` for live TLS checks and `Ssl.parsePem()` for offline parsing, returning `CertificateInfo` with `coversHost()` and `expiresWithin()`.
- `NginxConfig` fluent builder for static, PHP-FPM and reverse-proxy sites, with HTTPS redirect, gzip and an injection guard.
- `Health.http()` and `Health.port()` uptime checks.
- `Util.formatBytes()` and `Util.generatePassword()`.
- Error hierarchy: `ToolkitError`, `InvalidDomain`, `DnsError`, `SslError`, `ConfigError`.
- Hand-written TypeScript declarations and subpath exports (`@hostfog/toolkit/dns` etc.).

[Unreleased]: https://github.com/hostfog/toolkit-js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hostfog/toolkit-js/releases/tag/v0.1.0
