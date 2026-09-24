import type { ReactNode } from 'react'
import { LIBELLE_BLOC } from '../carte/couleurs'
import { RACINE_DONNEES, useManifeste, useReferentiel } from '../donnees/requetes'
import { grouper } from '../donnees/scrutins'
import type { Bloc, Catalogue, Manifeste, ScrutinCatalogue } from '../donnees/types'
import { formatNombre, formatPart } from '../format'

interface Props {
  catalogue: Catalogue
  scrutin: ScrutinCatalogue
  /** Noms des territoires, pour nommer ceux qui manquent à la source. */
  noms: ReadonlyMap<string, string>
  onScrutin: (id: string) => void
  onRetour: () => void
}

const DEPOT = 'https://github.com/aurelien032-glitch/atlas-electoral'

/** Sources lues au build : leur version (date de dernière modification) vient de sources.lock.json. */
const SOURCES = [
  {
    cles: ['general_results', 'candidats_results'],
    titre: 'Résultats par bureau de vote, 1999 à 2026',
    detail: "« Données des élections agrégées » (data.gouv.fr), d'après les résultats publiés par le ministère de l'Intérieur",
    lien: 'https://www.data.gouv.fr/datasets/donnees-des-elections-agregees/',
  },
  {
    cles: ['legislatives_2024_t1_circonscriptions', 'legislatives_2024_t2_circonscriptions'],
    titre: 'Législatives 2024, résultats définitifs par circonscription',
    detail: "Ministère de l'Intérieur (data.gouv.fr), 1er et 2d tours",
    lien: 'https://www.data.gouv.fr/datasets/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/',
  },
  {
    cles: ['nuances_2026'],
    titre: 'Nuances politiques et blocs',
    detail: "Dictionnaire de la circulaire du ministère de l'Intérieur de février 2026 (INTP2602966C)",
    lien: 'https://www.legifrance.gouv.fr/circulaire/id/45645',
  },
  {
    cles: ['contours_bureaux_pmtiles', 'contours_bureaux_geojson'],
    titre: 'Contours des bureaux de vote, 2022',
    detail: 'Reconstitués par Etalab à partir des adresses du Répertoire électoral unique (Insee) : indicatifs',
    lien: 'https://www.data.gouv.fr/datasets/proposition-de-contours-des-bureaux-de-vote/',
  },
  {
    cles: ['codes_postaux'],
    titre: 'Codes postaux',
    detail: 'Base officielle des codes postaux de La Poste, pour la recherche',
    lien: 'https://www.data.gouv.fr/datasets/base-officielle-des-codes-postaux/',
  },
  {
    cles: ['cog_2026_communes', 'cog_2026_mouvements'],
    titre: 'Code officiel géographique 2026',
    detail: 'Insee : communes au 1er janvier 2026 et fusions intervenues depuis chaque scrutin',
    lien: 'https://www.data.gouv.fr/datasets/code-officiel-geographique-1/',
  },
]

const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const dateLisible = (texte: string | null | undefined) => {
  const t = texte ? Date.parse(texte) : Number.NaN
  return Number.isNaN(t) ? undefined : jour.format(t)
}
const fois = (n: number, singulier: string, pluriel: string) => `${formatNombre(n)} ${n > 1 ? pluriel : singulier}`

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return <section className="methodologie-section"><h2>{titre}</h2>{children}</section>
}

/** Contrôles d'un scrutin, lus dans son manifeste : ce qui est vérifié et ce qui est seulement signalé. */
function Controles({ scrutin, manifeste, officiel, noms }: {
  scrutin: ScrutinCatalogue
  manifeste: Manifeste
  officiel: Record<string, string> | undefined
  noms: ReadonlyMap<string, string>
}) {
  const c = manifeste.compteurs
  const n = (cle: string) => (typeof c[cle] === 'number' ? (c[cle] as number) : undefined)
  const lignes: [string, string][] = []
  const ajouter = (libelle: string, valeur: string | undefined) => { if (valeur !== undefined) lignes.push([libelle, valeur]) }
  ajouter('Bureaux de vote', n('bureaux') === undefined ? undefined : formatNombre(n('bureaux') ?? 0))
  ajouter('Candidatures', n('candidatures') === undefined ? undefined : formatNombre(n('candidatures') ?? 0)
    + (n('candidatures_panachage') ? `, dont ${formatNombre(n('candidatures_panachage') ?? 0)} au panachage` : ''))
  const lues = n('lignes_voix_source')
  const publiees = n('lignes_voix')
  if (lues !== undefined && publiees !== undefined) {
    ajouter('Lignes de voix', `${formatNombre(lues)} lues, ${formatNombre(publiees)} publiées${lues === publiees ? ' : aucune perdue' : ''}`)
  }
  const incoherents = n('participation_incoherente')
  ajouter('Votants = blancs + nuls + exprimés', incoherents === undefined ? undefined
    : incoherents === 0 ? 'vérifié dans chaque bureau' : fois(incoherents, 'bureau', 'bureaux') + ' en écart')
  ajouter('Somme des voix différente des exprimés', n('somme_voix_differente_des_exprimes') === undefined ? undefined
    : `${fois(n('somme_voix_differente_des_exprimes') ?? 0, 'bureau', 'bureaux')} (anomalies de la source, tolérées)`)
  ajouter("Plus de votants que d'inscrits", n('votants_superieurs_aux_inscrits') === undefined ? undefined
    : fois(n('votants_superieurs_aux_inscrits') ?? 0, 'bureau', 'bureaux'))
  if (n('bureaux_panachage')) ajouter('Bureaux au panachage', `${formatNombre(n('bureaux_panachage') ?? 0)} (vote pour des personnes)`)
  if (c.blancs_distincts === false) ajouter('Blancs et nuls', 'comptés ensemble dans la source')
  ajouter('Communes recodées au 1er janvier 2026', n('communes_recodees') === undefined ? undefined : formatNombre(n('communes_recodees') ?? 0))
  if (n('circonscriptions')) {
    const ecart = n('circonscriptions_ecart_officiel')
    ajouter('Circonscriptions', formatNombre(n('circonscriptions') ?? 0)
      + (ecart === 0 ? ', totaux égaux aux totaux officiels de chacune' : ecart ? `, ${fois(ecart, 'écart', 'écarts')} aux totaux officiels` : ''))
  }
  const j = scrutin.jointure_contours
  if (j) {
    ajouter('Carte', `${j.niveau_carte === 'bureau' ? 'au bureau de vote' : 'à la commune'} : ${formatPart(j.taux_inscrits_metropole)} des inscrits de métropole trouvent leur bureau dans les contours de ${j.millesime_contours}`)
  }
  if (scrutin.territoires_absents?.length) {
    ajouter('Territoires absents de la source', scrutin.territoires_absents.map((c) => noms.get(c) ?? c).join(', '))
  }
  const t = scrutin.totaux
  ajouter('Total France', `${formatNombre(t.inscrits)} inscrits, ${formatNombre(t.votants)} votants, ${formatNombre(t.exprimes)} exprimés`)
  if (officiel) {
    const egaux = ['inscrits', 'votants', 'exprimes'].every((k) => Number(officiel[k]) === t[k as 'inscrits' | 'votants' | 'exprimes'])
    ajouter('Total officiel', egaux ? `identique (${officiel.source})` : `différent : ${officiel.source}`)
  } else {
    ajouter('Total officiel', 'pas encore rapproché pour ce scrutin')
  }
  return (
    <table className="controles">
      <caption className="visuellement-cache">Contrôles et compteurs, {scrutin.libelle}</caption>
      <tbody>
        {lignes.map(([libelle, valeur]) => <tr key={libelle}><th scope="row">{libelle}</th><td>{valeur}</td></tr>)}
      </tbody>
    </table>
  )
}

/**
 * Méthodologie, sources et qualité des données : ce que le site montre, d'où cela vient et ce qui a
 * été vérifié. Affichée dans le panneau (?page=methodologie) : la carte reste visible.
 */
export function Methodologie({ catalogue, scrutin, noms, onScrutin, onRetour }: Props) {
  const manifeste = useManifeste(scrutin.id)
  const grille = useReferentiel('nuances.csv', true)
  const totaux = useReferentiel('totaux_officiels.csv', true)
  const officiel = totaux.data?.find((l) => l.id_election === scrutin.id)
  const releve = dateLisible(catalogue.genere_le)

  return (
    <article className="methodologie">
      <button type="button" className="lien retour" onClick={onRetour}>← Retour aux résultats</button>
      <div className="titre">
        <h1>Méthodologie</h1>
        <p className="chapo">
          L'Atlas électoral montre les résultats officiels des élections, de la France entière au bureau de vote. Chaque
          chiffre vient d'une source publique, citée ici ; le site n'ajoute ni prévision ni commentaire.
        </p>
      </div>

      <Section titre="Sources">
        <ul className="liste-sources">
          {SOURCES.map((s) => {
            const version = s.cles.map((k) => catalogue.sources?.[k]?.derniere_modification)
              .map((d) => (d ? Date.parse(d) : Number.NaN)).filter((d) => !Number.isNaN(d)).sort().pop()
            return (
              <li key={s.titre}>
                <a href={s.lien} target="_blank" rel="noreferrer">{s.titre}</a>
                <span>{s.detail}{version !== undefined && ` ; version du ${jour.format(version)}`}.</span>
              </li>
            )
          })}
          <li>
            <span className="fort">Communes, départements et régions</span>
            <span>Contours de l'IGN simplifiés par Etalab (découpage au 1er janvier 2026).</span>
          </li>
          <li>
            <a href="https://geo.api.gouv.fr/decoupage-administratif" target="_blank" rel="noreferrer">Contour détaillé d'une commune</a>
            <span>API Découpage administratif (geo.api.gouv.fr), interrogée quand une commune est choisie.</span>
          </li>
        </ul>
        {releve && <p className="note-bas">Sources relevées le {releve}. Les jeux de données sont publiés sous Licence Ouverte (Etalab).</p>}
      </Section>

      <Section titre="Des bulletins à la carte">
        <ul className="liste">
          <li>Le site ne publie que des comptes (inscrits, votants, voix) ; les pourcentages se calculent à l'affichage, sur les suffrages exprimés, et la participation sur les inscrits.</li>
          <li>Les communes sont celles du 1er janvier 2026 : les résultats d'une commune fusionnée depuis un scrutin sont additionnés dans sa commune actuelle.</li>
          <li>Les contours des bureaux datent de 2022. Quand moins de 98 % des inscrits de métropole trouvent leur bureau dans ces contours (scrutins antérieurs à 2022, municipales 2026), la carte s'arrête à la commune.</li>
          <li>Jusqu'en 2015, les données comptent ensemble les bulletins blancs et nuls ; le site ne les sépare pas.</li>
          <li>Municipales 2014 et 2020 : dans les communes de moins de 1 000 habitants, on vote pour des personnes (panachage) ; leurs voix, multiples, n'entrent pas dans les parts des blocs.</li>
          <li>Législatives : la circonscription vient des données de 2012 à 2022, et des fichiers officiels par circonscription en 2024.</li>
          <li>Paris, Lyon et Marseille : résultats par arrondissement, calculés d'après le numéro des bureaux (voir les limites).</li>
        </ul>
      </Section>

      <Section titre="Classement politique">
        <ul className="liste">
          <li><span className="fort">Nuance officielle</span> : celle du ministère de l'Intérieur, affichée telle quelle.</li>
          <li><span className="fort">Famille</span> : grille du projet, harmonisée entre scrutins.</li>
          <li><span className="fort">Bloc</span> : grille de la circulaire de février 2026, appliquée à tous les scrutins pour comparer dans le temps ; elle ne dit pas qu'un parti existait sous cette forme à chaque élection.</li>
          <li>Un candidat sans nuance officielle (présidentielle, certaines listes européennes) reçoit le code de son parti dans la grille : l'interface l'indique (« attribuée »). Les classements discutables sont signalés « cas limite ».</li>
        </ul>
        <details className="depliant">
          <summary>La grille des nuances{grille.data ? ` (${grille.data.length} codes)` : ''}</summary>
          {grille.data
            ? (
              <div className="defilement" role="region" aria-label="Grille des nuances" tabIndex={0}>
                <table className="nuances">
                  <thead>
                    <tr><th scope="col">Code</th><th scope="col">Libellé</th><th scope="col">Famille</th><th scope="col">Bloc</th><th scope="col">Source</th></tr>
                  </thead>
                  <tbody>
                    {grille.data.map((l) => (
                      <tr key={l.code}>
                        <th scope="row"><abbr title={l.libelle}>{l.code}</abbr></th>
                        <td>{l.libelle}{l.cas_limite === 'oui' && <span className="mention">cas limite</span>}</td>
                        <td>{l.famille}</td>
                        <td>{LIBELLE_BLOC[l.bloc as Bloc] ?? l.bloc}</td>
                        <td className="discret">{l.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p className="note">{grille.error ? 'Grille indisponible.' : 'Chargement…'}</p>}
          <p className="note-bas">
            <a href={`${RACINE_DONNEES}/referentiels/nuances.csv`} download>Télécharger la grille (CSV)</a> ; elle est
            versionnée dans le dépôt du projet, où chaque choix est justifié.
          </p>
        </details>
      </Section>

      <Section titre="Qualité des données">
        <label className="champ">
          <span>Scrutin</span>
          <select value={scrutin.id} onChange={(e) => onScrutin(e.target.value)}>
            {grouper(catalogue.scrutins).map((g) => (
              <optgroup key={g.code} label={g.libelle}>
                {g.scrutins.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {manifeste.data
          ? (
            <>
              <Controles scrutin={scrutin} manifeste={manifeste.data} officiel={officiel} noms={noms} />
              <details className="depliant">
                <summary>Fichiers publiés et empreintes</summary>
                <div className="defilement" role="region" aria-label="Fichiers publiés" tabIndex={0}>
                  <table>
                    <thead><tr><th scope="col">Fichier</th><th scope="col" className="nombre">Taille</th><th scope="col">SHA-256</th></tr></thead>
                    <tbody>
                      {Object.entries(manifeste.data.fichiers).map(([nom, f]) => (
                        <tr key={nom}>
                          <th scope="row">{nom}</th>
                          <td className="nombre">{formatNombre(Math.round(f.octets / 1000))} Ko</td>
                          <td><code>{f.sha256}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="note-bas">
                  <a href={`${RACINE_DONNEES}/${scrutin.id}/scrutin.json`}>Manifeste complet (JSON)</a> ; construit en{' '}
                  {formatNombre(Math.round(manifeste.data.duree_s))} s à partir des sources ci-dessus.
                </p>
              </details>
            </>
          )
          : <p className="note">{manifeste.error ? 'Manifeste indisponible.' : 'Chargement…'}</p>}
      </Section>

      <Section titre="Limites connues">
        <ul className="liste">
          <li>Les contours des bureaux sont indicatifs : reconstitués en 2022 à partir des adresses, ils peuvent s'écarter du découpage réel, et les bureaux créés depuis n'y figurent pas.</li>
          <li>Paris, Lyon et Marseille : les données ne descendent qu'à la ville ; les résultats par arrondissement sont calculés d'après le numéro des bureaux, qui commence par celui de l'arrondissement (règle vérifiée sur tous les scrutins, à un ou deux bureaux près, laissés à la ville). Jusqu'en 2020, les municipales s'y votaient par secteur : chaque arrondissement montre les listes du sien, et la ville n'a pas de liste « en tête ».</li>
          <li>Nouvelle-Calédonie, Polynésie française, Wallis-et-Futuna : pas de contours de bureaux, résultats à la commune.</li>
          <li>L'offre politique change d'un scrutin à l'autre : une évolution de bloc peut tenir à l'absence d'une candidature.</li>
          <li>Seule la présidentielle 2022 est, à ce jour, rapprochée des totaux officiels proclamés.</li>
          <li>Scrutins nationaux antérieurs à 2012 (présidentielles et législatives de 2002 et 2007, européennes de 1999 à 2009) : la source ne contient pas les résultats de certains territoires d'outre-mer ni, selon les cas, des Français de l'étranger ; le rapport qualité de chaque scrutin les nomme. De 2012 à 2022, nos résultats nationaux par candidat égalent la proclamation officielle.</li>
        </ul>
      </Section>

      <Section titre="Code et licences">
        <ul className="liste">
          <li>
            Code source sous licence AGPL-3.0 : <a href={DEPOT} target="_blank" rel="noreferrer">github.com/aurelien032-glitch/atlas-electoral</a>.
            Le <a href={`${DEPOT}/blob/main/docs/PLAN.md`} target="_blank" rel="noreferrer">plan du projet</a> y détaille chaque décision.
          </li>
          <li>
            Fichiers publiés par le site (Parquet et JSON) : <a href={`${RACINE_DONNEES}/scrutins.json`}>catalogue des scrutins</a>.
          </li>
        </ul>
      </Section>
    </article>
  )
}
