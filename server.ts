import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { app, runDueReminders } from './server/app';
import { ensureDbReady } from './server/db';
import { getAppBaseUrl } from './server/email';

const PORT = 3000;

// Automatic J-3 reminder scheduler for persistent Node.js hosting
setInterval(() => {
  const baseUrl = getAppBaseUrl();
  runDueReminders(baseUrl, false).catch((err) => {
    console.error('Scheduled reminder check error:', err);
  });
}, 60 * 60 * 1000);

async function startServer() {
  await ensureDbReady();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build missing');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    runDueReminders(getAppBaseUrl(), false).catch(() => {});
  });
}

startServer();
