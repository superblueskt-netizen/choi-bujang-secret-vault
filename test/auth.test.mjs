// 11단계 수정 시험: 서버 로그인은 토큰을 HttpOnly 쿠키로만 주고, 화면 묶음·설정에는 키 값이 없어야 합니다(로컬 연습).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { handleAuth, setSignInForTesting } from '../src/auth-api.mjs';
import { handleCollection, setServicesForTesting } from '../src/notes-api.mjs';

const TOKEN = randomBytes(24).toString('base64url');
setSignInForTesting(async (email, password) => (password === 'right' ? { token: TOKEN, expiresIn: 3600, email } : { error: 'invalid_credentials' }));
setServicesForTesting({ verify: async (h) => (h === `Bearer ${TOKEN}` ? { userId: 'u1' } : null),
  db: { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, then: (r) => r({ data: [], error: null }) }) } });

async function call(fn, method, { body, cookie } = {}, arg) {
  let status; let json; const headers = {};
  await fn({ method, body, headers: cookie ? { cookie } : {} },
    { setHeader(k, v) { headers[k] = v; }, status: (s) => { status = s; return { json: (j) => { json = j; } }; } }, arg);
  return { status, json, setCookie: headers['Set-Cookie'] };
}

test('서버 로그인: 토큰은 응답 본문에 없고 HttpOnly 쿠키로만 온다', async () => {
  const ok = await call(handleAuth, 'POST', { body: { email: 'a@test.invalid', password: 'right' } }, 'login');
  assert.equal(ok.status, 200);
  assert.ok(!JSON.stringify(ok.json).includes(TOKEN));
  assert.match(ok.setCookie, /^__Host-vault_session=.+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600$/u);
  const bad = await call(handleAuth, 'POST', { body: { email: 'a@test.invalid', password: 'wrong' } }, 'login');
  assert.equal(bad.status, 401); assert.equal(bad.setCookie, undefined);
  const out = await call(handleAuth, 'POST', {}, 'logout');
  assert.ok(out.setCookie.every((c) => c.includes('Max-Age=0')));
});

test('쿠키 로그인으로 자료 API를 부를 수 있고, 쿠키가 없으면 401', async () => {
  assert.equal((await call(handleCollection, 'GET', { cookie: `__Host-vault_session=${TOKEN}` })).status, 200);
  assert.equal((await call(handleCollection, 'GET', {})).status, 401);
});

test('화면 묶음·설정에 키 값과 브라우저 저장소 사용이 없다', () => {
  const files = readdirSync('public').filter((f) => /\.(html|js|webmanifest|json|svg)$/u.test(f) && f !== 'aleph.json');
  for (const f of files) {
    const text = readFileSync(`public/${f}`, 'utf8');
    assert.doesNotMatch(text, /sb_publishable_|sb_secret_|eyJ[A-Za-z0-9_-]{20,}|PRIVATE KEY|localStorage|sessionStorage|indexedDB/u, f);
  }
  assert.doesNotMatch(readFileSync('aleph.config.json', 'utf8'), /sb_publishable_|sb_secret_/u);
});
