/**
 * The Mapbox token for the hero map.
 *
 * It is a public, URL-restricted browser token, the same one the listing pages
 * carry, but GitHub's push protection reads any Mapbox token in a commit as a
 * secret. So it lives in Vercel's environment (MAPBOX_TOKEN) and the page asks
 * for it here.
 */
export default function handler(req, res) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: "Map not configured." });
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ token });
}
