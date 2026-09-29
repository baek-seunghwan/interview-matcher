"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Copy, Link2, LoaderCircle, Radio, RotateCcw, Users, X } from "lucide-react";

type Snapshot = { me: null | { name: string; team: string; department: string; state: string; created: number }; partner: null | { name: string; team: string; department: string }; queue: { department: string; count: number }[] };
const initial: Snapshot = { me: null, partner: null, queue: [] };
const departments = ["AI", "풀스택", "클라우드"];

export default function Home() {
  const [data, setData] = useState<Snapshot>(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [department, setDepartment] = useState("AI");
  const [clock, setClock] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const inflight = useRef(false);
  const current = useRef(data);
  current.current = data;
  const active = data.me?.state === "waiting" || data.me?.state === "matched";
  const chosenCount = data.queue.find(q => q.department === department)?.count ?? 0;
  const allWaiting = data.queue.reduce((sum, q) => sum + q.count, 0);

  const request = useCallback(async (payload?: Record<string, unknown>) => {
    const response = await fetch("/api/match", payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : { cache: "no-store" });
    const result = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(result.error || "연결을 확인한 뒤 다시 시도해 주세요.");
    setData(result); setError(""); return result;
  }, []);

  useEffect(() => {
    let stopped = false;
    async function init() {
      try {
        const result = await request();
        if (stopped) return;
        if (result.me) { setName(result.me.name); setTeam(result.me.team); setDepartment(result.me.department); }
        setReady(true);
      } catch (e) { if (!stopped) setError((e as Error).message); }
    }
    void init();
    const timer = setInterval(async () => {
      setClock(Date.now());
      if (inflight.current) return;
      inflight.current = true;
      try { await request(current.current.me && ["waiting", "matched"].includes(current.current.me.state) ? { action: "heartbeat" } : undefined); setReady(true); }
      catch (e) { if (!stopped) setError((e as Error).message); }
      finally { inflight.current = false; }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [request]);

  async function act(action: string) {
    if (inflight.current) return;
    inflight.current = true; setBusy(true);
    try { return await request({ action, ...(action === "join" ? { name, team, department } : {}) }); }
    catch (e) { setError((e as Error).message); }
    finally { inflight.current = false; setBusy(false); }
  }
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(context.registerTool({ name: "read_matching_status", description: "Read the current visitor's live interview matching status.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input: unknown) { if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("Expected an empty object"); return { state: current.current.me?.state ?? "idle", partner: current.current.partner, department: current.current.me?.department ?? null }; } }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  const elapsed = data.me ? Math.max(0, Math.floor((clock - data.me.created) / 1000)) : 0;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="PAIR 홈"><span className="brand-icon"><Link2 size={25} strokeWidth={2.8} /></span>PAIR<span className="brand-caption">카테부</span></a><span className="header-note"><span className="tiny-square" /> 실시간 모의면접 매칭</span></header>
    <main>
      <div className="intro"><div><div className="eyebrow">MOCK INTERVIEW CLUB <span>/</span> LIVE MATCHING</div><h1>지금, 함께 연습할 사람.</h1><p>파트너를 찾아다니는 대신, 여기서 바로 만나요.</p></div><button className="share-button" onClick={async () => { try { await navigator.clipboard.writeText(location.origin); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError("주소창의 링크를 복사해서 공유해 주세요."); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "링크 복사됨" : "팀원에게 공유"}</button></div>
      {error && <div className="error" role="alert">{error}<button onClick={() => { void request().then(() => setReady(true)).catch(e => setError(e.message)); }}>다시 연결</button></div>}
      <div className="workspace">
        <section className="form-panel" aria-labelledby="form-title">
          <div className="panel-heading"><div><span className="section-kicker">FIND YOUR PAIR</span><h2 id="form-title">면접 파트너 찾기</h2></div><span className="duration"><Radio size={15} />실시간</span></div>
          <form onSubmit={e => { e.preventDefault(); void act("join"); }}>
            <fieldset disabled={active || busy || !ready}>
              <legend>어떻게 불러드릴까요?</legend>
              <div className="two-fields"><label>닉네임<input required maxLength={24} placeholder="예: Leon" value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label><label>팀<input required maxLength={30} placeholder="예: 14" value={team} onChange={e => setTeam(e.target.value)} /></label></div>
              <label className="department-field">부서<select value={department} onChange={e => setDepartment(e.target.value)}>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
            </fieldset>
            {!active && <><div className="selection-summary"><Users size={17} /><span>{chosenCount > 0 ? <><strong>{department} {chosenCount}명</strong>이 지금 기다리고 있어요.</> : <>같은 부서에서 대기 중인 사람과 바로 연결돼요.</>}</span></div><button type="submit" className="primary" disabled={!ready || busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Link2 size={19} />}{!ready ? "연결 중…" : busy ? "파트너 찾는 중…" : "매칭 시작"}</button><p className="small-print">매칭될 때까지 이 화면을 열어두세요.</p></>}
            {active && <p className="locked-note"><Check size={16} /> 정보를 바꾸려면 현재 매칭을 취소해 주세요.</p>}
          </form>
        </section>
        <aside className="status-column">
          <section className={`status-panel ${data.me?.state === "matched" ? "is-matched" : ""}`} aria-live="polite">
            <div className="status-heading"><h2>내 매칭 현황</h2><span className={`status-badge ${active ? "live" : ""}`}>{!ready ? "연결 중" : data.me?.state === "matched" ? "매칭 완료" : data.me?.state === "waiting" ? "파트너 찾는 중" : "시작 전"}</span></div>
            {data.me?.state === "matched" && data.partner ? <div className="matched-content"><div className="success-icon"><CheckCheck size={31} /></div><h3>함께할 파트너를 찾았어요!</h3><p>바로 만나서 모의면접을 시작해 보세요.</p><div className="partner-card"><div className="avatar">{data.partner.name.slice(0, 1)}</div><div><strong>{data.partner.name}</strong><span>{data.partner.team} · {data.partner.department}</span></div><span className="partner-label">YOUR PAIR</span></div><p className="match-tip">파트너의 팀과 닉네임을 확인하고 만나세요.<br />서로 면접관과 지원자를 번갈아 맡아보세요.</p><button className="primary" disabled={busy} onClick={() => void act("complete")}><Check size={18} />면접을 마쳤어요</button><div className="secondary-actions"><button disabled={busy} onClick={() => void act("rematch")}><RotateCcw size={15} />다른 파트너 찾기</button><button disabled={busy} onClick={() => void act("cancel")}>매칭 취소</button></div></div>
            : data.me?.state === "waiting" ? <div className="waiting-content"><div className="waiting-orbit"><Radio size={34} /></div><h3>{data.me.department} 파트너를 찾고 있어요</h3><p>대기 중인 팀원이 생기면 바로 연결해 드려요.</p><div className="wait-time">{Math.floor(elapsed / 60).toString().padStart(2, "0")}<span>:</span>{(elapsed % 60).toString().padStart(2, "0")}</div><p className="match-tip">화면을 열어둔 채로 잠시만 기다려 주세요.</p><button className="outline full" disabled={busy} onClick={() => void act("cancel")}><X size={16} />대기 취소</button></div>
            : <div className="empty-content"><div className="empty-icon">{data.me?.state === "completed" ? <CheckCheck size={36} /> : <Users size={36} />}</div><h3>{data.me?.state === "completed" ? "오늘도 한 걸음 성장했어요." : data.me?.state === "expired" ? "매칭이 종료되었어요." : data.me?.state === "cancelled" ? "매칭을 취소했어요." : "당신의 다음 파트너는?"}</h3><p>{data.me?.state === "expired" ? "대기 연결이 끊겼거나 매칭 후 1시간이 지났어요. 다시 시작해 주세요." : "닉네임과 팀, 부서를 입력하고 매칭 시작을 누르면 파트너를 찾아드려요."}</p><div className="empty-rule" /><span className="private-note">두 사람이 모이면, 바로 시작.</span></div>}
          </section>
          <section className="queue-panel"><div><span className="queue-icon"><Users size={19} /></span><div><h3>지금 파트너를 기다리는 팀원</h3><p>{departments.map(d => `${d} ${data.queue.find(q => q.department === d)?.count ?? 0}명`).join(" · ")}</p></div></div><strong>{ready ? allWaiting : "—"}<span>명</span></strong></section>
          <div className="help-note"><span>파트너가 오지 않나요?</span><p>‘다른 파트너 찾기’를 누르면 새로운 팀원을 찾아드려요. 기존 파트너도 다시 대기하게 됩니다.</p></div>
        </aside>
      </div>
      <section className="how-it-works"><div className="how-title">좋은 연습은<br /><strong>이렇게 시작해요.</strong></div><div><span>01</span><h3>내 정보 입력하기</h3><p>닉네임과 팀, 부서만 알려주세요.</p></div><div><span>02</span><h3>매칭 시작 누르기</h3><p>같은 부서의 대기자와 바로 연결돼요.</p></div><div><span>03</span><h3>파트너와 만나기</h3><p>팀과 닉네임을 확인하고 시작해요.</p></div></section>
    </main>
    <footer><span className="footer-brand">PAIR <span>×</span> 카테부</span><span>혼자 고민하던 면접을, 함께.</span><span>AI · FULL STACK · CLOUD</span></footer>
  </div>;
}
