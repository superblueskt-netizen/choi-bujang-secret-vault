// 12단계 로컬 시험: 작전실 요약이 서버 코드·DB 값만 쓰고 본문·전체 ID를 내보내지 않는지 봅니다(가짜 DB, 심판 판정 아님).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { handleOps } from '../src/ops-api.mjs';
import { setServicesForTesting } from '../src/notes-api.mjs';
import { RULE_IDS } from '../src/decider.mjs';

const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tables = {
  vault_devices: [{ user_id: U, status: 'approved' }, { user_id: U, status: 'revoked' }, { user_id: 'other', status: 'pending' }],
  vault_audit: [{ actor: U, at: '2026-10-13T07:15:25Z', action: 'note_restore', resource: 'note:23cad896-80fe-439c-bd32-e6b0c5e66e3b', result: 'restored', body: '본문이 섞이면 안 됨' }],
};
function from(name) {
  const filters = [];
  const q = { select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, order() { return q; }, limit() { return q; },
    then(res) { return res({ data: tables[name].filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }); } };
  return q;
}
setServicesForTesting({ verify: async (h) => (h === 'Bearer u' ? { userId: U } : null), db: { from } });
async function call(who) {
  let status; let json;
  await handleOps({ method: 'GET', headers: who ? { authorization: `Bearer ${who}` } : {} },
    { setHeader() {}, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, 'summary');
  return { status, json };
}

test('작전실 요약: 실제 규칙·내 기기 상태·정책 검증·복원 기록을 서버 값으로 돌려준다', async () => {
  const { status, json } = await call('u');
  assert.equal(status, 200);
  assert.deepEqual(json.decider.ruleIds, [...RULE_IDS]);
  assert.equal(json.detection.rule.limit, 120);
  assert.equal(json.detection.events.status, '미실행');
  assert.deepEqual(json.revocation, { source: 'server-db', approved: 1, pending: 0, revoked: 1 });
  assert.equal(json.policy.verified, true);
  assert.equal(json.restores.count, 1);
  assert.equal(json.restores.recent[0].resource, 'note:23cad896…');
  const text = JSON.stringify(json);
  assert.ok(!text.includes('본문') && !text.includes(U) && !text.includes('e6b0c5e66e3b'));
});

test('작전실 요약: 로그인 없으면 401', async () => {
  assert.equal((await call(null)).status, 401);
});

test('작전실 화면: 미실행을 통과로 바꾸는 코드가 없고 본문을 그리지 않는다', () => {
  const html = readFileSync('public/ops.html', 'utf8');
  assert.match(html, /verdict: '미실행'/u);
  assert.doesNotMatch(html, /\.body\b(?!:)|note\.body|title\s*\+/u);
});
