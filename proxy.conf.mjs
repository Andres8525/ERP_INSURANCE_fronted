const target = process.env.API_TARGET ?? 'http://localhost:8080';
const realtimeTarget = process.env.REALTIME_TARGET ?? 'http://localhost:8090';

const backend = { target, secure: false, changeOrigin: true };
const realtime = { target: realtimeTarget, secure: false, changeOrigin: true };

export default {
  '/api/realtime': realtime,
  '/ws': { ...realtime, ws: true },
  '/api': backend,
  '/actuator': backend,
};
