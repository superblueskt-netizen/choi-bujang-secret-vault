// GET /api/notes (로그인 사용자의 메모 목록), POST /api/notes ({id?, title, body} → {id})
import { handleCollection } from '../src/notes-api.mjs';

export default function handler(request, response) {
  return handleCollection(request, response);
}
