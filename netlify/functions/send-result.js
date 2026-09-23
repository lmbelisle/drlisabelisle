/**
 * POST /.netlify/functions/send-result
 *
 * Emails a reader their Leader Identity assessment result. The browser has
 * already computed the archetype and strength band (see leader-identity.html);
 * this function receives the *scoring outputs* — never free-form HTML — and
 * renders the email from its own canonical, voice-checked copy so the message
 * is server-controlled and self-contained.
 *
 * Provider: Resend (https://resend.com). The API key lives only in Netlify env
 * (RESEND_API_KEY), never in the client. The FROM address must be on a domain
 * verified with Resend; it is configurable via RESULT_FROM and defaults to an
 * address on drlisabelisle.com. Nothing sends until both are in place — until
 * then this returns a clean error the page silently ignores (the reader still
 * gets their on-page result either way).
 *
 * The site's own Netlify Forms capture (see the hidden form in
 * leader-identity.html) is unchanged and still records the lead for Lisa; this
 * function only adds the reader's emailed copy.
 */

// ---- Canonical archetype copy (verbatim from the voice-checked build spec).
const ARCHETYPES = {
  A: {
    name: "The Reluctant Expert",
    desc: "You earned authority the way medicine teaches it: by being right, and by being responsible. You read your own clinical limits well. You are less sure you belong in a leadership role, so you tend to lead by doing the work yourself rather than through other people. You already carry a clear picture of yourself as the most capable clinician in the room. You have not yet built one of yourself as the leader. Start there, and lead through other people instead of around them.",
    research: "You become a leader when others recognize and grant the identity, not by competence alone (DeRue & Ashford, 2010). Self-doubt like this runs high among physicians (Bravata et al., 2020).",
  },
  B: {
    name: "The Borrowed Playbook",
    desc: "You lead in the style of the attendings and chiefs who trained you, sometimes without deciding whether that style is yours. That gives you a working model early, which helps. It also means your instincts under pressure can belong to someone else. You have not yet sorted your own values from the habits you absorbed. Sort them: name which of your leadership reflexes you chose, and which you inherited.",
    research: "Trying on the styles of leaders you admire is a normal stage of becoming one; Ibarra calls these “provisional selves” (1999).",
  },
  C: {
    name: "The Values-First Leader",
    desc: "You know why you lead. Your priorities are clear to you, and colleagues can usually name what you stand for. Your conviction moves people. It also exposes you when others resist and your own response runs ahead of you. Work on staying steady and effective with colleagues who do not share your priorities.",
    research: "Creating a shared sense of “we” is identity entrepreneurship, one of the four validated dimensions of identity leadership (Steffens et al., 2014).",
  },
  D: {
    name: "The Steady Hand",
    desc: "You have started to hold the clinician and the leader in the same person without one erasing the other. You notice your reactions before they run you, and you can name how your sense of yourself in the role has changed over the past few years. This is the most integrated of the four profiles. Its risk is complacency: treating competence as the end of the work. Decide where you grow next while the choice is still yours.",
    research: "Merging the clinician and the leader into one identity is the arc of leader development (Day & Harrison, 2007; Lord & Hall, 2005).",
  },
};

const BANDS = {
  Emerging: "You are early in the behaviors that hold a group together: embodying what it stands for, championing it, building its cohesion and structure. That is normal at this stage of a career, and you can learn it.",
  Developing: "You already hold a group together in real ways. The next step is doing it more consistently, and knowing why it works when it does.",
  Established: "You reliably embody and advance your group. What remains is range: leading well in settings and with people unlike the ones you know.",
};

const ILI_CITATION =
  "This second dimension comes from the four validated items of the Identity Leadership Inventory: Steffens, N. K., Haslam, S. A., Reicher, S. D., et al. (2014). Leadership as social identity management: Introducing the Identity Leadership Inventory (ILI) to assess and validate a four-dimensional model. The Leadership Quarterly, 25(5), 1001–1024.";

const CLOSE =
  "Whichever profile you land in, the next move is the same: to work on your leader identity on purpose. Most physicians never do, and it shows. That is the work I do with early-career physician leaders, one on one. If you want to talk about yours, start a conversation.";

const SUBJECT = "Your leader-identity profile";
const COACHING_LINK = "https://drlisabelisle.com/inquiry.html?type=coaching";

// ---- Small helpers.
function sanitize(s, max) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}
function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Best-effort per-IP flood control (same speed-bump approach as pag-art-dna;
// each function instance keeps its own map, so it bounds a naive script, not a
// determined one).
const RATE = new Map();
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 1000;
function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  RATE.set(ip, hits);
  if (RATE.size > 5000) RATE.clear();
  return hits.length > RATE_MAX;
}

// Only our own site (and Netlify deploy previews) may call this public endpoint.
function fromUs(u) {
  return /^https:\/\/(www\.)?drlisabelisle\.com(\/|$)/.test(u) ||
    /^https:\/\/[a-z0-9-]+\.netlify\.app(\/|$)/.test(u);
}

// ---- Email rendering (HTML + plain text), from the canonical copy above.
function renderArchetypeBlocks(primary, secondary) {
  if (secondary) {
    return {
      heading: primary.name + " &amp; " + secondary.name,
      eyebrow: "A blend of two profiles",
      note: "Your answers split evenly between two profiles. Both are live in how you lead right now. Read them together.",
      body: [primary.desc, secondary.desc],
      research: primary.research + " " + secondary.research,
    };
  }
  return {
    heading: primary.name,
    eyebrow: "Your profile",
    note: "",
    body: [primary.desc],
    research: primary.research,
  };
}

function buildHtml(data) {
  const { firstName, arch, bandName, avg, c } = data;
  const teal = "#1B7383", gold = "#C9A84C", tx = "#1E1D1B", tx2 = "#5A5854", tx3 = "#9A9690";
  const serif = "Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const greeting = firstName
    ? `<p style="margin:0 0 18px;font-family:${sans};font-size:15px;color:${tx2};">Here is your read, ${escHtml(firstName)}.</p>`
    : "";

  const noteHtml = arch.note
    ? `<p style="margin:0 0 16px;font-family:${serif};font-style:italic;font-size:15px;color:${tx3};line-height:1.6;">${escHtml(arch.note)}</p>`
    : "";
  const bodyHtml = arch.body
    .map((p) => `<p style="margin:0 0 14px;font-family:${sans};font-size:16px;color:${tx2};line-height:1.75;">${escHtml(p)}</p>`)
    .join("");

  // Section C reflected back, when offered.
  const recapRows = [];
  if (c.effective)   recapRows.push(["Three words for effective leaders", c.effective]);
  if (c.ineffective) recapRows.push(["Three words for less effective leaders", c.ineffective]);
  if (c.experience)  recapRows.push(["When you fully engaged your leadership", c.experience]);
  if (c.roleModels)  recapRows.push(["Your leadership role models", c.roleModels]);
  const recapHtml = recapRows.length
    ? `<div style="margin:0 0 28px;">
         <div style="font-family:${sans};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${teal};margin-bottom:12px;">In your own words</div>
         ${recapRows.map(([k, v]) =>
           `<p style="margin:0 0 10px;font-family:${sans};font-size:14px;color:${tx};"><strong style="font-weight:600;">${escHtml(k)}</strong><br><span style="color:${tx2};">${escHtml(v)}</span></p>`
         ).join("")}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0EDE7;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;background:#FEFCF9;">

    <div style="font-family:${sans};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${tx3};margin-bottom:6px;">Leader Identity Assessment</div>

    ${greeting}

    <!-- Archetype card -->
    <div style="border:0.5px solid rgba(30,29,27,0.22);border-top:2px solid ${gold};padding:26px 24px;margin-bottom:22px;">
      <div style="font-family:${sans};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${teal};margin-bottom:10px;">${escHtml(arch.eyebrow)}</div>
      <div style="font-family:${serif};font-size:30px;font-weight:400;line-height:1.1;color:${tx};margin-bottom:16px;">${arch.heading}</div>
      ${noteHtml}
      ${bodyHtml}
      <div style="margin-top:18px;padding-top:14px;border-top:0.5px solid rgba(30,29,27,0.11);">
        <span style="display:block;font-family:${sans};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${tx3};margin-bottom:6px;">The research behind this</span>
        <span style="font-family:${sans};font-size:14px;color:${tx2};line-height:1.7;">${escHtml(arch.research)}</span>
      </div>
    </div>

    <!-- Strength band -->
    <div style="border:0.5px solid rgba(30,29,27,0.11);background:#F0EDE7;padding:22px 24px;margin-bottom:22px;">
      <div style="font-family:${sans};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${teal};margin-bottom:4px;">Identity-leadership strength</div>
      <div style="font-family:${serif};font-style:italic;font-size:24px;color:${tx};margin-bottom:2px;">${escHtml(bandName)}</div>
      <div style="font-family:${sans};font-size:12px;color:${tx3};margin-bottom:12px;">Self-rating average ${escHtml(avg)} of 5</div>
      <p style="margin:0 0 14px;font-family:${sans};font-size:15px;color:${tx2};line-height:1.75;">${escHtml(BANDS[bandName])}</p>
      <p style="margin:0;font-family:${sans};font-size:12px;color:${tx3};line-height:1.65;">${escHtml(ILI_CITATION)}</p>
    </div>

    ${recapHtml}

    <!-- Close -->
    <p style="font-family:${serif};font-size:18px;font-weight:400;color:${tx2};line-height:1.65;margin:0 0 22px;">${escHtml(CLOSE)}</p>

    <a href="${COACHING_LINK}" style="display:inline-block;font-family:${sans};font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;padding:13px 26px;border:0.5px solid rgba(30,29,27,0.22);color:${tx};text-decoration:none;">Start a conversation &rarr;</a>

    <div style="margin-top:30px;padding-top:18px;border-top:0.5px solid rgba(30,29,27,0.11);font-family:${sans};font-size:12px;color:${tx3};line-height:1.7;">
      Lisa Belisle, MD, PhD, MPH, MBA<br>
      <a href="https://drlisabelisle.com/coaching.html" style="color:${teal};text-decoration:none;">drlisabelisle.com</a>
    </div>

  </div>
</body></html>`;
}

function buildText(data) {
  const { firstName, arch, bandName, avg, c } = data;
  const lines = [];
  if (firstName) lines.push(`Here is your read, ${firstName}.`, "");
  lines.push(arch.eyebrow.toUpperCase(), arch.heading.replace(/&amp;/g, "&"), "");
  if (arch.note) lines.push(arch.note, "");
  arch.body.forEach((p) => { lines.push(p, ""); });
  lines.push("The research behind this: " + arch.research, "");
  lines.push("IDENTITY-LEADERSHIP STRENGTH: " + bandName + ` (self-rating average ${avg} of 5)`);
  lines.push(BANDS[bandName], "");
  lines.push(ILI_CITATION, "");
  const recap = [];
  if (c.effective)   recap.push(`Three words for effective leaders: ${c.effective}`);
  if (c.ineffective) recap.push(`Three words for less effective leaders: ${c.ineffective}`);
  if (c.experience)  recap.push(`When you fully engaged your leadership: ${c.experience}`);
  if (c.roleModels)  recap.push(`Your leadership role models: ${c.roleModels}`);
  if (recap.length) { lines.push("IN YOUR OWN WORDS", ...recap, ""); }
  lines.push(CLOSE, "");
  lines.push("Start a conversation: " + COACHING_LINK, "");
  lines.push("Lisa Belisle, MD, PhD, MPH, MBA — drlisabelisle.com");
  return lines.join("\n");
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const origin = req.headers.get("origin") || "";
  const referer = req.headers.get("referer") || "";
  if (!fromUs(origin) && !fromUs(referer)) {
    return json({ error: "forbidden" }, 403);
  }

  const apiKey = Netlify.env.get("RESEND_API_KEY");
  if (!apiKey) {
    // Not configured yet: fail cleanly. The page ignores this and the reader
    // still sees their on-page result.
    return json({ error: "email not configured" }, 503);
  }
  const from = Netlify.env.get("RESULT_FROM") || "Dr. Lisa Belisle <no-reply@drlisabelisle.com>";
  const replyTo = Netlify.env.get("RESULT_REPLY_TO") || "lbelisle@littlejohnisland.me";

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const email = sanitize(body.email, 200);
  if (!isEmail(email)) return json({ error: "A valid email is required." }, 400);

  const ip = req.headers.get("x-nf-client-connection-ip")
    || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (rateLimited(ip)) return json({ error: "Too many requests." }, 429);

  // Validate the scoring outputs against the known sets. Anything off the list
  // is dropped rather than trusted — this endpoint is public.
  const primaryKey = ["A", "B", "C", "D"].includes(body.primary) ? body.primary : null;
  if (!primaryKey) return json({ error: "unknown profile" }, 400);
  const secondaryKey = body.blended && ["A", "B", "C", "D"].includes(body.secondary) && body.secondary !== primaryKey
    ? body.secondary : null;
  const bandName = ["Emerging", "Developing", "Established"].includes(body.band) ? body.band : null;
  if (!bandName) return json({ error: "unknown band" }, 400);

  const avgNum = Number(body.avg);
  const avg = Number.isFinite(avgNum) ? avgNum.toFixed(1) : "";
  const firstName = sanitize(body.name, 120).split(/\s+/)[0] || "";

  const c = {
    effective:   sanitize(body.effective_leaders, 400),
    ineffective: sanitize(body.ineffective_leaders, 400),
    experience:  sanitize(body.engaged_experience, 2000),
    roleModels:  sanitize(body.role_models, 2000),
  };

  const arch = renderArchetypeBlocks(ARCHETYPES[primaryKey], secondaryKey ? ARCHETYPES[secondaryKey] : null);
  const data = { firstName, arch, bandName, avg, c };

  let resendRes;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: replyTo,
        subject: SUBJECT,
        html: buildHtml(data),
        text: buildText(data),
      }),
    });
  } catch (e) {
    console.error("Resend request failed", e);
    return json({ error: "Could not send the email." }, 502);
  }

  if (!resendRes.ok) {
    const detail = await resendRes.text().catch(() => "");
    console.error("Resend error", resendRes.status, detail.slice(0, 400));
    return json({ error: "Could not send the email." }, 502);
  }

  return json({ ok: true }, 200);
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
