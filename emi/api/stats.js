/* Live market numbers for the tracker.

   OpenSea's stats endpoint answers without an API key, but only server-side:
   it returns 401 to anything carrying a browser Origin. So the page asks this
   function instead, and the CDN caches the answer for five minutes rather than
   every visitor hitting OpenSea.

   The sales-history endpoint does require a key, which is why there is no
   price-over-time chart yet. */

const SOURCE = 'https://api.opensea.io/api/v2/collections/emi-by-ogbe/stats';
const SUPPLY = 222;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Use GET.' });
  }

  try {
    const upstream = await fetch(SOURCE, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: 'Market data is unavailable right now.' });
    }
    const d = await upstream.json();
    const total = (d && d.total) || {};
    const byInterval = {};
    for (const i of (d && d.intervals) || []) byInterval[i.interval] = i;

    const floor = Number(total.floor_price) || 0;

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({
      ok: true,
      symbol: total.floor_price_symbol || 'ETH',
      floor,
      volume: Number(total.volume) || 0,
      sales: Number(total.sales) || 0,
      owners: Number(total.num_owners) || 0,
      supply: SUPPLY,
      // the usual floor-times-supply estimate, labelled as such on the page
      marketCap: floor * SUPPLY,
      day: byInterval.one_day || null,
      week: byInterval.seven_day || null,
      month: byInterval.thirty_day || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Market data is unavailable right now.' });
  }
}
