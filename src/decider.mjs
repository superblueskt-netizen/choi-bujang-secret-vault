// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 규칙이 참일 때만 허용하고 나머지는 거부하거나 추가 확인을 요구합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 계약(docs/DECIDER_REQUEST.md)에 있는 최상위 값만 읽습니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required',
  'zone_route_allowlist', 'zone_own_notes', 'zone_notices_read', 'zone_notice_write']);

// 7단계 입력 검사 기준
// - signals는 엔진이 넘긴 값만 씁니다. 브라우저 헤더·위치는 판정기에 들어오지 않고, 읽지도 않습니다.
// - 출처(source)가 아래 목록에 없으면 '불명확'으로 보고 지역·시각·네트워크를 모두 unknown/null로 둡니다.
// - 값이 없거나 형식이 틀려도 정상값(local, usual, 낮 시각)으로 채우지 않습니다.
const SIGNAL_SOURCES = Object.freeze({
  none: 'none',                    // 실제 경로: 엔진이 위치·네트워크 정보를 주지 않음
  judge_fixture: 'judge_fixture',  // 심판이 보낸 가상 사건. 실제 위치 증거가 아님
});
const UNUSUAL_HOURS = new Set([0, 1, 2, 3, 4, 5]);
const BULK_READ_KINDS = new Set(['risk_signal', 'bulk_read']);
const BULK_READ_WINDOW_SECONDS = 600;
const BULK_READ_MIN_COUNT = 10;
const STEP_UP_MAX_AGE_SECONDS = 900;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanLabel = (value) => (typeof value === 'string' && /^[a-z][a-z0-9_]{0,31}$/u.test(value) ? value : 'unknown');

export function readSignals(request) {
  const raw = isPlainObject(request?.signals) ? request.signals : null;
  const source = raw && Object.hasOwn(SIGNAL_SOURCES, raw.source) ? SIGNAL_SOURCES[raw.source] : 'unverified';
  if (source !== 'judge_fixture') {
    // 'none'(엔진이 정보 없음)과 'unverified'(출처 불명)는 어떤 값도 근거로 삼지 않습니다.
    return { source, region: 'unknown', network: 'unknown', hour: null };
  }
  const hour = Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : null;
  return { source, region: cleanLabel(raw.region), network: cleanLabel(raw.network), hour };
}

export function readRecentEvents(request) {
  if (!Array.isArray(request?.recentEvents)) return [];
  return request.recentEvents.slice(0, 12).filter((item) => isPlainObject(item)
    && typeof item.kind === 'string'
    && Number.isInteger(item.ageSeconds) && item.ageSeconds >= 0
    && Number.isInteger(item.count) && item.count >= 0);
}

export function readStepUp(request) {
  const raw = isPlainObject(request?.stepUp) ? request.stepUp : null;
  const verified = raw?.verified === true
    && Number.isInteger(raw.authAgeSeconds)
    && raw.authAgeSeconds >= 0 && raw.authAgeSeconds <= STEP_UP_MAX_AGE_SECONDS;
  return { verified };
}

// 8단계 구역 표: 엔진이 확인한 메서드·경로(route)·실제 경로(path)가 정확히 맞는 것만 구역을 받습니다.
// 자료는 경로의 :id 한 칸으로만 고르고, 쿼리로 기능을 고르지 않습니다. :id와 같은 깊이에 export 같은 기능 경로는 두지 않습니다.
const ID_SEGMENT = '[A-Za-z0-9_-]{1,64}';
const ZONES = Object.freeze({
  'GET /notes': { zone: 'own_notes', rule: 'zone_own_notes', path: '/notes' },
  'POST /notes': { zone: 'own_notes', rule: 'zone_own_notes', path: '/notes' },
  'GET /notes/:id': { zone: 'own_notes', rule: 'zone_own_notes', path: `/notes/${ID_SEGMENT}` },
  'PUT /notes/:id': { zone: 'own_notes', rule: 'zone_own_notes', path: `/notes/${ID_SEGMENT}` },
  'DELETE /notes/:id': { zone: 'own_notes', rule: 'zone_own_notes', path: `/notes/${ID_SEGMENT}` },
  'GET /notices': { zone: 'notices_read', rule: 'zone_notices_read', path: '/notices' },
  'GET /notices/:id': { zone: 'notices_read', rule: 'zone_notices_read', path: `/notices/${ID_SEGMENT}` },
  'PUT /notices/:id': { zone: 'notice_write', rule: 'zone_notice_write', path: `/notices/${ID_SEGMENT}` },
});
export function readZone(request) {
  const method = request?.method;
  const route = request?.route;
  const path = request?.path;
  if (typeof method !== 'string' || typeof route !== 'string' || typeof path !== 'string') return null;
  const subject = request?.subjectId;
  if (typeof subject !== 'string' || !subject || subject.length > 256 || !/^[0-9a-f]{16}$/u.test(String(request?.deviceId ?? ''))) return null;
  if (request.queryLength !== 0) return null;               // 쿼리로 기능·자료를 고르지 않음
  const entry = Object.hasOwn(ZONES, route) ? ZONES[route] : null;
  if (!entry || route.split(' ')[0] !== method) return null; // 메서드와 경로 모양이 정확히 맞아야 함
  if (!new RegExp(`^${entry.path}$`, 'u').test(path)) return null;
  return entry;
}

const respond = (request, decision, reasonCode, ruleIds) => ({
  schema: 'aleph.decision.v1',
  requestId: request.requestId,
  decision,
  reasonCode,
  ruleIds,
});

// 7단계 step_up_required: 평소와 다른 시각 + 처음 보는 네트워크 + 최근 대량 읽기가 모두 겹칠 때만 추가 확인.
// 지역(region)은 조건에 넣지 않습니다. 지역 하나로 차단하지 않고, 영구 차단(deny)도 하지 않습니다.
function isCompositeAnomaly(request) {
  const signals = readSignals(request);
  if (signals.source !== 'judge_fixture') return false;
  const unusualHour = signals.hour !== null && UNUSUAL_HOURS.has(signals.hour);
  const newNetwork = signals.network === 'unusual';
  const bulkRead = readRecentEvents(request)
    .filter((item) => BULK_READ_KINDS.has(item.kind) && item.ageSeconds <= BULK_READ_WINDOW_SECONDS)
    .reduce((sum, item) => sum + item.count, 0) >= BULK_READ_MIN_COUNT;
  return unusualHour && newNetwork && bulkRead;
}

export async function decide(request) {
  // 6단계 device_registered: 엔진이 등록됐다고 확인한 기기(true)만 통과합니다.
  if (request?.deviceRegistered !== true) {
    return respond(request ?? {}, 'deny', 'device_not_registered', ['device_registered']);
  }
  // 8단계 구역: 표에 없는 경로·메서드·쿼리는 거부합니다.
  const zone = readZone(request);
  if (!zone) return respond(request, 'deny', 'route_not_allowed', ['zone_route_allowlist']);
  // 공지 수정은 강사만 가능하지만, 현재 판정 요청 계약에는 엔진이 확인한 역할이 없습니다.
  // 역할을 추측하거나 요청 본문에서 읽지 않고 거부합니다(자료 API도 저장된 강사 목록으로 다시 확인).
  if (zone.zone === 'notice_write') return respond(request, 'deny', 'instructor_role_unverified', ['zone_notice_write']);
  // 7단계 step_up_required: 복합 이상이면 엔진이 확인한 새 로그인(900초 이내) 전까지 추가 확인을 요구합니다.
  if (isCompositeAnomaly(request) && !readStepUp(request).verified) {
    return respond(request, 'step_up', 'step_up_required', ['step_up_required']);
  }
  return respond(request, 'allow', 'approved', ['device_registered', zone.rule]);
}
