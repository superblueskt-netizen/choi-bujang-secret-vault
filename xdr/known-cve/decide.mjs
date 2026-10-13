// 보너스 xdr-03: 알려진 취약점(CVE-2021-44228, Log4Shell) 악용 판단기. 이 파일 하나만으로 계산합니다.
// 다른 파일·패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않습니다.
// 패턴은 xdr/known-cve/patterns.json 을 그대로 옮긴 상수입니다(근거: CVE-2021-44228, MITRE ATT&CK T1190).

export const PATTERNS = Object.freeze([
  Object.freeze({
    "name": "jndi-lookup-in-header",
    "technique": "T1190",
    "condition": "요청 머리글(User-Agent 등)에 완전한 원격 조회 구문 ${jndi:<ldap|ldaps|rmi|dns|iiop|http>://...} 이 있음",
    "evidence": "CVE-2021-44228: 공격자가 기록되는 머리글에 JNDI 조회 구문을 넣으면 Log4j 가 외부 주소에서 코드를 받아 실행할 수 있다."
  }),
  Object.freeze({
    "name": "jndi-lookup-in-param",
    "technique": "T1190",
    "condition": "요청 주소·인자에 완전한 원격 조회 구문 ${jndi:<프로토콜>://...} 이 있음",
    "evidence": "CVE-2021-44228: 기록되는 요청 인자 역시 같은 조회 구문으로 원격 코드 실행을 일으키며, T1190 의 공개 앱 취약점 악용에 해당한다."
  }),
  Object.freeze({
    "name": "jndi-lookup-obfuscated",
    "technique": "T1190",
    "condition": "${lower:j}·${::-n} 같은 중첩 조회로 쪼갰지만 풀면 ${jndi:<프로토콜>:// 이 되는 구문",
    "evidence": "CVE-2021-44228: Log4j 는 중첩된 조회를 먼저 풀어 처리하므로, 쪼갠 표기도 풀린 뒤 같은 원격 조회로 실행된다."
  }),
  Object.freeze({
    "name": "cve-scanner-trace",
    "technique": "T1190",
    "condition": "알려진 취약점 점검 도구 이름(nuclei·log4j-scan·zgrab·masscan 등)이 요청 머리글에 있음",
    "evidence": "T1190: 공격자는 공개 앱을 악용하기 전에 공개 취약점 점검 도구로 대상을 훑으므로, 점검 도구 흔적은 악용 시도의 전 단계 신호다."
  }),
  Object.freeze({
    "name": "cve-reference-without-lookup",
    "technique": "T1190",
    "condition": "T1190 탐지 규칙이 걸렸거나 CVE 번호·jndi 단어·잘린 ${ 표기가 있지만 완전한 원격 조회 구문은 없음",
    "evidence": "CVE-2021-44228 악용에는 완전한 ${jndi:<프로토콜>:// 구문이 필요하므로, 이름·단어·조각만 있는 요청은 검색·수업 노트와 구별되지 않아 확인이 필요하다."
  })
]);

const BLOCK_MIN = 0.85;
const ALERT_MIN = 0.5;
// 완전한 원격 조회 구문: ${jndi:<프로토콜>://
const FULL_LOOKUP = /\$\{\s*jndi\s*:\s*(ldaps?|rmi|dns|iiop|nis|nds|corba|https?):\/\//iu;
// 중첩 조회 풀기: ${lower:j} ${upper:J} ${::-n} ${env:X:-d} 같은 조각을 그 글자로 바꿉니다(최대 5번).
const NESTED = /\$\{(?:lower|upper|::-|[a-z]+:[^}:]*:-)\s*:?([^${}]*)\}/giu;
const SCANNER = /\b(nuclei|log4j-?scan|zgrab|masscan|jndi-?exploit|interactsh)\b/iu;
// 조각 신호: CVE 번호, jndi 단어, 잘린 ${ 표기
const FRAGMENT = /CVE-2021-44228|jndi|\$\{/iu;

const clamp = (n) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
const toInt = (v) => { const n = Number.parseInt(String(v ?? ''), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
const text = (v) => (typeof v === 'string' ? v : '');

function deobfuscate(s) {
  let out = s;
  for (let i = 0; i < 5 && NESTED.test(out); i += 1) {
    NESTED.lastIndex = 0;
    out = out.replace(NESTED, (_, ch) => ch);
  }
  NESTED.lastIndex = 0;
  return out;
}

export function decide(alert) {
  const data = alert?.data && typeof alert.data === 'object' ? alert.data : {};
  const rule = alert?.rule && typeof alert.rule === 'object' ? alert.rule : {};
  const header = [data.useragent, data.referer, data.header, data.headers].map(text).join(' ');
  const param = [data.url, data.query, data.body].map(text).join(' ');
  const tagged = Array.isArray(rule.mitre) && rule.mitre.includes('T1190');
  const count = toInt(data.count);
  const level = Number(rule.level) || 0;

  const inHeader = FULL_LOOKUP.test(header);
  const inParam = FULL_LOOKUP.test(param);
  const obfuscated = !inHeader && !inParam && FULL_LOOKUP.test(deobfuscate(`${header} ${param}`));
  const scanner = SCANNER.test(header);

  // 1) 완전한 원격 조회 구문 → 명확한 공격(block)
  if (inHeader || inParam || obfuscated) {
    const names = [inHeader && 'jndi-lookup-in-header', inParam && 'jndi-lookup-in-param',
      obfuscated && 'jndi-lookup-obfuscated', scanner && 'cve-scanner-trace'].filter(Boolean);
    let c = obfuscated ? 0.88 : 0.9;
    if (inHeader && inParam) c += 0.03;
    if (count >= 2) c += 0.03;
    if (tagged) c += 0.02;
    if (scanner) c += 0.02;
    return { action: 'block', confidence: clamp(Math.min(c, 0.99)), reason: `${names.join(', ')} (CVE-2021-44228): 완전한 원격 조회 구문` };
  }

  // 2) 점검 도구 흔적만 → 확인 필요(alert)
  if (scanner) {
    return { action: 'alert', confidence: clamp(0.7 + (tagged ? 0.05 : 0)), reason: 'cve-scanner-trace (T1190): 점검 도구 흔적, 조회 구문 없음' };
  }

  // 3) T1190 규칙·CVE 이름·jndi 단어·조각만 있음 → 확인 필요(alert)
  if (tagged || FRAGMENT.test(`${header} ${param}`)) {
    const c = 0.55 + Math.min(Math.max(level - 4, 0), 4) * 0.03 + (count >= 2 ? 0.03 : 0);
    return { action: 'alert', confidence: clamp(Math.min(c, 0.8)), reason: 'cve-reference-without-lookup (T1190): 완전한 조회 구문 없음, 확인 필요' };
  }

  // 4) 아무 신호 없음 → 정상(record)
  return { action: 'record', confidence: 0.05, reason: '알려진 취약점 악용 신호 없음' };
}
