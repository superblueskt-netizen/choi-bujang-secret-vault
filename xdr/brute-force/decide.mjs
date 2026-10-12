// 보너스 xdr-01: 무차별 로그인 공격 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/brute-force/patterns.json 을 그대로 옮긴 상수입니다(근거: MITRE ATT&CK T1110).

export const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'password-guessing-burst',
    technique: 'T1110.001',
    condition: '같은 출발 주소에서 짧은 시간(몇 분) 안에 로그인 실패가 30건 이상 연속',
    evidence: 'T1110.001 Password Guessing: 한 계정에 비밀번호를 반복 대입하면 짧은 시간에 같은 주소의 인증 실패가 몰린다.',
  }),
  Object.freeze({
    name: 'password-spraying',
    technique: 'T1110.003',
    condition: '같은 출발 주소가 여러 계정(5개 이상)에 같은 비밀번호로 로그인 실패를 넣음',
    evidence: 'T1110.003 Password Spraying: 잠금을 피하려고 흔한 비밀번호 하나를 여러 계정에 돌려 넣으므로 여러 계정에 걸친 같은 비밀번호 실패가 신호다.',
  }),
  Object.freeze({
    name: 'repeated-failures-low-volume',
    technique: 'T1110',
    condition: '로그인 실패가 3~29건으로 반복되지만 대량·다계정 신호는 없음',
    evidence: 'T1110 Brute Force 탐지 권고: 반복된 인증 실패는 대입 시도의 초기 신호일 수 있으나 사용자의 단순 오타와 구별되지 않아 확인이 필요하다.',
  }),
]);

const BURST_MIN = 30;       // password-guessing-burst 기준 실패 건수
const SPRAY_MIN_ACCOUNTS = 5;
const LOW_MIN = 3;          // 이보다 적은 실패는 평범한 오타로 기록만

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };

function signals(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const level = Number(alert?.rule?.level) || 0;
  const count = toInt(alert?.data?.count);
  const listed = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').map((s) => s.trim()).filter(Boolean).length : 0;
  const numbered = toInt(description.match(/계정\s*(\d+)\s*개/u)?.[1]);
  const accounts = Math.max(listed, numbered, /여러 계정/u.test(description) ? SPRAY_MIN_ACCOUNTS : 0);
  const failed = /실패/u.test(description) || count > 0 && level >= 5;
  const samePassword = /같은 비밀번호/u.test(description);
  return { level, count, accounts, failed, samePassword };
}

export function decide(alert) {
  const s = signals(alert);
  const levelBoost = s.level >= 10 ? 0.03 : 0;

  // T1110.003: 여러 계정에 같은 비밀번호(또는 같은 주소가 계정 다수를 돎)
  // '같은 비밀번호를 여러 계정에 넣음' 자체가 대입 시도이므로 '실패'라는 낱말이 없어도 신호로 봅니다.
  if ((s.failed || s.samePassword) && s.accounts >= SPRAY_MIN_ACCOUNTS && (s.samePassword || s.count >= 10 || s.accounts >= 10)) {
    const confidence = clamp(0.86 + Math.min(0.08, s.accounts / 250) + levelBoost);
    return { action: 'block', confidence, reason: `password-spraying (T1110.003): 계정 ${s.accounts}개에 대입` };
  }
  // T1110.001: 같은 주소의 짧은 시간 대량 실패
  if (s.failed && s.count >= BURST_MIN) {
    const confidence = clamp(0.85 + Math.min(0.1, (s.count - BURST_MIN) / 400) + levelBoost);
    return { action: confidence >= 0.85 ? 'block' : 'alert', confidence,
      reason: `password-guessing-burst (T1110.001): 실패 ${s.count}건` };
  }
  // T1110 약한 신호: 반복 실패이지만 오타와 구별 불가 → 알림만
  if (s.failed && s.count >= LOW_MIN) {
    const confidence = clamp(Math.min(0.8, 0.5 + s.count * 0.025 + (s.level >= 7 ? 0.05 : 0)));
    return { action: 'alert', confidence, reason: `repeated-failures-low-volume (T1110): 실패 ${s.count}건, 확인 필요` };
  }
  const confidence = clamp(s.failed ? 0.15 : 0.02);
  return { action: 'record', confidence, reason: '일치 패턴 없음: 정상 인증 이벤트로 기록' };
}
