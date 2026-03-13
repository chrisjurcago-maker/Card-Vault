const CLIENT_ID     = process.env.EBAY_CLIENT_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, exact } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Missing query field' });
  }

  // Get OAuth token
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return res.status(502).json({ error: 'Failed to get eBay token', details: err });
  }

  const { access_token } = await tokenRes.json();

  // Search Browse API — newest listings first
  // exact=true means the caller already built a precise query; don't append generic suffix
  const q = encodeURIComponent(exact ? query : `${query} card`);
  const searchRes = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&filter=buyingOptions%3A%7BFIXED_PRICE%7D&sort=newlyListed&limit=20`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.text();
    return res.status(502).json({ error: 'eBay search failed', details: err });
  }

  const data = await searchRes.json();
  const rawItems = data.itemSummaries || [];

  const items = rawItems.map((item) => {
    const title = item.title || '';
    const numberMatch = title.match(/#\s*(\w+)/);
    const setMatch = title.match(/\b(20\d{2}|19\d{2})\s+([A-Za-z][^#\d]*?)(?=\s+#|\s+\d|$)/);

    return {
      name: title,
      set: setMatch ? setMatch[0].trim() : '',
      number: numberMatch ? numberMatch[1] : '',
      image: item.image?.imageUrl || '',
      value: parseFloat(item.price?.value || 0),
      listedDate: item.itemCreationDate || null,
      url: item.itemWebUrl || null,
    };
  });

  return res.status(200).json({ items });
}
