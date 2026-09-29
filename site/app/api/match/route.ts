import { database, cleanup, pair } from "@/db/matching";

export const dynamic = "force-dynamic";
type Ticket = { owner: string; name: string; team: string; department: string; state: string; partner: string | null; created: number; seen: number; matched: number | null };

async function identity(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)pair_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
function json(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
async function snapshot(db: ReturnType<typeof database>, owner: string | null) {
  const now = Date.now();
  const me = owner ? await db.prepare("SELECT * FROM tickets WHERE owner=?").bind(owner).first<Ticket>() : null;
  const expired = me && ((me.state === "waiting" && (me.seen < now - 90000)) || (me.state === "matched" && (me.matched ?? 0) + 3600000 <= now));
  const current = expired ? { ...me!, state: "expired", partner: null } : me;
  const partner = current?.state === "matched" && current.partner ? await db.prepare("SELECT name,team,department FROM tickets WHERE owner=? AND partner=? AND state='matched'").bind(current.partner, owner).first() : null;
  const counts = await db.prepare("SELECT department,COUNT(*) AS count FROM tickets WHERE state='waiting' AND seen>=? GROUP BY department").bind(now - 90000).all();
  return { me: current ? { name: current.name, team: current.team, department: current.department, state: current.state, created: current.created } : null, partner, queue: counts.results, serverTime: now };
}
export async function GET(request: Request) {
  try {
    const owner = await identity(request);
    const result = await snapshot(database(), owner);
    if (owner) return json(result);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json(result, 200, { "Set-Cookie": `pair_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secure}` });
  } catch (error) { console.error("match read failed", error); return json({ error: "매칭 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "허용되지 않은 요청입니다." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "JSON 요청이 필요합니다." }, 415);
  const owner = await identity(request);
  if (!owner) return json({ error: "페이지를 새로고침한 뒤 다시 시도해 주세요." }, 401);
  let body;
  try { const raw = await request.text(); if (raw.length > 2048) return json({ error: "입력 내용이 너무 깁니다." }, 413); body = JSON.parse(raw); }
  catch { return json({ error: "입력 내용을 확인해 주세요." }, 400); }
  if (!body || !["join", "heartbeat", "cancel", "rematch", "complete"].includes(body.action)) return json({ error: "잘못된 동작입니다." }, 400);
  try {
    const db = database(), now = Date.now();
    const statements = cleanup(db, now);
    if (body.action === "join") {
      const fields = [body.name, body.team];
      if (!fields.every(v => typeof v === "string" && v.trim().length > 0) || body.name.trim().length > 24 || body.team.trim().length > 30 || !["AI", "풀스택", "클라우드"].includes(body.department)) return json({ error: "닉네임·팀을 입력하고 AI·풀스택·클라우드 중 부서를 선택해 주세요." }, 400);
      statements.push(db.prepare(`INSERT INTO tickets(owner,name,team,department,state,created,seen)
        VALUES(?,?,?,?,'waiting',?,?) ON CONFLICT(owner) DO UPDATE SET
        name=excluded.name,team=excluded.team,department=excluded.department,
        state='waiting',partner=NULL,excluded=NULL,created=excluded.created,seen=excluded.seen,matched=NULL
        WHERE tickets.state NOT IN ('waiting','matched')`).bind(owner, body.name.trim(), body.team.trim(), body.department, now, now));
      statements.push(...pair(db, owner, now));
    } else if (body.action === "heartbeat") {
      statements.push(db.prepare("UPDATE tickets SET seen=? WHERE owner=? AND state IN ('waiting','matched')").bind(now, owner));
      statements.push(...pair(db, owner, now));
    } else if (body.action === "complete") {
      statements.push(db.prepare("WITH targets AS MATERIALIZED (SELECT owner FROM tickets WHERE owner=? AND state='matched' UNION SELECT partner FROM tickets WHERE owner=? AND state='matched') UPDATE tickets SET state='completed' WHERE owner IN (SELECT owner FROM targets) AND state='matched'").bind(owner, owner));
    } else {
      // Release the other participant and exclude the last pair before clearing our pointer.
      statements.push(db.prepare("UPDATE tickets SET state='waiting',excluded=?,partner=NULL,created=?,matched=NULL WHERE owner=(SELECT partner FROM tickets WHERE owner=? AND state='matched') AND state='matched' AND partner=?").bind(owner, now, owner, owner));
      statements.push(db.prepare("UPDATE tickets SET excluded=COALESCE(partner,excluded),partner=NULL,state=?,created=?,seen=?,matched=NULL WHERE owner=? AND state IN ('waiting','matched')").bind(body.action === "rematch" ? "waiting" : "cancelled", now, now, owner));
      if (body.action === "rematch") statements.push(...pair(db, owner, now));
    }
    await db.batch(statements);
    return json(await snapshot(db, owner));
  } catch (error) { console.error("match update failed", error); return json({ error: "요청을 처리하지 못했어요. 입력 내용은 유지되니 다시 시도해 주세요." }, 503); }
}
