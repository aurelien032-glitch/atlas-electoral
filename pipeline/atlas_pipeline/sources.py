"""Résolution et verrouillage des sources officielles (manifeste sources.lock.json).

On relève, pour chaque ressource, l'URL finale et ses marqueurs de version (ETag, date, taille)
sans télécharger le fichier : une requête d'un seul octet suffit.
"""
import datetime as dt
import json
import re
import urllib.request
from pathlib import Path

from .config import LIEN_PERENNE, RESSOURCES


def resoudre(id_ressource: str) -> dict:
    requete = urllib.request.Request(
        LIEN_PERENNE.format(id=id_ressource),
        headers={"Range": "bytes=0-0", "User-Agent": "atlas-electoral-pipeline"},
    )
    with urllib.request.urlopen(requete, timeout=60) as reponse:
        plage = reponse.headers.get("Content-Range", "")
        taille = re.search(r"/(\d+)$", plage)
        return {
            "id": id_ressource,
            "url": reponse.url,
            "etag": (reponse.headers.get("ETag") or "").strip('"'),
            "derniere_modification": reponse.headers.get("Last-Modified"),
            "taille": int(taille.group(1)) if taille else int(reponse.headers.get("Content-Length") or 0),
        }


def verrouiller(chemin: Path) -> dict:
    manifeste = {
        "releve_le": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sources": {nom: resoudre(ident) for nom, ident in RESSOURCES.items()},
    }
    chemin.write_text(json.dumps(manifeste, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifeste
