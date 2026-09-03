# EMI by OgBe — emi.ogbe.art

Static site for the EMI collection (222 hand-drawn 1/1s on Robinhood). Plain HTML + CSS, no build.

- Vercel project: `emi-ogbe` (team ge11ys-projects), root = this folder. Domain: emi.ogbe.art.
- Deploy: `cd ~/art-portal/emi && npx vercel deploy --prod --yes`
- The parent site (ogbe.art) is the repo root and deploys separately as project `art-portal`.

## After the reveal

1. In `index.html`, set `var REVEALED = true;` — the "Reveal tonight" copy switches over.
2. Fill `data/pieces.json` with token number → image URL, e.g.
   `{ "1": "https://.../1.png", "2": "https://.../2.png" }`.
   Any number without an entry keeps its numbered tile. Tiles link to
   `https://opensea.io/item/robinhood/0x9a08c037e631e901ed205a26e7632148f48e3d9c/<n>`.
3. Deploy.

## Facts baked into the copy (verified 2026-09-03 from OpenSea + the drop post)

- 222 / 222 minted, token IDs 1–222, contract `0x9a08c037e631e901ed205a26e7632148f48e3d9c` on Robinhood Chain.
- Stages (all Sept 3, EDT): Team 12:18 free · GTD 12:32 · WL 12:57 · Public 1:37 · minted out the same afternoon.
- Mint price .00333 ETH (the artist's figure; OpenSea showed $8.37 at the time).
- Drop post: https://x.com/_0gbe/status/2094408719245209965
- Collection: https://opensea.io/collection/emi-by-ogbe
