// Temporary DB helper for the invoice/quote edit verification run.
// Uses the service-role key from the repo's .env.local (never printed).
//
// Usage as CLI:
//   node db.js state
//   node db.js set-subscription <plan> <status>
//   node db.js set-invoice-status <invoiceId> <status>
//   node db.js find-docs <invoiceTitle> <quoteTitle>
//   node db.js delete-doc invoice|quote <id>
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env.local");

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
  // @supabase/supabase-js lives in the repo root's node_modules.
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

const ORG_ID = "8cf82a2a-96ad-4ec4-a334-25bf3ce4bb24";
const TEST_EMAIL = "pwa-test-1301678156@example.com";

async function getAuthUserId(sb) {
  // Paginate-free lookup: the test user is created recently, but scan a page.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === TEST_EMAIL.toLowerCase()
    );
    if (hit) return hit.id;
    if (!data?.users?.length) break;
  }
  return null;
}

async function getUserId(sb) {
  const id = await getAuthUserId(sb);
  if (id) return id;
  throw new Error(`Auth user not found for ${TEST_EMAIL}`);
}

async function getSubscriptionRow(sb) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("id, user_id, org_id, plan, status, stripe_subscription_id")
    .eq("org_id", ORG_ID);
  if (error) throw error;
  return data ?? [];
}

async function state() {
  const sb = getClient();
  const userId = await getUserId(sb);
  const subs = await getSubscriptionRow(sb);
  const { data: members } = await sb
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", userId);
  const { data: invoices } = await sb
    .from("invoices")
    .select("id, number, title, status, currency, tax_rate")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: quotes } = await sb
    .from("quotes")
    .select("id, number, title, status")
    .eq("org_id", ORG_ID)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, first_name, last_name, company")
    .eq("org_id", ORG_ID)
    .limit(20);
  return {
    userId,
    memberships: members ?? [],
    subscriptions: subs,
    invoices: invoices ?? [],
    quotes: quotes ?? [],
    contacts: contacts ?? [],
  };
}

async function setSubscription(plan, status) {
  const sb = getClient();
  const userId = await getUserId(sb);
  const existing = await getSubscriptionRow(sb);
  if (existing.length) {
    const { error, data } = await sb
      .from("subscriptions")
      .update({ plan, status })
      .eq("id", existing[0].id)
      .select("id, plan, status");
    if (error) throw error;
    return { mode: "update", rows: data };
  }
  const { error, data } = await sb
    .from("subscriptions")
    .insert({ user_id: userId, org_id: ORG_ID, plan, status })
    .select("id, plan, status");
  if (error) throw error;
  return { mode: "insert", rows: data };
}

async function setInvoiceStatus(invoiceId, status) {
  const sb = getClient();
  const { error, data } = await sb
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId)
    .eq("org_id", ORG_ID)
    .select("id, title, status");
  if (error) throw error;
  return data;
}

async function getInvoice(invoiceId) {
  const sb = getClient();
  const { data, error } = await sb
    .from("invoices")
    .select(
      "id, number, title, status, tax_rate, subtotal, tax_amount, total, currency, invoice_items(*)"
    )
    .eq("id", invoiceId)
    .eq("org_id", ORG_ID)
    .single();
  if (error) throw error;
  return data;
}

async function getQuote(quoteId) {
  const sb = getClient();
  const { data, error } = await sb
    .from("quotes")
    .select(
      "id, number, title, status, tax_rate, subtotal, tax_amount, total, currency, quote_items(*)"
    )
    .eq("id", quoteId)
    .eq("org_id", ORG_ID)
    .single();
  if (error) throw error;
  return data;
}

async function findDocs(invoiceTitle, quoteTitle) {
  const sb = getClient();
  const { data: inv } = await sb
    .from("invoices")
    .select("id, number, title, status")
    .eq("org_id", ORG_ID)
    .in("title", [invoiceTitle, `${invoiceTitle} CHANGED`]);
  const { data: qte } = await sb
    .from("quotes")
    .select("id, number, title, status")
    .eq("org_id", ORG_ID)
    .in("title", [quoteTitle, `${quoteTitle} CHANGED`]);
  return { invoices: inv ?? [], quotes: qte ?? [] };
}

async function deleteDoc(kind, id) {
  const sb = getClient();
  const table = kind === "invoice" ? "invoices" : "quotes";
  const { error, data } = await sb
    .from(table)
    .delete()
    .eq("id", id)
    .eq("org_id", ORG_ID)
    .select("id, title");
  if (error) throw error;
  return data;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  let result;
  switch (cmd) {
    case "state":
      result = await state();
      break;
    case "set-subscription":
      result = await setSubscription(args[0], args[1]);
      break;
    case "set-invoice-status":
      result = await setInvoiceStatus(args[0], args[1]);
      break;
    case "get-invoice":
      result = await getInvoice(args[0]);
      break;
    case "get-quote":
      result = await getQuote(args[0]);
      break;
    case "find-docs":
      result = await findDocs(args[0], args[1]);
      break;
    case "delete-doc":
      result = await deleteDoc(args[0], args[1]);
      break;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("db.js error:", err?.message ?? err);
    process.exit(1);
  });
}

module.exports = {
  ORG_ID,
  TEST_EMAIL,
  getClient,
  state,
  setSubscription,
  setInvoiceStatus,
  getInvoice,
  getQuote,
  findDocs,
  deleteDoc,
};
