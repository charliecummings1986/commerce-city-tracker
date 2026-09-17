/**
 * The Next Steps checklist, read and written on behalf of the page.
 *
 * The tracker is a single static file in a public repo, so it can hold no
 * secret: the access code below is visible in the page source and the repo.
 * That is why the database is not reachable from the browser at all.
 * `tracker_next_steps` has RLS on with no policies, so the anon and
 * publishable keys get nothing; this function holds the service role key,
 * which lives only in Vercel's environment and is never committed.
 *
 * The code check is therefore a speed bump against a scanner that finds the
 * endpoint without reading the page, not a lock. What actually limits damage
 * is the shape of this file: three operations, one table, one board, with
 * lengths bounded here and again by the column constraints.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://hmlaopflxijdgypvntci.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_CODE = (process.env.TRACKER_ACCESS_CODE || "ldcommerce").trim().toLowerCase();

const BOARD = "commerce-city";
const TABLE = "tracker_next_steps";
const MAX_BODY = 500;
const MAX_OWNER = 60;
const MAX_ITEMS = 60;

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
  const r = await rest(
    `${TABLE}?board=eq.${BOARD}&select=id,body,done,owner,sort_order&order=sort_order.asc,created_at.asc`,
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    // Said plainly, because the page shows this text: a checklist that silently
    // does nothing is worse than one that says why.
    // The key is set per PROJECT in Vercel, not per team or per repo -- one on
    // a neighbouring project is invisible here, and this is what that looks
    // like from the inside.
    return res.status(503).json({
      error: "This deployment has no SUPABASE_SERVICE_ROLE_KEY set, so the checklist cannot be saved.",
    });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ items: await list() });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const code = String(payload.code || "").trim().toLowerCase();
    if (code !== ACCESS_CODE) return res.status(401).json({ error: "Wrong access code." });

    const action = String(payload.action || "");

    if (action === "toggle") {
      const id = String(payload.id || "");
      if (!id) return res.status(400).json({ error: "Which item?" });
      const r = await rest(`${TABLE}?id=eq.${encodeURIComponent(id)}&board=eq.${BOARD}`, {
        method: "PATCH",
        body: JSON.stringify({ done: Boolean(payload.done) }),
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ items: await list() });
    }

    if (action === "add") {
      const body = String(payload.body || "").trim().slice(0, MAX_BODY);
      if (!body) return res.status(400).json({ error: "An item needs some words." });

      const current = await list();
      // A cap, so a script pointed at this endpoint fills a list rather than a
      // database.
      if (current.length >= MAX_ITEMS) {
        return res.status(409).json({ error: `That is already ${MAX_ITEMS} items. Clear some first.` });
      }
      // Whose step it is. Free text rather than a fixed pair, because the
      // third answer on this deal is never "nobody" -- it is the GC, or
      // Debbie, or the city.
      const owner = String(payload.owner || "").trim().slice(0, MAX_OWNER) || null;

      const last = current[current.length - 1];
      const r = await rest(TABLE, {
        method: "POST",
        body: JSON.stringify({
          board: BOARD,
          body,
          owner,
          sort_order: (last ? last.sort_order : 0) + 10,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ items: await list() });
    }

    // Change whose step it is, or clear the owner, without retyping the item.
    if (action === "assign") {
      const id = String(payload.id || "");
      if (!id) return res.status(400).json({ error: "Which item?" });
      const owner = String(payload.owner || "").trim().slice(0, MAX_OWNER) || null;
      const r = await rest(`${TABLE}?id=eq.${encodeURIComponent(id)}&board=eq.${BOARD}`, {
        method: "PATCH",
        body: JSON.stringify({ owner }),
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ items: await list() });
    }

    if (action === "remove") {
      const id = String(payload.id || "");
      if (!id) return res.status(400).json({ error: "Which item?" });
      const r = await rest(`${TABLE}?id=eq.${encodeURIComponent(id)}&board=eq.${BOARD}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ items: await list() });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
