# Security Policy

## Reporting a vulnerability

Do **not** open a public issue. Email **security@scrolloop.com** with:

- affected component and version / commit,
- reproduction steps or proof of concept,
- impact as you understand it.

We acknowledge within 2 business days, give an initial assessment within 5, and coordinate a
disclosure date with you once a fix is available. Please allow up to 90 days before public
disclosure.

## Scope

In scope: `apps/auth-service`, `apps/admin-portal`, `packages/*`, and the hosted service at
`*.sentry.scrolloop.com`. Out of scope: denial of service by volume, social engineering,
findings that require a compromised host or database.

## Supported versions

Pre-1.0: only the latest `main` receives security fixes.

The engineering security model is documented in [docs/security.md](docs/security.md).
