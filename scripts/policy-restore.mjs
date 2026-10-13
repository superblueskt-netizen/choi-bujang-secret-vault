// 10단계 정책 복원 도구 (시험 정책 전용)
// - 검증한 안전 정책 사본(backup/policy-safe.json)을 SHA-256 봉인(backup/policy-safe.sha256)과 대조합니다.
// - 사본이 없거나 해시·형식·실제 판정기와의 대조가 틀리면 즉시 중단합니다.
// - 시험 정책(policy/test-policy.json)과의 차이만 보여 줍니다. 실제 운영 정책(src/decider.mjs, DB 권한)은 바꾸지 않습니다.
// - --apply --yes 를 함께 줄 때만 notes 서비스 항목을 사본 버전으로 되돌리고, 다른 서비스 규칙은 그대로 둡니다.
// - 실행할 때마다 backup/audit.log 끝에 한 줄을 덧붙입니다(지우거나 고치지 않음). 비밀값·메모 내용은 남기지 않습니다.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_PATHS = Object.freeze({
  safe: resolve(ROOT, 'backup/policy-safe.json'),
  seal: resolve(ROOT, 'backup/policy-safe.sha256'),
  test: resolve(ROOT, 'policy/test-policy.json'),
  audit: resolve(ROOT, 'backup/audit.log'),
});
const SERVICE = 'notes';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const stop = (code) => { const e = new Error(code); e.code = code; throw e; };

export function loadVerifiedSnapshot(paths = DEFAULT_PATHS, { ruleIds, zoneRoutes } = {}) {
  if (!existsSync(paths.safe) || !existsSync(paths.seal)) stop('SNAPSHOT_MISSING');
  const raw = readFileSync(paths.safe, 'utf8').replace(/\r\n/gu, '\n');
  const sealed = readFileSync(paths.seal, 'utf8').trim().split(/\s+/u)[0];
  if (!/^[0-9a-f]{64}$/u.test(sealed) || sha256(raw) !== sealed) stop('SNAPSHOT_HASH_MISMATCH');
  let snap;
  try { snap = JSON.parse(raw); } catch { stop('SNAPSHOT_INVALID_JSON'); }
  const policy = snap?.services?.[SERVICE];
  if (snap?.schema !== 'aleph.policy.v1' || typeof snap.version !== 'string' || !policy) stop('SNAPSHOT_INVALID_SHAPE');
  // 사본이 지금 판정기의 실제 규칙과도 같은지 확인합니다(사본만 맞고 판정기가 바뀐 경우 중단).
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (ruleIds && !same(policy.decider.ruleIds, ruleIds)) stop('SNAPSHOT_DECIDER_RULE_MISMATCH');
  if (zoneRoutes && !same(policy.decider.zoneRoutes, zoneRoutes)) stop('SNAPSHOT_DECIDER_ROUTE_MISMATCH');
  return { version: snap.version, sha256: sealed, policy };
}

// 두 객체의 차이를 "경로: 지금 → 복원값" 목록으로 만듭니다.
export function diffPolicy(current, safe, base = SERVICE) {
  const out = [];
  const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(safe ?? {})]);
  for (const key of [...keys].sort()) {
    const a = current?.[key]; const b = safe?.[key]; const path = `${base}.${key}`;
    const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
    if (isObj(a) && isObj(b)) out.push(...diffPolicy(a, b, path));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, current: a ?? null, restore: b ?? null });
  }
  return out;
}

export function planRestore(paths = DEFAULT_PATHS, deciderInfo = {}) {
  const snap = loadVerifiedSnapshot(paths, deciderInfo);
  if (!existsSync(paths.test)) stop('TEST_POLICY_MISSING');
  const test = JSON.parse(readFileSync(paths.test, 'utf8'));
  const changes = diffPolicy(test?.services?.[SERVICE], snap.policy);
  return { snap, test, changes };
}

export function applyRestore(paths = DEFAULT_PATHS, deciderInfo = {}, { now = new Date() } = {}) {
  const { snap, test, changes } = planRestore(paths, deciderInfo);
  if (changes.length) {
    const next = { ...test, version: snap.version, services: { ...test.services, [SERVICE]: snap.policy } };
    writeFileSync(paths.test, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  appendFileSync(paths.audit, `${JSON.stringify({ at: now.toISOString(), action: 'policy_restore', service: SERVICE,
    toVersion: snap.version, snapshotSha256: snap.sha256, changed: changes.map((c) => c.path) })}\n`, 'utf8');
  return { snap, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { RULE_IDS, ZONE_ROUTES } = await import(pathToFileURL(resolve(ROOT, 'src/decider.mjs')).href);
    const info = { ruleIds: RULE_IDS, zoneRoutes: ZONE_ROUTES };
    const apply = process.argv.includes('--apply');
    const { snap, changes } = planRestore(DEFAULT_PATHS, info);
    process.stdout.write(`복원할 버전: ${snap.version} (사본 SHA-256 ${snap.sha256.slice(0, 16)}… 검증 통과)\n`);
    process.stdout.write(`대상: policy/test-policy.json 의 services.${SERVICE} 만 (다른 서비스·감사 기록 보존, 운영 정책 미변경)\n`);
    if (!changes.length) process.stdout.write('바뀔 항목: 없음 (시험 정책이 이미 안전 버전과 같습니다)\n');
    for (const c of changes) process.stdout.write(`바뀔 항목: ${c.path}\n  지금   ${JSON.stringify(c.current)}\n  복원값 ${JSON.stringify(c.restore)}\n`);
    if (!apply) {
      process.stdout.write('미리 보기만 했습니다. 되돌리려면: npm run policy:restore -- --apply --yes\n');
    } else if (!process.argv.includes('--yes')) {
      process.stdout.write('중단: 위 항목을 확인한 뒤 --yes 를 함께 붙여야 실행합니다.\n');
      process.exitCode = 2;
    } else {
      const done = applyRestore(DEFAULT_PATHS, info);
      process.stdout.write(`되돌림 완료: ${done.changes.length}개 항목 · backup/audit.log 에 한 줄 추가\n`);
    }
  } catch (error) {
    process.stderr.write(`정책 복원 중단: ${error.code ?? error.message}\n`);
    process.exitCode = 1;
  }
}
