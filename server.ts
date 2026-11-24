import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer, type ConfigEnv } from 'vite';
import viteConfig from './vite.config.ts';
import { initDatabase } from './server/db.ts';
import { authRoutes } from './server/routes/authRoutes.ts';
import { adminRoutes } from './server/routes/adminRoutes.ts';
import { catalogRoutes } from './server/routes/catalogRoutes.ts';
import { salesRoutes } from './server/routes/salesRoutes.ts';
import { financeRoutes } from './server/routes/financeRoutes.ts';
import { shareholderRoutes } from './server/routes/shareholderRoutes.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', true);
  app.use(express.json({ limit: '10mb' }));

  // Basic origin check for cookie-authenticated mutations
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host && !req.headers.authorization && !req.headers['x-requested-with']) {
            res.status(403).json({ error: 'Cross-origin mutation rejected.' });
            return;
          }
        } catch {
          res.status(400).json({ error: 'Invalid Origin header.' });
          return;
        }
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'XCLUFY Business Management System' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', adminRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api', salesRoutes);
  app.use('/api', financeRoutes);
  app.use('/api/shareholders', shareholderRoutes);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const configEnv: ConfigEnv = { command: 'serve', mode: process.env.NODE_ENV || 'development' };
    const resolvedUserConfig = typeof viteConfig === 'function' ? await viteConfig(configEnv) : viteConfig;
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      ...resolvedUserConfig,
      configFile: false,
      server: {
        ...resolvedUserConfig.server,
        middlewareMode: true,
        hmr: hmrDisabled ? false : true,
        watch: hmrDisabled ? null : resolvedUserConfig.server?.watch,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = process.env.NODE_ENV === 'production' ? Number(process.env.PORT || 3000) : 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`XCLUFY server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start XCLUFY server:', err);
  process.exit(1);
});
