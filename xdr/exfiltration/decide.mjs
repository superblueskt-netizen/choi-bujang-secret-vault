// 보너스 xdr-06: 자료 빼돌리기(외부 반출) 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/exfiltration/patterns.json 을 그대로 옮긴 상수입니다(근거: MITRE ATT&CK T1041·T1048).

export const PATTERNS = Object.freeze([
  Object.freeze({
    "name": "bulk-transfer-new-destination",
    "technique": "T1048",
    "condition": "처음 보는·외부 목적지나 평소에 쓰지 않던 포트로 50MB 이상 또는 자료 50건 이상이 나감",
    "evidence": "T1048: 공격자는 평소 통로가 아닌 다른 프로토콜·목적지로 대량 자료를 빼내므로, 처음 보는 곳으로 가는 대용량 전송이 핵심 신호다."
  }),
  Object.freeze({
    "name": "off-hours-archive-exfil",
    "technique": "T1048",
    "condition": "수업·업무 시간 밖에 압축 파일 또는 50MB 이상 자료가 바깥으로 나감",
    "evidence": "T1048: 유출은 감시가 느슨한 시간에 압축한 묶음으로 내보내는 경우가 많아, 업무 시간 밖 압축 파일 반출은 유출 신호다."
  }),
  Object.freeze({
    "name": "archive-to-new-destination",
    "technique": "T1048",
    "condition": "압축 파일이 처음 보는 주소로 50MB 이상 올라감",
    "evidence": "T1048: 자료를 압축해 한 덩어리로 낯선 주소에 올리는 것은 다른 프로토콜을 통한 유출의 전형적인 형태다."
  }),
  Object.freeze({
    "name": "repeated-transfer-c2-channel",
    "technique": "T1041",
    "condition": "같은 목적지나 명령 통로로 대용량(50MB 이상) 전송이 5번 이상 반복됨",
    "evidence": "T1041: 공격자는 이미 열어 둔 명령 통로로 자료를 여러 번 나눠 보내므로, 같은 목적지로의 반복 대용량 전송은 유출 신호다."
  }),
  Object.freeze({
    "name": "transfer-unconfirmed",
    "technique": "T1041 / T1048",
    "condition": "외부 전송 경보(규칙 수준 4 이상)지만 50MB 미만이고 대량 건수·반복도 없음",
    "evidence": "T1041·T1048 탐지 지침은 전송량·목적지를 평소와 비교해 확인하라고 하므로, 작은 전송·실패·평소 목적지의 변화는 확인이 필요하다."
  })
]);

const BLOCK_MIN = 0.85;
const ALERT_MIN = 0.5;   // alert 확신도는 0.52~0.8, record 는 0.05 로 두어 경계와 맞춥니다
const LARGE_BYTES = 50_000_000;
const MANY_FILES = 50;
const REPEAT_MIN = 5;
const NEW_DEST = /처음 보는|처음 봅|외부 주소|평소에 쓰지 않던/u;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖/u;
const ARCHIVE = /압축 파일/u;
const C2_OR_SAME = /명령 통로|같은 목적지/u;

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const text = (v) => (typeof v === 'string' ? v : '');

export function decide(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const rule = alert?.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const desc = text(rule.description);
  const mitre = Array.isArray(rule.mitre) ? rule.mitre.map(String) : [];
  const level = Number(rule.level) || 0;
  const bytes = toInt(data.bytes);
  const files = toInt(data.files);
  const count = toInt(data.count);

  const tagged = mitre.some((t) => /^T1041|^T1048/u.test(t));
  const large = bytes >= LARGE_BYTES;
  const bulk = large || files >= MANY_FILES;
  const newDest = NEW_DEST.test(desc);
  const offHours = OFF_HOURS.test(desc);
  const archive = ARCHIVE.test(desc);

  // 1) 뚜렷한 자료 빼돌리기 → block (대용량이 아니면 block 하지 않음)
  const names = [];
  if (bulk && (newDest || files >= MANY_FILES)) names.push('bulk-transfer-new-destination');
  if (large && offHours) names.push('off-hours-archive-exfil');
  if (large && archive && newDest) names.push('archive-to-new-destination');
  if (large && count >= REPEAT_MIN && (C2_OR_SAME.test(desc) || newDest)) names.push('repeated-transfer-c2-channel');
  if (names.length) {
    const c = 0.86 + (names.length - 1) * 0.03 + (level >= 11 ? 0.03 : 0) + (bytes >= 200_000_000 ? 0.03 : 0) + (count >= 8 ? 0.02 : 0);
    return { action: 'block', confidence: clamp(Math.min(c, 0.99)), reason: `${names.join(', ')}: 평소와 다른 대용량 반출` };
  }

  // 2) 외부 전송 경보지만 작거나 한 번뿐 → alert
  if (tagged && level >= 4) {
    const c = 0.52 + Math.min(level - 4, 4) * 0.03 + (newDest ? 0.03 : 0);
    return { action: 'alert', confidence: clamp(Math.min(c, 0.8)), reason: 'transfer-unconfirmed: 확인 필요' };
  }

  // 3) 신호 없음 → record
  return { action: 'record', confidence: 0.05, reason: '평소와 다른 외부 반출 신호 없음' };
}
