import { defineConfig, loadEnv, type Plugin } from 'vite';
import { githubResponse } from './server/proxy';

function githubProxy(token: string | undefined): Plugin {
  return {
    name: 'github-proxy',
    configureServer(server) {
      server.middlewares.use('/api/github', async (req, res) => {
        try {
          const response = await githubResponse(new Request(new URL(req.originalUrl ?? '/api/github', 'http://localhost'), { method: req.method }), token);
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.statusCode = response.status;
          res.end(await response.text());
        } catch { res.statusCode = 502; res.end(JSON.stringify({ error: 'Could not reach GitHub. Try again.' })); }
      });
    },
  };
}
export default defineConfig(({ mode }) => {
  // These values are used only by the development server, never exposed via define or VITE_.
  const env = loadEnv(mode, process.cwd(), 'GITHUB_');
  return {
    plugins: [githubProxy(process.env.GITHUB_TOKEN ?? env.GITHUB_TOKEN)],
    build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
  };
});
