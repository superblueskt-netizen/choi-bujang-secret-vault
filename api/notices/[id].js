// GET /api/notices/:id (공지 한 건), PUT /api/notices/:id (강사만 수정)
import { handleNoticeItem } from '../../src/notes-api.mjs';

import { withObservation } from '../../src/observe.mjs';

export default withObservation(function handler(request, response) {
  return handleNoticeItem(request, response, request.query?.id);
});
