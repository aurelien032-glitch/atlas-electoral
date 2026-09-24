/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// En développement, les fichiers produits par le pipeline (../publication) sont servis sous /data.
// En production, ils sont déployés à côté du site (docs/PLAN.md, § 5).
const PUBLICATION = fileURLToPath(new URL('../publication', import.meta.url))
const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.parquet': 'application/vnd.apache.parquet',
}

function servirPublication(requete: IncomingMessage, reponse: ServerResponse, suite: () => void) {
  const relatif = decodeURIComponent((requete.url ?? '/').split('?')[0])
  const chemin = normalize(join(PUBLICATION, relatif))
  if (!chemin.startsWith(PUBLICATION + sep) || !existsSync(chemin) || !statSync(chemin).isFile()) return suite()
  reponse.setHeader('Content-Type', TYPES[extname(chemin)] ?? 'application/octet-stream')
  createReadStream(chemin).pipe(reponse)
}

function publicationDuPipeline(): Plugin {
  return {
    name: 'publication-du-pipeline',
    configureServer: (serveur) => { serveur.middlewares.use('/data', servirPublication) },
    configurePreviewServer: (serveur) => { serveur.middlewares.use('/data', servirPublication) },
  }
}

export default defineConfig({
  plugins: [react(), publicationDuPipeline()],
  // MapLibre 6 est découpé en trois modules ES (principal, worker, code partagé) : le pré-bundling de
  // Vite les sépare mal, on le laisse donc de côté ; le worker est compilé comme module ES.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  test: { environment: 'node' },
})
