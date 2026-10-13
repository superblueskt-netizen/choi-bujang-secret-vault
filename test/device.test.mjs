// 11단계 로컬 시험: 진짜 ES256 키로 만든 가상 패스키와 가짜 DB를 씁니다. 실제 기기·배포·심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { handleDevice, ORIGIN, RP_ID } from '../src/device-api.mjs';
import { handleCollection, setServicesForTesting } from '../src/notes-api.mjs';
import { readDeviceSession, signDeviceSession } from '../src/device-session.mjs';

const SECRET = 'test-only-secret';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tables = { vault_devices: [], vault_device_challenges: [], vault_notes: [{ id: 'n1', owner_id: A, title: 'A 메모', body: 'a', created_at: 1 }] };
let seq = 0;
function from(name) {
  const rows = tables[name]; const filters = []; let op = 'select'; let payload;
  const run = () => {
    if (op === 'insert') {
      if (name === 'vault_devices' && rows.some((r) => r.credential_id === payload.credential_id)) return { error: { code: '23505' } };
      rows.push({ id: payload.id ?? `dev-${++seq}`, ...payload }); return [];
    }
    const hit = rows.filter((r) => filters.every(([k, v]) => r[k] === v));
    if (op === 'update') hit.forEach((r) => Object.assign(r, payload));
    if (op === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
    return hit.map((r) => ({ ...r }));
  };
  const q = {
    select() { return q; }, insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
    delete() { op = 'delete'; return q; }, eq(k, v) { filters.push([k, v]); return q; }, order() { return q; },
    async maybeSingle() { const r = run(); return r.error ? { data: null, error: r.error } : { data: r[0] ?? null, error: null }; },
    then(res, rej) { const r = run(); return Promise.resolve(r.error ? { data: null, error: r.error } : { data: r, error: null }).then(res, rej); },
  };
  return q;
}
setServicesForTesting({ verify: async (h) => ({ 'Bearer a': { userId: A }, 'Bearer b': { userId: B } })[h] ?? null,
  db: { from }, deviceSecret: SECRET, requireDevice: true });

async function call(fn, method, who, { body, cookie, arg } = {}) {
  let status; let json; const headers = {};
  await fn({ method, body, headers: { ...(who ? { authorization: `Bearer ${who}` } : {}), ...(cookie ? { cookie } : {}) } },
    { setHeader(k, v) { headers[k] = v; }, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, arg);
  return { status, json, setCookie: headers['Set-Cookie'] };
}
const sha = (b) => createHash('sha256').update(b).digest();
const b64u = (b) => Buffer.from(b).toString('base64url');
function authData(count, flags = 0x05) {
  const c = Buffer.alloc(4); c.writeUInt32BE(count);
  return Buffer.concat([sha(RP_ID), Buffer.from([flags]), c]);
}
const clientData = (type, challenge, origin = ORIGIN) => Buffer.from(JSON.stringify({ type, challenge, origin }));

// 가상 기기(패스키): 개인키는 이 시험 메모리 안에만 있습니다.
const device = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const credId = b64u(Buffer.from('credential-A-1'));
const spki = b64u(device.publicKey.export({ format: 'der', type: 'spki' }));

async function registerA() {
  const ch = await call(handleDevice, 'POST', 'a', { body: { purpose: 'register' }, arg: 'challenge' });
  return call(handleDevice, 'POST', 'a', { arg: 'register', body: { challenge: ch.json.challenge, id: credId,
    clientDataJSON: b64u(clientData('webauthn.create', ch.json.challenge)), authenticatorData: b64u(authData(0, 0x45)),
    publicKey: spki, publicKeyAlgorithm: -7 } });
}
async function verifyA(count, { who = 'a', origin } = {}) {
  const ch = await call(handleDevice, 'POST', who, { body: { purpose: 'verify' }, arg: 'challenge' });
  const cd = clientData('webauthn.get', ch.json.challenge, origin); const ad = authData(count);
  const signature = sign('sha256', Buffer.concat([ad, sha(cd)]), { key: device.privateKey, dsaEncoding: 'der' });
  return call(handleDevice, 'POST', who, { arg: 'verify', body: { challenge: ch.json.challenge, id: credId,
    clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(signature) } });
}

test('기기 세션 쿠키: 서명·만료·변조 검사', () => {
  const value = signDeviceSession({ userId: A, deviceId: 'd1' }, SECRET);
  assert.deepEqual(readDeviceSession(`x=1; __Host-vault_device=${value}`, SECRET), { userId: A, deviceId: 'd1' });
  assert.equal(readDeviceSession(`__Host-vault_device=${value}`, 'other-secret'), null);
  assert.equal(readDeviceSession(`__Host-vault_device=${value.replace(/.$/u, (c) => (c === 'A' ? 'B' : 'A'))}`, SECRET), null);
  assert.equal(readDeviceSession(`__Host-vault_device=${value}`, SECRET, Date.now() + 16 * 60 * 1000), null);
});

test('승인 전: 등록하면 pending이고, 기기 확인을 해도 쿠키가 없으며 자료는 403', async () => {
  assert.equal((await call(handleCollection, 'GET', 'a')).status, 403);
  const reg = await registerA();
  assert.equal(reg.status, 201); assert.equal(reg.json.status, 'pending');
  assert.equal(tables.vault_devices[0].status, 'pending');
  assert.ok(!('private' in tables.vault_devices[0]) && tables.vault_devices[0].public_key === spki);
  const st = await call(handleDevice, 'GET', 'a', { arg: 'status' });
  assert.deepEqual(st.json, { verified: false, approved: 0, pending: 1 });
  tables.vault_devices[0].status = 'pending';
  const v = await verifyA(1);
  assert.equal(v.status, 403); assert.equal(v.json.error, 'DEVICE_NOT_APPROVED'); assert.equal(v.setCookie, undefined);
});

test('서버 승인 뒤: 서명 확인을 마친 기기만 쿠키를 받고 기존 자료 API가 열린다', async () => {
  tables.vault_devices[0].status = 'approved';                         // 운영자가 DB에서 승인
  const v = await verifyA(2);
  assert.equal(v.status, 200); assert.match(v.setCookie, /__Host-vault_device=.*HttpOnly; Secure; SameSite=Strict/u);
  const cookie = v.setCookie.split(';')[0];
  const notes = await call(handleCollection, 'GET', 'a', { cookie });
  assert.equal(notes.status, 200); assert.equal(notes.json.length, 1);
  assert.equal((await call(handleDevice, 'GET', 'a', { arg: 'status', cookie })).json.verified, true);
  // 다른 사용자가 A의 기기 쿠키를 들고 와도 열리지 않음
  assert.equal((await call(handleCollection, 'GET', 'b', { cookie })).status, 403);
  // 승인을 거두면 같은 쿠키라도 다음 요청부터 403
  tables.vault_devices[0].status = 'revoked';
  assert.equal((await call(handleCollection, 'GET', 'a', { cookie })).status, 403);
  tables.vault_devices[0].status = 'approved';
});

test('위조·재사용 거부: 다른 출처, 같은 도전값 재사용, 서명 횟수 되돌림, 로그인 없음', async () => {
  assert.equal((await verifyA(10, { origin: 'https://evil.example' })).json.error, 'ORIGIN_MISMATCH');
  const ch = await call(handleDevice, 'POST', 'a', { body: { purpose: 'verify' }, arg: 'challenge' });
  const cd = clientData('webauthn.get', ch.json.challenge); const ad = authData(20);
  const sig = sign('sha256', Buffer.concat([ad, sha(cd)]), { key: device.privateKey, dsaEncoding: 'der' });
  const body = { challenge: ch.json.challenge, id: credId, clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig) };
  assert.equal((await call(handleDevice, 'POST', 'a', { arg: 'verify', body })).status, 200);
  assert.equal((await call(handleDevice, 'POST', 'a', { arg: 'verify', body })).json.error, 'CHALLENGE_INVALID');
  assert.equal((await verifyA(5)).json.error, 'SIGN_COUNT_REPLAY');
  assert.equal((await call(handleDevice, 'GET', null, { arg: 'status' })).status, 401);
  const forged = await call(handleCollection, 'GET', 'a', { cookie: '__Host-vault_device=eyJ1IjoiYSJ9.AAAA' });
  assert.equal(forged.status, 403);
});
