// 11단계 기기 세션 쿠키(서버 전용). 기기 확인(WebAuthn 서명 검증)에 성공한 뒤에만 발급합니다.
// HttpOnly·Secure·SameSite=Strict 쿠키라 브라우저 스크립트가 읽거나 저장소에 옮길 수 없습니다.
// 서명 키는 서버 환경변수(SUPABASE_SECRET_KEY)에서 용도별로 파생하며, 키 자체를 쿠키·로그·응답에 넣지 않습니다.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEVICE_COOKIE = '__Host-vault_device';
export const DEVICE_SESSION_SECONDS = 15 * 60;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const keyFrom = (secret) => createHash('sha256').update(`aleph-device-session:${secret}`).digest();

export function signDeviceSession({ userId, deviceId }, secret, now = Date.now()) {
  const payload = b64u(JSON.stringify({ u: userId, d: deviceId, exp: Math.floor(now / 1000) + DEVICE_SESSION_SECONDS }));
  const sig = b64u(createHmac('sha256', keyFrom(secret)).update(payload).digest());
  return `${payload}.${sig}`;
}

export function readDeviceSession(cookieHeader, secret, now = Date.now()) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 4096) return null;
  const raw = cookieHeader.split(/;\s*/u).find((part) => part.startsWith(`${DEVICE_COOKIE}=`));
  if (!raw) return null;
  const [payload, sig] = raw.slice(DEVICE_COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', keyFrom(secret)).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (typeof data?.u !== 'string' || typeof data?.d !== 'string' || !Number.isInteger(data?.exp)) return null;
  if (data.exp <= Math.floor(now / 1000)) return null;
  return { userId: data.u, deviceId: data.d };
}

export const deviceCookie = (value) => `${DEVICE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DEVICE_SESSION_SECONDS}`;
export const clearDeviceCookie = () => `${DEVICE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
