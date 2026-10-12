import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

// 2단계부터: 메모는 Supabase에 있고 화면은 /api/notes로 읽습니다.
// 빌드는 더 이상 public/data.json을 만들지 않고, 배포 식별용 /aleph.json만 만듭니다.
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (!Number.isInteger(config.step) || config.step < 2 || config.step > 12) {
  throw new Error('aleph.config.json의 step은 2 이상이어야 합니다. 1단계 공개 복사 흐름은 끝났습니다.');
}
for (const leaked of ['data.json', 'public/data.json']) {
  if (existsSync(resolve(root, leaked))) {
    throw new Error(`${leaked}가 다시 생겼습니다. 메모는 공개 정적 파일에 두지 마세요.`);
  }
}
console.log('공개 data.json 없이 빌드합니다. 메모는 /api/notes 서버 함수가 읽습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
