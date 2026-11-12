/**
 * Hands the page the public Mapbox key for the "What's being built nearby" map.
 *
 * The key is a public (pk.) token, meant to be used in browsers, but GitHub
 * push protection blocks it from the repo, so it lives in Vercel as
 * MAPBOX_PUBLIC_TOKEN and the page asks for it here.
 */
export default function handler(req, res) {
  const token = (process.env.MAPBOX_PUBLIC_TOKEN || "").trim();
  if (!/^pk\./.test(token)) return res.status(503).json({ error: "No public Mapbox key is set on this deployment." });
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ token });
}
