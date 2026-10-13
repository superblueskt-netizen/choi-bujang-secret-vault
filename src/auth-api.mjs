// 11단계 수정: 로그인을 서버 함수로 옮깁니다(S11_KEY_EXPOSED 대응).
// - 화면에는 Supabase SDK·공개 키를 두지 않고, 로그인 토큰은 브라우저 저장소(localStorage 등)에 저장하지 않습니다.
// - 서버가 Supabase Auth로 이메일·비밀번호를 확인하고, 액세스 토큰은 HttpOnly·Secure·SameSite=Strict 쿠키로만 돌려줍니다.
//   브라우저 스크립트는 이 쿠키를 읽을 수 없습니다. 비밀번호·토큰은 응답 본문·로그에 남기지 않습니다.
//   POST /api/auth/login   {email, password} → 로그인 쿠키
//   GET  /api/auth/me      로그인 상태(이메일·사용자 ID)
//   POST /api/auth/logout  로그인·기기 세션 쿠키 삭제
import { createClient } from '@supabase/supabase-js';
import { clearDeviceCookie } from './device-session.mjs';
import { authenticateLoginOnly } from './notes-api.mjs';

export const SESSION_COOKIE = '__Host-vault_session';
const send = (response, status, body) => response.status(status).json(body);
const sessionCookie = (token, maxAge) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
const REASONS = {
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
  email_not_confirmed: '이메일 인증이 끝나지 않은 계정입니다.',
  over_request_rate_limit: '시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.',
  user_banned: '사용이 정지된 계정입니다.',
};

function readBody(request) {
  let body = request.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return null; } }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

// 테스트에서만 가짜 로그인 함수를 넣습니다.
let signInImpl;
export function setSignInForTesting(fn) { signInImpl = fn; }
async function signIn(email, password) {
  if (signInImpl) return signInImpl(email, password);
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  // 요청마다 새 클라이언트를 만들어 다른 사용자의 세션이 섞이지 않게 합니다.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return { error: error?.code ?? 'invalid_credentials' };
  return { token: data.session.access_token, expiresIn: data.session.expires_in, email: data.user?.email ?? email };
}

export async function handleAuth(request, response, action) {
  response.setHeader('Cache-Control', 'no-store');
  const routes = { login: 'POST', me: 'GET', logout: 'POST' };
  if (!Object.hasOwn(routes, action)) return send(response, 404, { error: 'NOT_FOUND' });
  if (request.method !== routes[action]) {
    response.setHeader('Allow', routes[action]);
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  if (action === 'logout') {
    response.setHeader('Set-Cookie', [clearSessionCookie(), clearDeviceCookie()]);
    return send(response, 200, { signedOut: true });
  }
  if (action === 'me') {
    const ctx = await authenticateLoginOnly(request, response);
    if (!ctx) return;
    let email = null;
    try {
      const token = request.headers?.cookie?.split(/;\s*/u).find((p) => p.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
      if (token && ctx.db?.auth?.getUser) email = (await ctx.db.auth.getUser(token)).data?.user?.email ?? null;
    } catch { email = null; }
    return send(response, 200, { signedIn: true, userId: ctx.userId, email });
  }
  const body = readBody(request);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !password || password.length > 256) {
    return send(response, 400, { error: 'INVALID_LOGIN', message: '이메일과 비밀번호를 확인하세요.' });
  }
  let result;
  try { result = await signIn(email, password); } catch {
    return send(response, 500, { error: 'SERVER_NOT_CONFIGURED' });
  }
  if (!result?.token) {
    return send(response, 401, { error: 'LOGIN_FAILED', message: REASONS[result?.error] ?? '로그인에 실패했습니다.' });
  }
  const maxAge = Number.isInteger(result.expiresIn) && result.expiresIn > 0 ? Math.min(result.expiresIn, 3600) : 3600;
  response.setHeader('Set-Cookie', sessionCookie(result.token, maxAge));
  return send(response, 200, { signedIn: true, email: result.email });
}
