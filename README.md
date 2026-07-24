# Dude Companion

Dude Companion is an original, physics-driven macOS desktop companion. Choose Dude, Dudette, or both; drag and throw them with momentum; chat through a compact right-click panel; set reminders; view lightweight system status; change outfits; and approve computer actions one at a time.

Website: [dude-companion-mac.tinkerhub12.chatgpt.site](https://dude-companion-mac.tinkerhub12.chatgpt.site)

## Install

Download the latest DMG from Releases, or use the one-command installer on the official landing page.

## Run from source

Requires Node.js 22 or later on macOS.

```bash
npm install
npm start
```

## Optional AI planner

The app has a local personality planner by default. To connect any OpenAI-compatible chat-completions endpoint, set these variables before launching:

```bash
export DUDE_AI_BASE_URL="https://provider.example/v1"
export DUDE_AI_MODEL="model-name"
export DUDE_AI_KEY="your-new-private-key"
npm start
```

Never commit API keys. Keys pasted into chats or screenshots should be rotated.

## Permissions

Searches and links open in the default browser. Typing and clicking require macOS Accessibility permission. Every computer action is described first and supports Cancel, Allow once, or Always allow. Saved permissions can be revoked in Personalization.

## Current release boundary

- macOS Apple silicon is packaged and locally verified.
- The DMG is ad-hoc signed because no Apple Developer ID credentials are present in this build environment.
- Public distribution should be Developer ID signed and notarized before being described as Gatekeeper-clean.

## License

MIT. Character artwork is original to this project and distributed with the app.
