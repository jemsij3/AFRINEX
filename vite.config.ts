import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Serves Hono Cloudflare Worker routes (/api/*) in Vite dev mode via Wrangler PlatformProxy
      // so AI Studio preview and `npm run dev` work without ECONNREFUSED on port 8787.
      {
        name: 'cloudflare-worker-dev-bridge',
        apply: 'serve',
        configureServer(server) {
          let proxyPromise: Promise<{
            env: Record<string, unknown>;
            ctx: unknown;
            dispose: () => Promise<void>;
          }> | null = null;

          const getProxy = () => {
            if (!proxyPromise) {
              proxyPromise = import('wrangler').then(({ getPlatformProxy }) =>
                getPlatformProxy({ persist: true, remoteBindings: false })
              );
            }
            return proxyPromise;
          };

          server.httpServer?.once('close', () => {
            if (proxyPromise) {
              void proxyPromise.then((p) => p.dispose());
            }
          });

          server.middlewares.use(async (req, res, next) => {
            if (!req.url || !req.url.startsWith('/api')) {
              next();
              return;
            }

            try {
              const proxy = await getProxy();
              const mod = (await server.ssrLoadModule('/worker/index.ts')) as {
                default: {
                  fetch: (
                    request: Request,
                    env: Record<string, unknown>,
                    ctx: unknown
                  ) => Promise<Response>;
                };
              };

              const origin = `http://${req.headers.host || 'localhost:3000'}`;
              const url = new URL(req.url, origin);
              const method = req.method || 'GET';

              let bodyBytes: Uint8Array | undefined;
              if (method !== 'GET' && method !== 'HEAD') {
                const chunks: Uint8Array[] = [];
                for await (const chunk of req) {
                  chunks.push(
                    typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Uint8Array)
                  );
                }
                bodyBytes = Buffer.concat(chunks);
              }

              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === 'string') {
                  headers.set(key, value);
                } else if (Array.isArray(value)) {
                  for (const item of value) {
                    headers.append(key, item);
                  }
                }
              }

              const webRequest = new Request(url.toString(), {
                method,
                headers,
                body: bodyBytes ? (bodyBytes as unknown as BodyInit) : undefined,
              });

              const devEnv = {
                ...proxy.env,
                ENVIRONMENT: 'development',
              };

              const webResponse = await mod.default.fetch(webRequest, devEnv, proxy.ctx);

              res.statusCode = webResponse.status;
              webResponse.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });
              const arrayBuffer = await webResponse.arrayBuffer();
              res.end(Buffer.from(arrayBuffer));
            } catch (err) {
              next(err);
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
