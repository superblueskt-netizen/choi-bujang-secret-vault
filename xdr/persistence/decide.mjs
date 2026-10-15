// 보너스 xdr-04: 몰래 심어진 프로그램(지속성) 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/persistence/patterns.json 을 그대로 옮긴 상수입니다(근거: MITRE ATT&CK T1543.003·T1053.005·T1547.001).

export const PATTERNS = Object.freeze([
  Object.freeze({
    "name": "new-service-temp-binary",
    "technique": "T1543.003",
    "condition": "새로 생기거나 바뀐 서비스가 임시 폴더(AppData\\Local\\Temp)의 실행 파일을 가리키거나, 평소 목록에 없고 서명이 없음",
    "evidence": "T1543.003: 공격자는 서비스를 만들거나 서비스 실행 파일을 바꿔 다시 켜도 악성 프로그램이 자동 실행되게 한다."
  }),
  Object.freeze({
    "name": "scheduled-task-temp-binary",
    "technique": "T1053.005",
    "condition": "처음 보거나 이름이 임의 문자열인 예약 작업이 임시 폴더의 실행 파일을 실행함",
    "evidence": "T1053.005: 공격자는 예약 작업으로 악성 프로그램을 정해진 시각·재부팅 때 반복 실행해 머문다(선버스트 공격자도 예약 작업을 잠깐 바꿔 썼다)."
  }),
  Object.freeze({
    "name": "startup-folder-unknown-program",
    "technique": "T1547.001",
    "condition": "사용자 시작 폴더(Start Menu\\Programs\\Startup)에 평소 목록에 없는 실행 파일이 추가됨",
    "evidence": "T1547.001: 시작 폴더에 놓인 프로그램은 사용자가 로그인할 때마다 자동 실행되므로 지속성 확보에 쓰인다."
  }),
  Object.freeze({
    "name": "repeated-unsigned-service-registration",
    "technique": "T1543.003",
    "condition": "같은 출발 주소에서 서명 없는 서비스 등록이 2건 이상 연속됨",
    "evidence": "T1543.003: 원격에서 서비스를 연달아 만드는 것은 원격 실행·지속성 도구가 서비스를 심는 전형적인 형태다."
  }),
  Object.freeze({
    "name": "persistence-change-unconfirmed",
    "technique": "T1543 / T1053",
    "condition": "서비스·예약 작업·시작 항목 경보(규칙 수준 4 이상)지만 임시 폴더·서명 없음·평소 목록 밖 같은 뚜렷한 신호가 없음",
    "evidence": "T1543·T1053 의 탐지 지침은 새 서비스·예약 작업을 평소 목록과 비교해 확인하라고 하므로, 수업 경로·서명 미확인만 있는 변경은 확인이 필요하다."
  })
]);

const BLOCK_MIN = 0.85;
const ALERT_MIN = 0.5;   // alert 확신도는 0.52~0.8, record 는 0.05 로 두어 경계와 맞춥니다
const TEMP_PATH = /\\AppData\\Local\\Temp\\/iu;
const STARTUP_PATH = /\\Start Menu\\Programs\\Startup\\/iu;
const SERVICE = /서비스/u;
const TASK = /예약 작업/u;
const STARTUP = /시작 (폴더|프로그램|항목)/u;
const UNSIGNED = /서명(이)? ?없/u;                       // "서명 없는", "서명이 없습니다" (서명 미확인은 아님)
const UNKNOWN = /평소 목록에 없|처음 보는|임의 문자열|바뀌었/u;
const NOT_REGISTERED = /등록은 없/u;                       // "서비스 등록은 없습니다" → 지속성 장치가 아님

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const text = (v) => (typeof v === 'string' ? v : '');

function decision(action, confidence, names, note) {
  return { action, confidence: clamp(confidence), reason: `${names.join(', ')}: ${note}` };
}

export function decide(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const rule = alert?.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const desc = text(rule.description);
  const path = text(data.path);
  const mitre = Array.isArray(rule.mitre) ? rule.mitre.map(String) : [];
  const level = Number(rule.level) || 0;
  const count = toInt(data.count);

  const tagged = mitre.some((t) => /^T1543|^T1053|^T1547/u.test(t));
  const service = SERVICE.test(desc) && !NOT_REGISTERED.test(desc);
  const task = TASK.test(desc);
  const startup = STARTUP.test(desc) || STARTUP_PATH.test(path);
  const mechanism = service || task || startup;
  const temp = TEMP_PATH.test(path);
  const unsigned = UNSIGNED.test(desc);
  const unknown = UNKNOWN.test(desc);
  const bonus = (level >= 11 ? 0.03 : 0) + (unsigned ? 0.03 : 0) + (unknown ? 0.02 : 0);

  // 1) 뚜렷한 지속성 장치 → block
  const names = [];
  if (service && (temp || (unknown && unsigned))) names.push('new-service-temp-binary');
  if (task && temp) names.push('scheduled-task-temp-binary');
  if (startup && (STARTUP_PATH.test(path) ? unknown : temp)) names.push('startup-folder-unknown-program');
  if (service && unsigned && count >= 2) names.push('repeated-unsigned-service-registration');
  if (mechanism && names.length) {
    const c = 0.86 + bonus + (names.length >= 2 ? 0.03 : 0) + (count >= 3 ? 0.03 : 0);
    return decision('block', Math.min(c, 0.99), names, '평소 목록 밖 지속성 장치');
  }

  // 2) 지속성 관련 경보지만 뚜렷한 신호 없음 → alert
  if ((tagged || mechanism || temp) && level >= 4) {
    const c = 0.52 + Math.min(level - 4, 4) * 0.03 + (temp ? 0.03 : 0);
    return decision('alert', Math.min(c, 0.8), ['persistence-change-unconfirmed'], '확인 필요');
  }

  // 3) 신호 없음 또는 평소 그대로인 낮은 수준 경보 → record
  return { action: 'record', confidence: 0.05, reason: '평소 목록 밖 지속성 신호 없음' };
}
