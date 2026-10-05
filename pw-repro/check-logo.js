// TEMPORARY: reports whether the demo org still has a logo set, so the
// larger logo size can actually be previewed.
const { getClient, ORG_ID } = require("./db");

async function main() {
  const sb = getClient();
  const { data, error } = await sb
    .from("organizations")
    .select("name, logo_data")
    .eq("id", ORG_ID)
    .single();
  if (error) throw error;
  console.log("org:", data.name);
  console.log("logo set:", Boolean(data.logo_data), "len:", (data.logo_data || "").length);

  const { count: quotes } = await sb
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG_ID);
  const { count: invoices } = await sb
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ORG_ID);
  console.log("quotes:", quotes, "invoices:", invoices);
}

main().catch((e) => {
  console.error("check error:", e?.message ?? e);
  process.exit(1);
});