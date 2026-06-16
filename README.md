# 3018 — statistiques d'activité (webapp statique)

Application web pour consulter les statistiques d'activité du 3018 : synthèse,
comparaison historique mensuelle (2024 / 2025 / 2026), sollicitations,
performance des canaux (téléphone, tchat, mail), signalements Trusted Flagger,
sorties d'anonymat, données BIK / Insafe et méthodologie. Les ETP théoriques
contextualisent les ressources dans la synthèse et la comparaison historique.

Elle est **statique** : pas de serveur, pas de base de données. Elle lit
simplement des fichiers `.json` rangés dans `data/`. Aucune donnée personnelle
n'est présente : uniquement des comptages agrégés.

---

## 1. Contenu et arborescence

```
statistiques-3018/
├── index.html        ← la page (structure)        ← NE PAS modifier en principe
├── style.css         ← l'apparence                 ← NE PAS modifier en principe
├── app.js            ← la logique d'affichage      ← NE PAS modifier en principe
├── README.md         ← ce fichier
└── data/             ← LES DONNÉES (à actualiser)  ← c'est ICI qu'on met à jour
    ├── activity_monthly.json
    ├── activity_quarterly.json
    ├── annual_to_date.json
    ├── historical_monthly.json
    ├── phone.json
    ├── chat.json
    ├── trusted_flagger.json
    ├── trusted_flagger_2026.json
    ├── anonymity_outputs.json
    ├── bik.json
    ├── methodology.json
    └── etp.json
```

- **À la racine du dépôt :** `index.html`, `style.css`, `app.js`, `README.md`.
- **Dans `data/` :** les 12 fichiers `.json`.

---

## 2. Quel fichier JSON alimente quelle section ?

| Section de l'application      | Fichier(s) JSON utilisé(s)                          |
|-------------------------------|-----------------------------------------------------|
| Synthèse                      | `annual_to_date.json`, `activity_monthly.json`, `anonymity_outputs.json`, `etp.json` |
| Comparaison historique        | `historical_monthly.json`, `etp.json`               |
| Sollicitations                | `activity_monthly.json`, `activity_quarterly.json`, `historical_monthly.json` |
| Performance des canaux        | `phone.json`, `chat.json`, `activity_monthly.json`  |
| Signalements Trusted Flagger  | `trusted_flagger_2026.json` (tableau de bord dynamique) ; `trusted_flagger.json` (synthèse) |
| Sorties d'anonymat            | `anonymity_outputs.json`                            |
| Données BIK / Insafe          | `bik.json`                                          |
| Méthodologie                  | `methodology.json`, `etp.json`                      |

> Les anciens onglets « Activité mensuelle », « Activité trimestrielle »,
> « Téléphone » et « Tchat » sont désormais regroupés dans « Sollicitations »
> et « Performance des canaux » (aucune donnée perdue).

---

## 2 bis. Les ETP (`data/etp.json`)

- **Source :** Octime — édition « Temps de base », champ **Temps dû initial**.
- **Méthode :** ETP mensuel = total des heures de temps dû initial ÷ (nombre de
  jours couverts × 5 heures).
- **Nature :** ETP **théorique** issu des cycles de planning. Ce **n'est pas**
  une mesure de présence réelle, ni de productivité ou d'efficacité, ni un
  indicateur individuel.
- **Période :** janvier 2025 → juin 2026. **Aucune valeur 2024** (affichée
  `n.d.`). **Juin 2026 partiel** (au 14/06) : jamais extrapolé en mois complet.
- **Où les ETP apparaissent :** uniquement dans **Synthèse** (carte « ETP moyen »
  janvier-mai) et **Comparaison historique** (ligne « ETP moyen » du tableau
  « Vue d'ensemble — janvier à mai »). Ils n'apparaissent dans aucun autre onglet.
- **Usage :** les ETP servent **uniquement à contextualiser les ressources
  globales**. Ce **n'est pas** une mesure de productivité : aucun ratio par ETP
  n'est affiché dans l'interface. Une donnée absente reste `n.d.`, jamais 0.
- **Mise à jour mensuelle :** ajouter une ligne dans `par_mois` de `etp.json`
  (`{ "mois": "AAAA-MM", "etp": 0.00, "statut": "complet" }`), puis remplacer le
  fichier dans `data/`. Marquer un mois en cours avec un `statut` « partiel… ».

---

---

## 3. Mettre à jour les données — procédure simple

### Étape 1 — Obtenir les nouveaux fichiers JSON

Deux cas :

- **Cas A — il suffit de remplacer les fichiers.** Si on vous fournit
  directement des fichiers `.json` déjà prêts (même noms que ci-dessus), il
  suffit de les déposer dans `data/`. Rien d'autre à faire.

- **Cas B — il faut régénérer les JSON.** Si vous avez seulement les fichiers
  sources du 3018 (les `.xlsx` et `.csv` : tableau d'activité mensuelle, exports
  3CX, stats tchat, signalements RS, sorties d'anonymat, Helpline Assessment
  Platform), il faut d'abord **régénérer les JSON** à partir de ces sources
  (étape réalisée par la personne qui prépare les données). On régénère
  notamment quand : un nouveau mois arrive, un fichier source est corrigé, ou la
  structure d'un export change.

> En résumé : **nouveaux `.xlsx`/`.csv` → régénérer les JSON** ; **JSON déjà
> prêts → simple remplacement dans `data/`**.

### Étape 2 — Remplacer les fichiers dans `data/`

Copiez les nouveaux `.json` dans le dossier `data/`, en écrasant les anciens.
**Ne touchez pas** à `index.html`, `style.css`, `app.js`.

### Étape 3 — Vérifier en local (recommandé)

⚠️ Ne double-cliquez pas sur `index.html` : ouvert en `file://`, le navigateur
bloque la lecture des JSON. Lancez un petit serveur local.

Avec Python (déjà présent sur Mac/Linux) — dans le dossier du projet :

```bash
python3 -m http.server 8000
```

Puis ouvrez `http://localhost:8000`. Pour arrêter : `Ctrl + C`.
(Avec VS Code : extension **Live Server**, clic droit sur `index.html`.)

Vérifiez que les chiffres se mettent à jour et que les onglets s'affichent.

### Étape 4 — Republier sur GitHub Pages

1. Ouvrez votre dépôt sur GitHub, entrez dans `data/`.
2. **Add file → Upload files**, glissez les nouveaux `.json`, **Commit changes**.
3. GitHub Pages se met à jour tout seul en 1 à 2 minutes.

### Étape 5 — Vérifier que GitHub Pages a bien pris la mise à jour

- Attendez 1–2 minutes après le commit.
- Rechargez la page publique en **vidant le cache** : `Ctrl + F5` (ou
  `Cmd + Shift + R` sur Mac).
- Dans **Settings → Pages**, un bandeau indique la dernière publication réussie.
- Si besoin, ouvrez l'onglet **Méthodologie** : la « dernière mise à jour des
  données » doit correspondre à votre nouvelle version.

---

## 4. Première publication sur GitHub Pages

1. Créez un dépôt (bouton **New**), par ex. `statistiques-3018`.
2. **Add file → Upload files** : déposez les 4 fichiers racine **et** le dossier
   `data/` complet, puis **Commit**.
3. **Settings → Pages** → Source : **Deploy from a branch**, branche **main**,
   dossier **/ (root)** → **Save**.
4. L'adresse publique apparaît après une minute :
   `https://votre-nom.github.io/statistiques-3018/`.

---

## 5. En cas de problème

- **Les tableaux affichent « Impossible de charger les données ».**
  Vous avez probablement ouvert le fichier en `file://`. Utilisez un serveur
  local (étape 3) ou la version GitHub Pages.
- **Une section affiche « n.d. » partout.** Le fichier JSON correspondant est
  peut-être absent, mal nommé ou mal formé. Vérifiez qu'il est bien dans `data/`
  avec le bon nom, et qu'il s'agit d'un JSON valide (un outil comme
  jsonlint.com permet de le vérifier).
- **« n.d. » sur quelques cases seulement.** C'est normal : la donnée est
  réellement absente ou non comparable pour cette case (ex. tchat de janvier,
  sollicitations tous canaux de février-mai 2026). Voir l'onglet Méthodologie.
- **Rien ne change après mise à jour sur GitHub Pages.** Videz le cache du
  navigateur (`Ctrl + F5`) et patientez 1–2 minutes.

---

## 6. Bon à savoir

- Tout fonctionne **hors ligne** : aucune librairie externe, aucune police à
  télécharger. Les graphiques sont dessinés par `app.js` (SVG / HTML).
- Quand une donnée n'existe pas, l'application affiche **« n.d. »** plutôt qu'un
  chiffre inventé. L'activité traitée février-mai 2026 est **tous canaux**
  (appels + tchats + mails) ; les mails (915 sur fév.-mai) ne sont plus comptés
  comme absents. Les mois issus de l'export Salesforce Case portent l'étiquette
  « SF » et le mois partiel l'étiquette « partiel ».
- La synthèse propose un bouton **« Copier les chiffres clés »** pour
  réutiliser les indicateurs dans un mail ou une présentation.

---

## 7. État des données (juin 2026)

Les 12 fichiers JSON sont renseignés. Limites connues, détaillées dans l'onglet
**Méthodologie** :

- **Historique — activité :** 2024 et 2025 consolidés (tableau d'activité) ;
  2026 reconstruit depuis les fichiers sources. Trois notions distinctes et
  affichées séparément : **sollicitations reçues** (appels reçus + tchats reçus
  + mails), **contacts traités** (appels décrochés + tchats traités + mails) et
  **activité de protection**. Mai : appels et tchats complets, mails partiels
  (26/05). Comparaisons possibles, à interpréter avec la prudence d'usage liée
  à la différence de provenance.
- **Historique — protection :** comparaison 2024 / 2025 / 2026 des signalements
  plateformes, remontées MEN, PHAROS, CRIP, OFMIN et signalements au procureur.
  2024-2025 viennent du tableau d'activité, 2026 des fichiers dédiés ; procureur
  n'existe qu'à partir de 2026, OFMIN à partir de 2025.
- **Tchat :** février-mai 2026 (janvier absent de l'export Conversation Entries).
- **Mails :** disponibles février-mai 2026 (export Salesforce Case, 915) et
  intégrés à l'activité traitée — plus comptés comme absents.
- **Juin 2026 :** partiel (arrêté au 12/06), marqué comme tel.
- **BIK / Insafe :** données déclaratives Q1 2026, présentées séparément.

Aucun fichier n'est vide.

---

## Onglet « Charge de travail » (ajout)

Cet onglet convertit l'activité mesurable en **heures théoriques estimées** et la compare à la **capacité contractuelle théorique** (ETP × 151,67 h/mois). C'est une **estimation partielle** : elle ne couvre pas tout le travail du service.

### Où se modifient les temps standards
Tout le paramétrage est dans un seul fichier : **`data/parametres_charge.json`**.
On peut y changer, sans toucher au code :
- les temps standards par activité (appels, tchats, mails, signalements, transmissions) ;
- la base ETP (151,67 h/mois) ;
- les mentions méthodologiques et la liste des activités encore hors calcul.

Après modification, on enregistre le fichier et on recharge la page : l'affichage se met à jour tout seul.

### Ce que l'onglet affiche
- un sélecteur de période (cumul janv.–mai, trimestre, ou un mois) ;
- les indicateurs clés : charge mesurée (h), équivalent journées de 7 h, équivalent ETP mobilisé, capacité contractuelle, taux d'occupation théorique ;
- la répartition des heures par activité ;
- le détail des composantes ;
- un grand tableau détaillé par mois ;
- la liste des activités non mesurées et les limites.

Des cartes de synthèse apparaissent aussi dans **Synthèse**, un tableau synthétique dans **Comparaison historique**, et tous les temps standards + formules + contrôles dans **Méthodologie**.

### Règles importantes
- Une donnée absente est affichée **« n.d. »**, jamais comptée comme zéro.
- La durée des appels est **réelle** (3CX) ; tchats, mails et signalements reposent sur des **temps conventionnels estimés**.
- **Signal-Sports** n'existe pas dans les fichiers actuels : la catégorie est prête mais affiche « n.d. ».
- Le taux d'occupation théorique **n'est pas** une mesure de productivité.
