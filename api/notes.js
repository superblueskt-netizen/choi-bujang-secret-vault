// 2단계: 가상 메모를 학습용 Supabase 테이블(vault_notes)에서 서버 쪽에서만 읽습니다.
// SUPABASE_URL, SUPABASE_SECRET_KEY는 Vercel 환경변수에서만 읽고
// 브라우저 파일·응답·로그에 절대 내보내지 않습니다.
// 약점(3단계 전까지): 이 함수는 로그인 없이 누구나 부를 수 있는 공개 주소입니다.
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error('notes: 서버 환경변수가 설정되지 않았습니다.');
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('vault_notes')
    .select('title, content')
    .order('id', { ascending: true });
  if (error) {
    console.error('notes: 자료를 읽지 못했습니다.', error.code ?? 'unknown');
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
  return response.status(200).json({ notes: data });
}
