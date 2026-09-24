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
  // Worker introuvable ou arrêté : les lectures en cours échouent (la page le dit et peut réessayer) au lieu
  // d'attendre indéfiniment ; la lecture suivante relance un worker.
  const echec = (raison: string) => {
    for (const attente of attentes.values()) attente.rejeter(new Error(raison))
    attentes.clear()
    decodeur?.terminate()
    decodeur = undefined
  }
  decodeur.onerror = (e) => {
    e.preventDefault()
    echec(`décodeur indisponible${e.message ? ` (${e.message})` : ''}`)
  }
  decodeur.onmessageerror = () => echec('réponse illisible du décodeur')
  return decodeur
}

/** Télécharge un fichier Parquet publié par le pipeline (compressé en ZSTD) et le décode hors du fil principal. */
export async function lireParquet<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const reponse = await fetch(url, { signal })
  if (!reponse.ok) throw new Error(`${url} : HTTP ${reponse.status}`)
  const tampon = await reponse.arrayBuffer()
  signal?.throwIfAborted()
  const id = suivant++
  const worker = travailleur()
  const lignes = await new Promise<Record<string, unknown>[]>((resoudre, rejeter) => {
    // Lecture abandonnée (autre scrutin choisi) : le worker saute ce fichier s'il ne l'a pas commencé.
    const annuler = () => {
      attentes.delete(id)
      worker.postMessage({ annuler: id })
      rejeter(signal?.reason instanceof Error ? signal.reason : new DOMException('Lecture abandonnée', 'AbortError'))
    }
    signal?.addEventListener('abort', annuler, { once: true })
    attentes.set(id, {
      resoudre: (l) => { signal?.removeEventListener('abort', annuler); resoudre(l) },
      rejeter: (e) => { signal?.removeEventListener('abort', annuler); rejeter(new Error(`${url} : ${e.message}`)) },
    })
    worker.postMessage({ id, tampon }, [tampon])
  })
  return lignes as T[]
}
