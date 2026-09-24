/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pipeline } from 'node:stream'
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
  // pipeline ferme le fichier même si le navigateur abandonne la requête : sous Windows, un fichier
  // resté ouvert empêcherait le pipeline de données de le remplacer (« Accès refusé »).
  pipeline(createReadStream(chemin), reponse, () => {})
}

/**
 * Aperçu de production (`npm run preview`) : applique les en-têtes de public/_headers, ceux que
 * Cloudflare Pages enverra, pour vérifier en local la politique de sécurité (CSP) avant de publier.
 */
function entetesDePages(): Plugin {
  const regles: { motif: RegExp; entetes: [string, string][] }[] = []
  const texte = readFileSync(fileURLToPath(new URL('public/_headers', import.meta.url)), 'utf8')
  for (const ligne of texte.split(/\r?\n/)) {
    if (!ligne.trim() || ligne.trim().startsWith('#')) continue
    if (!/^\s/.test(ligne)) {
      const motif = ligne.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      regles.push({ motif: new RegExp(`^${motif}$`), entetes: [] })
    } else {
      const i = ligne.indexOf(':')
      regles.at(-1)?.entetes.push([ligne.slice(0, i).trim(), ligne.slice(i + 1).trim()])
    }
  }
  return {
    name: 'entetes-de-pages',
    configurePreviewServer: (serveur) => {
      serveur.middlewares.use((requete, reponse, suite) => {
        const chemin = (requete.url ?? '/').split('?')[0]
        for (const r of regles) if (r.motif.test(chemin)) for (const [nom, valeur] of r.entetes) reponse.setHeader(nom, valeur)
        suite()
      })
    },
  }
}

function publicationDuPipeline(): Plugin {
  return {
    name: 'publication-du-pipeline',
    configureServer: (serveur) => { serveur.middlewares.use('/data', servirPublication) },
    configurePreviewServer: (serveur) => { serveur.middlewares.use('/data', servirPublication) },
  }
}

export default defineConfig({
  plugins: [react(), entetesDePages(), publicationDuPipeline()],
  // MapLibre 6 est découpé en trois modules ES (principal, worker, code partagé) : le pré-bundling de
  // Vite les sépare mal, on le laisse donc de côté ; le worker est compilé comme module ES.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  // MapLibre change rarement, l'application souvent : dans un fichier à part, il reste en cache d'une
  // version du site à l'autre et se télécharge en parallèle du reste.
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }] } },
    },
  },
  test: { environment: 'node' },
})
