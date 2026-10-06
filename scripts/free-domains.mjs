// Before the Workers are deployed: clears out OLD address records that stop Cloudflare attaching the website's own domains.
//
// A Worker "custom domain" creates its own DNS record. If the same name already has an ordinary A / AAAA / CNAME record (left over from
// an earlier host, or a parking page), Cloudflare refuses with "Hostname already has externally managed DNS records" and the name keeps
// pointing at the old place (visitors see error 523). This removes such records for exactly the names below – nothing else:
// no mail (MX), no TXT (SPF/DKIM/DMARC/verification), no other hostnames, and never a record Cloudflare manages for a Worker.
//
//   CLOUDFLARE_API_TOKEN=… node scripts/free-domains.mjs nureasmir.com www.nureasmir.com admin.nureasmir.com
//
// It only logs a warning if it cannot do its job, so a DNS problem never blocks a deploy.
const token = process.env.CLOUDFLARE_API_TOKEN;
const names = process.argv.slice(2).map((n) => n.toLowerCase());
if (!token || !names.length) {
  console.log("Nothing to do (no token or no names).");
  process.exit(0);
}
const API = "https://api.cloudflare.com/client/v4";
const call = async (path, init) => {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  return response.json();
};

const apex = names.reduce((shortest, n) => (n.length < shortest.length ? n : shortest));
const zones = await call(`/zones?name=${apex}`);
const zone = zones.result?.[0];
if (!zone) {
  console.log(`::warning::Could not find the zone ${apex} (${JSON.stringify(zones.errors)}). Domain attach may fail.`);
  process.exit(0);
}
const listing = await call(`/zones/${zone.id}/dns_records?per_page=500`);
if (!listing.success) {
  console.log(`::warning::The Cloudflare token cannot read DNS records (${JSON.stringify(listing.errors)}). Give it "Zone → DNS → Edit" for ${apex}, or delete the old records by hand.`);
  process.exit(0);
}
for (const record of listing.result) {
  if (!names.includes(record.name.toLowerCase())) continue;
  console.log(`found ${record.type} ${record.name} → ${record.content} (proxied=${record.proxied}) ${record.comment ?? ""}`);
  if (!["A", "AAAA", "CNAME"].includes(record.type)) continue;
  if (record.meta?.read_only || /workers/i.test(record.comment ?? "")) {
    console.log("  keeping: managed by Cloudflare Workers");
    continue;
  }
  const removed = await call(`/zones/${zone.id}/dns_records/${record.id}`, { method: "DELETE" });
  console.log(removed.success ? "  removed (old record in the way)" : `::warning::  could not remove: ${JSON.stringify(removed.errors)}`);
}
