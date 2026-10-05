// TEMPORARY guide screenshot fixtures. Seeds a realistic UK sole-trader
// dataset into the throwaway test org, then removes it again.
//
//   node seed-guide-demo.js snapshot   # record current subscription/org state
//   node seed-guide-demo.js seed
//   node seed-guide-demo.js clean
const fs = require("fs");
const path = require("path");
const { ORG_ID, getClient } = require("./db");

const SNAP_PATH = path.join(__dirname, "guide-demo-snapshot.json");
const TEST_USER_ID = null; // resolved at runtime

async function testUserId(sb) {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === "pwa-test-1301678156@example.com"
    );
    if (hit) return hit.id;
    if (!data?.users?.length) break;
  }
  throw new Error("test auth user not found");
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function iso(n) {
  return daysAgo(n).toISOString();
}
function ymd(n) {
  return daysAgo(n).toISOString().slice(0, 10);
}

async function snapshot() {
  const sb = getClient();
  const [{ data: org }, { data: subs }] = await Promise.all([
    sb.from("organizations").select("id, name, email, phone, website, address").eq("id", ORG_ID).single(),
    sb.from("subscriptions").select("id, plan, status").eq("org_id", ORG_ID),
  ]);
  const snap = { org, subs: subs ?? [] };
  fs.writeFileSync(SNAP_PATH, JSON.stringify(snap, null, 2));
  console.log(JSON.stringify(snap, null, 2));
}

async function seed() {
  const sb = getClient();
  const userId = await testUserId(sb);

  // Clear anything left over first so seeding is idempotent.
  await clean({ quiet: true });

  // Pro plan so Pro-only pages (tax, reports, import, activity) render.
  await sb
    .from("subscriptions")
    .update({ plan: "pro", status: "active" })
    .eq("org_id", ORG_ID);

  await sb
    .from("organizations")
    .update({
      name: "Hartley Digital",
      email: "hello@hartleydigital.example",
      phone: "0161 496 0182",
      website: "hartleydigital.example",
      address: "Unit 4, Dale Street Works\nManchester M4 5JW",
    })
    .eq("id", ORG_ID);

  await sb
    .from("profiles")
    .update({ full_name: "Alex Hartley" })
    .eq("id", userId);

  const contacts = [
    { first_name: "Rachel", last_name: "Nightingale", email: "rachel@nightingaledental.example", phone: "07700 900412", company: "Nightingale Dental Care", status: "client", notes: "Prefers email. Monthly retainer since March." },
    { first_name: "Tom", last_name: "Fletcher", email: "tom@fletcherbuilders.example", phone: "07700 900733", company: "Fletcher & Co Builders", status: "client", notes: "Site work usually starts after the first week of the month." },
    { first_name: "Priya", last_name: "Shah", email: "priya@shahmedia.example", phone: "07700 900188", company: "Shah Media Ltd", status: "prospect", notes: "Quoted for a full rebrand. Waiting on their board sign-off." },
    { first_name: "Daniel", last_name: "Okafor", email: "daniel@okaforpartners.example", phone: "07700 900254", company: "Okafor & Partners", status: "client", notes: "Accountant asks for a summary each quarter." },
    { first_name: "Emma", last_name: "Whitfield", email: "emma.whitfield@example.com", phone: "07700 900961", company: "", status: "lead", notes: "Enquiry through the website contact form." },
    { first_name: "Oliver", last_name: "Barnes", email: "oliver@barnesproperty.example", phone: "07700 900320", company: "Barnes Property Group", status: "prospect", notes: "Interested in a support plan for two tenant sites." },
  ];

  const { data: contactRows, error: contactErr } = await sb
    .from("contacts")
    .insert(
      contacts.map((c, i) => ({
        ...c,
        org_id: ORG_ID,
        created_at: iso(240 - i * 12),
        updated_at: iso(240 - i * 12),
      }))
    )
    .select("id, first_name, last_name, company");
  if (contactErr) throw contactErr;
  const by = {};
  for (const c of contactRows) by[c.last_name] = c;

  async function insertQuote(q, items, createdDaysAgo) {
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const tax = Math.round((subtotal * q.tax_rate) / 100);
    const { data, error } = await sb
      .from("quotes")
      .insert({
        org_id: ORG_ID,
        contact_id: q.contact_id,
        number: q.number,
        title: q.title,
        description: q.description ?? null,
        status: q.status,
        subtotal,
        tax_rate: q.tax_rate,
        tax_amount: tax,
        total: subtotal + tax,
        currency: "GBP",
        valid_until: q.valid_until ?? null,
        notes: q.notes ?? null,
        created_at: iso(createdDaysAgo),
        updated_at: iso(createdDaysAgo),
      })
      .select("id")
      .single();
    if (error) throw error;
    await sb.from("quote_items").insert(items.map((it) => ({ ...it, quote_id: data.id })));
    return data.id;
  }

  async function insertInvoice(inv, items, createdDaysAgo) {
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const tax = Math.round((subtotal * inv.tax_rate) / 100);
    const { data, error } = await sb
      .from("invoices")
      .insert({
        org_id: ORG_ID,
        contact_id: inv.contact_id,
        quote_id: inv.quote_id ?? null,
        number: inv.number,
        title: inv.title,
        description: inv.description ?? null,
        status: inv.status,
        subtotal,
        tax_rate: inv.tax_rate,
        tax_amount: tax,
        total: subtotal + tax,
        currency: "GBP",
        due_date: inv.due_date ?? null,
        paid_at: inv.paid_at ?? null,
        notes: inv.notes ?? null,
        created_at: iso(createdDaysAgo),
        updated_at: iso(createdDaysAgo),
      })
      .select("id")
      .single();
    if (error) throw error;
    await sb.from("invoice_items").insert(items.map((it) => ({ ...it, invoice_id: data.id })));
    return data.id;
  }

  const q1 = await insertQuote(
    {
      contact_id: by.Nightingale.id,
      number: "Q-0001",
      title: "Dental practice website redesign",
      description: "New five-page site with online booking links.",
      status: "accepted",
      tax_rate: 20,
      valid_until: ymd(-110),
    },
    [
      { description: "Design and wireframes (5 pages)", quantity: 1, unit_price: 145000, total: 145000 },
      { description: "Build and CMS setup", quantity: 1, unit_price: 210000, total: 210000 },
      { description: "Photography retouching", quantity: 12, unit_price: 3500, total: 42000 },
    ],
    150
  );

  const q4 = await insertQuote(
    {
      contact_id: by.Okafor.id,
      number: "Q-0004",
      title: "Annual support retainer",
      description: "Twelve months of hosting, backups and small changes.",
      status: "accepted",
      tax_rate: 20,
      valid_until: ymd(-40),
    },
    [{ description: "Support retainer (12 months)", quantity: 12, unit_price: 9500, total: 114000 }],
    60
  );

  await insertQuote(
    {
      contact_id: by.Fletcher.id,
      number: "Q-0002",
      title: "Shopfront signage package",
      description: "Fascia, vinyl window graphics and installation.",
      status: "sent",
      tax_rate: 20,
      valid_until: ymd(-8),
    },
    [
      { description: "Fascia sign, 3.2m", quantity: 1, unit_price: 88000, total: 88000 },
      { description: "Window vinyl set", quantity: 2, unit_price: 24000, total: 48000 },
      { description: "Installation", quantity: 1, unit_price: 32000, total: 32000 },
    ],
    34
  );

  await insertQuote(
    {
      contact_id: by.Shah.id,
      number: "Q-0003",
      title: "Brand identity package",
      status: "draft",
      tax_rate: 20,
      valid_until: ymd(45),
    },
    [
      { description: "Logo design and refinement", quantity: 1, unit_price: 120000, total: 120000 },
      { description: "Colour and type system", quantity: 1, unit_price: 65000, total: 65000 },
    ],
    12
  );

  await insertQuote(
    {
      contact_id: by.Barnes.id,
      number: "Q-0005",
      title: "Tenant site support, two sites",
      status: "sent",
      tax_rate: 20,
      valid_until: ymd(20),
    },
    [
      { description: "Care plan per site", quantity: 2, unit_price: 42000, total: 84000 },
      { description: "Shared content calendar setup", quantity: 1, unit_price: 35000, total: 35000 },
    ],
    6
  );

  await insertInvoice(
    {
      contact_id: by.Nightingale.id,
      quote_id: q1,
      number: "INV-0001",
      title: "Dental practice website redesign",
      status: "paid",
      tax_rate: 20,
      due_date: ymd(-124),
      paid_at: iso(126),
    },
    [
      { description: "Design and wireframes (5 pages)", quantity: 1, unit_price: 145000, total: 145000 },
      { description: "Build and CMS setup", quantity: 1, unit_price: 210000, total: 210000 },
      { description: "Photography retouching", quantity: 12, unit_price: 3500, total: 42000 },
    ],
    150
  );

  await insertInvoice(
    {
      contact_id: by.Okafor.id,
      quote_id: q4,
      number: "INV-0004",
      title: "Annual support retainer",
      status: "overdue",
      tax_rate: 20,
      due_date: ymd(-26),
    },
    [{ description: "Support retainer (12 months)", quantity: 12, unit_price: 9500, total: 114000 }],
    52
  );

  await insertInvoice(
    {
      contact_id: by.Fletcher.id,
      number: "INV-0002",
      title: "Shopfront signage package",
      status: "sent",
      tax_rate: 20,
      due_date: ymd(11),
    },
    [
      { description: "Fascia sign, 3.2m", quantity: 1, unit_price: 88000, total: 88000 },
      { description: "Window vinyl set", quantity: 2, unit_price: 24000, total: 48000 },
      { description: "Installation", quantity: 1, unit_price: 32000, total: 32000 },
    ],
    26
  );

  await insertInvoice(
    {
      contact_id: by.Shah.id,
      number: "INV-0003",
      title: "Brand guidelines document",
      status: "paid",
      tax_rate: 20,
      due_date: ymd(-40),
      paid_at: iso(7),
    },
    [{ description: "Brand guidelines, 24 page", quantity: 1, unit_price: 62000, total: 62000 }],
    66
  );

  await insertInvoice(
    {
      contact_id: by.Barnes.id,
      number: "INV-0005",
      title: "Tenant site support, two sites",
      status: "draft",
      tax_rate: 20,
      due_date: ymd(28),
    },
    [{ description: "Care plan per site", quantity: 2, unit_price: 42000, total: 84000 }],
    6
  );

  await insertInvoice(
    {
      contact_id: by.Fletcher.id,
      number: "INV-0007",
      title: "Shop till system build",
      status: "paid",
      tax_rate: 20,
      due_date: ymd(-58),
      paid_at: iso(-24),
    },
    [
      { description: "Shop system build", quantity: 1, unit_price: 640000, total: 640000 },
      { description: "Till integration and stock import", quantity: 1, unit_price: 320000, total: 320000 },
    ],
    88
  );

  await insertInvoice(
    {
      contact_id: by.Whitfield.id,
      number: "INV-0006",
      title: "Discovery workshop",
      status: "sent",
      tax_rate: 20,
      due_date: ymd(4),
    },
    [{ description: "Half-day discovery workshop", quantity: 1, unit_price: 45000, total: 45000 }],
    18
  );

  await sb.from("expenses").insert([
    { org_id: ORG_ID, incurred_on: ymd(0), category: "Software", description: "Adobe Creative Cloud and hosting", amount: 6899, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(1), category: "Travel", description: "Client visit, mileage and parking", amount: 4275, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(2), category: "Equipment", description: "External SSD for backups", amount: 15999, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(9), category: "Insurance", description: "Professional indemnity, quarterly", amount: 18500, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(21), category: "Marketing", description: "Local advertising", amount: 7500, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(70), category: "Software", description: "Domain and email hosting", amount: 3120, created_by: userId },
    { org_id: ORG_ID, incurred_on: ymd(96), category: "Professional services", description: "Accountant, annual return", amount: 12000, created_by: userId },
  ]);

  await sb.from("reminders").insert([
    {
      org_id: ORG_ID,
      contact_id: by.Fletcher.id,
      invoice_id: null,
      quote_id: null,
      title: "Chase shopfront signage deposit",
      description: "Friendly nudge if the deposit has not landed.",
      scheduled_at: iso(-2),
      status: "pending",
    },
    {
      org_id: ORG_ID,
      contact_id: by.Barnes.id,
      quote_id: null,
      invoice_id: null,
      title: "Follow up on the two-site support quote",
      description: "Quote Q-0005 expires soon.",
      scheduled_at: iso(3),
      status: "pending",
    },
    {
      org_id: ORG_ID,
      contact_id: by.Okafor.id,
      quote_id: null,
      invoice_id: null,
      title: "Overdue retainer invoice",
      description: "Second reminder before escalating.",
      scheduled_at: iso(-9),
      status: "completed",
    },
  ]);

  // The activity page only shows the last 10 days, so keep entries recent.
  await sb.from("activity_log").insert([
    { org_id: ORG_ID, user_id: userId, action: "created", entity: "quote", entity_id: null, label: "Tenant site support, two sites", payload: { number: "Q-0005" }, created_at: iso(1) },
    { org_id: ORG_ID, user_id: userId, action: "updated", entity: "contact", entity_id: null, label: "Rachel Nightingale", payload: {}, created_at: iso(2) },
    { org_id: ORG_ID, user_id: userId, action: "created", entity: "invoice", entity_id: null, label: "Discovery workshop", payload: { number: "INV-0006" }, created_at: iso(3) },
    { org_id: ORG_ID, user_id: userId, action: "updated", entity: "quote", entity_id: null, label: "Brand identity package", payload: { number: "Q-0003" }, created_at: iso(5) },
    { org_id: ORG_ID, user_id: userId, action: "deleted", entity: "contact", entity_id: null, label: "Old enquiry", payload: {}, created_at: iso(8) },
  ]);

  console.log("seeded guide demo data");
}

async function clean({ quiet = false } = {}) {
  const sb = getClient();
  const log = quiet ? () => {} : console.log;
  log("removing fixtures");
  await sb.from("activity_log").delete().eq("org_id", ORG_ID);
  await sb.from("reminders").delete().eq("org_id", ORG_ID);
  await sb.from("expenses").delete().eq("org_id", ORG_ID);

  const { data: inv } = await sb.from("invoices").select("id").eq("org_id", ORG_ID);
  if (inv?.length) await sb.from("invoice_items").delete().in("invoice_id", inv.map((i) => i.id));
  await sb.from("invoices").delete().eq("org_id", ORG_ID);

  const { data: qte } = await sb.from("quotes").select("id").eq("org_id", ORG_ID);
  if (qte?.length) await sb.from("quote_items").delete().in("quote_id", qte.map((q) => q.id));
  await sb.from("quotes").delete().eq("org_id", ORG_ID);

  await sb.from("contacts").delete().eq("org_id", ORG_ID);

  if (fs.existsSync(SNAP_PATH)) {
    const snap = JSON.parse(fs.readFileSync(SNAP_PATH, "utf8"));
    if (snap.org) {
      const patch = {};
      for (const k of ["name", "email", "phone", "website", "address"]) {
        patch[k] = snap.org[k] ?? null;
      }
      await sb.from("organizations").update(patch).eq("id", ORG_ID);
      log("restored organisation details");
    }
    for (const s of snap.subs ?? []) {
      await sb.from("subscriptions").update({ plan: s.plan, status: s.status }).eq("id", s.id);
    }
    if (snap.subs?.length) log("restored subscription");
  }
  log("cleaned");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "snapshot") return snapshot();
  if (cmd === "seed") return seed();
  if (cmd === "clean") return clean();
  throw new Error("usage: seed-guide-demo.js snapshot|seed|clean");
}

main().catch((e) => {
  console.error("seed-guide-demo error:", e?.message ?? e);
  process.exit(1);
});