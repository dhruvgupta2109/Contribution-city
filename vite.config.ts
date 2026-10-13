import { defineConfig, loadEnv } from 'vite';
import handler from './api/city.ts';

export default defineConfig(({ mode }) => {
  // Loaded in the Node dev server only. GITHUB_TOKEN is never a VITE_ variable.
  const environment = loadEnv(mode, process.cwd(), 'GITHUB_TOKEN');
  if (environment.GITHUB_TOKEN) process.env.GITHUB_TOKEN = environment.GITHUB_TOKEN;
  return {
    plugins: [{
      name: 'local-github-endpoint',
      configureServer(server) {
        server.middlewares.use('/api/city', (request, response) => { void handler(request, response); });
      },
    }],
    build: {
      rolldownOptions: {
        output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] } },
      },
    },
  };
});
