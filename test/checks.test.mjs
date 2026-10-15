// 12단계 점검 시험: 제출 묶음 결과가 서버 관측(caseId·requestKey)과 연결된 것만 HTTP 상태를 적는지 봅니다(가짜 서버·메모리 기록, 심판 판정 아님).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKS, MAX_REQUESTS, runChecks } from '../src/checks.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
import { handleChecks } from '../src/checks-api.mjs';
import { runRuleCase } from '../src/rule-cases.mjs';
import { setObservationStoreForTesting, withObservation } from '../src/observe.mjs';

let rows = [];
setObservationStoreForTesting({
  async insert(row) { rows.push({ ...row, at: new Date(Date.now() + rows.length).toISOString() }); return true; },
  async byKeys(keys) { return rows.filter((r) => keys.includes(r.request_key)); },
  async latest() { return rows; },
});
const denyHandler = withObservation(async (req, res) => res.status(401).json({ error: 'LOGIN_REQUIRED' }));
const checksHandler = withObservation((req, res) => handleChecks(req, res));

// 가짜 서버: 실제 래퍼(withObservation)와 /api/checks 처리 함수를 그대로 부릅니다.
function fakeFetch(log, { dropObservation = false } = {}) {
  return async (url, init = {}) => {
    const u = new URL(url); log.push({ url: String(url), method: init.method ?? 'GET', evidence: init.alephEvidence });
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (dropObservation) { delete headers['x-aleph-request-key']; delete headers['x-aleph-evidence']; }
    const req = { method: init.method ?? 'GET', url: u.pathname + u.search, headers, query: Object.fromEntries(u.searchParams) };
    let status = 200; let body = null;
    const res = { setHeader() {}, status(s) { status = s; return { json: (b) => { body = b; return b; } }; } };
    await (u.pathname === '/api/checks' ? checksHandler : denyHandler)(req, res);
    return new Response(JSON.stringify(body), { status });
  };
}
const appUrl = 'https://choi-bujang-secret-vault-five-eta.vercel.app/';

test('제출 묶음: GET만·24건 이하, 서버가 관측한 요청만 HTTP 상태, 나머지는 not_run', async () => {
  rows = []; const log = [];
  const out = await runChecks({ appUrl, fetchImpl: fakeFetch(log) });
  assert.ok(log.length <= MAX_REQUESTS && log.every((r) => r.method === 'GET'));
  assert.equal(out.total, CHECKS.length);
  assert.equal(out.failed, 0);
  assert.deepEqual(out.attempts.filter((a) => a.result === 'not_run').map((a) => a.attackId),
    ['s01-static-notes', 's02-static-copy', 's05-direct-table', 's10-restore-unauth', 's11-unsigned-write']);
  for (const a of out.attempts.filter((x) => x.result !== 'not_run')) {
    const sentReq = log.find((r) => r.evidence?.attackId === a.attackId);
    assert.equal(a.alephEvidence.caseId, a.attackId);
    assert.equal(a.alephEvidence.requestKey, sentReq.evidence.requestKey);
    assert.match(a.observed, /^HTTP \d{3}(; jsonReady=(true|false))?$/u);
  }
});

test('서버 관측이 연결되지 않으면 HTTP 상태를 적지 않고 not_run', async () => {
  rows = [];
  const out = await runChecks({ appUrl, fetchImpl: fakeFetch([], { dropObservation: true }) });
  assert.equal(out.notRun, out.total);
});

test('제출 묶음과 /api/checks(서버 관측 기록)가 같은 결과', async () => {
  rows = [];
  const real = globalThis.fetch; globalThis.fetch = fakeFetch([]);
  try {
    const bundle = await runAttackChecks({ step: 12, publicAppUrl: appUrl });
    let json;
    await handleChecks({ method: 'GET', query: {} }, { setHeader() {}, status: () => ({ json: (j) => { json = j; } }) });
    assert.deepEqual(bundle, json.attempts.map(({ attackId, expected, observed }) => ({ attackId, expected, observed })));
  } finally { globalThis.fetch = real; }
});

test('규칙 점검: 출처와 ALEPH SDP 엔진, 엔진 집행은 not_run', async () => {
  for (const c of CHECKS.filter((x) => x.json)) {
    const out = await runRuleCase(c.attackId);
    assert.equal(out.jsonReady, true); assert.equal(out.blocked, true);
    assert.equal(out.engine, 'ALEPH SDP 엔진'); assert.equal(out.engineEnforced, 'not_run');
  }
});
