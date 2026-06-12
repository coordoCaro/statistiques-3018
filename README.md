# Reporting interne 3018 — webapp statique

Petite application web pour consulter les statistiques d'activité du 3018
(mensuel, trimestriel, annuel à date). Elle est **statique** : pas de serveur,
pas de base de données. Elle lit simplement des fichiers `.json` rangés dans le
dossier `data/` et les affiche dans des tableaux et des graphiques.

Aucune donnée personnelle n'est présente dans les fichiers : uniquement des
comptages agrégés.

---

## 1. Contenu du dossier

```
statistiques-3018/
├── index.html        ← la page (structure)
├── style.css         ← l'apparence (charte e-Enfance / 3018)
├── app.js            ← la logique (charge les JSON et construit l'affichage)
├── README.md         ← ce fichier
└── data/             ← les données (à actualiser chaque mois)
    ├── activity_monthly.json
    ├── activity_quarterly.json
    ├── annual_to_date.json
    ├── phone.json
    ├── chat.json
    ├── trusted_flagger.json
    ├── anonymity_outputs.json
    ├── bik.json
    └── methodology.json
```

- **À la racine du dépôt :** `index.html`, `style.css`, `app.js`, `README.md`.
- **Dans le dossier `data/` :** les 9 fichiers `.json`.

C'est tout. Pour mettre à jour les chiffres, on **remplace les fichiers JSON**
dans `data/` : la page se met à jour toute seule, sans toucher au code.

---

## 2. Tester en local (sur votre ordinateur)

⚠️ **Important :** il ne suffit pas de double-cliquer sur `index.html`. Ouvert
ainsi (adresse `file://...`), le navigateur **bloque** la lecture des fichiers
JSON pour des raisons de sécurité. Il faut lancer un petit serveur local.

### Option simple : avec Python (déjà installé sur Mac et Linux)

1. Ouvrez un terminal **dans le dossier du projet** (celui qui contient `index.html`).
2. Tapez :

   ```bash
   python3 -m http.server 8000
   ```

3. Dans votre navigateur, allez à l'adresse : `http://localhost:8000`
4. Pour arrêter le serveur : `Ctrl + C` dans le terminal.

### Option : avec VS Code

Installez l'extension **Live Server**, puis clic droit sur `index.html` →
« Open with Live Server ».

---

## 3. Publier gratuitement sur GitHub Pages

1. Créez un compte sur [github.com](https://github.com) si besoin.
2. Créez un nouveau dépôt (bouton **New**), par exemple `statistiques-3018`.
3. Déposez les fichiers : ouvrez le dépôt, bouton **Add file → Upload files**,
   glissez `index.html`, `style.css`, `app.js`, `README.md` **et le dossier
   `data/`** (avec ses 9 fichiers), puis **Commit changes**.
4. Allez dans **Settings → Pages**.
5. Sous « Build and deployment », choisissez **Source : Deploy from a branch**,
   branche **main**, dossier **/ (root)**, puis **Save**.
6. Patientez une minute : GitHub affiche l'adresse publique, du type
   `https://votre-nom.github.io/statistiques-3018/`.

### Mettre à jour les chiffres plus tard

Allez dans le dossier `data/` sur GitHub, ouvrez le fichier à remplacer
(ou **Add file → Upload files** pour écraser), validez par **Commit**.
La page publiée se met à jour automatiquement.

---

## 4. Bon à savoir

- Tout fonctionne **hors ligne** : aucune librairie externe, aucune police à
  télécharger, aucune dépendance.
- Les graphiques sont dessinés directement par `app.js` (SVG et HTML), pas de
  bibliothèque tierce.
- Si un fichier JSON est absent ou mal formé, la section correspondante affiche
  un message au lieu de planter le reste de la page.
- Quand une donnée n'existe pas, l'application affiche **« n.d. »**
  (non disponible) plutôt qu'un chiffre inventé.

---

## 5. État des données (juin 2026)

Les 9 fichiers JSON sont **renseignés** avec de vraies données. Points
d'attention, détaillés dans l'onglet **Méthodologie** de l'application :

- **Tchat :** données de **février à mai 2026** (janvier absent de l'export).
- **Volume d'activité traité :** consolidé tous canaux pour **janvier** ;
  pour février-mai, calculé comme *appels décrochés + tchats traités*
  (**hors emails**, aucune source email exploitable).
- **Juin 2026 :** partiel (données arrêtées au 12/06/2026), signalé comme tel.
- **Comparaison annuelle :** possible seulement pour **janvier**
  (seul mois 2026 consolidé tous canaux dans le tableau d'activité).

Aucun fichier n'est vide.
