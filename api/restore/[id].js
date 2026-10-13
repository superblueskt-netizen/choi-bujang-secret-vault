// POST /api/restore/:id (자기 메모 한 건을 비공개 백업에서 복원)
import { handleRestore } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  return handleRestore(request, response, request.query?.id);
}
