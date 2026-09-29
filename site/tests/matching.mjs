import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:5173';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Tests are local-only');
const users = [];
async function user(name) {
  const init = await fetch(`${base}/api/match`);
  assert.equal(init.status, 200, await init.clone().text());
  const cookie = init.headers.get('set-cookie')?.split(';')[0];
  assert(cookie);
  const u = { name, async call(body) {
    const r = await fetch(`${base}/api/match`, { method: body ? 'POST' : 'GET', headers: { cookie, origin: new URL(base).origin, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await r.json(); return { status: r.status, ...value };
  }, async join(department) { return this.call({ action: 'join', department, name, team: '14팀' }); } };
  users.push(u); return u;
}
const slot = 'AI', other = '풀스택';
try {
  const a = await user('검증A'), b = await user('검증B'), c = await user('검증C');
  assert.equal((await a.join(slot)).me.state, 'waiting');
  assert.equal((await b.join(other)).me.state, 'waiting', 'Different departments must remain separate');
  const joined = await c.join(slot);
  assert.equal(joined.me.state, 'matched'); assert.equal(joined.partner.name, a.name);
  const matchedA = await a.call();
  assert.equal(matchedA.partner.name, c.name);
  assert.equal('owner' in matchedA.me, false); assert.equal('owner' in matchedA.partner, false);
  assert.equal((await a.join(other)).me.department, slot, 'Duplicate join must preserve active ticket');
  assert.equal((await a.call({ action: 'rematch' })).me.state, 'waiting');
  assert.equal((await c.call({ action: 'heartbeat' })).me.state, 'waiting', 'Previous pair must not match again immediately');
  const d = await user('검証D'); assert.equal((await d.join(slot)).me.state, 'matched');
  const matchedD = await d.call();
  const peer = users.find(u => u.name === matchedD.partner.name);
  await d.call({ action: 'complete' });
  assert.equal((await peer.call()).me.state, 'completed', 'Completion must reach both participants');
  for (const u of users) await u.call({ action: 'cancel' });
  const concurrent = await Promise.all(Array.from({length:10}, (_,i)=>user(`同時${i}`)));
  await Promise.all(concurrent.map(u => u.join(slot)));
  const states = await Promise.all(concurrent.map(u=>u.call()));
  assert(states.every(s=>s.me.state === 'matched'), JSON.stringify(states));
  assert.equal(new Set(states.map(s=>s.partner.name)).size, 10, 'A partner cannot be assigned twice');
  for (let i=0;i<states.length;i++) { const peerIndex=concurrent.findIndex(u=>u.name===states[i].partner.name); assert.equal(states[peerIndex].partner.name,concurrent[i].name, 'Pairs must be reciprocal'); }
  const cancelPeer = concurrent.find(u=>u.name===states[0].partner.name);
  await concurrent[0].call({action:'cancel'});
  assert.equal((await cancelPeer.call()).me.state, 'waiting');
  const cloudA = await user('클라우드A'), cloudB = await user('클라우드B');
  assert.equal((await cloudA.join('클라우드')).me.state, 'waiting');
  assert.equal((await cloudB.join('클라우드')).partner.name, '클라우드A');
  const outsider = await user('외부');
  const outside = await outsider.call(); assert.equal(outside.me, null); assert.equal(outside.partner,null);
  assert.equal((await outsider.join('잘못된 부서')).status, 400);
  assert.equal((await outsider.call({action:'join', department:slot, name:' ', team:'팀'})).status,400);
  assert.equal((await outsider.call({action:'bad'})).status,400);
  const noSession = await fetch(`${base}/api/match`, {method:'POST',headers:{origin:new URL(base).origin,'content-type':'application/json'},body:JSON.stringify({action:'join'})});
  assert.equal(noSession.status,401);
  const foreign = await fetch(`${base}/api/match`, {method:'POST',headers:{origin:'https://example.org','content-type':'application/json'},body:'{}'}); assert.equal(foreign.status,403);
  console.log('PASS: real D1 pairing, 10 concurrent clients, reciprocal unique assignments, department separation, retry idempotency, rematch exclusion, cancellation, completion, privacy, invalid input, session and origin protections.');
} finally {
  for (const u of users) await u.call({action:'cancel'});
}
