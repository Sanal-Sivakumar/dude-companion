# Design System

## Theme

A tiny stage-light character against the real desktop: mostly transparent, with compact near-black controls and a sun-cured olive signal color. The companion is visually expressive; the interface remains restrained and familiar.

## Color Palette

- Background: `oklch(0.10 0 0 / 0.94)`
- Surface: `oklch(0.17 0.01 110 / 0.96)`
- Elevated surface: `oklch(0.23 0.015 110 / 0.98)`
- Ink: `oklch(0.96 0 0)`
- Muted ink: `oklch(0.74 0.012 110)`
- Primary olive: `oklch(0.56 0.12 110)`
- Accent coral: `oklch(0.68 0.17 32)`
- Success: `oklch(0.72 0.15 145)`
- Warning: `oklch(0.78 0.15 80)`
- Danger: `oklch(0.65 0.20 25)`

## Typography

Use the macOS system family (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, sans-serif). Interface labels are compact and direct. Character speech may use slightly heavier weight but never novelty fonts.

## Components

- Companion overlay: transparent full-screen stage with hit testing only around interactive content.
- Speech bubble: compact, dismissible, and never blocks the current pointer target.
- Context dock: right-click surface for chat, jump, sit, wardrobe, reminders, and quiet mode.
- Personalization panel: double-click surface with character, outfit, voice frequency, motion intensity, and permissions.
- Permission sheet: one requested action, a plain-language explanation, Allow once / Always allow / Cancel.
- System status: CPU and memory shown only on demand or when a user-set threshold is crossed.

## Motion

Use spring-damped movement with visible acceleration, landing compression, arm lag, and leg planting. Normal UI transitions run 150–220 ms. Reduced motion removes swing, idle hops, and walk bob while preserving clear state changes.

## Layout

The companion occupies the desktop overlay without visible window chrome. Panels attach near the character and flip horizontally or vertically to remain within the current display work area. Touch targets are at least 36px; primary controls are at least 44px.

## Voice

Short, dry, useful. Never shame the user for screen time or system load. Avoid frequent unsolicited lines and never simulate urgency for engagement.
