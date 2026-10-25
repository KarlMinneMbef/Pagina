//! Correction orthographique (2026-10-25) — moteur Hunspell en Rust (`spellbook`).
//!
//! Pourquoi côté Rust et pas `nspell` en JavaScript (comme le fait CasualOffice, mais avec
//! un dictionnaire anglais bien plus petit) : mesuré avec le dictionnaire français, `nspell`
//! met ~9 s à charger et occupe ~400 Mo ; `spellbook` charge en ~40 ms, vérifie un mot en
//! quelques microsecondes et propose des suggestions en < 200 ms.
//!
//! Les dictionnaires sont intégrés à l'exécutable. Une langue = une ligne dans `LANGS`
//! (voir `dictionaries/README.md`). Le dictionnaire PERSONNEL de l'utilisateur et les mots
//! ignorés vivent côté interface (ils s'appliquent avant l'appel) : ce module ne connaît que
//! la langue et les mots.
//!
//! Commandes `async` : elles s'exécutent hors du thread principal, la recherche de
//! suggestions (la plus lente) ne bloque donc jamais l'interface.

use serde::Serialize;
use spellbook::Dictionary;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

struct Lang {
    code: &'static str,
    label: &'static str,
    aff: &'static str,
    dic: &'static str,
}

const LANGS: &[Lang] = &[Lang {
    code: "fr",
    label: "Français",
    aff: include_str!("../dictionaries/fr/fr.aff"),
    dic: include_str!("../dictionaries/fr/fr.dic"),
}];

/// Dictionnaires déjà chargés (chargement paresseux, une seule fois par langue).
#[derive(Default)]
pub struct SpellState {
    dicts: Mutex<HashMap<String, Arc<Dictionary>>>,
}

#[derive(Serialize)]
pub struct SpellLanguage {
    code: &'static str,
    label: &'static str,
}

impl SpellState {
    fn dictionary(&self, code: &str) -> Result<Arc<Dictionary>, String> {
        let mut dicts = self.dicts.lock().map_err(|_| "verrou du dictionnaire empoisonné".to_string())?;
        if let Some(d) = dicts.get(code) {
            return Ok(d.clone());
        }
        let lang = LANGS.iter().find(|l| l.code == code).ok_or_else(|| format!("langue inconnue : {code}"))?;
        let dict = Dictionary::new(lang.aff, lang.dic).map_err(|e| format!("dictionnaire illisible : {e}"))?;
        let dict = Arc::new(dict);
        dicts.insert(code.to_string(), dict.clone());
        Ok(dict)
    }
}

/// Apostrophe typographique → droite (les dictionnaires Hunspell écrivent `l'eau`).
fn normalize(word: &str) -> String {
    word.replace('’', "'")
}

fn is_correct(dict: &Dictionary, word: &str) -> bool {
    let w = normalize(word);
    if dict.check(&w) {
        return true;
    }
    // Hunspell est sensible à la casse : un nom propre tapé en minuscules ou un mot de début
    // de phrase ne doivent pas être signalés pour leur seule casse.
    let lower = w.to_lowercase();
    lower != w && dict.check(&lower)
}

/// Langues disponibles (pour une future liste de choix).
#[tauri::command]
pub async fn spell_languages() -> Vec<SpellLanguage> {
    LANGS.iter().map(|l| SpellLanguage { code: l.code, label: l.label }).collect()
}

/// Renvoie, parmi les mots donnés, ceux qui sont mal orthographiés.
#[tauri::command]
pub async fn spell_check(state: tauri::State<'_, SpellState>, lang: String, words: Vec<String>) -> Result<Vec<String>, String> {
    let dict = state.dictionary(&lang)?;
    Ok(words.into_iter().filter(|w| !is_correct(&dict, w)).collect())
}

/// Suggestions de correction pour un mot (au plus `limit`).
#[tauri::command]
pub async fn spell_suggest(state: tauri::State<'_, SpellState>, lang: String, word: String, limit: usize) -> Result<Vec<String>, String> {
    let dict = state.dictionary(&lang)?;
    let mut out = Vec::new();
    dict.suggest(&normalize(&word), &mut out);
    out.truncate(limit);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn francais_courant_et_fautes() {
        let state = SpellState::default();
        let dict = state.dictionary("fr").unwrap();
        for ok in ["ventilation", "calorifugeage", "l'entreprise", "l’entreprise", "Valence", "valence", "d'œuvre"] {
            assert!(is_correct(&dict, ok), "{ok} devrait être correct");
        }
        for ko in ["ventillation", "entrepeneur", "ecrit"] {
            assert!(!is_correct(&dict, ko), "{ko} devrait être signalé");
        }
        let mut s = Vec::new();
        dict.suggest("ventillation", &mut s);
        assert!(s.iter().any(|x| x == "ventilation"));
    }

    #[test]
    fn langue_inconnue() {
        assert!(SpellState::default().dictionary("xx").is_err());
    }
}
