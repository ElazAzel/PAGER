# PAGER design direction

PAGER is a mobile-first product for an independent consultant. The visitor
should feel that they have opened a calm, considered personal space; the
creator should feel that they are editing a small product, not filling in a
generic dashboard.

## Visual language

- **Mood:** warm paper, ink, one terracotta signal colour, quiet green for
  completed states.
- **Typography:** a practical sans for controls and reading, a restrained
  roman serif for names and major statements. No italic display headings.
- **Surfaces:** use tonal grouping before borders. A card earns its surface by
  carrying a different job: identity, conversation, offer, proof or detail.
- **Shape:** generous but deliberate radii. Avoid a page made from identical
  white rounded rectangles.
- **Composition:** the first screen has one clear next action. Content blocks
  may vary in density, width and surface, while the spacing rhythm remains
  predictable.
- **Motion:** short state transitions by default. Author-selected entrances and
  hover effects are optional, finite and restrained. Reduced motion always wins.

## Mobile product rules

- The 320–414px range is the primary canvas; desktop is an adaptation.
- Bottom navigation owns global movement. Contextual sheets own editing and
  temporary decisions.
- Interactive targets are at least 44px. Focus-visible states remain visible.
- The public page is edge-to-edge on a phone and does not pretend to be a
  phone mockup inside a browser.
- The editor keeps the page preview in view and moves properties into a
  bottom sheet. Do not make the user manage a desktop sidebar on a phone.
- Use one primary CTA per screen and write it as a concrete action.

## Anti-slop guardrails

- No default blue SaaS palette, glow-heavy gradients, decorative blobs or
  invented product metrics.
- No hero → three cards → CTA template for every surface.
- No repeated icon-in-a-coloured-square treatment when typography or spacing
  can carry the hierarchy.
- No fake browser chrome or fake device frames in production UI.
- Empty states explain the next useful action in the user's language.
- Russian and English copy should sound like a person who does the work,
  rather than a feature catalogue.

## Author appearance extension — 2026-09-03

The user requested flexible visual customization and animation. Keep Paper as
the default; offer Studio, Sage, Midnight and Rose as creator-selected variants.
Use the same validated tokens for the editor preview and published page. Personal
light/dark/system settings affect the PAGER shell only. Keep type readable,
surfaces calm and motion subordinate to booking and purchase. See
[the appearance guide](docs/APPEARANCE.md) for controls and verification gates.

## Reference sources

The implementation uses the installed frontend-design and Hallmark guidance,
Open Design's `apple-hig`, `ui-skills`, `web-design-guidelines` and
`design-review` references, with `webapp-testing` as the browser verification
path. Humanizer and humanizer-ru are manual copy review steps. None of these
materials are shipped as application runtime dependencies.
