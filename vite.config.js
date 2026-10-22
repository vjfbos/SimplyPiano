import { defineConfig } from 'vite';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

// Vult na de build de precache-lijst in dist/sw.js met alle gebouwde bestanden,
// zodat de app (inclusief lessen en liedjes) na het eerste bezoek offline werkt.
function precacheServiceWorker() {
  let outDir = 'dist';
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    async closeBundle() {
      const files = [];
      const walk = async (d) => {
        for (const name of await readdir(d)) {
          const p = join(d, name);
          if ((await stat(p)).isDirectory()) await walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      await walk(outDir);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of list) hash.update(f).update(await readFile(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      const sw = (await readFile(swPath, 'utf8'))
        .replace('self.__PRECACHE__ = []', `self.__PRECACHE__ = ${JSON.stringify(['./', ...list])}`)
        .replace("'dev'", `'${hash.digest('hex').slice(0, 12)}'`);
      await writeFile(swPath, sw);
    },
  };
}

export default defineConfig({
  plugins: [precacheServiceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2500 },
  test: { environment: 'node' },
});
