# Dude Companion

Dude Companion is an original, physics-driven macOS desktop companion. Choose Dude, Dudette, or both; drag and throw them with momentum; chat through a compact right-click panel; set reminders; view lightweight system status; change outfits; and approve computer actions one at a time.

Version 0.2 replaces the original CSS puppet with a deterministic articulated-body simulation:

- 14 constrained joints per character: head, torso, shoulders, elbows, wrists/hands, hips, knees, and ankles/feet.
- A fixed 120 Hz physics step with gravity, friction, restitution, angular inertia, joint limits, spring damping, ground/edge impacts, and pointer-history throw velocity.
- Alternating planted and swing feet, direction-aware body yaw, impact transfer through the whole rig, landing compression, tumbling, lying down, and physical recovery.
- A joined, procedural Three.js character with continuous 360° yaw, connected coat volume, buried rig pivots, authored cross-legged sitting, and arbitrary in-between viewing angles.
- Independent bodies when both companions are enabled.
- Raised support physics for active-window tops and the dock, plus distinct wall-climbing, ceiling-crawling, hanging, and ledge-walking motion.
- Exactly 50 harmless local behavior variations spanning locomotion, rest, partner routines, props, and recovery drills. Computer actions never run autonomously.

Website: [dude-companion-mac.tinkerhub12.chatgpt.site](https://dude-companion-mac.tinkerhub12.chatgpt.site)

## Install

Download the latest DMG from Releases, or use the one-command installer on the official landing page. The installer detects Apple silicon (`arm64`) or Intel (`x86_64`), verifies the matching SHA-256 digest, copies the app to `/Applications`, and launches it.

## Interactions

- Drag and release: swing or throw with measured pointer momentum.
- Right-click: open chat, quick movement actions, system status, and quiet mode.
- Double-click: choose Dude, Dudette, or both; select one of six colorways; tune motion; manage startup and permissions.
- Space while focused: jump. Enter while focused: open chat.
- Chat examples: `sit`, `wave`, `climb`, `ceiling crawl`, `ledge`, `hang`, `perch`, `remind me in 20m to stretch`, or `show me the skateboard`.

Sitting uses a coherent cross-legged pose. Walking holds a readable three-quarter travel angle instead of moonwalking. Gentle placements snap to detected window or dock surfaces; fast releases retain throw momentum. Window geometry is read only when Accessibility has already been granted, so autonomy never triggers a permission prompt.

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

Searches and links open in the default browser. Opening or closing apps, typing, clicking, downloading, and changing wallpaper are permission-gated. Typing, clicking, and active-window geometry require macOS Accessibility permission. Every computer action is described first and supports Cancel, Allow once, or Always allow. Saved permissions can be revoked in Personalization.

The Electron renderer is sandboxed, context-isolated, protected by a self-only Content Security Policy, blocked from navigation/popups, and accepted by IPC only from the packaged local page. Settings, reminders, coordinates, URLs, app names, wallpaper paths, and AI decisions are validated in the main process.

## Verification

```bash
npm test             # unit, constraint, deterministic and 10-minute simulation tests
npm run test:runtime # seven macOS Electron scenes: walk, impact, wardrobe, sit, recovery, surfaces, continuous turn
npm run verify       # both suites
```

The v0.2 release matrix covers 18 source/simulation checks plus seven real Electron scenes. It verifies all 14 joints, the 50-behavior catalog, independent actors, frame-rate consistency, planted feet, continuous yaw, cross-legged sitting, hand-braced recovery without spin, raised supports, wall/ceiling motion, hip-pivot occlusion, full-body wardrobe blur, CSP, and transparent-window rendering. See [QUALITY_AUDIT.md](QUALITY_AUDIT.md).

## Current release boundary

- macOS Apple silicon and Intel DMGs/ZIPs are packaged and structurally verified; v0.2 is installed and running on the development Apple-silicon Mac.
- Bundles are ad-hoc signed with the hardened runtime because no Apple Developer ID credentials are present in this build environment.
- Public distribution should be Developer ID signed and notarized before being described as Gatekeeper-clean.

## License

MIT. Character artwork is original to this project and distributed with the app.
