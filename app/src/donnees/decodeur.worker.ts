/// <reference lib="webworker" />
import { decompress } from 'fzstd'
import { parquetReadObjects, type Compressors } from 'hyparquet'

// Décodage des Parquet hors du fil principal : sur un téléphone, décoder l'index des territoires ou les
// 70 000 bureaux d'un scrutin prend plusieurs secondes, pendant lesquelles la page ne répondrait plus.
// Le pipeline écrit tous ses Parquet en ZSTD : seul ce décompresseur est embarqué.
const compressors: Compressors = { ZSTD: (entree) => decompress(entree) }

type Travail = { id: number; tampon: ArrayBuffer }
const file: Travail[] = []
let occupe = false

self.onmessage = (message: MessageEvent<Travail | { annuler: number }>) => {
  if ('annuler' in message.data) {
    // Fichier devenu inutile (on est passé à un autre scrutin) : retiré de la file s'il n'est pas commencé.
    const { annuler } = message.data
    const i = file.findIndex((t) => t.id === annuler)
    if (i >= 0) file.splice(i, 1)
    return
  }
  file.push(message.data)
  if (!occupe) void traiter()
}

// Un fichier à la fois, en rendant la main entre deux : une annulation arrivée pendant un décodage est lue
// avant le suivant. Un canal plutôt qu'un minuteur, que les onglets en arrière-plan ralentissent.
const canal = new MessageChannel()
const rendreLaMain = () => new Promise<void>((suite) => {
  canal.port1.onmessage = () => suite()
  canal.port2.postMessage(null)
})

async function traiter() {
  occupe = true
  while (file.length > 0) {
    await rendreLaMain()
    const travail = file.shift()
    if (!travail) continue
    try {
      const lignes = await parquetReadObjects({ file: travail.tampon, compressors })
      // hyparquet renvoie les entiers 64 bits en BigInt ; voix et effectifs tiennent dans un nombre.
      for (const ligne of lignes) {
        for (const [cle, valeur] of Object.entries(ligne)) if (typeof valeur === 'bigint') ligne[cle] = Number(valeur)
      }
      self.postMessage({ id: travail.id, lignes })
    } catch (erreur) {
      self.postMessage({ id: travail.id, erreur: erreur instanceof Error ? erreur.message : String(erreur) })
    }
  }
  occupe = false
}
