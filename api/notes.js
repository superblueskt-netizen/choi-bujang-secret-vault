// GET /api/notes (로그인 사용자의 메모 목록), POST /api/notes ({id?, title, body} → {id})
import { handleCollection } from '../src/notes-api.mjs';

import { withObservation } from '../src/observe.mjs';

export default withObservation(function handler(request, response) {
  return handleCollection(request, response);
});
