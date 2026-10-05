// Impersonation E2E fixture: a throwaway user (free plan) owned by nobody.
//   node impersonation-fixtures.js up     creates the account, prints JSON
//   node impersonation-fixtures.js down   removes everything created by "up"
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env.local");
const STATE_PATH = path.join(__dirname, "impersonation-fixtures.json");

const EMAIL = "imp-target-9471@example.com";
const PASSWORD = "ImpTarget123!";

function readEnv() {
  const out = {};
  for (const raw of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function getClient() {
  const { createClient } = require(path.join(
    __dirname,
    "..",
    "node_modules",
    "@supabase",
    "supabase-js"
  ));
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL / service role key");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUser(sb) {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === EMAIL.toLowerCase()
    );
    if (hit) return hit;
    if (!data?.users?.length) break;
  }
  return null;
}

async function down() {
  const sb = getClient();
  const user = await findUser(sb);
  const state = fs.existsSync(STATE_PATH)
    ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8"))
    : null;

  // Collect every user id ever tied to this email (auth + profiles), then every
  // org they belong to, so repeated/partial runs sweep all leftovers.
  const userIds = new Set();
  if (user?.id) userIds.add(user.id);
  if (state?.userId) userIds.add(state.userId);
  const { data: profiles } = await sb
    .from("profiles")
    .select("id")
    .eq("email", EMAIL);
  for (const p of profiles ?? []) userIds.add(p.id);

  const orgIds = new Set();
  if (state?.orgId) orgIds.add(state.orgId);
  for (const uid of userIds) {
    const { data: members } = await sb
      .from("memberships")
      .select("org_id")
      .eq("user_id", uid);
    for (const m of members ?? []) orgIds.add(m.org_id);
  }

  for (const orgId of orgIds) {
    const { data: quotes } = await sb
      .from("quotes")
      .select("id")
      .eq("org_id", orgId);
    for (const q of quotes ?? []) {
      await sb.from("quote_items").delete().eq("quote_id", q.id);
    }
    await sb.from("quotes").delete().eq("org_id", orgId);

    const { data: invoices } = await sb
      .from("invoices")
      .select("id")
      .eq("org_id", orgId);
    for (const i of invoices ?? []) {
      await sb.from("invoice_items").delete().eq("invoice_id", i.id);
    }
    await sb.from("invoices").delete().eq("org_id", orgId);

    await sb.from("contacts").delete().eq("org_id", orgId);
    await sb.from("memberships").delete().eq("org_id", orgId);
    await sb.from("subscriptions").delete().eq("org_id", orgId);
    await sb.from("organizations").delete().eq("id", orgId);
  }

  for (const uid of userIds) {
    await sb.from("profiles").delete().eq("id", uid);
    const { error } = await sb.auth.admin.deleteUser(uid);
    if (error && !/not found/i.test(error.message ?? "")) {
      throw new Error(`deleteUser failed: ${error.message}`);
    }
  }
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  return { cleaned: { orgIds: [...orgIds], userIds: [...userIds], email: EMAIL } };
}

async function up() {
  const sb = getClient();
  const existing = await findUser(sb);
  if (existing || fs.existsSync(STATE_PATH)) {
    await down();
  }

  const { data: created, error: createError } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new Error(createError?.message ?? "createUser failed");
  }
  const userId = created.user.id;

  // A DB trigger on auth.users creates profile + organization + membership
  // (and usually the free subscription). Wait for it instead of inserting a
  // second set, which would break every `.single()` membership query.
  let orgId = null;
  for (let i = 0; i < 30 && !orgId; i++) {
    const { data: rows } = await sb
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId);
    if (rows?.length) {
      orgId = rows[0].org_id;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!orgId) throw new Error("no membership appeared for fixture user");

  const { data: subs } = await sb
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (!subs?.length) {
    const { error } = await sb
      .from("subscriptions")
      .insert({ user_id: userId, org_id: orgId, plan: "free", status: "active" });
    if (error) throw new Error(`subscription insert failed: ${error.message}`);
  }

  const { error: contactError } = await sb.from("contacts").insert({
    org_id: orgId,
    first_name: "Fixture",
    last_name: "Customer",
    status: "client",
  });
  if (contactError) throw new Error(`contact insert failed: ${contactError.message}`);

  const state = { email: EMAIL, password: PASSWORD, userId, orgId };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return state;
}

async function main() {
  const cmd = process.argv[2];
  let result;
  if (cmd === "up") result = await up();
  else if (cmd === "down") result = await down();
  else throw new Error("usage: node impersonation-fixtures.js up|down");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("fixtures error:", err?.message ?? err);
    process.exit(1);
  });
}

module.exports = { EMAIL, PASSWORD, STATE_PATH, getClient, up, down };
