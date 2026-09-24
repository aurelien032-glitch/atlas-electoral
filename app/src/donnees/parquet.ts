import { parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

/** Télécharge un fichier Parquet publié par le pipeline (compressé en ZSTD) et le décode. */
export async function lireParquet<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const reponse = await fetch(url, { signal })
  if (!reponse.ok) throw new Error(`${url} : HTTP ${reponse.status}`)
  const lignes = await parquetReadObjects({ file: await reponse.arrayBuffer(), compressors })
  return lignes.map(entiersEnNombres) as T[]
}

// hyparquet renvoie les entiers 64 bits en BigInt ; les voix et les effectifs tiennent largement
// dans un nombre JavaScript.
function entiersEnNombres(ligne: Record<string, unknown>): Record<string, unknown> {
  for (const [cle, valeur] of Object.entries(ligne)) {
    if (typeof valeur === 'bigint') ligne[cle] = Number(valeur)
  }
  return ligne
}
