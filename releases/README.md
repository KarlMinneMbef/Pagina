# Installeurs Pagina (Windows x64)

- `Pagina_<version>_x64-setup.exe` : installeur NSIS, le plus simple pour une installation manuelle.
- `Pagina_<version>_x64_en-US.msi` : installeur MSI, utile pour un déploiement centralisé (GPO/Intune).

Générés avec `npx tauri build` (voir la racine du dépôt). Aucun certificat de signature de code n'est configuré : Windows SmartScreen affichera un avertissement « éditeur non reconnu » au premier lancement — cliquer sur « Informations complémentaires → Exécuter quand même ».
