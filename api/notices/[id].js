// GET /api/notices/:id (공지 한 건), PUT /api/notices/:id (강사만 수정)
import { handleNoticeItem } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  return handleNoticeItem(request, response, request.query?.id);
}
