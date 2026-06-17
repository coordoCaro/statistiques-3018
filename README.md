# 3018 — statistiques d'activité (webapp statique)

Application web pour consulter les statistiques d'activité du 3018 : synthèse,
comparaison historique mensuelle (2024 / 2025 / 2026), sollicitations,
performance des canaux (téléphone, tchat, mail), signalements Trusted Flagger,
sorties d'anonymat, données BIK / Insafe et méthodologie. Un onglet « ETP et
activité » met en regard les ETP, les absences et le temps consacré aux
sollicitations et aux activités annexes. Les ETP n'apparaissent que dans
« Synthèse » et « ETP et activité » (plus dans « Comparaison historique »).

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
    ├── etp.json
    ├── absences_monthly.json     ← absences en heures (agrégées, non nominatives)
    ├── workforce_monthly.json    ← nombre d'écoutants par mois
    └── workload_config.json      ← temps standards + base ETP (à modifier ici)
```

- **À la racine du dépôt :** `index.html`, `style.css`, `app.js`, `README.md`.
- **Dans `data/` :** les fichiers `.json` (dont `absences_monthly.json`, `workforce_monthly.json`, `workload_config.json`).

---

## 2. Quel fichier JSON alimente quelle section ?

| Section de l'application      | Fichier(s) JSON utilisé(s)                          |
|-------------------------------|-----------------------------------------------------|
| Synthèse                      | `annual_to_date.json`, `activity_monthly.json`, `anonymity_outputs.json`, `etp.json` |
| Comparaison historique        | `historical_monthly.json`                           |
| ETP et activité               | `etp.json`, `absences_monthly.json`, `workforce_monthly.json`, `workload_config.json`, `activity_monthly.json`, `phone.json`, `chat.json`, `trusted_flagger.json`, `anonymity_outputs.json` |
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
- **Méthode :** ETP mensuel issu des cycles Octime (Temps dû initial). La
  référence est **35 h / semaine = 5 jours × 7 h** : le « 5 » est un nombre de
  **jours par semaine**, pas un nombre d'heures par jour. Pour convertir un ETP
  en heures de travail : **1 ETP = 151,67 h / mois** (35 × 52 ÷ 12).
- **Nature :** ETP **théorique** issu des cycles de planning. Ce **n'est pas**
  une mesure de présence réelle, ni de productivité ou d'efficacité, ni un
  indicateur individuel.
- **Période :** janvier 2025 → juin 2026. **Aucune valeur 2024** (affichée
  `n.d.`). **Juin 2026 partiel** (au 14/06) : jamais extrapolé en mois complet.
- **Où les ETP apparaissent :** uniquement dans **Synthèse** (carte du dernier
  mois complet) et **ETP et activité** (analyse détaillée). Ils n'apparaissent
  **plus** dans « Comparaison historique » ni dans aucun autre onglet.
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

## Onglet « ETP et activité » (ajout)

Cet onglet répond à une question : **pourquoi les sollicitations prises en charge
peuvent baisser alors que les ETP augmentent ?** Il met côte à côte les ETP, les
absences, les sollicitations et le temps consacré à chaque type d'activité, pour
montrer que les **activités annexes** prennent une place croissante.

### Fichiers qui l'alimentent
- `etp.json` : ETP mensuels (1 ETP = 151,67 h / mois).
- `absences_monthly.json` : absences **en heures**, agrégées par mois, **non
  nominatives** (congés payés, maladie, RTT, maternité, formation, événements
  familiaux, récupération, autres ; nombre de personnes concernées ; statut).
- `workforce_monthly.json` : **nombre d'écoutants** par mois (pour le temps de
  réunions = écoutants × 5 h). Tant qu'il n'est pas renseigné, les réunions
  restent « n.d. ».
- `workload_config.json` : **temps standards** et base ETP. **C'est ici qu'on
  modifie** un temps (ex. minutes par tchat) sans toucher au code.

### L'export Excel d'absences ne doit **pas** être publié
Le fichier brut Octime (`R@CPT_MAN9_...XLSX`) contient des données nominatives :
il ne doit **jamais** être déposé sur GitHub. Seul le fichier agrégé
`absences_monthly.json` (non nominatif) est publié.

### Mettre à jour le nombre d'écoutants
À partir de l'export Octime des **présences** (postes ECO), compter chaque mois
les **personnes distinctes** ayant au moins une ligne datée avec du temps
planifié, validé ou réalisé (chaque personne une seule fois ; ne pas exclure une
personne ayant eu des absences ; ne pas déduire l'effectif des ETP). Reporter le
résultat dans `workforce_monthly.json` (`nombre_ecoutants`).

### Temps standards (modifiables dans `workload_config.json`)
appel = durée réelle ou moyenne + 10 min ; tchat = 30 min ; mail = 15 min ;
MEN = 10 min ; plateforme = 20 min ; Procureur / article 40 = 120 min ;
IP / CRIP = 105 min ; Pharos = 30 min ; Signal-Sports = 20 min (donnée n.d.) ;
réunions = 5 h / mois / écoutant. Ces temps **comparent les activités**, ils ne
mesurent pas une performance individuelle.

### Règles
- Une donnée absente reste **« n.d. »**, jamais 0 ; aucune évolution n'est
  calculée si une valeur manque ; les mois partiels ne sont jamais extrapolés.
- La **formation** figure dans les absences (déduite des heures disponibles) et
  n'est jamais recomptée dans les activités annexes.
- La différence entre heures ETP et heures mesurées **n'est pas** de
  l'inactivité : beaucoup d'activités ne sont pas mesurées.
