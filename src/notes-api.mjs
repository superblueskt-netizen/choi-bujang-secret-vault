// 메모 API 공통 처리. 서버가 src/verify-login.mjs로 확인한 사용자 ID만 믿습니다.
// 4단계: 읽기·추가·수정·삭제 모두 확인된 사용자 ID와 DB의 owner_id를 비교하고, 맞지 않으면 기본 거부합니다.
// URL·본문의 owner_id·userId·role은 소유자 판단에 쓰지 않습니다.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TABLE = 'vault_notes';
const COLUMNS = 'id, title, body';
const OWNER_FIELDS = ['owner_id', 'ownerId', 'userId', 'user_id'];

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
const notFound = (response) => send(response, 404, { error: 'NOT_FOUND' });
const publicNote = (row) => ({ id: row.id, title: row.title, body: row.body });

// 본문에 다른 사람을 소유자로 적으면 거부합니다(자기 ID와 같으면 무시).
function ownerChangeAttempt(input, userId) {
  return OWNER_FIELDS.some((key) => input[key] !== undefined && input[key] !== userId);
}

// 테스트에서만 가짜 검사기·DB를 넣습니다.
export function setServicesForTesting(fake) { services = fake; }

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
  if (ownerChangeAttempt(input, ctx.userId)) {
    return send(response, 403, { error: 'OWNER_MISMATCH', message: '다른 사용자를 소유자로 저장할 수 없습니다.' });
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    return send(response, 400, { error: 'INVALID_ID', message: 'id는 UUID여야 합니다.' });
  }
  const id = input.id ? input.id.toLowerCase() : randomUUID();
  const { error } = await ctx.db.from(TABLE).insert({ id, owner_id: ctx.userId, ...note });
  if (error?.code === '23505') return send(response, 409, { error: 'ID_EXISTS' });
  if (error) return dbFailure(response, '추가', error);
  return send(response, 201, { id });
}

// /api/notes/:id : GET 한 건, PUT 수정, DELETE 삭제 — 모두 본인 메모만 허용
// 남의 메모와 없는 메모는 똑같이 404로 답해 존재 여부를 알려 주지 않습니다.
export async function handleItem(request, response, rawId) {
  if (!['GET', 'PUT', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT, DELETE');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  const id = typeof rawId === 'string' && UUID.test(rawId) ? rawId.toLowerCase() : null;
  if (!id) return notFound(response);

  // 기존 행을 먼저 읽어 소유자를 서버에서 비교합니다.
  const { data: row, error: readError } = await ctx.db.from(TABLE)
    .select('id, title, body, owner_id').eq('id', id).maybeSingle();
  if (readError) return dbFailure(response, '읽기', readError);
  if (!row || row.owner_id !== ctx.userId) return notFound(response);

  if (request.method === 'GET') return send(response, 200, publicNote(row));

  if (request.method === 'PUT') {
    const input = readBody(request);
    if (input && ownerChangeAttempt(input, ctx.userId)) {
      return send(response, 403, { error: 'OWNER_CHANGE_FORBIDDEN', message: '메모 소유자는 바꿀 수 없습니다.' });
    }
    const note = input && cleanNote(input, { partial: true });
    if (!note) return send(response, 400, { error: 'INVALID_NOTE', message: 'title 또는 body를 확인하세요.' });
    // 기존 행 조건(id + owner_id)으로만 고치고, 새 행의 owner_id는 쓰지 않으므로 본인으로 유지됩니다.
    const { data, error } = await ctx.db.from(TABLE).update(note)
      .eq('id', id).eq('owner_id', ctx.userId).select('id, title, body, owner_id').maybeSingle();
    if (error) return dbFailure(response, '수정', error);
    if (!data || data.owner_id !== ctx.userId) return notFound(response);
    return send(response, 200, publicNote(data));
  }

  const { data, error } = await ctx.db.from(TABLE).delete()
    .eq('id', id).eq('owner_id', ctx.userId).select('id').maybeSingle();
  if (error) return dbFailure(response, '삭제', error);
  return data ? send(response, 200, { id: data.id, deleted: true }) : notFound(response);
}
