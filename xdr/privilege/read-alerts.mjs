// 확인용 읽기 모듈: privilege 경보에서 시각·출발 주소·계정·규칙 수준·설명만 뽑아 표로 보여 줍니다.
// 원본 경보는 읽기만 합니다. decide.mjs는 이 파일을 불러오지 않습니다.
// 실행: node xdr/privilege/read-alerts.mjs
import { readFileSync } from 'node:fs';

const SECRETISH = /(pass(word)?|pwd|token|secret|api[_-]?key|authorization|cookie|session)\s*[:=]\s*\S+|eyJ[A-Za-z0-9_-]{10,}|sb_secret_\S+|\b[A-Fa-f0-9]{32,}\b/giu;
const clean = (value) => String(value ?? '').replace(SECRETISH, '[가림]');

export function readAlerts(path = new URL('../fixtures/privilege.json', import.meta.url)) {
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  const alerts = Array.isArray(fixture.alerts) ? fixture.alerts : [];
  const rows = alerts.map((alert) => ({
    id: clean(alert?.id),
    time: clean(alert?.timestamp),
    srcip: clean(alert?.data?.srcip),
    user: clean(alert?.data?.srcuser ?? '-'),
    level: Number(alert?.rule?.level ?? 0),
    description: clean(alert?.rule?.description),
  }));
  return { alertCount: alerts.length, rows };
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
  const { alertCount, rows } = readAlerts();
  for (const r of rows) console.log([r.id, r.time, r.srcip, r.user, `L${r.level}`, r.description].join(' | '));
  console.log(`경보 ${alertCount}건 · 뽑은 줄 ${rows.length}줄 · ${alertCount === rows.length ? '일치' : '불일치'}`);
}
