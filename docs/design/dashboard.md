# Internal dashboard design

The Internal dashboard (apps/dashboard) follows the Grocer design system (DESIGN.md, tokens.json) adapted to a desktop
web tool. Product truth: apps/dashboard/PRODUCT.md. The drawn pages are Direction A in Figma, file
`YncE254fQ7DyfktwvCsqR0`, page "Dashboard" (node `206:2`), section "Direction A · the dashboard pages". Read a frame
with the Figma MCP `get_screenshot` (fileKey above, nodeId below); its layer names say what each part is.

| Frame | Node | Page |
| --- | --- | --- |
| A1 · Price syncs | 215:92 | `/` home |
| A2 · Price sync run | 215:589 | `/syncs/:id` |
| A3 · Chains | 216:158 | `/chains` |
| A4 · Stores | 216:396 | `/stores` (table + map) |
| A5 · Store | 216:1063 | `/stores/:id` (published address, edit form) |
| A6 · Products | 216:1152 | `/products` (browse by Product type) |
| A7 · Product | 216:1353 | `/products/:code` |
| A7b · Product image | 222:408 | the upload dialog on `/products/:code` |
| A8 · Product groups | 216:1579 | `/groups` (list + open group) |
| A9 · New group | 216:1831 | `/groups/new` |
| A10 · Promotions | 221:354 | `/promotions` |
| A11 · Promotion | 221:615 | `/promotions/:id` |
| Dashboard components | 206:3 | badges, buttons, nav item, top bar |

## Shell

- Desktop only, 1440 wide drawn; content is one centered column, 1120 max (160 side padding at 1440), 32 top.
- Top bar (white, 57 tall, bottom hairline): "Grocer" bold + "Internal" secondary; nav items Price syncs, Chains,
  Stores, Products, Product groups, Promotions (current = Tint text, SemiBold, on Tint Wash, radius 8, 36 tall);
  a find field at the end (Control Fill, radius 10, 280 wide: "Find a store, Product or barcode").
- Page header: Large Title (34/41 bold) + one summary line (subhead, Secondary Label); a breadcrumb above the title on
  detail pages (Tint, medium); the page's one primary action at the end of the header.
- Ground Grouped Gray; content in white inset groups (radius 12), section header above a group (13px Secondary Label,
  a count at the end). No cards in cards, no shadows except the dialog.

## Tokens and type

Colors, spacing and radii come from docs/design/tokens.json (import it; no hex literals outside one tokens CSS file).
Type: the system font stack (`-apple-system, system-ui, "Segoe UI", sans-serif`; Heebo only stands in inside Figma),
sizes from the DESIGN.md scale: Large Title 34, Title 3 20, Headline 17 semibold, Subhead 15 (table cells, rows),
Footnote 13 (table headers, notes), Caption 12. Tabular figures for every number and price.

## State colours (dashboard only)

Green (`saving`) = ok, red (`danger`) = failed, amber (`warning`) = degraded or needs a look (Promotion failure,
interrupted, no location, address differs, no type yet). A tint (ultramarine) is only for what you can press.
Badges (pill, 13px semibold, 2/8 padding): ok = green text on green at 12%; failed = red on red at 10%; warning = amber
on amber at 12%; interrupted = amber text, amber outline; running = label text on Control Fill with a dot; finished =
label text, hairline outline (a run that finished with failures is never green); skipped = secondary on Control Fill;
requested = secondary, dashed outline; ignored = secondary, dotted outline.

## Components

- Buttons 36 tall, radius 10, 15px semibold: filled (Tint), tinted (Tint Wash + Tint text), disabled (Control Fill +
  Secondary Label, with the reason next to it), plain (Tint text). Destructive actions are plain red text.
- Tables: header row 13px medium Secondary Label; rows 15px, ~44 tall, hairline between rows; numbers end-aligned;
  the row's link in Tint. An error under its row in a footnote (red or amber).
- Filter chips (pill, 15px): selected = Tint Wash + Tint text; others white with a hairline; each shows its count.
- Selects and inputs: white, hairline border, radius 10, 36–38 tall, chevron-down in Tint; label above in 13px medium
  Secondary Label; an invalid input gets a red 1.5 border and its message under it.
- Product image slots: Control Fill at 55% when there is none.

## Copy

English, sentence case, CONTEXT.md terms (Price sync, Chain failure, Promotion failure, Product type, Product group,
Made group). Lead with the outcome, then the raw error ("Prices not updated" / "No Stores file among 0 listed files").
Buttons name their action ("Start a Manual sync", "Save changes", "Use the new image", "Create group").
