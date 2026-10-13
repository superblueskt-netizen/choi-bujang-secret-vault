// 8단계 구역 시험: 가상 요청·가짜 검사기·메모리 DB만 씁니다. 심판 판정이나 실제 배포 증거가 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide } from '../src/decider.mjs';
import { handleCollection, handleItem, handleNoticeCollection, handleNoticeItem, setServicesForTesting } from '../src/notes-api.mjs';

// ---------- 판정기 ----------
const { normal } = fixtureRequests();
const req = (method, route, path, patch = {}) => ({ ...normal, requestId: randomUUID(), method, route, path, ...patch });

test('판정기: 자기 메모 읽기·수정은 허용하고 구역 규칙 이름을 남긴다', async () => {
  for (const [m, r, p] of [['GET', 'GET /notes/:id', '/notes/n1'], ['PUT', 'PUT /notes/:id', '/notes/n1'], ['GET', 'GET /notes', '/notes']]) {
    const out = await decide(req(m, r, p));
    assert.equal(out.decision, 'allow', `${m} ${p}`);
    assert.deepEqual(out.ruleIds, ['device_registered', 'zone_own_notes']);
  }
});

test('판정기: 공지 수정은 역할 계약이 없어 거부, 공지(강사 구역) 읽기·목록도 거부', async () => {
  const write = await decide(req('PUT', 'PUT /notices/:id', '/notices/x1'));
  assert.equal(write.decision, 'deny');
  assert.equal(write.reasonCode, 'instructor_role_unverified');
  assert.equal((await decide(req('GET', 'GET /notices/:id', '/notices/x1'))).decision, 'deny');
  assert.equal((await decide(req('GET', 'GET /notices', '/notices'))).decision, 'deny');
});

test('판정기: 알 수 없는 경로·메서드 불일치·쿼리·기능 경로는 거부', async () => {
  const cases = [
    req('GET', 'GET /notes/:id/export', '/notes/n1/export'),
    req('GET', 'GET /export', '/export'),
    req('POST', 'GET /notes/:id', '/notes/n1'),
    req('GET', 'GET /notes/:id', '/notices/n1'),
    req('GET', 'GET /notes/:id', '/notes/n1/extra'),
    req('GET', 'GET /notes', '/notes', { queryLength: 12 }),
    req('DELETE', 'DELETE /notices/:id', '/notices/x1'),
    req('GET', 'GET /notes/:id', '/notes/n1', { deviceId: 'not-a-device' }),
  ];
  for (const c of cases) {
    const out = await decide(c);
    assert.equal(out.decision, 'deny', `${c.route} ${c.path}`);
    assert.equal(out.reasonCode, 'route_not_allowed');
  }
});

test('판정기: 이전 규칙 유지(미등록 기기 거부, 복합 이상 추가 확인)', async () => {
  assert.equal((await decide(req('GET', 'GET /notes/:id', '/notes/n1', { deviceRegistered: false }))).reasonCode, 'device_not_registered');
  const { suspicious } = fixtureRequests();
  assert.equal((await decide(suspicious)).decision, 'step_up');
});

// ---------- 자료 API ----------
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOTE_A = '11111111-1111-4111-8111-111111111111';
const NOTICE = '22222222-2222-4222-8222-222222222222';
const tables = {
  vault_notes: [{ id: NOTE_A, owner_id: A, title: 'A 메모', body: 'a', created_at: 1 }],
  vault_notices: [{ id: NOTICE, title: '공지', body: 'n', created_at: 1 }],
  vault_instructors: [{ user_id: T }],
};
function from(name) {
  const rows = tables[name];
  const filters = []; let op = 'select'; let payload;
  const run = () => {
    const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
    return hit.map((r) => ({ ...r }));
  };
  const q = {
    select() { return q; }, update(v) { op = 'update'; payload = v; return q; },
    eq(k, v) { filters.push([k, v]); return q; }, order() { return q; },
    async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
    then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
  };
  return q;
}
setServicesForTesting({
  verify: async (h) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B }, 'Bearer t': { userId: T } })[h] ?? null,
  db: { from },
});
async function call(fn, method, who, body, id) {
  let status; let json; const headers = {};
  await fn({ method, headers: who ? { authorization: `Bearer ${who}` } : {}, body },
    { setHeader(k, v) { headers[k] = v; }, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, id);
  return { status, json, resource: headers['X-Aleph-Resource'] };
}
const quiet = (fn) => async (...a) => { const w = console.warn; console.warn = () => {}; try { return await fn(...a); } finally { console.warn = w; } };

test('API: 메모와 공지는 서로 다른 자원 ID를 받는다', async () => {
  assert.equal((await call(handleItem, 'GET', 'a', null, NOTE_A)).resource, `note:${NOTE_A}`);
  assert.equal((await call(handleNoticeItem, 'GET', 'a', null, NOTICE)).resource, `notice:${NOTICE}`);
  assert.equal((await call(handleCollection, 'GET', 'a')).resource, 'notes:mine');
  assert.equal((await call(handleNoticeCollection, 'GET', 'a')).resource, 'notices:all');
});

test('API: A 자기 메모 허용, B의 A 메모는 404', quiet(async () => {
  assert.equal((await call(handleItem, 'GET', 'a', null, NOTE_A)).status, 200);
  assert.equal((await call(handleItem, 'GET', 'b', null, NOTE_A)).status, 404);
  assert.equal((await call(handleItem, 'PUT', 'b', { title: '탈취' }, NOTE_A)).status, 404);
  assert.equal(tables.vault_notes[0].title, 'A 메모');
}));

test('API: 학생의 공지 수정은 본문에 role을 넣어도 403, 강사는 허용', quiet(async () => {
  const student = await call(handleNoticeItem, 'PUT', 'a', { title: '바꿈', role: 'instructor', isInstructor: true }, NOTICE);
  assert.equal(student.status, 403);
  assert.equal(student.json.error, 'INSTRUCTOR_ONLY');
  assert.equal(tables.vault_notices[0].title, '공지');
  const teacher = await call(handleNoticeItem, 'PUT', 't', { title: '강사 수정' }, NOTICE);
  assert.equal(teacher.status, 200);
  assert.equal(tables.vault_notices[0].title, '강사 수정');
}));

test('API: 메뉴를 우회해 다른 구역 주소로 요청해도 자료가 나오지 않는다', async () => {
  assert.equal((await call(handleItem, 'GET', 'a', null, NOTICE)).status, 404);        // 공지 id를 메모 주소로
  assert.equal((await call(handleNoticeItem, 'GET', 'a', null, NOTE_A)).status, 404);  // 메모 id를 공지 주소로
  assert.equal((await call(handleNoticeItem, 'DELETE', 't', null, NOTICE)).status, 405);
  assert.equal((await call(handleNoticeCollection, 'GET', null)).status, 401);
  assert.equal((await call(handleNoticeItem, 'PUT', null, { title: 'x' }, NOTICE)).status, 401);
});
