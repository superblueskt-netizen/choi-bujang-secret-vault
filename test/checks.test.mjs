// 12단계 점검 목록 시험: 묶음과 /api/checks가 같은 결과를 내고, GET만·24건 이하·쓰기는 not_run인지 봅니다(가짜 네트워크, 심판 판정 아님).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKS, MAX_REQUESTS, runChecks } from '../src/checks.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
import { handleChecks } from '../src/checks-api.mjs';
import { runRuleCase } from '../src/rule-cases.mjs';

const fakeFetch = (log) => async (url, init = {}) => {
  log.push({ url: String(url), method: init.method ?? 'GET' });
  if (String(url).includes('/api/checks?case=')) {
    const out = await runRuleCase(new URL(url).searchParams.get('case'));
    return new Response(JSON.stringify(out), { status: 200 });
  }
  if (String(url).endsWith('/')) return new Response('<html>자료실</html>', { status: 200 });
  if (String(url).endsWith('/data.json')) return new Response('not found', { status: 404 });
  return new Response('{"error":"LOGIN_REQUIRED"}', { status: 401 });
};
const config = { step: 12, publicAppUrl: 'https://choi-bujang-secret-vault-five-eta.vercel.app/', originalApiUrl: 'https://giixryoqzyamfedhnnpt.supabase.co/rest/v1/vault_notes' };

test('점검: GET만, 24건 이하, 쓰기 점검은 not_run, observed는 사실만', async () => {
  const log = [];
  const out = await runChecks({ appUrl: config.publicAppUrl, originalApiUrl: config.originalApiUrl, fetchImpl: fakeFetch(log) });
  assert.ok(log.length <= MAX_REQUESTS);
  assert.ok(log.every((r) => r.method === 'GET'));
  assert.equal(new Set(log.map((r) => r.url + '')).size <= log.length, true);
  assert.equal(out.total, CHECKS.length);
  assert.equal(out.blocked + out.failed + out.notRun, out.total);
  assert.deepEqual(out.attempts.filter((a) => a.result === 'not_run').map((a) => a.attackId), ['s10-restore-unauth', 's11-unsigned-write']);
  assert.equal(out.failed, 0);
  for (const a of out.attempts) assert.match(a.observed, /^(HTTP \d{3}(; jsonReady=(true|false))?|not_run)$/u);
});

test('제출 묶음과 /api/checks가 같은 목록·같은 결과', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = fakeFetch([]);
  try {
    const bundle = await runAttackChecks(config);
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
    assert.ok(out.source.startsWith('학생'));
  }
});
