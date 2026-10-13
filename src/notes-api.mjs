// 메모 API 공통 처리. 서버가 src/verify-login.mjs로 확인한 사용자 ID만 믿습니다.
// 4단계: 읽기·추가·수정·삭제 모두 확인된 사용자 ID와 DB의 owner_id를 비교하고, 맞지 않으면 기본 거부합니다.
// URL·본문의 owner_id·userId·role은 소유자 판단에 쓰지 않습니다.
// 8단계: 자원마다 구역 ID(note:<id>, notice:<id>)를 붙이고, 공지 수정은 DB의 강사 목록(vault_instructors)으로만 허용합니다.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { readDeviceSession } from './device-session.mjs';

const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TABLE = 'vault_notes';
const NOTICE_TABLE = 'vault_notices';
const INSTRUCTOR_TABLE = 'vault_instructors';
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
      // 11단계: 운영에서는 승인된 기기 세션이 있어야 자료 API가 열립니다.
      deviceSecret: key,
      requireDevice: true,
    };
  }
  return services;
}

const send = (response, status, body) => response.status(status).json(body);
const notFound = (response) => send(response, 404, { error: 'NOT_FOUND' });

// 8단계 자원 ID: 서버가 요청마다 구역을 구별하도록 응답 헤더에 붙입니다(응답 본문 모양은 그대로).
export const resourceId = (kind, id) => `${kind}:${id}`;
const markResource = (response, kind, id) => response.setHeader('X-Aleph-Resource', resourceId(kind, id));
// 거부 사유는 짧은 코드와 자원 ID만 남깁니다. 사용자 ID·토큰·본문은 남기지 않습니다.
const logDeny = (reason, resource) => console.warn(`zone deny: ${reason} ${resource}`);
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
  // 11단계 기기 확인: 로그인과 별도로, 서버가 발급한 기기 세션 쿠키가 같은 사용자의 '승인된' 기기를 가리켜야 합니다.
  // 화면의 버튼·앱 설치 여부·요청 본문 값은 보지 않고, DB의 승인 상태를 요청마다 다시 확인합니다(승인 취소 즉시 반영).
  if (svc.requireDevice) {
    const session = readDeviceSession(request.headers?.cookie, svc.deviceSecret);
    let approved = false;
    if (session && session.userId === user.userId) {
      const { data, error } = await svc.db.from('vault_devices').select('id')
        .eq('id', session.deviceId).eq('user_id', user.userId).eq('status', 'approved').maybeSingle();
      if (error) { dbFailure(response, '기기 확인', error); return null; }
      approved = Boolean(data);
    }
    if (!approved) {
      send(response, 403, { error: 'DEVICE_NOT_APPROVED', message: '승인된 기기에서 기기 확인을 마친 뒤에만 자료를 볼 수 있습니다.' });
      return null;
    }
  }
  return { ...svc, userId: user.userId };
}

// 11단계 기기 API가 같은 로그인 검사·DB를 쓰도록 내보냅니다(기기 확인 자체는 요구하지 않음).
export async function authenticateLoginOnly(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  let svc;
  try { svc = getServices(); } catch {
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
  markResource(response, 'notes', 'mine');
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
  markResource(response, 'note', id);

  // 기존 행을 먼저 읽어 소유자를 서버에서 비교합니다.
  const { data: row, error: readError } = await ctx.db.from(TABLE)
    .select('id, title, body, owner_id').eq('id', id).maybeSingle();
  if (readError) return dbFailure(response, '읽기', readError);
  if (!row) return notFound(response);
  if (row.owner_id !== ctx.userId) { logDeny('owner_mismatch', resourceId('note', id)); return notFound(response); }

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

// ===== 8단계: 강사 공지 구역 =====
// /api/notices       GET 공지 목록(로그인 사용자)
// /api/notices/:id   GET 공지 한 건(로그인 사용자), PUT 공지 수정(DB 강사 목록에 있는 사용자만)
// 화면 메뉴, 요청 본문의 role·isInstructor 같은 값은 권한 판단에 쓰지 않습니다.
async function isInstructor(ctx) {
  const { data, error } = await ctx.db.from(INSTRUCTOR_TABLE).select('user_id').eq('user_id', ctx.userId).maybeSingle();
  if (error) return { error };
  return { ok: data?.user_id === ctx.userId };
}

export async function handleNoticeCollection(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  markResource(response, 'notices', 'all');
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  const { data, error } = await ctx.db.from(NOTICE_TABLE).select(COLUMNS).order('created_at', { ascending: true });
  if (error) return dbFailure(response, '공지 목록', error);
  return send(response, 200, data);
}

export async function handleNoticeItem(request, response, rawId) {
  if (!['GET', 'PUT'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  const id = typeof rawId === 'string' && UUID.test(rawId) ? rawId.toLowerCase() : null;
  if (!id) return notFound(response);
  markResource(response, 'notice', id);

  if (request.method === 'PUT') {
    // 수정 전에 DB의 강사 목록으로 권한부터 확인합니다. 본문의 role은 읽지 않습니다.
    const role = await isInstructor(ctx);
    if (role.error) return dbFailure(response, '강사 확인', role.error);
    if (!role.ok) {
      logDeny('instructor_only', resourceId('notice', id));
      return send(response, 403, { error: 'INSTRUCTOR_ONLY', message: '공지는 강사만 고칠 수 있습니다.' });
    }
    const input = readBody(request);
    const notice = input && cleanNote(input, { partial: true });
    if (!notice) return send(response, 400, { error: 'INVALID_NOTICE', message: 'title 또는 body를 확인하세요.' });
    const { data, error } = await ctx.db.from(NOTICE_TABLE).update(notice).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) return dbFailure(response, '공지 수정', error);
    return data ? send(response, 200, publicNote(data)) : notFound(response);
  }

  const { data, error } = await ctx.db.from(NOTICE_TABLE).select(COLUMNS).eq('id', id).maybeSingle();
  if (error) return dbFailure(response, '공지 읽기', error);
  return data ? send(response, 200, publicNote(data)) : notFound(response);
}

// ===== 10단계: 비공개 백업에서 메모 한 건 복원 =====
// POST /api/restore/:id — 로그인한 사용자가 자기 메모 한 건만 백업 사본(vault_notes_backup)에서 되살립니다.
// 백업 행의 id·owner_id·내용 해시(title + "\n" + body의 SHA-256)를 대조하고, 맞을 때만 그 한 건을 씁니다.
// 다른 메모는 건드리지 않고, 결과는 vault_audit에 한 줄 추가합니다(지우거나 고치지 않음). 응답·로그에 메모 내용은 넣지 않습니다.
const BACKUP_TABLE = 'vault_notes_backup';
const AUDIT_TABLE = 'vault_audit';
export const contentSha256 = (title, body) => createHash('sha256').update(`${title}\n${body ?? ''}`, 'utf8').digest('hex');

async function audit(ctx, resource, result) {
  const { error } = await ctx.db.from(AUDIT_TABLE).insert({ action: 'note_restore', resource, actor: ctx.userId, result });
  if (error) console.error('restore: 감사 기록 실패', error?.code ?? 'no-code');
}

export async function handleRestore(request, response, rawId) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await authenticate(request, response);
  if (!ctx) return;
  const id = typeof rawId === 'string' && UUID.test(rawId) ? rawId.toLowerCase() : null;
  if (!id) return notFound(response);
  const resource = resourceId('note', id);
  markResource(response, 'note', id);

  // 1) 백업 사본을 읽고 소유자를 대조합니다. 남의 백업과 없는 백업은 똑같이 404입니다.
  const { data: copy, error: copyError } = await ctx.db.from(BACKUP_TABLE)
    .select('id, owner_id, title, body, content_sha256').eq('id', id).maybeSingle();
  if (copyError) return dbFailure(response, '백업 읽기', copyError);
  if (!copy || copy.owner_id !== ctx.userId) { logDeny('backup_owner_mismatch', resource); return notFound(response); }
  // 2) 백업 내용이 기록된 해시와 같은지 다시 읽어 검증합니다.
  if (contentSha256(copy.title, copy.body) !== copy.content_sha256) {
    await audit(ctx, resource, 'backup_hash_mismatch');
    return send(response, 409, { error: 'BACKUP_HASH_MISMATCH', message: '백업 사본이 검증되지 않아 복원하지 않았습니다.' });
  }
  // 3) 같은 id가 이미 다른 사람 소유면 덮어쓰지 않습니다.
  const { data: live, error: liveError } = await ctx.db.from(TABLE).select('id, owner_id').eq('id', id).maybeSingle();
  if (liveError) return dbFailure(response, '현재 메모 읽기', liveError);
  if (live && live.owner_id !== ctx.userId) {
    await audit(ctx, resource, 'owner_conflict');
    return send(response, 409, { error: 'OWNER_CONFLICT', message: '같은 id의 다른 소유자 메모가 있어 복원하지 않았습니다.' });
  }
  // 4) 그 한 건만 씁니다.
  const values = { title: copy.title, body: copy.body ?? '' };
  const { error: writeError } = live
    ? await ctx.db.from(TABLE).update(values).eq('id', id).eq('owner_id', ctx.userId)
    : await ctx.db.from(TABLE).insert({ id, owner_id: ctx.userId, ...values });
  if (writeError) return dbFailure(response, '복원 쓰기', writeError);
  // 5) 다시 읽어 id·소유자·해시가 사본과 같은지 확인합니다.
  const { data: after, error: afterError } = await ctx.db.from(TABLE)
    .select('id, owner_id, title, body').eq('id', id).maybeSingle();
  if (afterError) return dbFailure(response, '복원 확인', afterError);
  const verified = Boolean(after) && after.id === copy.id && after.owner_id === copy.owner_id
    && contentSha256(after.title, after.body) === copy.content_sha256;
  await audit(ctx, resource, verified ? 'restored' : 'verify_failed');
  if (!verified) return send(response, 500, { error: 'RESTORE_VERIFY_FAILED' });
  return send(response, 200, { id, restored: true, ownerMatch: true, contentSha256: copy.content_sha256 });
}
