// /api/device/status·challenge·register·verify·signout (11단계 기기 승인)
import { handleDevice } from '../../src/device-api.mjs';

export default function handler(request, response) {
  return handleDevice(request, response, request.query?.action);
}
