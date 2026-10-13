// GET /api/notices (로그인 사용자의 강사 공지 목록)
import { handleNoticeCollection } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return handleNoticeCollection(request, response);
}
