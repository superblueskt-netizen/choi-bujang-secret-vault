// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 6단계부터 규칙을 하나씩 추가합니다. 규칙이 참일 때만 허용하고 나머지는 거부합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
// 계약(docs/DECIDER_REQUEST.md)에 있는 최상위 값만 읽습니다.
export const RULE_IDS = Object.freeze(['device_registered']);

const respond = (request, decision, reasonCode, ruleIds) => ({
  schema: 'aleph.decision.v1',
  requestId: request.requestId,
  decision,
  reasonCode,
  ruleIds,
});

export async function decide(request) {
  // 6단계 device_registered: 엔진이 등록됐다고 확인한 기기(true)만 허용합니다.
  // false·값 없음·그 밖의 값은 모두 거부합니다.
  if (request?.deviceRegistered !== true) {
    return respond(request ?? {}, 'deny', 'device_not_registered', ['device_registered']);
  }
  return respond(request, 'allow', 'approved', ['device_registered']);
}
