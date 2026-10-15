// GET /api/ops/summary (12단계 탈환 작전실 요약)
import { handleOps } from '../../src/ops-api.mjs';

import { withObservation } from '../../src/observe.mjs';

export default withObservation(function handler(request, response) {
  return handleOps(request, response, request.query?.action);
});
