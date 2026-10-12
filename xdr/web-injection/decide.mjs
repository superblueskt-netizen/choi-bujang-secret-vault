// 보너스 xdr-02: 웹 주입 공격 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/web-injection/patterns.json 을 그대로 옮긴 상수입니다(근거: MITRE ATT&CK T1190).

export const PATTERNS = Object.freeze([
  Object.freeze({
      "name": "sql-injection-repeated",
      "technique": "T1190",
      "condition": "요청 인자에 SQL 구문(이어 붙이기·OR·SELECT 연결) 표기가 있고 같은 주소에서 5번 이상 반복",
      "evidence": "T1190: 공격자는 공개 웹 앱의 입력값에 SQL 구문을 넣어 데이터베이스를 조작하며(SQL injection), 같은 주소의 반복 시도가 대표 신호다."
  }),
  Object.freeze({
      "name": "script-injection-repeated",
      "technique": "T1190",
      "condition": "요청 인자에 스크립트 태그·삽입 표식이 있고 같은 주소에서 5번 이상 반복",
      "evidence": "T1190: 공개 웹 앱의 입력 검증 약점을 노려 스크립트를 끼워 넣는 시도는 외부 공개 앱 악용의 한 형태다."
  }),
  Object.freeze({
      "name": "path-traversal-repeated",
      "technique": "T1190",
      "condition": "경로 인자에 상위 폴더 거슬러 올라가기(../) 표기가 여러 단계로 들어 있고 5번 이상 반복",
      "evidence": "T1190: 경로 입력을 조작해 앱 밖의 파일을 읽으려는 경로 이탈은 공개 웹 앱 취약점 악용으로 다뤄진다."
  }),
  Object.freeze({
      "name": "command-separator-injection-repeated",
      "technique": "T1190",
      "condition": "요청 인자에 명령 구분자 표기가 있고 연속 요청에서 5번 이상 반복",
      "evidence": "T1190: 웹 입력을 통해 서버 명령을 이어 붙여 실행시키는 명령 주입도 공개 앱 악용 사례에 포함된다."
  }),
  Object.freeze({
      "name": "single-injection-like-request",
      "technique": "T1190",
      "condition": "주입처럼 보이는 표기·T1190 탐지 규칙이 한 번 걸렸지만 반복이 없음",
      "evidence": "T1190 탐지 권고: 웹 요청의 비정상 입력은 탐지 대상이지만 한 번뿐인 표기는 수업명·따옴표 같은 정상 입력과 구별되지 않아 확인이 필요하다."
  })
]);

const REPEAT_MIN = 5;   // 같은 주소에서 이만큼 반복돼야 '명확한 주입 시도'
// 패턴 이름 → 경보 설명·주소에서 찾는 표기 (부정문 '아닙니다/없습니다'가 붙은 경우는 표식으로 보지 않음)
const MARKERS = Object.freeze([
  ['sql-injection-repeated', /(SQL|데이터베이스 조회)[^.]*(이어 붙|표기|표식|구문)|sql-(chain|or|select)/iu],
  ['script-injection-repeated', /스크립트 (삽입|표식|표기)|script-marker/iu],
  ['path-traversal-repeated', /(거슬러 올라가|경로 이탈)|up-repeat/iu],
  ['command-separator-injection-repeated', /명령 구분자|cmd-separator/iu],
]);
const NEGATED = /(표식은 아닙니다|표기는 없습니다|공격 표기는 없|수업명|수업 단어|수업 공지)/u;

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const url = typeof alert?.data?.url === 'string' ? alert.data.url : '';
  const level = Number(alert?.rule?.level) || 0;
  const count = toInt(alert?.data?.count);
  const tagged = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
  const text = `${description} ${url}`;
  const negated = NEGATED.test(description);
  const hits = negated ? [] : MARKERS.filter(([, re]) => re.test(text)).map(([name]) => name);

  // 명확한 공격: 주입 표기 + 같은 주소 반복
  if (hits.length && count >= REPEAT_MIN) {
    const confidence = clamp(0.86 + Math.min(0.08, (count - REPEAT_MIN) / 150)
      + (level >= 10 ? 0.03 : 0) + (hits.length > 1 ? 0.02 : 0));
    return { action: 'block', confidence, reason: `${hits.join(' + ')} (T1190): 같은 주소 ${count}회 반복` };
  }
  // 애매한 시도: T1190 규칙이 걸렸거나 표기가 있지만 반복이 없음
  if (tagged || hits.length) {
    const confidence = clamp(Math.min(0.8, 0.5 + Math.max(0, level - 4) * 0.04 + (hits.length ? 0.05 : 0)));
    return { action: 'alert', confidence, reason: `single-injection-like-request (T1190): 반복 없음, 확인 필요` };
  }
  return { action: 'record', confidence: 0.02, reason: '일치 패턴 없음: 정상 웹 요청으로 기록' };
}
