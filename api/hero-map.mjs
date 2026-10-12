/**
 * The hero's satellite image, from Mapbox's Static Images API.
 *
 * The token is a public browser token, the same one the listing pages carry,
 * but GitHub's push protection reads any Mapbox token in a commit as a secret.
 * So it lives in Vercel's environment (MAPBOX_TOKEN) and this function
 * redirects the page's background image to Mapbox with it attached.
 *
 * The map is centred west of the site so the pin lands three quarters of the
 * way across: on a wide screen the hero copy sits on the left, and on a phone
 * the CSS crops to the same point.
 */
const SITE = [-104.815, 39.8859]; // E 104th Ave & Chambers Rd
const ZOOM = 15;
const W = 1280;
const H = 640;
// Static maps use 512px tiles: degrees of longitude per pixel at this zoom.
const DEG_PER_PX = 360 / (512 * 2 ** ZOOM);
const CENTER_LNG = (SITE[0] - (W * 0.25) * DEG_PER_PX).toFixed(5);

export default function handler(req, res) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).end();
  const pin = `pin-l+0EB2CC(${SITE[0]},${SITE[1]})`;
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${pin}/${CENTER_LNG},${SITE[1]},${ZOOM},0/${W}x${H}@2x?access_token=${token}`;
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Location", url);
  return res.status(302).end();
}
