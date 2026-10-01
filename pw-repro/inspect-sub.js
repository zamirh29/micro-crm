// Temporary diagnostic: list subscription rows for a user/org.
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

(async () => {
  const email = process.argv[2] || "ayyaz@4wheelsdirect.co.uk";
  const { data: users, error: uerr } = await admin.auth.admin.listUsers();
  if (uerr) { console.log("ERR", uerr.message); process.exit(1); }
  const user = users.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!user) { console.log("NO USER for", email); process.exit(0); }
  console.log("user:", user.id, user.email);

  const { data: subs } = await admin
    .from("subscriptions")
    .select("*")
    .or(`user_id.eq.${user.id}`)
    .order("created_at", { ascending: false });
  console.log("subscriptions by user_id:", JSON.stringify(subs, null, 2));

  const { data: members } = await admin
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id);
  console.log("memberships:", JSON.stringify(members));

  for (const m of members ?? []) {
    const { data: orgSubs } = await admin
      .from("subscriptions")
      .select("*")
      .eq("org_id", m.org_id)
      .order("created_at", { ascending: false });
    console.log(`subs for org ${m.org_id}:`, JSON.stringify(orgSubs, null, 2));
  }
})();
