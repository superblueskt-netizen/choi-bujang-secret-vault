// GET /api/checks, GET /api/checks?case=<attackId> (12단계 점검 결과)
import { handleChecks } from '../src/checks-api.mjs';
import { withObservation } from '../src/observe.mjs';

export default withObservation(function handler(request, response) {
  return handleChecks(request, response);
});
