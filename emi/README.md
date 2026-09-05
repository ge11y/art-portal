# EMI by OgBe — emi.ogbe.art

Static site for the EMI collection: 222 hand-drawn 1/1s, minted out on Robinhood Chain on
3 September 2026. Plain HTML, CSS and one JS file. No build step, no framework.

- Vercel project `emi-ogbe` (team ge11ys-projects), root = this folder.
- Deploy: `cd ~/art-portal/emi && npx vercel deploy --prod --yes`
- The parent site (ogbe.art) is the repo root and deploys separately as project `art-portal`.

## The studio

Type a number from 1 to 222 and the piece loads. No wallet, nothing to connect — every image
and its metadata are public, so a number is all it takes. You can put any piece on either
ground and download the result as a PNG.

### How the background swap works

Each piece is a duotone: one ground colour, and marks sitting on it. OgBe drew the black
pieces with **white** marks and the green pieces with **black** marks, so swapping the ground
has to carry the marks across too:

| Direction | Ground | Marks |
| --- | --- | --- |
| green → black | `#ccff01` → `#060303` | black → white |
| black → green | `#060303` → `#ccff01` | white → black |

Both halves matter. Keeping the ink black on a black ground erases whole figures — 8 of the
59 green pieces have more ink than white, and two (#7 and #64) have no white at all, so they
would come out as a solid black square. Putting white marks on green washes them out to
almost no contrast. `markWeight()` in `js/studio.js` measures how much of each pixel is
figure rather than ground, anti-aliasing included, then re-lays that figure in the target
pair. That keeps the edges clean instead of leaving a fringe of the old colour.

## Layout

```
art/<n>.png      222 pieces, 1400px, ~85 KB each (19 MB total)
data/emi.json    which tokens are green, which are black
js/studio.js     the studio: loading, recolour, download, owner lookup
css/emi.css      styles
```

Images are mirrored into the repo on purpose. Public IPFS gateways rate-limited and dropped
requests repeatedly while building this, so the site must not depend on one at page load.

## Re-mirroring the art

Originals live on IPFS at `QmbbpCX4AbrdcEZnknjSAnbro4UnSjzgiN6DWTwyozapAq/<n>` (3000px).
Metadata is at `QmTpjFkWztf5NJVvd8s3FYZ9YAChr3wvL5DmsgDk4uahbD/<n>`. Fetch with fallback
across several gateways and no more than about four at a time; a single gateway hammered in
parallel starts refusing connections. Then resize to 1400px and regenerate `data/emi.json`.

## Verified on-chain

| | |
| --- | --- |
| Contract | `0x9a08c037e631e901ed205a26e7632148f48e3d9c` |
| Chain | Robinhood Chain, ID 4663 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` (CORS open, so the browser reads the owner directly) |
| Supply | 222, token IDs 1–222 |
| Split | 59 green, 163 black |

The green is `#ccff01`, sampled from the artwork itself. Do not drift back to `#ccff02`.

## Not built yet

Animation. See the build plan for the two options: coded motion (free, instant, works on all
222) and pre-rendered AI clips (about 7.5 credits each on Kling v3, so roughly 1,665 credits
for the collection). Generating on demand was rejected — it needs a server holding the key
and costs money on every click.
