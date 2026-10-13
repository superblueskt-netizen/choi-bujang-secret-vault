// GET /api/ops/summary (12단계 탈환 작전실 요약)
import { handleOps } from '../../src/ops-api.mjs';

export default function handler(request, response) {
  return handleOps(request, response, request.query?.action);
}
