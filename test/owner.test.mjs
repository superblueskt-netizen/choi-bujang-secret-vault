// 4단계 소유자 검사 시험: 가짜 검사기(토큰 → 사용자)와 메모리 DB로 A/B 접근을 확인합니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleCollection, handleItem, setServicesForTesting } from '../src/notes-api.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rows = [];

function query(table) {
  let filters = []; let op = 'select'; let payload; let wantRows = true;
  const match = (r) => filters.every(([k, v]) => r[k] === v);
  const q = {
    select() { wantRows = true; return q; },
    insert(v) { op = 'insert'; payload = v; return q; },
    update(v) { op = 'update'; payload = v; return q; },
    delete() { op = 'delete'; return q; },
    eq(k, v) { filters.push([k, v]); return q; },
    order() { return q; },
    async maybeSingle() { const r = run(); return { data: r[0] ?? null, error: null }; },
    then(res, rej) { return Promise.resolve(run()).then((data) => (op === 'insert' && data.error ? data : { data, error: null })).then(res, rej); },
  };
  function run() {
    if (op === 'insert') {
      if (rows.some((r) => r.id === payload.id)) return { error: { code: '23505' } };
      rows.push({ ...payload, created_at: rows.length }); return [];
    }
    const hit = rows.filter(match);
    if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
    if (op === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
    return hit.map((r) => ({ ...r }));
  }
  return q;
}
setServicesForTesting({
  verify: async (h) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } })[h] ?? null,
  db: { from: query },
});

async function call(fn, method, who, body, id) {
  let status; let json;
  await fn({ method, headers: who ? { authorization: `Bearer ${who}` } : {}, body },
    { setHeader() {}, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, id);
  return { status, json };
}

test('A/B는 자기 메모만 읽고 고치고 지운다', async () => {
  const a = await call(handleCollection, 'POST', 'a', { title: 'A 메모', body: 'a' });
  const b = await call(handleCollection, 'POST', 'b', { title: 'B 메모', body: 'b', owner_id: B });
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.deepEqual((await call(handleItem, 'GET', 'a', null, a.json.id)).json, { id: a.json.id, title: 'A 메모', body: 'a' });
  assert.equal((await call(handleCollection, 'GET', 'a')).json.length, 1);

  // 상대 메모: 읽기·수정·삭제 모두 404, 내용 그대로
  assert.equal((await call(handleItem, 'GET', 'b', null, a.json.id)).status, 404);
  assert.equal((await call(handleItem, 'PUT', 'b', { title: '탈취' }, a.json.id)).status, 404);
  assert.equal((await call(handleItem, 'DELETE', 'b', null, a.json.id)).status, 404);
  assert.equal(rows.find((r) => r.id === a.json.id).title, 'A 메모');

  // 소유자 변경·남의 이름으로 추가 거부
  assert.equal((await call(handleItem, 'PUT', 'a', { title: 'x', owner_id: B }, a.json.id)).status, 403);
  assert.equal((await call(handleCollection, 'POST', 'b', { title: 'x', owner_id: A })).status, 403);
  assert.equal(rows.find((r) => r.id === a.json.id).owner_id, A);

  // 본인 수정·삭제는 허용, 지운 뒤 GET은 404
  const put = await call(handleItem, 'PUT', 'a', { title: '고침', body: 'aa' }, a.json.id);
  assert.deepEqual(put.json, { id: a.json.id, title: '고침', body: 'aa' });
  assert.equal((await call(handleItem, 'DELETE', 'a', null, a.json.id)).status, 200);
  assert.equal((await call(handleItem, 'GET', 'a', null, a.json.id)).status, 404);
  assert.equal((await call(handleItem, 'GET', 'b', null, b.json.id)).status, 200);

  // 무로그인 거부
  assert.equal((await call(handleCollection, 'GET', null)).status, 401);
  assert.equal((await call(handleItem, 'DELETE', null, null, b.json.id)).status, 401);
});
