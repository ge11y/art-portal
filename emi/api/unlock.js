import { timingSafeEqual } from 'node:crypto';

/* The studio's colour controls are for holders. The password lives in an
   environment variable so it never ships to the browser, and OgBe can change
   it without anyone touching the code:

     vercel env add EMI_PASSWORD production   (then redeploy)

   This is a doorman, not a lock. The artwork itself is public on IPFS, so
   anyone determined enough can recolour a piece on their own machine. What
   this does is keep the studio a holders' room and make the password
   something you get by being in the chat. */

const FAIL_DELAY_MS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function matches(given, expected) {
  const a = Buffer.from(String(given), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  // Still do the comparison either way to avoid leaking length by timing.
  const same = a.length === b.length;
  const left = same ? a : b;
  return timingSafeEqual(left, b) && same;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }

  const expected = process.env.EMI_PASSWORD;
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'The studio is not set up yet. Ask OgBe to set the password.',
    });
  }

  let given = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    given = (body && body.password) || '';
  } catch {
    given = '';
  }

  if (!given || !matches(given.trim(), expected.trim())) {
    await sleep(FAIL_DELAY_MS);
    return res.status(401).json({ ok: false, error: "That's not it. Ask in the chat." });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}
