/// <reference lib="webworker" />
import { decompress } from 'fzstd'
import { parquetReadObjects, type Compressors } from 'hyparquet'

// Décodage des Parquet hors du fil principal : sur un téléphone, décoder l'index des territoires ou les
// 70 000 bureaux d'un scrutin prend plusieurs secondes, pendant lesquelles la page ne répondrait plus.
// Le pipeline écrit tous ses Parquet en ZSTD : seul ce décompresseur est embarqué.
const compressors: Compressors = { ZSTD: (entree) => decompress(entree) }

self.onmessage = async (message: MessageEvent<{ id: number; tampon: ArrayBuffer }>) => {
  const { id, tampon } = message.data
  try {
    const lignes = await parquetReadObjects({ file: tampon, compressors })
    // hyparquet renvoie les entiers 64 bits en BigInt ; voix et effectifs tiennent dans un nombre.
    for (const ligne of lignes) {
      for (const [cle, valeur] of Object.entries(ligne)) if (typeof valeur === 'bigint') ligne[cle] = Number(valeur)
    }
    self.postMessage({ id, lignes })
  } catch (erreur) {
    self.postMessage({ id, erreur: erreur instanceof Error ? erreur.message : String(erreur) })
  }
}
