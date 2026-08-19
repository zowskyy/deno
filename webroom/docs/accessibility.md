# Accessibility

Webroom targets WCAG 2.2-minded behavior. Accessibility is a product feature, not a cleanup step.

## Reader Mode

Available on every public profile via the top bar (`?reader=1`). Strips theme colors, custom CSS, and decorative styling. Content stays readable regardless of the owner's theme choices.

## Keyboard

- All platform forms and Studio controls are native elements with labels
- Focus rings via `:focus-visible` in `globals.css`
- Module reorder in Studio uses up/down buttons (keyboard accessible)

## Motion

- Global `prefers-reduced-motion` baseline in `globals.css`
- Per-page `theme.reduceMotion` adds `.reduce-motion` class
- No autoplay audio — playlist is links only

## Contrast

Studio Access tab runs `getContrastWarnings()` — flags low accent/background contrast and missing gallery alt text.

## Landmarks

`PageRenderer` modules use semantic sections (`section`, `nav`, `article` on mini-pages). Top bar with Reader / Report / Block is always outside themed content and cannot be hidden by user CSS.

## Safety bar

Reader, Report, and Block links live in `.top-bar` — excluded from custom CSS selectors by `cssScope.ts`.
