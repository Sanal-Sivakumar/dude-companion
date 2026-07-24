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

Use a fixed 120 Hz articulated-body simulation with visible acceleration, landing compression, counter-rotating head/torso, shoulder and elbow lag, wrist follow-through, hip/knee gait, ankle compensation, and alternating planted feet. Each actor has 14 limited spring-damper joints. Root movement uses gravity, collision restitution, ground friction, angular inertia, and pointer-history release velocity.

Walking faces travel at a readable three-quarter yaw. The renderer preserves the original high-detail painted character across front, side, rear, and seated anchors, then adds perspective compression and restrained articulated motion between them. Only one painted body is visible per frame, preventing doubled eyes, belts, or torso fragments. Internal shoulder and hip controls remain buried inside the hood, sleeves, torso, and continuous coat hem. Sitting, reading, working, and napping use coherent full-body cross-legged poses.

Raised surfaces are real physics supports rather than visual offsets. With already-granted Accessibility access, the active window top becomes a bounded ledge; otherwise the work-area edge provides an honest dock fallback. Wall climbing and ceiling crawling have separate root constraints and alternating limb poses. Recovery plants the near hand, tucks the opposite knee, freezes angular spin, and presses upright.

Normal UI transitions run 150–220 ms. Reduced motion caps throw speed, absorbs impacts, removes ambient glow, increases damping, and reduces autonomous movement while preserving clear state changes. Wardrobe motion removes and replaces painted garment regions behind a small, localized privacy blur; the underlying form remains neutral and anatomy-free.

## Layout

The companion occupies the desktop overlay without visible window chrome. Panels attach near the character and flip horizontally or vertically to remain within the current display work area. Touch targets are at least 36px; primary controls are at least 44px.

## Voice

Short, dry, useful. Never shame the user for screen time or system load. Avoid frequent unsolicited lines and never simulate urgency for engagement.
