// 9단계 탐지 함수. 계약: docs/DETECT_EVENTS.md
// 반 엔진이 검증한 가상 조회 사건만 받습니다. 브라우저가 보낸 사용자 번호는 신원으로 쓰지 않습니다.
// 사건에서 시각(at)·요청 종류(method)·가명 사용자(identity.sub)만 읽고, 그 밖의 값(메모 내용·토큰·실명 등)은
// 버립니다. 사건을 파일·로그·응답에 저장하거나 출력하지 않습니다.

const WINDOW_MS = 10 * 60 * 1000;   // 10분 구간
const BURST_LIMIT = 120;            // 120건까지는 정상, 121건부터 의심
const SUBJECT = /^[A-Za-z0-9_.:-]{1,128}$/u;

// 입력 정리: 형식이 맞는 GET 사건만 {sub, t} 두 값으로 줄입니다. 틀린 사건은 세지 않습니다.
export function readEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const reads = [];
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (event.method !== 'GET') continue;
    const sub = event.identity && typeof event.identity === 'object' ? event.identity.sub : undefined;
    if (typeof sub !== 'string' || !SUBJECT.test(sub)) continue;
    const t = typeof event.at === 'string' ? Date.parse(event.at) : NaN;
    if (!Number.isFinite(t)) continue;
    reads.push({ sub, t });
  }
  return reads;
}

// 탐지 규칙 burst_read: 같은 사용자의 GET이 어느 10분 구간에서든 120건을 넘을 때만 의심으로 봅니다.
// 다른 사용자의 사건은 합치지 않고, 10분 밖의 사건은 같은 묶음으로 세지 않습니다.
// 지역 같은 신호 하나로는 확정하지 않습니다(이 계약의 사건에는 지역·네트워크 값이 없습니다).
export function findBurst(reads) {
  const bySub = new Map();
  for (const { sub, t } of reads) {
    if (!bySub.has(sub)) bySub.set(sub, []);
    bySub.get(sub).push(t);
  }
  for (const [sub, times] of [...bySub.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= WINDOW_MS) start += 1;
      if (end - start + 1 > BURST_LIMIT) return sub;
    }
  }
  return null;
}

// 결과: 탐지 결과만 별도로 돌려줍니다. 판정기(src/decider.mjs)의 허용·거부 응답은 바꾸지 않습니다.
// 회수는 제안만 하고 직접 집행하지 않습니다. 실제 회수와 경과 시간은 심판·운영 엔진이 확인합니다.
export function detect(events) {
  const subject = findBurst(readEvents(events));
  if (!subject) return { action: 'observe' };
  return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
}
