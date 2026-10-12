// GET·PUT·DELETE /api/notes/:id
import { handleItem } from '../../src/notes-api.mjs';

export default function handler(request, response) {
  return handleItem(request, response, request.query?.id);
}
