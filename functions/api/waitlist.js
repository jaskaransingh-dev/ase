// functions/api/waitlist.js (Cloudflare Pages Function)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let cachedColumns = null;
let cachedColumnsAtMs = 0;

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function normalizeEmail(input) {
  return String(input ?? "").trim().toLowerCase();
}

function getInsertedId(result) {
  const candidate =
    result?.meta?.last_row_id ??
    result?.lastInsertRowid ??
    result?.lastInsertRowId ??
    null;
  const id = Number(candidate);
  return Number.isFinite(id) ? id : null;
}

async function ensureSchema(env) {
  // Keep in sync with migrations/0001_waitlist_users.sql.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS waitlist_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      user_agent TEXT,
      confirmation_sent_at DATETIME,
      confirmation_error TEXT,
      checked_in INTEGER DEFAULT 0
    )
  `).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_waitlist_users_email ON waitlist_users(email)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_waitlist_users_created_at ON waitlist_users(created_at DESC)"
  ).run();

  cachedColumns = null;
  cachedColumnsAtMs = 0;
}

async function getWaitlistColumns(env) {
  const now = Date.now();
  if (cachedColumns && now - cachedColumnsAtMs < 60_000) return cachedColumns;

  const { results } = await env.DB.prepare("PRAGMA table_info(waitlist_users)").all();
  const cols = new Set((results || []).map((r) => r?.name).filter(Boolean));
  cachedColumns = cols;
  cachedColumnsAtMs = now;
  return cols;
}

function withCors(request, env, res) {
  const origin = request.headers.get("Origin");
  const allowed = env?.FRONTEND_URL;
  if (!origin) return res;
  if (!allowed || origin !== allowed) return res;
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers });
}

async function sendSendGridConfirmationEmail(toEmail, env) {
  if (!env?.SENDGRID_API_KEY || !env?.EMAIL_FROM) return { skipped: true };

  const fromName = env.EMAIL_FROM_NAME || "ASE";
  const subject = "You're on the ASE waitlist";
  const dashboardUrl = env.FRONTEND_URL || "";
  const text = [
    "Thanks for joining the Agent Stock Exchange (ASE) waitlist.",
    "We'll reach out as we approach launch.",
    dashboardUrl ? `\nWebsite: ${dashboardUrl}` : "",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <p>Thanks for joining the <strong>Agent Stock Exchange (ASE)</strong> waitlist.</p>
      <p>We'll reach out as we approach launch.</p>
      ${dashboardUrl ? `<p><a href="${dashboardUrl}">${dashboardUrl}</a></p>` : ""}
      <p style="color:#666;font-size:12px">If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: env.EMAIL_FROM, name: fromName },
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
  };

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`SendGrid error ${resp.status}: ${detail}`.slice(0, 500));
  }

  return { skipped: false };
}

async function insertWaitlistUser(env, { email, ip, userAgent }) {
  const cols = await getWaitlistColumns(env).catch(() => new Set());
  const hasIp = cols.has("ip");
  const hasUserAgent = cols.has("user_agent");

  if (hasIp && hasUserAgent) {
    return env.DB.prepare(
      "INSERT INTO waitlist_users (email, ip, user_agent) VALUES (?, ?, ?)"
    )
      .bind(email, ip, userAgent)
      .run();
  }

  return env.DB.prepare("INSERT INTO waitlist_users (email) VALUES (?)")
    .bind(email)
    .run();
}

async function updateConfirmationSuccess(env, id) {
  const cols = await getWaitlistColumns(env).catch(() => new Set());
  if (!cols.has("confirmation_sent_at")) return;
  await env.DB.prepare(
    "UPDATE waitlist_users SET confirmation_sent_at = CURRENT_TIMESTAMP, confirmation_error = NULL WHERE id = ?"
  )
    .bind(id)
    .run();
}

async function updateConfirmationError(env, id, errorMessage) {
  const cols = await getWaitlistColumns(env).catch(() => new Set());
  if (!cols.has("confirmation_error")) return;
  await env.DB.prepare(
    "UPDATE waitlist_users SET confirmation_error = ? WHERE id = ?"
  )
    .bind(errorMessage, id)
    .run();
}

export async function onRequestOptions(context) {
  const { request, env } = context;
  const res = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-admin-token",
      "Access-Control-Max-Age": "86400",
    },
  });
  return withCors(request, env, res);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let data;
  try {
    data = await request.json();
  } catch {
    return withCors(request, env, json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const email = normalizeEmail(data?.email);
  if (!email || !EMAIL_RE.test(email)) {
    return withCors(request, env, json({ error: "Invalid email" }, { status: 400 }));
  }

  const ip = request.headers.get("CF-Connecting-IP") || null;
  const userAgent = request.headers.get("User-Agent") || null;

  try {
    let result;
    try {
      result = await insertWaitlistUser(env, { email, ip, userAgent });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("no such table")) {
        await ensureSchema(env);
        result = await insertWaitlistUser(env, { email, ip, userAgent });
      } else {
        throw e;
      }
    }

    const id = getInsertedId(result);

    if (id !== null) {
      context.waitUntil(
        (async () => {
          try {
            await sendSendGridConfirmationEmail(email, env);
            await updateConfirmationSuccess(env, id);
          } catch (e) {
            const msg = String(e?.message || e).slice(0, 500);
            await updateConfirmationError(env, id, msg);
            console.error("confirmation_email_failed", { id, email, error: msg });
          }
        })()
      );
    }

    return withCors(request, env, json({ success: true, id }, { status: 201 }));
  } catch (err) {
    const message = String(err?.message || err);
    if (message.includes("UNIQUE constraint failed")) {
      return withCors(
        request,
        env,
        json({ error: "Email already registered" }, { status: 409 })
      );
    }
    console.error("waitlist_insert_failed", { email, error: message });
    return withCors(request, env, json({ error: "Server error" }, { status: 500 }));
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env?.ADMIN_TOKEN) {
    return withCors(request, env, json({ error: "Admin not configured" }, { status: 503 }));
  }
  const token = request.headers.get("x-admin-token");
  if (!token || token !== env.ADMIN_TOKEN) {
    return withCors(request, env, json({ error: "Unauthorized" }, { status: 401 }));
  }

  const cols = await getWaitlistColumns(env).catch(() => new Set());
  const selectCols = ["id", "email", "created_at"]
    .concat(cols.has("confirmation_sent_at") ? ["confirmation_sent_at"] : [])
    .concat(cols.has("confirmation_error") ? ["confirmation_error"] : []);
  const { results } = await env.DB.prepare(
    `SELECT ${selectCols.join(", ")} FROM waitlist_users ORDER BY id ASC`
  ).all();

  return withCors(request, env, json({ users: results, count: results.length }, { status: 200 }));
}
