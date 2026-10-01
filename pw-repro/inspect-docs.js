const path = require("path");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase/supabase-js"));
const fs = require("fs");

const env = {};
for (const raw of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  let val = line.slice(i + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  env[line.slice(0, i).trim()] = val;
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ORG = process.argv[2];

(async () => {
  const { data: inv } = await admin
    .from("invoices")
    .select("id, number, status, total, created_at, due_date")
    .eq("org_id", ORG)
    .order("created_at", { ascending: false });
  const counts = {};
  for (const r of inv) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log("INVOICE status counts:", JSON.stringify(counts), "total rows:", inv.length);
  console.log("latest 10:", inv.slice(0, 10).map(r => `${r.number}:${r.status}:${r.created_at.slice(0,10)}`).join(" | "));

  const { data: q } = await admin.from("quotes").select("id, status").eq("org_id", ORG);
  const qc = {};
  for (const r of q) qc[r.status] = (qc[r.status] || 0) + 1;
  console.log("QUOTE status counts:", JSON.stringify(qc));

  const { data: subs } = await admin.from("subscriptions").select("*").eq("org_id", ORG);
  console.log("subs:", JSON.stringify(subs));
})();
