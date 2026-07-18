# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a suspected vulnerability, exposed
secret, or provider-account risk. Contact the repository owner privately via
their [GitHub profile](https://github.com/wizkidword) with:

- a concise description of the impact;
- reproducible steps or a minimal proof of concept;
- affected version or commit, if known; and
- any suggested mitigation.

Please redact tokens, passwords, session files, email content, and personal
data. A report will be acknowledged, assessed, and handled privately before a
public disclosure or fix note is published.

## Supported surface

Security fixes are prioritized on the current `main` branch. Historical
release notes and retired experiments may not receive standalone patches.

## Security design notes

PA Nostromo is local-first by default. It binds to loopback unless deliberately
configured otherwise, keeps runtime storage outside source control, and uses
explicit route controls for remote access. Review the
[route manifest](docs/route-manifest.md) and
[outbound network inventory](docs/outbound-network-inventory.md) before
changing network exposure or integration behavior.
