// 11단계 기기 승인 API (WebAuthn 패스키, 외부 라이브러리 없이 Node 내장 crypto로 검증)
//   GET  /api/device/status     로그인 사용자의 기기 상태(등록 없음/승인 대기/승인됨)와 이번 세션 확인 여부
//   POST /api/device/challenge  {purpose:'register'|'verify'} → 한 번만 쓰는 2분짜리 도전값
//   POST /api/device/register   새 기기 공개키 등록 → 항상 'pending'(승인 대기). 승인은 서버 DB에서만 바꿉니다.
//   POST /api/device/verify     기기 서명 확인 → 승인된 기기일 때만 HttpOnly 기기 세션 쿠키 발급
//   POST /api/device/signout    기기 세션 쿠키 삭제
// 기기 개인키는 기기(OS·보안 칩) 밖으로 나오지 않고, 서버에는 공개키만 저장합니다. 브라우저 저장소에는 아무것도 넣지 않습니다.
import { createHash, createPublicKey, randomBytes, verify as verifySig } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authenticateLoginOnly } from './notes-api.mjs';
import { clearDeviceCookie, deviceCookie, readDeviceSession, signDeviceSession } from './device-session.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const APP = new URL(config.publicAppUrl);
export const RP_ID = APP.hostname;
export const ORIGIN = APP.origin;
const DEVICES = 'vault_devices';
const CHALLENGES = 'vault_device_challenges';
const CHALLENGE_SECONDS = 120;
const MAX_DEVICES = 5;
const B64U = /^[A-Za-z0-9_-]{1,4096}$/u;

const send = (response, status, body) => response.status(status).json(body);
const sha256 = (buf) => createHash('sha256').update(buf).digest();
const fromB64u = (value) => (typeof value === 'string' && B64U.test(value) ? Buffer.from(value, 'base64url') : null);
const fail = (response, status, error, message) => send(response, status, { error, ...(message ? { message } : {}) });

function readBody(request) {
  let body = request.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return null; } }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

// clientDataJSON과 authenticatorData의 공통 검사: 종류·도전값·출처·RP ID·사용자 확인 표시
export function checkCeremony({ clientDataJSON, authenticatorData, type, challenge }) {
  let client;
  try { client = JSON.parse(clientDataJSON.toString('utf8')); } catch { return 'CLIENT_DATA_INVALID'; }
  if (client?.type !== type) return 'CLIENT_DATA_TYPE';
  if (client.challenge !== challenge) return 'CHALLENGE_MISMATCH';
  if (client.origin !== ORIGIN) return 'ORIGIN_MISMATCH';
  if (!authenticatorData || authenticatorData.length < 37) return 'AUTH_DATA_INVALID';
  if (!authenticatorData.subarray(0, 32).equals(sha256(RP_ID))) return 'RP_ID_MISMATCH';
  if ((authenticatorData[32] & 0x01) !== 0x01) return 'USER_NOT_PRESENT';
  return null;
}

// 한 번만 쓰는 도전값: 꺼내면서 지웁니다. 만료됐거나 다른 사용자·용도면 거부합니다.
async function takeChallenge(ctx, purpose, challenge) {
  if (typeof challenge !== 'string' || !B64U.test(challenge)) return false;
  const { data, error } = await ctx.db.from(CHALLENGES).delete()
    .eq('challenge', challenge).eq('user_id', ctx.userId).eq('purpose', purpose).select('expires_at').maybeSingle();
  if (error || !data) return false;
  return Date.parse(data.expires_at) > Date.now();
}

async function status(ctx, request, response) {
  const { data, error } = await ctx.db.from(DEVICES).select('id, status').eq('user_id', ctx.userId);
  if (error) return fail(response, 502, 'DEVICES_UNAVAILABLE');
  const rows = data ?? [];
  const session = readDeviceSession(request.headers?.cookie, ctx.deviceSecret);
  const verified = Boolean(session && session.userId === ctx.userId
    && rows.some((row) => row.id === session.deviceId && row.status === 'approved'));
  return send(response, 200, {
    verified,
    approved: rows.filter((r) => r.status === 'approved').length,
    pending: rows.filter((r) => r.status === 'pending').length,
  });
}

async function challenge(ctx, body, response) {
  const purpose = body?.purpose;
  if (!['register', 'verify'].includes(purpose)) return fail(response, 400, 'INVALID_PURPOSE');
  const value = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + CHALLENGE_SECONDS * 1000).toISOString();
  const { error } = await ctx.db.from(CHALLENGES).insert({ challenge: value, user_id: ctx.userId, purpose, expires_at: expires });
  if (error) return fail(response, 502, 'DEVICES_UNAVAILABLE');
  const out = { challenge: value, rpId: RP_ID, timeoutMs: CHALLENGE_SECONDS * 1000 };
  if (purpose === 'verify') {
    const { data } = await ctx.db.from(DEVICES).select('credential_id').eq('user_id', ctx.userId).eq('status', 'approved');
    out.allowCredentials = (data ?? []).map((row) => row.credential_id);
  }
  return send(response, 200, out);
}

async function register(ctx, body, response) {
  const rawId = fromB64u(body?.id);
  const clientDataJSON = fromB64u(body?.clientDataJSON);
  const authenticatorData = fromB64u(body?.authenticatorData);
  const spki = fromB64u(body?.publicKey);
  const alg = body?.publicKeyAlgorithm;
  if (!rawId || !clientDataJSON || !authenticatorData || !spki || ![-7, -257].includes(alg)) return fail(response, 400, 'INVALID_REGISTRATION');
  if (!await takeChallenge(ctx, 'register', body?.challenge)) return fail(response, 400, 'CHALLENGE_INVALID');
  const problem = checkCeremony({ clientDataJSON, authenticatorData, type: 'webauthn.create', challenge: body.challenge });
  if (problem) return fail(response, 400, problem);
  try { createPublicKey({ key: spki, format: 'der', type: 'spki' }); } catch { return fail(response, 400, 'PUBLIC_KEY_INVALID'); }
  const { data: mine } = await ctx.db.from(DEVICES).select('id').eq('user_id', ctx.userId);
  if ((mine ?? []).length >= MAX_DEVICES) return fail(response, 409, 'TOO_MANY_DEVICES');
  const label = typeof body.label === 'string' ? body.label.slice(0, 40) : '';
  const { error } = await ctx.db.from(DEVICES).insert({
    user_id: ctx.userId, credential_id: rawId.toString('base64url'), public_key: spki.toString('base64url'),
    alg, sign_count: 0, status: 'pending', label,
  });
  if (error?.code === '23505') return fail(response, 409, 'DEVICE_EXISTS');
  if (error) return fail(response, 502, 'DEVICES_UNAVAILABLE');
  return send(response, 201, { status: 'pending', message: '등록 요청을 받았습니다. 서버에서 승인되기 전까지 자료는 열리지 않습니다.' });
}

async function verifyDevice(ctx, body, response) {
  const rawId = fromB64u(body?.id);
  const clientDataJSON = fromB64u(body?.clientDataJSON);
  const authenticatorData = fromB64u(body?.authenticatorData);
  const signature = fromB64u(body?.signature);
  if (!rawId || !clientDataJSON || !authenticatorData || !signature) return fail(response, 400, 'INVALID_ASSERTION');
  if (!await takeChallenge(ctx, 'verify', body?.challenge)) return fail(response, 400, 'CHALLENGE_INVALID');
  const problem = checkCeremony({ clientDataJSON, authenticatorData, type: 'webauthn.get', challenge: body.challenge });
  if (problem) return fail(response, 400, problem);
  const { data: device, error } = await ctx.db.from(DEVICES).select('id, public_key, alg, sign_count, status')
    .eq('credential_id', rawId.toString('base64url')).eq('user_id', ctx.userId).maybeSingle();
  if (error) return fail(response, 502, 'DEVICES_UNAVAILABLE');
  if (!device) return fail(response, 404, 'DEVICE_UNKNOWN');
  let valid = false;
  try {
    const key = createPublicKey({ key: Buffer.from(device.public_key, 'base64url'), format: 'der', type: 'spki' });
    const signed = Buffer.concat([authenticatorData, sha256(clientDataJSON)]);
    valid = device.alg === -7
      ? verifySig('sha256', signed, { key, dsaEncoding: 'der' }, signature)
      : verifySig('sha256', signed, key, signature);
  } catch { valid = false; }
  if (!valid) return fail(response, 401, 'SIGNATURE_INVALID');
  const count = authenticatorData.readUInt32BE(33);
  if (count !== 0 && device.sign_count !== 0 && count <= device.sign_count) return fail(response, 401, 'SIGN_COUNT_REPLAY');
  await ctx.db.from(DEVICES).update({ sign_count: count, last_verified_at: new Date().toISOString() }).eq('id', device.id);
  if (device.status !== 'approved') {
    return send(response, 403, { error: 'DEVICE_NOT_APPROVED', status: device.status, message: '이 기기는 아직 서버에서 승인되지 않았습니다.' });
  }
  response.setHeader('Set-Cookie', deviceCookie(signDeviceSession({ userId: ctx.userId, deviceId: device.id }, ctx.deviceSecret)));
  return send(response, 200, { status: 'approved', verified: true });
}

export async function handleDevice(request, response, action) {
  const routes = { status: 'GET', challenge: 'POST', register: 'POST', verify: 'POST', signout: 'POST' };
  if (!Object.hasOwn(routes, action)) return fail(response, 404, 'NOT_FOUND');
  if (request.method !== routes[action]) {
    response.setHeader('Allow', routes[action]);
    return fail(response, 405, 'METHOD_NOT_ALLOWED');
  }
  if (action === 'signout') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', clearDeviceCookie());
    return send(response, 200, { signedOut: true });
  }
  const ctx = await authenticateLoginOnly(request, response);
  if (!ctx) return;
  const body = readBody(request);
  if (action === 'status') return status(ctx, request, response);
  if (action === 'challenge') return challenge(ctx, body, response);
  if (action === 'register') return register(ctx, body, response);
  return verifyDevice(ctx, body, response);
}
