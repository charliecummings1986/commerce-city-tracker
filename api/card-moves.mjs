/**
 * Manual column moves on the board, read and written on behalf of the page.
 *
 * Same arrangement as next-steps.mjs: the table has RLS on with no policies,
 * so only this function (holding the service role key from Vercel's
 * environment) can reach it, and the access code is a speed bump, not a lock.
 *
 * A move is stored with the column the card had in the page when it was
 * moved (from_cat). The page applies a move only while its own copy of the
 * card still sits in that column, so when the card is later updated in the
 * page itself, the page wins and the old move falls away.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hmlaopflxijdgypvntci.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_CODE = (process.env.TRACKER_ACCESS_CODE || "ldcommerce").trim().toLowerCase();

const BOARD = "commerce-city";
const TABLE = "tracker_card_moves";
const CATS = new Set(["loi", "interested", "reviewing", "notcontacted", "open", "no"]);

function rest(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function list() {
  const r = await rest(`${TABLE}?board=eq.${BOARD}&select=card_name,from_cat,to_cat,moved_at&order=moved_at.asc`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    return res.status(503).json({ error: "This deployment has no SUPABASE_SERVICE_ROLE_KEY set, so moves cannot be saved." });
  }
  try {
    if (req.method === "GET") return res.status(200).json({ moves: await list() });
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (String(payload.code || "").trim().toLowerCase() !== ACCESS_CODE) return res.status(401).json({ error: "Wrong access code." });

    const name = String(payload.name || "").trim().slice(0, 200);
    const from = String(payload.from || "").trim();
    const to = String(payload.to || "").trim();
    if (!name || !CATS.has(from) || !CATS.has(to)) return res.status(400).json({ error: "Which card, and which column?" });

    const r = await rest(`${TABLE}?on_conflict=board,card_name`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ board: BOARD, card_name: name, from_cat: from, to_cat: to, moved_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(await r.text());
    return res.status(200).json({ moves: await list() });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
