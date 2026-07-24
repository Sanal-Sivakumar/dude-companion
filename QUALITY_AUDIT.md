# Dude Companion v0.2 — 50-point quality audit

This checklist turns the comparison audit into shipped, testable behavior. The reference products reward visible variety, direct manipulation, surface-aware movement, props, customization, and restraint; Dude keeps those strengths while preserving explicit permission boundaries.

1. Use one connected 3D body instead of sliced body images — implemented in `character-3d.js`.
2. Keep internal hip pivots invisible — implemented and runtime-asserted.
3. Overlap torso and pelvis with a continuous coat hem — implemented and runtime-asserted.
4. Articulate all 14 named joints — implemented and unit/runtime-tested.
5. Give each joint physical limits — implemented and tested for ten simulated minutes.
6. Use spring-damper joint response — implemented at a fixed simulation rate.
7. Transfer acceleration into limb lag — implemented for arms, wrists, and the body.
8. Alternate planted and swing feet — implemented and unit-tested.
9. Solve legs toward actual foot targets — implemented with two-segment leg solving.
10. Lift only the swing foot — implemented and unit-tested.
11. Turn toward travel without moonwalking — implemented.
12. Preserve a readable three-quarter angle while walking — implemented.
13. Interpolate yaw continuously rather than snap among four sprites — implemented and runtime-tested.
14. Render arbitrary front, side, rear, and in-between angles — implemented in Three.js.
15. Use gravity and restitution for throws — implemented.
16. Derive throw velocity from recent pointer history — implemented and unit-tested.
17. Cap pathological throw speeds — implemented.
18. Transfer hard impacts across the whole joint chain — implemented and runtime-tested.
19. Compress the body on landing — implemented.
20. Tumble only after genuinely hard impacts — implemented.
21. Let the companion rest after a fall — implemented.
22. Replace spinning recovery with a planted-hand press — implemented and unit/runtime-tested.
23. Freeze angular velocity during recovery — implemented and unit-tested.
24. Tuck the opposite knee under the body while rising — implemented and unit-tested.
25. Remove the visible drag tether — implemented.
26. Snap only gentle placements to surfaces — implemented using pointer speed.
27. Preserve high-momentum releases as real throws — implemented.
28. Hold a companion on a raised support after release — implemented and unit-tested.
29. Constrain ledge walking to the support bounds — implemented and unit-tested.
30. Detect the active macOS window top with already-granted Accessibility access — implemented without autonomous permission prompts.
31. Fall back honestly to the dock/work-area edge when window geometry is unavailable — implemented.
32. Perch on window or dock edges — implemented.
33. Walk along a detected window top — implemented.
34. Climb the left wall with alternating hands and knees — implemented and runtime-tested.
35. Climb the right wall independently — implemented and runtime-tested.
36. Crawl upside down across the ceiling — implemented and runtime-tested.
37. Hang from the ceiling as a separate pose — implemented.
38. Sit with an authored cross-legged full-body pose — implemented and runtime-tested.
39. Provide reading, working, napping, dancing, sneaking, balancing, pondering, greeting, and celebrating poses — implemented.
40. Give both companions independent bodies and decision state — implemented and tested.
41. Supply exactly 50 safe autonomous behavior variations — implemented and unit-tested.
42. Keep autonomous behavior physical and harmless — implemented; OS actions are excluded from the catalog.
43. Pause autonomy after user interaction — implemented.
44. Nap instead of adding load when CPU usage is high — implemented.
45. Keep speech rare, dismissible, and suppressible — implemented with Quiet mode.
46. Use a large privacy blur during clothing changes — implemented and runtime-tested.
47. Animate old garments out and new garments in — implemented as layered 3D pieces.
48. Keep the privacy surface anatomy-free underneath — implemented with a neutral mannequin base.
49. Gate typing, clicking, downloads, apps, links, and wallpaper changes behind explicit consent — implemented in the main process.
50. Prove the result in the packaged runtime, not only in source tests — implemented through seven macOS Electron smoke scenes and retained screenshots/diagnostics.

Comparison references: [Desktop Mate](https://steamcommunity.com/app/3929250/), [VPet](https://store.steampowered.com/app/1920960/VPet/), [Pets Therapy](https://apps.apple.com/us/app/desktop-pets/id1575542220?platform=ipad), [DeskPet](https://www.deskpet.me/), and [Doja](https://www.doja.pet/).
