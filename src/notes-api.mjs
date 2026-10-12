// 3단계 메모 API 공통 처리. 서버가 src/verify-login.mjs로 확인한 사용자 ID만 믿습니다.
// 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다.
// 아직 소유자 검사는 하지 않습니다: 로그인한 B가 A 메모의 id를 알면 읽기·수정·삭제할 수 있습니다(4단계에서 막음).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TABLE = 'vault_notes';
const COLUMNS = 'id, title, body';

let services;
function getServices() {
  if (!services) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
    services = {
      verify: createLoginVerifier({ config, supabaseSecretKey: key }),
      db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    };
  }
  return services;
}

const send = (response, status, body) => response.status(status).json(body);

function readBody(request) {
  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

function cleanNote(input, { partial }) {
  const note = {};
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) return null;
    note.title = input.title.trim();
  } else if (!partial) return null;
  if (input.body !== undefined) {
    if (typeof input.body !== 'string' || input.body.length > 2000) return null;
    note.body = input.body;
  } else if (!partial) note.body = '';
  return Object.keys(note).length ? note : null;
}

function dbFailure(response, where, error) {
  console.error(`notes: ${where} 실패`, error?.code ?? 'no-code');
  return send(response, 502, { error: 'NOTES_UNAVAILABLE' });
}

// 공통 앞단: 캐시 금지 → 서버 설정 확인 → 토큰 검사. 실패하면 자료 없이 거부합니다.
async function authenticate(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  let svc;
  try { svc = getServices(); } catch {
    console.error('notes: 서버 환경변수가 설정되지 않았습니다.');
    send(response, 500, { error: 'SERVER_NOT_CONFIGURED' });
    return null;
  }
  const user = await svc.verify(request.headers?.authorization);
  if (!user?.userId) {
    send(response, 401, { error: 'LOGIN_REQUIRED', message: '로그인 토큰이 없거나 확인되지 않았습니다.' });
    return null;
  }
  return { ...svc, userId: user.userId };
}

// /api/notes : GET 내 메모 목록, POST 새 메모
export async function handleCollection(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  if (request.method === 'GET') {
    const { data, error } = await ctx.db.from(TABLE).select(COLUMNS)
      .eq('owner_id', ctx.userId).order('created_at', { ascending: true });
    if (error) return dbFailure(response, '목록', error);
    return send(response, 200, data);
  }
  const input = readBody(request);
  const note = input && cleanNote(input, { partial: false });
  if (!note) return send(response, 400, { error: 'INVALID_NOTE', message: 'title(1~120자)과 body(2000자 이하)를 확인하세요.' });
  if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const id = input.id ? input.id.toLowerCase() : randomUUID();
  const { error } = await ctx.db.from(TABLE).insert({ id, owner_id: ctx.userId, ...note });
  if (error?.code === '23505') return send(response, 409, { error: 'ID_EXISTS' });
  if (error) return dbFailure(response, '추가', error);
  return send(response, 201, { id });
}

// /api/notes/:id : GET 한 건, PUT 수정, DELETE 삭제 (로그인만 확인, 소유자 검사 없음)
export async function handleItem(request, response, rawId) {
  if (!['GET', 'PUT', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT, DELETE');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  const id = typeof rawId === 'string' && UUID.test(rawId) ? rawId.toLowerCase() : null;
  if (!id) return send(response, 404, { error: 'NOT_FOUND' });
  if (request.method === 'GET') {
    const { data, error } = await ctx.db.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle();
    if (error) return dbFailure(response, '읽기', error);
    return data ? send(response, 200, data) : send(response, 404, { error: 'NOT_FOUND' });
  }
  if (request.method === 'PUT') {
    const input = readBody(request);
    const note = input && cleanNote(input, { partial: true });
    if (!note) return send(response, 400, { error: 'INVALID_NOTE', message: 'title 또는 body를 확인하세요.' });
    const { data, error } = await ctx.db.from(TABLE).update(note).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) return dbFailure(response, '수정', error);
    return data ? send(response, 200, data) : send(response, 404, { error: 'NOT_FOUND' });
  }
  const { data, error } = await ctx.db.from(TABLE).delete().eq('id', id).select('id').maybeSingle();
  if (error) return dbFailure(response, '삭제', error);
  return data ? send(response, 200, { id: data.id, deleted: true }) : send(response, 404, { error: 'NOT_FOUND' });
}
