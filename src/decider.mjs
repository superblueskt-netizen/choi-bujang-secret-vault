// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 규칙이 참일 때만 허용하고 나머지는 거부하거나 추가 확인을 요구합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 계약(docs/DECIDER_REQUEST.md)에 있는 최상위 값만 읽습니다.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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
  // 7단계 step_up_required: 복합 이상이면 엔진이 확인한 새 로그인(900초 이내) 전까지 추가 확인을 요구합니다.
  if (isCompositeAnomaly(request) && !readStepUp(request).verified) {
    return respond(request, 'step_up', 'step_up_required', ['step_up_required']);
  }
  return respond(request, 'allow', 'approved', ['device_registered']);
}
