// 12단계 서버 관측: 점검 요청이 X-Aleph-Case-Id·X-Aleph-Request-Key(또는 X-Aleph-Evidence) 헤더를 달고 들어오면
// 서버가 응답을 보내기 직전에 {caseId, requestKey, method, path, status, jsonReady, at}를 DB(aleph_check_observations)에 남깁니다.
// 메모 본문·토큰·사용자 ID·쿼리 값은 남기지 않습니다. 기록에 실패하면 관측이 없는 것으로 남고(점검은 not_run), 응답은 그대로 보냅니다.
import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CASE = /^s\d{2}-[a-z0-9-]{1,60}$/u;
const TABLE = 'aleph_check_observations';

export function readEvidence(request) {
  const h = request.headers ?? {};
  let caseId = h['x-aleph-case-id']; let requestKey = h['x-aleph-request-key'];
  if ((!caseId || !requestKey) && typeof h['x-aleph-evidence'] === 'string' && h['x-aleph-evidence'].length < 500) {
    try { const ev = JSON.parse(h['x-aleph-evidence']); caseId ??= ev.caseId ?? ev.attackId; requestKey ??= ev.requestKey; } catch { /* 무시 */ }
  }
  if (typeof caseId !== 'string' || !CASE.test(caseId) || typeof requestKey !== 'string' || !UUID.test(requestKey)) return null;
  return { caseId, requestKey: requestKey.toLowerCase() };
}

let store;
export function setObservationStoreForTesting(fake) { store = fake; }
function getStore() {
  if (store) return store;
  const url = process.env.SUPABASE_URL?.trim(); const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  store = {
    async insert(row) { const { error } = await db.from(TABLE).insert(row); return !error; },
    async byKeys(keys) { const { data, error } = await db.from(TABLE).select('case_id, request_key, status, json_ready, at').in('request_key', keys); return error ? [] : data ?? []; },
    async latest() { const { data, error } = await db.from(TABLE).select('case_id, request_key, status, json_ready, at').order('at', { ascending: false }).limit(300); return error ? [] : data ?? []; },
  };
  return store;
}
export const observationStore = () => getStore();

// API 함수를 감싸, 증거 헤더가 있는 요청만 응답 직전에 관측 기록을 남깁니다.
export function withObservation(handler) {
  return async function observed(request, response) {
    const evidence = readEvidence(request);
    if (!evidence) return handler(request, response);
    const originalStatus = response.status.bind(response);
    let pending = Promise.resolve();
    response.status = (status) => {
      const sender = originalStatus(status);
      const originalJson = sender.json.bind(sender);
      return { ...sender, json: (body) => {
        pending = (async () => {
          const s = getStore();
          if (s) {
            await s.insert({ case_id: evidence.caseId, request_key: evidence.requestKey, method: request.method ?? 'GET',
              path: String(request.url ?? '').split('?')[0].slice(0, 120), status,
              json_ready: body?.jsonReady === true && body?.blocked === true }).catch(() => false);
          }
          return originalJson(body);
        })();
        return pending;
      } };
    };
    const result = await handler(request, response);
    await pending;
    return result;
  };
}
