// 10단계 로컬 시험: 임시 폴더의 시험 정책과 가짜 DB만 씁니다. 실제 운영 정책·DB나 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRestore, DEFAULT_PATHS, planRestore } from '../scripts/policy-restore.mjs';
import { RULE_IDS, ZONE_ROUTES } from '../src/decider.mjs';
import { contentSha256, handleItem, handleRestore, setServicesForTesting } from '../src/notes-api.mjs';

const info = { ruleIds: RULE_IDS, zoneRoutes: ZONE_ROUTES };
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'policy-'));
  const paths = { safe: join(dir, 'safe.json'), seal: join(dir, 'safe.sha256'), test: join(dir, 'test.json'), audit: join(dir, 'audit.log') };
  copyFileSync(DEFAULT_PATHS.safe, paths.safe); copyFileSync(DEFAULT_PATHS.seal, paths.seal); copyFileSync(DEFAULT_PATHS.test, paths.test);
  writeFileSync(paths.audit, '{"at":"이전 기록","action":"keep"}\n');
  return paths;
}

test('정책: 침해된 시험 정책의 차이만 보여 주고, 확인 뒤 notes만 되돌리며 다른 서비스·감사 기록은 보존', () => {
  const paths = sandbox();
  const tampered = JSON.parse(readFileSync(paths.test, 'utf8'));
  tampered.services.notes.decider.zoneRoutes.push('GET /notes');           // 메모 전체 목록을 다시 엶
  tampered.services.notes.api.noteOwnerCheck = false;                      // 소유자 검사 끔
  tampered.services.ai.allowedRoutes.push('GET /api/ai/extra');            // 다른 서비스 변경(보존 대상)
  writeFileSync(paths.test, JSON.stringify(tampered));
  const { snap, changes } = planRestore(paths, info);
  assert.equal(snap.version, 'step9-fdf4960');
  assert.deepEqual(changes.map((c) => c.path).sort(), ['notes.api.noteOwnerCheck', 'notes.decider.zoneRoutes']);
  assert.equal(readFileSync(paths.audit, 'utf8').split('\n').filter(Boolean).length, 1);  // 미리 보기는 아무것도 바꾸지 않음
  applyRestore(paths, info);
  const after = JSON.parse(readFileSync(paths.test, 'utf8'));
  assert.equal(after.services.notes.api.noteOwnerCheck, true);
  assert.ok(!after.services.notes.decider.zoneRoutes.includes('GET /notes'));
  assert.ok(after.services.ai.allowedRoutes.includes('GET /api/ai/extra'));
  const log = readFileSync(paths.audit, 'utf8').split('\n').filter(Boolean);
  assert.equal(log.length, 2); assert.match(log[0], /이전 기록/); assert.match(log[1], /policy_restore/);
  assert.deepEqual(planRestore(paths, info).changes, []);
});

test('정책: 사본이 없거나 해시가 틀리거나 판정기와 다르면 중단', () => {
  const missing = sandbox(); missing.safe += '.none';
  assert.throws(() => planRestore(missing, info), /SNAPSHOT_MISSING/);
  const bad = sandbox(); writeFileSync(bad.safe, readFileSync(bad.safe, 'utf8').replace('"denyNoteList": true', '"denyNoteList": false'));
  assert.throws(() => planRestore(bad, info), /SNAPSHOT_HASH_MISMATCH/);
  assert.throws(() => planRestore(sandbox(), { ...info, zoneRoutes: [...ZONE_ROUTES, 'GET /notes'] }), /SNAPSHOT_DECIDER_ROUTE_MISMATCH/);
});

// ---------- 메모 한 건 복원 API ----------
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOTE_B = '33333333-3333-4333-8333-333333333333';
const NOTE_A = '44444444-4444-4444-8444-444444444444';
const NOTE_BAD = '55555555-5555-4555-8555-555555555555';
const tables = {
  vault_notes: [
    { id: NOTE_B, owner_id: B, title: '침공으로 바뀐 제목', body: '변조됨' },
    { id: NOTE_A, owner_id: A, title: 'A 메모', body: 'a' },
  ],
  vault_notes_backup: [
    { id: NOTE_B, owner_id: B, title: 'B 원래 메모', body: 'b', content_sha256: contentSha256('B 원래 메모', 'b') },
    { id: NOTE_A, owner_id: A, title: 'A 메모', body: 'a', content_sha256: contentSha256('A 메모', 'a') },
    { id: NOTE_BAD, owner_id: B, title: '변조된 사본', body: 'x', content_sha256: '0'.repeat(64) },
  ],
  vault_audit: [{ action: 'earlier', resource: 'x', result: 'keep' }],
};
function from(name) {
  const rows = tables[name]; const filters = []; let op = 'select'; let payload;
  const run = () => {
    if (op === 'insert') { rows.push({ ...payload }); return []; }
    const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
    return hit.map((r) => ({ ...r }));
  };
  const q = {
    select() { return q; }, insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
    eq(k, v) { filters.push([k, v]); return q; }, order() { return q; },
    async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
    then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
  };
  return q;
}
setServicesForTesting({ verify: async (h) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } })[h] ?? null, db: { from } });
async function call(fn, method, who, id) {
  let status; let json;
  await fn({ method, headers: who ? { authorization: `Bearer ${who}` } : {} },
    { setHeader() {}, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, id);
  return { status, json };
}
const quiet = (fn) => async () => { const w = console.warn; console.warn = () => {}; try { await fn(); } finally { console.warn = w; } };

test('복원: B의 메모 한 건만 사본과 같은 id·소유자·해시로 되살리고 다른 메모·감사 기록은 보존', async () => {
  const out = await call(handleRestore, 'POST', 'b', NOTE_B);
  assert.equal(out.status, 200);
  assert.deepEqual(out.json, { id: NOTE_B, restored: true, ownerMatch: true, contentSha256: contentSha256('B 원래 메모', 'b') });
  const live = tables.vault_notes.find((r) => r.id === NOTE_B);
  assert.equal(live.owner_id, B); assert.equal(contentSha256(live.title, live.body), tables.vault_notes_backup[0].content_sha256);
  assert.equal(tables.vault_notes.find((r) => r.id === NOTE_A).title, 'A 메모');
  assert.equal(tables.vault_audit[0].action, 'earlier');
  assert.equal(tables.vault_audit.at(-1).result, 'restored');
  assert.ok(!JSON.stringify(out.json).includes('B 원래 메모'));
});

test('복원: 남의 사본·검증 안 되는 사본·로그인 없음·GET은 거부', quiet(async () => {
  assert.equal((await call(handleRestore, 'POST', 'a', NOTE_B)).status, 404);
  assert.equal((await call(handleRestore, 'POST', 'b', NOTE_A)).status, 404);
  const bad = await call(handleRestore, 'POST', 'b', NOTE_BAD);
  assert.equal(bad.status, 409); assert.equal(bad.json.error, 'BACKUP_HASH_MISMATCH');
  assert.ok(!tables.vault_notes.some((r) => r.id === NOTE_BAD));
  assert.equal((await call(handleRestore, 'POST', null, NOTE_B)).status, 401);
  assert.equal((await call(handleRestore, 'GET', 'b', NOTE_B)).status, 405);
}));

test('복원 뒤: B의 A 메모 요청은 여전히 거부, A 정상 요청은 유지', quiet(async () => {
  assert.equal((await call(handleItem, 'GET', 'b', NOTE_A)).status, 404);
  assert.equal((await call(handleItem, 'GET', 'a', NOTE_A)).status, 200);
}));
