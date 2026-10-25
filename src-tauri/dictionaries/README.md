# Dictionnaires orthographiques (Hunspell)

Un dossier par langue, avec `<code>.aff`, `<code>.dic` et `LICENSE.txt`. Les fichiers sont
intégrés à l'exécutable (`include_str!` dans `src/spell_commands.rs`) : aucun téléchargement.

| Langue | Source | Licence |
|---|---|---|
| `fr` — Français | [Dicollecte / Hunspell-fr 7.5](https://grammalecte.net/home.php?prj=fr) via [`dictionary-fr` 3.0.0](https://github.com/wooorm/dictionaries/tree/main/dictionaries/fr) | MPL-2.0 (fichiers non modifiés) |

**Ajouter une langue** : déposer les fichiers dans un nouveau dossier, ajouter une ligne à `LANGS`
dans `spell_commands.rs`, et rien d'autre (le reste de l'application ne connaît que le code de langue).
