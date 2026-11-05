---
name: frontend
description: Use when the user says "use frontend skills" or "design skills", and before building or changing screens, components, sheets, motion, theme tokens, or anything in apps/mobile/app, apps/mobile/src/ui, apps/mobile/src/features or docs/design.
---

# Frontend

Grocer's UI is an Expo / React Native app, Hebrew-first (RTL), light-only, styled from `docs/design/tokens.json` through `useTheme()`.
This skill is the **router** for every design skill installed: run the stages in order and load each skill named with the Skill tool.
A skill missing from your skill list may still be on disk: read `~/.agents/skills/<name>/SKILL.md` directly (`awesome-design-md` lives only there).

## 1. Ground

Read `docs/design/DESIGN.md`, `apps/mobile/PRODUCT.md` and the UI kit in `apps/mobile/src/ui/` before you propose anything.
Done when you can name the tokens, components and existing screen patterns the change will reuse.

## 2. Direct

Load all four, every time:

- `impeccable`: the lead skill. Shape, critique, polish and harden through it, and let it own DESIGN.md.
- `frontend-design`: aesthetic direction and typography.
- `emil-design-eng`: Emil Kowalski's polish and component craft.
- `awesome-design-md`: brand-inspired references when choosing or adapting a direction.

Pull in the taste skills that fit the brief and say which ones you used: `design-taste-frontend`, `high-end-visual-design`, `apple-design`, `minimalist-ui`, `redesign-existing-projects` (reshaping an existing screen), `stitch-design-taste`.
For new UI, draw 2-3 distinct directions in Figma (file key in memory `figma-grocer-assets`) with trade-offs in captions, and recommend one.
`imagegen-frontend-mobile` makes concept images. `prototype` puts directions behind a live picker.
Done when the user has picked a direction.

## 3. Build

Follow the Mobile conventions in `AGENTS.md`. For motion:

- `animate-expo`: every animation, gesture, sheet, transition and haptic (Reanimated 4, Gesture Handler 3, `springs`, `useReducedMotion()`).
- `animation-vocabulary`: when the user describes motion loosely.
- `find-animation-opportunities` and `remove-animations`: when the task touches a whole screen's motion.

Web-only skills (`animate`, `animation-performance`, `gpt-taste`, `image-to-code`, `imagegen-frontend-web`, `industrial-brutalist-ui`, `vercel-react-best-practices`, `ask-sonner`) apply only to web surfaces such as `apps/api/src/deletion/`.

## 4. Check

- `break-ui`: worst-case data, including long Hebrew strings and RTL.
- `review-animations`: any motion you added.
- `accessibility-check`: every touchable, label and contrast change.
- `impeccable` finish review against the picked direction.

Done when each check has run and its findings are fixed or reported to the user.
