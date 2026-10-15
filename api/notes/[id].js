// GET·PUT·DELETE /api/notes/:id
import { handleItem } from '../../src/notes-api.mjs';

import { withObservation } from '../../src/observe.mjs';

export default withObservation(function handler(request, response) {
  return handleItem(request, response, request.query?.id);
});
