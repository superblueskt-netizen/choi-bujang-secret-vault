// 9단계 로컬 시험: 가상 사건만 씁니다. 실제 접속 회수나 심판 판정이 아닙니다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect, readEvents } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1);
const reads = (n, sub, extra = {}, method = 'GET') => Array.from({ length: n }, (_, i) => ({
  at: new Date(START + i * 2000).toISOString(), method, identity: { sub }, ...extra,
}));

test('입력 정리: 시각·요청 종류·가명 사용자만 남기고 나머지는 버린다', () => {
  const out = readEvents(reads(1, 'learner_a', { body: '메모 본문', token: 'secret', name: '실명' }));
  assert.deepEqual(Object.keys(out[0]).sort(), ['sub', 't']);
  assert.ok(!JSON.stringify(out).includes('secret') && !JSON.stringify(out).includes('메모 본문'));
});

test('결과에 메모 내용·토큰이 섞이지 않는다', () => {
  const out = detect(reads(130, 'learner_a', { body: '메모 본문', token: 'secret' }));
  assert.deepEqual(out, { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_a' });
});

test('GET이 아닌 요청과 형식이 틀린 사건은 세지 않는다', () => {
  assert.deepEqual(detect(reads(200, 'learner_a', {}, 'POST')), { action: 'observe' });
  const broken = [...reads(100, 'learner_a'), ...Array.from({ length: 50 }, () => ({ method: 'GET', identity: { sub: 'learner_a' }, at: 'not-a-date' })), null, 'x'];
  assert.deepEqual(detect(broken), { action: 'observe' });
});

test('여러 사용자 중 폭주한 한 사용자만 대상으로 제안한다', () => {
  const out = detect([...reads(50, 'learner_normal'), ...reads(150, 'learner_burst')]);
  assert.equal(out.subject, 'learner_burst');
});

test('입력이 배열이 아니면 거부한다', () => {
  assert.throws(() => detect(null), /invalid_detection_events/);
});
