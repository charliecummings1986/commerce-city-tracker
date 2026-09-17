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
    `${TABLE}?board=eq.${BOARD}&select=id,body,done,sort_order&order=sort_order.asc,created_at.asc`,
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) {
    // Said plainly, because the page shows this text: a checklist that silently
    // does nothing is worse than one that says why.
    return res.status(503).json({
      error: "This deployment has no SUPABASE_SERVICE_ROLE_KEY set, so the checklist cannot be saved.",
      // TEMPORARY, remove once the key is in: which environment this is, and
      // the NAMES -- never the values -- of the variables it can actually see.
      // Every name here is already in this file in a public repo, so it gives
      // away nothing; what it settles is whether the key was saved to the
      // wrong environment or under a different name.
      diagnostic: {
        vercelEnv: process.env.VERCEL_ENV || null,
        matchingNames: Object.keys(process.env).filter((k) => /SUPABASE|TRACKER/i.test(k)).sort(),
      },
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
      const last = current[current.length - 1];
      const r = await rest(TABLE, {
        method: "POST",
        body: JSON.stringify({
          board: BOARD,
          body,
          sort_order: (last ? last.sort_order : 0) + 10,
        }),
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
