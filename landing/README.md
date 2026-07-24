# Dude Companion landing page

Public download page for [Dude Companion](https://dude-companion-mac.tinkerhub12.chatgpt.site), built with Next.js-compatible vinext and hosted through Sites.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

## Validation

```bash
npm test
```

The test command builds the production worker and verifies the rendered product page, metadata, character assets, and checksum-validating macOS installer.

## Distribution

`public/install.sh` detects Apple silicon or Intel, downloads the matching v0.2 DMG from the public GitHub release, validates its architecture-specific SHA-256 digest, installs the app in `/Applications`, and launches it.
