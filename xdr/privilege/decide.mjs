// 보너스 xdr-05: 권한 가로채기 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/privilege/patterns.json 을 그대로 옮긴 상수입니다(근거: MITRE ATT&CK T1068·T1078).

export const PATTERNS = Object.freeze([
  Object.freeze({
    "name": "admin-group-add",
    "technique": "T1078",
    "condition": "평범한 계정이 관리자 그룹(administrators)에 추가됨 — 원격 주소·여러 계정 동시 추가·빠졌다 다시 들어옴이면 더 뚜렷함",
    "evidence": "T1078: 공격자는 손에 넣은 정상 계정을 관리자 그룹에 넣어 높은 권한을 정상 사용자처럼 쓴다."
  }),
  Object.freeze({
    "name": "unseen-admin-command",
    "technique": "T1068",
    "condition": "방금 관리자가 됐거나 처음 보는 주소·다른 계정 권한으로 관리자 명령을 실행하거나 세션이 관리자 권한으로 바뀜",
    "evidence": "T1068: 권한 상승을 악용한 공격자는 얻은 관리자 권한으로 곧바로 평소에 없던 관리자 명령을 실행한다."
  }),
  Object.freeze({
    "name": "off-hours-privilege-use",
    "technique": "T1078",
    "condition": "수업·업무 시간 밖에 관리자 그룹 추가나 관리자 명령 실행이 있음",
    "evidence": "T1078: 탈취한 정상 계정은 주인이 없는 시간에 쓰이는 경우가 많아, 업무 시간 밖 권한 사용은 도용 신호다."
  }),
  Object.freeze({
    "name": "privilege-change-unconfirmed",
    "technique": "T1068 / T1078",
    "condition": "권한·그룹 관련 경보(규칙 수준 4 이상)지만 관리자 그룹 추가·처음 보는 관리자 명령·업무 시간 밖 사용이 없음",
    "evidence": "T1078 탐지 지침은 계정 권한 변경을 평소 행동과 비교해 확인하라고 하므로, 취소된 상승·과제 그룹 추가·평소 주소의 명령은 확인이 필요하다."
  })
]);

const BLOCK_MIN = 0.85;
const ALERT_MIN = 0.5;   // alert 확신도는 0.52~0.8, record 는 0.05 로 두어 경계와 맞춥니다
const ADMIN_GROUP = /^administrators?$/iu;
const ADMIN_JOIN = /관리자 그룹에 (추가|들어|다시)|다시 관리자로 들어/u;
const NOT_ADMIN = /관리자 그룹은 아닙니다/u;
const ADMIN_USE = /관리자 명령을 실행했|권한 명령을 실행했|관리자 권한으로 바뀌었|명령 실행이 같이/u;
const UNSEEN = /처음 보는|처음 봅|다른 계정의 권한|방금 관리자가 된|원격 주소/u;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖|업무처럼 보이지 않는 시각/u;

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const text = (v) => (typeof v === 'string' ? v : '');

export function decide(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const rule = alert?.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const desc = text(rule.description);
  const mitre = Array.isArray(rule.mitre) ? rule.mitre.map(String) : [];
  const level = Number(rule.level) || 0;
  const count = toInt(data.count);

  const tagged = mitre.some((t) => /^T1068|^T1078/u.test(t));
  const adminGroup = !NOT_ADMIN.test(desc) && (ADMIN_GROUP.test(text(data.group)) || ADMIN_JOIN.test(desc));
  const adminUse = ADMIN_USE.test(desc);
  const unseen = UNSEEN.test(desc);
  const offHours = OFF_HOURS.test(desc);

  // 1) 뚜렷한 권한 가로채기 → block
  const names = [];
  if (adminGroup) names.push('admin-group-add');
  if (adminUse && (unseen || adminGroup)) names.push('unseen-admin-command');
  if (offHours && (adminGroup || adminUse)) names.push('off-hours-privilege-use');
  if (names.length) {
    const c = 0.86 + (names.length - 1) * 0.03 + (level >= 11 ? 0.03 : 0) + (count >= 2 ? 0.03 : 0) + (unseen ? 0.02 : 0);
    return { action: 'block', confidence: clamp(Math.min(c, 0.99)), reason: `${names.join(', ')}: 평소와 다른 권한 상승` };
  }

  // 2) 권한·그룹 경보지만 뚜렷한 신호 없음 → alert
  if (tagged && level >= 4) {
    const c = 0.52 + Math.min(level - 4, 4) * 0.03;
    return { action: 'alert', confidence: clamp(Math.min(c, 0.8)), reason: 'privilege-change-unconfirmed: 확인 필요' };
  }

  // 3) 신호 없음 → record
  return { action: 'record', confidence: 0.05, reason: '평소와 다른 권한 상승 신호 없음' };
}
