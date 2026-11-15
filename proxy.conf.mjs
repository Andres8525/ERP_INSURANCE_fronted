const target = process.env.API_TARGET ?? 'http://localhost:8080';

const backend = { target, secure: false, changeOrigin: true };

export default {
  '/api': backend,
  '/actuator': backend,
};
