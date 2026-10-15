// 보너스 xdr-06 대응 연결: decide 결과 중 차단 후보만 ZTNA 판정기의 XDR 거부 규칙 목록에 넣고,
// 알림(alert·block)은 xdr/alerts.log 에 한 줄씩 쌓습니다.
// decide.mjs 는 판단만 하고, 파일 쓰기·판정기 연결은 이 파일만 합니다. src/decider.mjs 의 기존 규칙은 고치지 않습니다.
// 실행: node xdr/exfiltration/respond.mjs
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { decide } from './decide.mjs';

const ROOT = new URL('../../', import.meta.url);
const FIXTURE = new URL('xdr/fixtures/exfiltration.json', ROOT);
const RULES_FILE = new URL('xdr/ztna-deny-rules.json', ROOT);   // 판정기가 확인 단계로 읽는 XDR 거부 규칙 목록
const ALERT_LOG = new URL('xdr/alerts.log', ROOT);
const BLOCK_MIN = 0.85;
const TTL_MINUTES = 60;                                             // 목적지 차단 규칙은 1시간 뒤 만료

const isIp = (v) => typeof v === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/u.test(v);

function loadRules() {
  if (!existsSync(RULES_FILE)) return { schema: 'aleph.xdr.deny-rules.v1', rules: [] };
  return JSON.parse(readFileSync(RULES_FILE, 'utf8'));
}

// 판정 결과로 목적지 차단 규칙을 만듭니다. 막는 단위는 전송 목적지(dstip)입니다.
// 보내는 사람(srcip·계정)은 막지 않습니다 — 같은 사람의 정상 자료실 사용까지 막히기 때문입니다. 정상 사용자 보호:
//  - block 이고 확신도 0.85 이상인 경보의 목적지만 후보
//  - 정상(record)·확인 필요(alert) 경보에 한 번이라도 나온 목적지(예: 자료실 주소)는 넣지 않음
export function buildDenyRules(alerts, decisions, now = new Date()) {
  const protectedDst = new Set();
  const candidates = new Map();
  alerts.forEach((alert, i) => {
    const d = decisions[i];
    const dst = alert?.data?.dstip;
    if (!isIp(dst)) return;
    if (d.action !== 'block') protectedDst.add(dst);
    if (d.action === 'block' && d.confidence >= BLOCK_MIN) {
      const entry = candidates.get(dst) ?? { dst, alertIds: [], reasons: new Set(), maxConfidence: 0 };
      entry.alertIds.push(alert.id);
      for (const name of d.reason.split(':')[0].split(', ')) entry.reasons.add(name.trim());
      entry.maxConfidence = Math.max(entry.maxConfidence, d.confidence);
      candidates.set(dst, entry);
    }
  });
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000).toISOString();
  const skipped = [...candidates.keys()].filter((dst) => protectedDst.has(dst));
  const rules = [...candidates.values()].filter((c) => !protectedDst.has(c.dst)).map((c) => ({
    ruleId: `xdr.exfiltration.deny.${c.dst}`,
    effect: 'deny',
    match: { destinationIp: c.dst },
    reasonCode: 'xdr_exfiltration',
    evidenceAlertIds: c.alertIds,
    patterns: [...c.reasons],
    confidence: c.maxConfidence,
    createdAt: now.toISOString(),
    expiresAt,
  }));
  return { rules, skipped };
}

// 판정기에 꽂는 확인 단계: 만료되지 않은 차단 규칙에 전송 목적지가 걸리면 거부 근거를 돌려줍니다.
// 지금 판정기 요청 계약(docs/DECIDER_REQUEST.md)에는 목적지가 없어서, 엔진이 목적지를 넘겨줄 때만 쓸 수 있습니다.
export function checkXdrDeny({ destinationIp, at = new Date() }, rules = loadRules().rules) {
  const now = new Date(at).getTime();
  const hit = rules.find((r) => r.match?.destinationIp === destinationIp && new Date(r.expiresAt).getTime() > now);
  return hit ? { decision: 'deny', reasonCode: hit.reasonCode, ruleIds: [hit.ruleId] } : null;
}

export function respond({ now = new Date() } = {}) {
  const alerts = JSON.parse(readFileSync(FIXTURE, 'utf8')).alerts;
  const decisions = alerts.map((a) => decide(a));
  const { rules, skipped } = buildDenyRules(alerts, decisions, now);

  // 판정기 거부 규칙 목록: 같은 ruleId 는 새 만료 시각으로 바꾸고, 다른 출처의 규칙은 그대로 둡니다.
  const store = loadRules();
  const kept = store.rules.filter((r) => !rules.some((n) => n.ruleId === r.ruleId));
  writeFileSync(RULES_FILE, `${JSON.stringify({ ...store, rules: [...kept, ...rules] }, null, 2)}\n`, 'utf8');

  // 알림 로그: 이미 남긴 경보 번호는 다시 쓰지 않습니다. 자료 내용·비밀값은 쓰지 않습니다.
  const logged = existsSync(ALERT_LOG) ? readFileSync(ALERT_LOG, 'utf8') : '';
  const lines = alerts.map((a, i) => ({ a, d: decisions[i] }))
    .filter(({ a, d }) => d.action !== 'record' && !logged.includes(` alert=${a.id} `))
    .map(({ a, d }) => `${now.toISOString()} module=exfiltration alert=${a.id} action=${d.action} confidence=${d.confidence} srcip=${a.data?.srcip ?? '-'} user=${a.data?.srcuser ?? '-'} dstip=${a.data?.dstip ?? '-'} bytes=${a.data?.bytes ?? '-'} reason="${d.reason}"`);
  if (lines.length) appendFileSync(ALERT_LOG, `${lines.join('\n')}\n`, 'utf8');

  // 시험 경보를 다시 흘려 봅니다: 각 경보의 목적지가 판정기 확인 단계에서 막히는지
  const replay = alerts.map((a, i) => ({ id: a.id, action: decisions[i].action,
    denied: Boolean(checkXdrDeny({ destinationIp: a.data?.dstip, at: now }, rules)) }));
  return { rules, skipped, newLogLines: lines.length, replay };
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('xdr/exfiltration/respond.mjs')) {
  const { rules, skipped, newLogLines, replay } = respond();
  const wrong = replay.filter((r) => r.denied !== (r.action === 'block'));
  console.log(`차단 규칙 ${rules.length}개 (만료 ${rules[0]?.expiresAt ?? '-'}) · 정상 목적지라 뺀 후보 ${skipped.length}개 · 새 알림 ${newLogLines}줄`);
  console.log(`다시 흘리기: 막힘 ${replay.filter((r) => r.denied).length}건 / 통과 ${replay.filter((r) => !r.denied).length}건 · 정상(record) 막힘 ${replay.filter((r) => r.action === 'record' && r.denied).length}건 · 어긋남 ${wrong.length}건`);
}
