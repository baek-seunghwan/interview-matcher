import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB) throw new Error("Missing DB binding");
  return env.DB.withSession("first-primary");
}
export const cleanup = (db: ReturnType<typeof database>, now: number) => [
  db.prepare("DELETE FROM tickets WHERE seen < ?").bind(now - 86400000),
  db.prepare("UPDATE tickets SET state='expired', partner=NULL WHERE (state='matched' AND matched<=?) OR (state='waiting' AND seen<?)").bind(now - 3600000, now - 90000),
];
// Run these statements in the join/heartbeat batch. D1 serializes the entire
// transaction, so two people cannot claim the same waiting participant.
export function pair(db: ReturnType<typeof database>, owner: string, now: number) {
  return [
    db.prepare(`UPDATE tickets SET partner=(
      SELECT b.owner FROM tickets b WHERE b.state='waiting' AND b.owner<>tickets.owner
      AND b.department=tickets.department AND b.seen>=?
      AND (tickets.excluded IS NULL OR b.owner<>tickets.excluded)
      AND (b.excluded IS NULL OR b.excluded<>tickets.owner)
      ORDER BY b.created,b.owner LIMIT 1
    ) WHERE owner=? AND state='waiting'`).bind(now - 90000, owner),
    db.prepare("UPDATE tickets SET state='matched', matched=? WHERE owner=? AND state='waiting' AND partner IS NOT NULL").bind(now, owner),
    db.prepare("UPDATE tickets SET state='matched', partner=?, matched=? WHERE state='waiting' AND owner=(SELECT partner FROM tickets WHERE owner=? AND state='matched')").bind(owner, now, owner),
  ];
}
