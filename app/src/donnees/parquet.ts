// Les fichiers sont téléchargés ici (le préchargement déclaré dans index.html sert la requête), puis décodés
// dans un worker : le tampon lui est transféré sans copie, les lignes reviennent décodées.

type Reponse = { id: number; lignes: Record<string, unknown>[] } | { id: number; erreur: string }

let decodeur: Worker | undefined
let suivant = 0
const attentes = new Map<number, { resoudre: (lignes: Record<string, unknown>[]) => void; rejeter: (e: Error) => void }>()

function travailleur(): Worker {
  if (decodeur) return decodeur
  decodeur = new Worker(new URL('./decodeur.worker.ts', import.meta.url), { type: 'module' })
  decodeur.onmessage = (message: MessageEvent<Reponse>) => {
    const attente = attentes.get(message.data.id)
    if (!attente) return
    attentes.delete(message.data.id)
    if ('erreur' in message.data) attente.rejeter(new Error(message.data.erreur))
    else attente.resoudre(message.data.lignes)
  }
  return decodeur
}

/** Télécharge un fichier Parquet publié par le pipeline (compressé en ZSTD) et le décode hors du fil principal. */
export async function lireParquet<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const reponse = await fetch(url, { signal })
  if (!reponse.ok) throw new Error(`${url} : HTTP ${reponse.status}`)
  const tampon = await reponse.arrayBuffer()
  signal?.throwIfAborted()
  const id = suivant++
  const lignes = await new Promise<Record<string, unknown>[]>((resoudre, rejeter) => {
    attentes.set(id, { resoudre, rejeter: (e) => rejeter(new Error(`${url} : ${e.message}`)) })
    travailleur().postMessage({ id, tampon }, [tampon])
  })
  return lignes as T[]
}
