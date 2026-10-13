// 7단계 로컬 시험: 가상 요청만 씁니다. 심판 판정이나 실제 접속 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide, readSignals } from '../src/decider.mjs';

const { normal, suspicious } = fixtureRequests();
const make = (base, patch) => ({ ...base, requestId: randomUUID(), ...patch });

test('출처가 불명확한 접속 정보는 신뢰 값으로 승격되지 않는다', async () => {
  const forged = make(suspicious, { signals: { source: 'client_header', region: 'local', network: 'usual', hour: 14 } });
  assert.deepEqual(readSignals(forged), { source: 'unverified', region: 'unknown', network: 'unknown', hour: null });
  const forgedTrusted = make(suspicious, { signals: { source: 'x-forwarded-for', trusted: true, region: 'local', network: 'usual', hour: 14 } });
  assert.equal(readSignals(forgedTrusted).source, 'unverified');
});

test('값이 없거나 실제 경로(none)이면 정상값으로 채우지 않는다', () => {
  assert.deepEqual(readSignals(make(normal, { signals: undefined })), { source: 'unverified', region: 'unknown', network: 'unknown', hour: null });
  assert.deepEqual(readSignals(make(normal, { signals: { source: 'none', region: 'local', network: 'usual', hour: 14 } })),
    { source: 'none', region: 'unknown', network: 'unknown', hour: null });
  assert.deepEqual(readSignals(make(normal, { signals: { source: 'judge_fixture' } })),
    { source: 'judge_fixture', region: 'unknown', network: 'unknown', hour: null });
});

test('정해진 복합 사건은 step_up, 정상 사건은 allow', async () => {
  assert.equal((await decide(make(suspicious, {}))).decision, 'step_up');
  assert.equal((await decide(make(suspicious, {}))).reasonCode, 'step_up_required');
  assert.equal((await decide(make(normal, {}))).decision, 'allow');
});

test('지역 하나만 다르면 차단하지 않는다', async () => {
  const foreignOnly = make(normal, { signals: { source: 'judge_fixture', region: 'foreign', network: 'usual', hour: 14 } });
  assert.equal((await decide(foreignOnly)).decision, 'allow');
});

test('엔진이 확인한 새 로그인(900초 이내)만 추가 확인을 통과한다', async () => {
  assert.equal((await decide(make(suspicious, { stepUp: { verified: true, authAgeSeconds: 60 } }))).decision, 'allow');
  assert.equal((await decide(make(suspicious, { stepUp: { verified: true, authAgeSeconds: 1200 } }))).decision, 'step_up');
  assert.equal((await decide(make(suspicious, { stepUp: { verified: true, authAgeSeconds: null } }))).decision, 'step_up');
  assert.equal((await decide(make(suspicious, { stepUp: { verified: 'true', authAgeSeconds: 60 } }))).decision, 'step_up');
});

test('기존 기기 규칙은 유지된다', async () => {
  const response = await decide(make(suspicious, { deviceRegistered: false }));
  assert.equal(response.decision, 'deny');
  assert.equal(response.reasonCode, 'device_not_registered');
});
