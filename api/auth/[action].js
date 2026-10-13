// /api/auth/login·me·logout (로그인을 서버에서 처리하고 토큰은 HttpOnly 쿠키로만 다룸)
import { handleAuth } from '../../src/auth-api.mjs';

export default function handler(request, response) {
  return handleAuth(request, response, request.query?.action);
}
