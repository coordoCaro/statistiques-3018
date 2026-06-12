/* =========================================================
   Reporting interne 3018 — logique d'affichage
   - charge les 9 fichiers JSON du dossier /data avec fetch()
   - construit chaque section à partir des données
   - aucun chiffre n'est écrit en dur dans le code
   ========================================================= */

"use strict";

/* Liste des sections (ordre des onglets) */
const SECTIONS = [
  { id: "synthese",     label: "Synthèse" },
  { id: "mensuel",      label: "Activité mensuelle" },
  { id: "trimestriel",  label: "Activité trimestrielle" },
  { id: "telephone",    label: "Téléphone" },
  { id: "tchat",        label: "Tchat" },
  { id: "signalements", label: "Signalements Trusted Flagger" },
  { id: "anonymat",     label: "Sorties d'anonymat" },
  { id: "bik",          label: "Données BIK / Insafe" },
  { id: "methodologie", label: "Méthodologie" },
];

/* Fichiers JSON à charger (clé interne -> chemin) */
const FICHIERS = {
  monthly:    "data/activity_monthly.json",
  quarterly:  "data/activity_quarterly.json",
  annual:     "data/annual_to_date.json",
  phone:      "data/phone.json",
  chat:       "data/chat.json",
  flagger:    "data/trusted_flagger.json",
  anonymity:  "data/anonymity_outputs.json",
  bik:        "data/bik.json",
  methodology:"data/methodology.json",
};

const DATA = {}; /* données chargées */

/* ---------------- Utilitaires de formatage ---------------- */
function nf(n) { return (n === null || n === undefined) ? null : Number(n).toLocaleString("fr-FR"); }
function show(n) { const s = nf(n); return s === null ? "n.d." : s; }
function showPct(n) { return (n === null || n === undefined) ? "n.d." : nf(n) + " %"; }
function esc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/* cellule de tableau : ajoute la classe nd si valeur manquante */
function td(value, isPct) {
  if (value === null || value === undefined) return '<td class="nd">n.d.</td>';
  return "<td>" + (isPct ? showPct(value) : show(value)) + "</td>";
}
/* puce d'évolution entre deux valeurs */
function evo(courant, precedent) {
  if (courant == null || precedent == null || precedent === 0) {
    return '<span class="evo neutre">n.d.</span>';
  }
  const p = (courant - precedent) / precedent * 100;
  const cls = p > 0.05 ? "hausse" : (p < -0.05 ? "baisse" : "neutre");
  const signe = p > 0 ? "+" : "";
  return '<span class="evo ' + cls + '">' + signe + p.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %</span>";
}

/* ---------------- Graphiques (SVG / HTML, sans librairie) ---------------- */

/* Barres verticales groupées : compare deux séries par mois */
function svgGroupedBars(items, keyA, keyB, colorA, colorB) {
  const W = 700, H = 240, padL = 46, padR = 14, padT = 14, padB = 36;
  const vals = items.flatMap(d => [d[keyA] || 0, d[keyB] || 0]);
  const max = Math.max(...vals, 1);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const groupW = plotW / items.length;
  const barW = Math.min(24, (groupW - 12) / 2);
  const y = v => padT + plotH - (v / max) * plotH;

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
  /* axe et repères 0 / max */
  [0, max].forEach(v => {
    const yy = y(v);
    svg += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#E4E7EC"/>';
    svg += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#8A90A2">' + nf(Math.round(v)) + '</text>';
  });
  items.forEach((d, i) => {
    const gx = padL + i * groupW + (groupW - barW * 2 - 6) / 2;
    const a = d[keyA] || 0, b = d[keyB] || 0;
    svg += '<rect x="' + gx + '" y="' + y(a) + '" width="' + barW + '" height="' + (padT + plotH - y(a)) + '" fill="' + colorA + '" rx="2"/>';
    svg += '<rect x="' + (gx + barW + 6) + '" y="' + y(b) + '" width="' + barW + '" height="' + (padT + plotH - y(b)) + '" fill="' + colorB + '" rx="2"/>';
    svg += '<text x="' + (gx + barW + 3) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#5A6072">' + esc(d.label) + '</text>';
  });
  svg += "</svg>";
  return svg;
}

/* Barres horizontales (répartitions) en HTML */
function htmlHBars(items, key, color, max) {
  const m = max || Math.max(...items.map(d => d[key] || 0), 1);
  let html = '<div class="hbars">';
  items.forEach(d => {
    const v = d[key] || 0;
    const w = (v / m * 100).toFixed(1);
    html += '<div class="hbar-row">'
      + '<div class="hbar-label">' + esc(d.label) + '</div>'
      + '<div class="hbar-track"><div class="hbar-fill" style="width:' + w + '%;background:' + color + '"></div></div>'
      + '<div class="hbar-val">' + show(v) + '</div>'
      + '</div>';
  });
  return html + "</div>";
}

function legende(parts) {
  return '<div class="legende">' + parts.map(p =>
    '<span><span class="pastille" style="background:' + p.color + '"></span>' + esc(p.label) + "</span>"
  ).join("") + "</div>";
}

/* ---------------- Rendu des sections ---------------- */

function renderSynthese() {
  const a = DATA.annual, m = DATA.monthly;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  const mois = (m && m.mois) ? m.mois : [];
  const last = mois[mois.length - 1] || {};
  const prev = mois[mois.length - 2] || {};

  let h = '<p class="intro">' + esc((a._meta && a._meta.avertissement) || "") + "</p>";

  /* Cartes chiffres clés (cumul annuel à date) */
  h += '<div class="cartes">';
  h += carte("Appels décrochés", show(a.telephone && a.telephone.appels_decroches), a.telephone && a.telephone.periode, true);
  h += carte("Tchats traités", show(a.tchat && a.tchat.tchats_traites), a.tchat && a.tchat.periode, false);
  h += carte("Signalements Trusted Flagger", show(a.signalements_trusted_flagger && a.signalements_trusted_flagger.total), a.signalements_trusted_flagger && a.signalements_trusted_flagger.periode, false);
  h += carte("Sorties d'anonymat", show(a.sorties_anonymat && a.sorties_anonymat.total), a.sorties_anonymat && a.sorties_anonymat.periode, false);
  if (a.volume_activite_traite) {
    h += '<div class="carte encart-jaune"><p class="carte-label">Volume d\'activité traité (indicatif)</p>'
      + '<p class="carte-valeur">' + show(a.volume_activite_traite.valeur_indicative_hors_emails) + "</p>"
      + '<p class="carte-note">' + esc(a.volume_activite_traite.note || "") + "</p></div>";
  }
  h += "</div>";

  /* Évolution M / M-1 (dernier mois disponible) */
  if (last.mois && prev.mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution ' + esc(libelleCourt(last.mois)) + " vs " + esc(libelleCourt(prev.mois)) + '</h3>';
    h += '<div class="cartes">';
    h += carteEvo("Appels décrochés", last.appels_decroches, prev.appels_decroches);
    h += carteEvo("Tchats traités", last.tchats_traites, prev.tchats_traites);
    h += carteEvo("Volume d'activité traité", last.volume_activite_traite, prev.volume_activite_traite);
    h += "</div></div>";
  }

  /* Comparaison historique janvier */
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    h += '<div class="bloc"><h3 class="bloc-titre">Comparaison historique — janvier</h3>';
    h += '<p class="periode-tag">' + esc(c.note || "") + "</p>";
    h += '<div class="table-enveloppe"><table><thead><tr><th>Indicateur</th><th>2024</th><th>2025</th><th>2026</th></tr></thead><tbody>';
    h += ligneHist("Sollicitations", c.sollicitations);
    h += ligneHist("Contacts traités", c.contacts_traites);
    h += ligneHistPct("Taux de réponse", c.taux_reponse_pct);
    h += "</tbody></table></div></div>";
  }
  return h;
}
function carte(label, val, periode, accent) {
  return '<div class="carte"><p class="carte-label">' + esc(label) + "</p>"
    + '<p class="carte-valeur' + (accent ? " accent" : "") + '">' + val + "</p>"
    + '<p class="carte-note">' + esc(periode || "") + "</p></div>";
}
function carteEvo(label, cur, prev) {
  return '<div class="carte"><p class="carte-label">' + esc(label) + "</p>"
    + '<p class="carte-valeur">' + show(cur) + "</p>" + evo(cur, prev) + "</div>";
}
function ligneHist(label, obj) {
  obj = obj || {};
  return "<tr><td>" + esc(label) + "</td>" + td(obj["2024"]) + td(obj["2025"]) + td(obj["2026"]) + "</tr>";
}
function ligneHistPct(label, obj) {
  obj = obj || {};
  return "<tr><td>" + esc(label) + "</td>" + td(obj["2024"], true) + td(obj["2025"], true) + td(obj["2026"], true) + "</tr>";
}
function libelleCourt(mois) {
  const noms = { "01": "janv.", "02": "févr.", "03": "mars", "04": "avr.", "05": "mai", "06": "juin",
    "07": "juil.", "08": "août", "09": "sept.", "10": "oct.", "11": "nov.", "12": "déc." };
  const p = String(mois).split("-");
  return (noms[p[1]] || mois) + " " + (p[0] || "");
}

function renderMensuel() {
  const m = DATA.monthly;
  if (!m || !m.mois) return '<p class="intro">Données indisponibles.</p>';
  const mois = m.mois;
  let h = '<p class="intro">' + esc((m._meta && m._meta.avertissement) || "") + "</p>";

  /* Tableau mensuel */
  h += '<div class="table-enveloppe"><table><thead><tr>'
    + "<th>Mois</th><th>Appels reçus</th><th>Appels décrochés</th><th>Taux réponse</th>"
    + "<th>Tchats reçus</th><th>Tchats traités</th><th>Taux prise</th>"
    + "<th>Volume traité</th><th>Signalements TF</th><th>Sorties anonymat</th>"
    + "</tr></thead><tbody>";
  mois.forEach(d => {
    h += '<tr><td class="cellule-mois">' + esc(d.libelle) + "</td>"
      + td(d.appels_recus) + td(d.appels_decroches) + td(d.taux_reponse_appels_pct, true)
      + td(d.tchats_recus) + td(d.tchats_traites) + td(d.taux_prise_tchat_pct, true)
      + td(d.volume_activite_traite) + td(d.signalements_trusted_flagger) + td(d.sorties_anonymat)
      + "</tr>";
  });
  h += "</tbody></table></div>";

  /* Observations par mois */
  h += '<div class="bloc"><h3 class="bloc-titre">Observations</h3><ul class="liste-propre">';
  mois.forEach(d => { if (d.observation) h += "<li><strong>" + esc(d.libelle) + " :</strong> " + esc(d.observation) + "</li>"; });
  h += "</ul></div>";

  /* Graphique : appels reçus vs décrochés */
  const items = mois.map(d => ({ label: libelleCourt(d.mois), recus: d.appels_recus, decroches: d.appels_decroches }));
  h += '<div class="bloc"><h3 class="bloc-titre">Appels reçus et décrochés par mois</h3>'
    + '<div class="graph">' + svgGroupedBars(items, "recus", "decroches", "#2337FA", "#FFB40A") + "</div>"
    + legende([{ label: "Appels reçus", color: "#2337FA" }, { label: "Appels décrochés", color: "#FFB40A" }]) + "</div>";
  return h;
}

function renderTrimestriel() {
  const q = DATA.quarterly;
  if (!q || !q.trimestres) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="intro">' + esc((q._meta && q._meta.avertissement) || "") + "</p>";
  q.trimestres.forEach(t => {
    h += '<div class="bloc"><h3 class="bloc-titre">' + esc(t.trimestre)
      + ' <span class="badge ' + (String(t.statut).includes("complet") && !String(t.statut).includes("incomplet") ? "consolide" : "partiel") + '">' + esc(t.statut) + "</span></h3>";
    h += '<div class="kv">';
    const notes = [];
    Object.keys(t).forEach(k => {
      if (k === "trimestre" || k === "statut" || k === "observation") return;
      const val = t[k];
      if (typeof val === "string") { notes.push(val); return; } /* notes texte affichées en dessous */
      const affiche = k.endsWith("pct") ? showPct(val) : show(val);
      h += '<div class="k">' + esc(etiquette(k)) + '</div><div class="v">' + affiche + "</div>";
    });
    h += "</div>";
    notes.forEach(n => { h += '<div class="note">' + esc(n) + "</div>"; });
    if (t.observation) h += '<div class="note">' + esc(t.observation) + "</div>";
    h += "</div>";
  });
  return h;
}
function etiquette(k) {
  return k.replace(/_/g, " ").replace(/\bpct\b/, "(%)")
    .replace("tchats", "tchats").replace("recus", "reçus").replace("decroches", "décrochés")
    .replace("abandonnes", "abandonnés").replace("signalements trusted flagger", "signalements TF");
}

function renderTelephone() {
  const p = DATA.phone;
  if (!p) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="periode-tag">' + esc((p._meta && p._meta.periode) || "") + "</p>";
  const s = p.synthese_periode || {};
  h += '<div class="cartes">'
    + carte("Appels reçus", show(s.appels_recus), "période", false)
    + carte("Appels décrochés", show(s.appels_decroches), "indicateur prioritaire", true)
    + carte("Appels abandonnés", show(s.appels_abandonnes), "non répondus", false)
    + carte("Taux de réponse", showPct(s.taux_reponse_pct), "décrochés / reçus", false)
    + "</div>";

  if (p.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>Mois</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th><th>Taux réponse</th><th>Durée moyenne</th>"
      + "</tr></thead><tbody>";
    p.par_mois.forEach(d => {
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>"
        + td(d.appels_recus) + td(d.appels_decroches) + td(d.appels_abandonnes) + td(d.taux_reponse_pct, true)
        + "<td>" + esc(d.duree_moyenne_appel || "n.d.") + "</td></tr>";
    });
    h += "</tbody></table></div></div>";
  }

  if (p.par_file_periode) {
    h += '<div class="bloc"><h3 class="bloc-titre">Files 3CX (période)</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>File</th><th>Rôle supposé</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th>"
      + "</tr></thead><tbody>";
    p.par_file_periode.forEach(f => {
      h += "<tr><td>" + esc(f.libelle || f.file_3cx) + "</td><td style=\"text-align:left\">" + esc(f.role_suppose || "") + "</td>"
        + td(f.appels_recus) + td(f.appels_decroches) + td(f.appels_abandonnes) + "</tr>";
    });
    h += "</tbody></table></div></div>";
  }
  if (p.note_methodologique) h += '<div class="note">' + esc(p.note_methodologique) + "</div>";
  return h;
}

function renderTchat() {
  const c = DATA.chat;
  if (!c) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="periode-tag">' + esc((c._meta && c._meta.periode) || "") + "</p>";
  if (c._meta && c._meta.perimetre) h += '<p class="intro">' + esc(c._meta.perimetre) + "</p>";
  const s = c.synthese_periode || {};
  h += '<div class="cartes">'
    + carte("Tchats reçus", show(s.tchats_recus), "période", false)
    + carte("Tchats traités", show(s.tchats_traites), "un écoutant a rejoint", true)
    + carte("Tchats abandonnés", show(s.tchats_abandonnes), "jamais pris", false)
    + carte("Taux de prise", showPct(s.taux_prise_pct), "traités / reçus", false)
    + "</div>";

  if (c.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>Mois</th><th>Reçus</th><th>Traités</th><th>Abandonnés</th><th>Taux de prise</th></tr></thead><tbody>";
    c.par_mois.forEach(d => {
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>"
        + td(d.tchats_recus) + td(d.tchats_traites) + td(d.tchats_abandonnes) + td(d.taux_prise_pct, true) + "</tr>";
    });
    h += "</tbody></table></div></div>";

    const items = c.par_mois.map(d => ({ label: libelleCourt(d.mois), recus: d.tchats_recus, traites: d.tchats_traites }));
    h += '<div class="bloc"><h3 class="bloc-titre">Tchats reçus et traités par mois</h3>'
      + '<div class="graph">' + svgGroupedBars(items, "recus", "traites", "#2337FA", "#FFB40A") + "</div>"
      + legende([{ label: "Tchats reçus", color: "#2337FA" }, { label: "Tchats traités", color: "#FFB40A" }]) + "</div>";
  }
  if (c.note_methodologique) h += '<div class="note">' + esc(c.note_methodologique) + "</div>";
  return h;
}

function renderSignalements() {
  const f = DATA.flagger;
  if (!f) return '<p class="intro">Données indisponibles.</p>';
  let h = '<div class="cartes">'
    + carte("Total 2026", show(f.total_2026), "tous mois", true)
    + carte("Cumul janv.–mai", show(f.cumul_janvier_mai_2026), "année à date", false)
    + "</div>";

  if (f.par_mois_2026) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par mois (2026)</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>Mois</th><th>Signalements</th><th>Statut</th></tr></thead><tbody>";
    f.par_mois_2026.forEach(d => {
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>" + td(d.signalements)
        + '<td><span class="badge ' + (d.statut === "consolidé" ? "consolide" : "partiel") + '">' + esc(d.statut) + "</span></td></tr>";
    });
    h += "</tbody></table></div></div>";
  }

  if (f.par_plateforme) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par plateforme</h3>'
      + htmlHBars(f.par_plateforme.map(d => ({ label: d.plateforme, v: d.signalements })), "v", "#2337FA") + "</div>";
  }
  if (f.par_type_contenu) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par type de contenu</h3>'
      + htmlHBars(f.par_type_contenu.map(d => ({ label: d.type, v: d.signalements })), "v", "#2337FA") + "</div>";
  }
  if (f.par_decision) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par décision de la plateforme</h3>'
      + htmlHBars(f.par_decision.map(d => ({ label: d.decision, v: d.signalements })), "v", "#5A6072") + "</div>";
  }
  if (f.indicateurs_issue && f.indicateurs_issue.note) {
    h += '<div class="note vigilance"><strong>Taux de retrait indicatif : '
      + showPct(f.indicateurs_issue.taux_retrait_indicatif_pct) + ".</strong> " + esc(f.indicateurs_issue.note) + "</div>";
  }
  if (f.note_methodologique) h += '<div class="note">' + esc(f.note_methodologique) + "</div>";
  return h;
}

function renderAnonymat() {
  const a = DATA.anonymity;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  let h = '<div class="cartes">' + carte("Cumul janv.–mai", show(a.cumul_janvier_mai_2026), "sorties d'anonymat", true) + "</div>";

  if (a.par_mois_2026) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par mois (2026)</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>Mois</th><th>Sorties</th><th>Statut</th></tr></thead><tbody>";
    a.par_mois_2026.forEach(d => {
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>" + td(d.sorties)
        + '<td><span class="badge ' + (d.statut === "consolidé" ? "consolide" : "partiel") + '">' + esc(d.statut) + "</span></td></tr>";
    });
    h += "</tbody></table></div></div>";
  }
  if (a.par_destinataire_janv_mai) {
    h += '<div class="bloc"><h3 class="bloc-titre">Par destinataire (janv.–mai)</h3>'
      + htmlHBars(a.par_destinataire_janv_mai.map(d => ({ label: d.destinataire, v: d.sorties })), "v", "#2337FA") + "</div>";
  }
  if (a.sous_destinataires_ips) {
    const s = a.sous_destinataires_ips;
    h += '<div class="bloc"><h3 class="bloc-titre">Détail IPS</h3><div class="kv">';
    ["Procureur", "CRIP", "OFMIN", "OCRTEH"].forEach(k => {
      if (s[k] !== undefined) h += '<div class="k">' + esc(k) + '</div><div class="v">' + show(s[k]) + "</div>";
    });
    h += "</div>";
    if (s.note) h += '<div class="note">' + esc(s.note) + "</div>";
    h += "</div>";
  }
  if (a.note_methodologique) h += '<div class="note">' + esc(a.note_methodologique) + "</div>";
  return h;
}

function renderBik() {
  const b = DATA.bik;
  if (!b) return '<p class="intro">Données indisponibles.</p>';
  let h = '<div class="note vigilance">' + esc((b._meta && b._meta.avertissement) || "") + "</div>";
  h += '<div class="cartes">' + carte("Contacts totaux déclarés", show(b.contacts_total_declares), (b._meta && b._meta.trimestre) || "", true) + "</div>";

  if (b.canaux) {
    const items = Object.keys(b.canaux).map(k => ({ label: k, v: b.canaux[k] }));
    h += '<div class="bloc"><h3 class="bloc-titre">Canaux</h3>' + htmlHBars(items, "v", "#2337FA") + "</div>";
  }
  if (b.public_cible) {
    h += '<div class="bloc"><h3 class="bloc-titre">Public cible</h3><div class="kv">';
    Object.keys(b.public_cible).forEach(k => {
      h += '<div class="k">' + esc(k.replace(/_/g, " ")) + '</div><div class="v">' + show(b.public_cible[k]) + "</div>";
    });
    h += "</div></div>";
  }
  if (b.categories_bik_non_exclusives) {
    const items = Object.keys(b.categories_bik_non_exclusives)
      .map(k => ({ label: k, v: b.categories_bik_non_exclusives[k] }))
      .sort((x, y) => y.v - x.v);
    h += '<div class="bloc"><h3 class="bloc-titre">Catégories BIK <span class="badge partiel">non exclusives — ne pas additionner</span></h3>'
      + htmlHBars(items, "v", "#5A6072") + "</div>";
  }
  if (b.dsa) {
    h += '<div class="bloc"><h3 class="bloc-titre">Digital Services Act</h3><div class="kv">'
      + '<div class="k">Trusted Flagger</div><div class="v">' + esc(b.dsa.trusted_flagger) + "</div>"
      + '<div class="k">Désigné depuis</div><div class="v">' + esc(b.dsa.designe_depuis) + "</div>"
      + '<div class="k">Signalements du trimestre</div><div class="v">' + show(b.dsa.signalements_trimestre) + "</div>"
      + "</div></div>";
  }
  if (b.narratif) {
    h += '<div class="bloc"><h3 class="bloc-titre">Tendances et faits marquants</h3><div class="bloc-texte">';
    const map = { tendances: "Tendances et enjeux", success_story: "Réussite", difficultes: "Difficultés", commentaire_categories: "Note sur les catégories" };
    Object.keys(map).forEach(k => {
      if (b.narratif[k]) h += '<span class="etiquette">' + esc(map[k]) + "</span><p>" + esc(b.narratif[k]) + "</p>";
    });
    h += "</div></div>";
  }
  return h;
}

function renderMethodologie() {
  const m = DATA.methodology;
  if (!m) return '<p class="intro">Données indisponibles.</p>';
  let h = "";
  if (m.fichiers_utilises) {
    h += '<div class="bloc"><h3 class="bloc-titre">Fichiers utilisés</h3><div class="table-enveloppe"><table><thead><tr>'
      + "<th>Fichier</th><th>Usage</th><th>Période</th><th>Limite</th></tr></thead><tbody>";
    m.fichiers_utilises.forEach(f => {
      h += '<tr><td style="text-align:left">' + esc(f.fichier) + '</td><td style="text-align:left">' + esc(f.usage)
        + '</td><td style="text-align:left">' + esc(f.periode) + '</td><td style="text-align:left">' + esc(f.limite) + "</td></tr>";
    });
    h += "</tbody></table></div></div>";
  }
  if (m.regles_de_calcul) {
    h += '<div class="bloc"><h3 class="bloc-titre">Règles de calcul</h3><div class="kv">';
    Object.keys(m.regles_de_calcul).forEach(k => {
      h += '<div class="k">' + esc(k.replace(/_/g, " ")) + '</div><div class="v" style="text-align:left;font-weight:500">' + esc(m.regles_de_calcul[k]) + "</div>";
    });
    h += "</div></div>";
  }
  if (m.donnees_manquantes) {
    h += '<div class="bloc"><h3 class="bloc-titre">Données manquantes</h3><ul class="liste-propre">'
      + m.donnees_manquantes.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
  }
  if (m.ecarts_entre_sources) {
    h += '<div class="bloc"><h3 class="bloc-titre">Écarts entre sources</h3><ul class="liste-propre">'
      + m.ecarts_entre_sources.map(e => "<li><strong>" + esc(e.sujet) + " :</strong> " + esc(e.ecart) + " <em>Source retenue : " + esc(e.source_retenue) + "</em></li>").join("") + "</ul></div>";
  }
  if (m.ruptures_methodologiques) {
    h += '<div class="bloc"><h3 class="bloc-titre">Ruptures méthodologiques</h3><ul class="liste-propre">'
      + m.ruptures_methodologiques.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
  }
  if (m.confidentialite) h += '<div class="note vigilance"><strong>Confidentialité.</strong> ' + esc(m.confidentialite) + "</div>";
  if (m.perimetre_partiel_juin) h += '<div class="note">' + esc(m.perimetre_partiel_juin) + "</div>";
  return h;
}

const RENDERERS = {
  synthese: renderSynthese, mensuel: renderMensuel, trimestriel: renderTrimestriel,
  telephone: renderTelephone, tchat: renderTchat, signalements: renderSignalements,
  anonymat: renderAnonymat, bik: renderBik, methodologie: renderMethodologie,
};

/* ---------------- Navigation ---------------- */
function construireNavigation() {
  const nav = document.getElementById("navigation");
  nav.innerHTML = SECTIONS.map((s, i) =>
    '<button class="nav-bouton' + (i === 0 ? " actif" : "") + '" data-cible="' + s.id + '">' + esc(s.label) + "</button>"
  ).join("");
  nav.querySelectorAll(".nav-bouton").forEach(btn => {
    btn.addEventListener("click", () => activerSection(btn.dataset.cible));
  });
}
function activerSection(id) {
  document.querySelectorAll(".nav-bouton").forEach(b => b.classList.toggle("actif", b.dataset.cible === id));
  document.querySelectorAll(".section").forEach(sec => { sec.hidden = sec.id !== id; });
  const cible = document.getElementById(id);
  if (cible) cible.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

/* ---------------- Chargement ---------------- */
async function charger() {
  const statut = document.getElementById("statut");
  statut.innerHTML = '<p class="message">Chargement des données…</p>';

  const cles = Object.keys(FICHIERS);
  const resultats = await Promise.allSettled(
    cles.map(k => fetch(FICHIERS[k]).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }))
  );

  let erreurs = 0;
  resultats.forEach((res, i) => {
    if (res.status === "fulfilled") DATA[cles[i]] = res.value;
    else erreurs++;
  });

  if (Object.keys(DATA).length === 0) {
    statut.innerHTML = '<div class="erreur"><strong>Impossible de charger les données.</strong> '
      + "Si vous avez ouvert le fichier directement (adresse commençant par <code>file://</code>), le navigateur bloque la lecture des JSON. "
      + "Lancez un petit serveur local (voir le README) puis rechargez la page.</div>";
    return;
  }

  /* Période globale dans l'en-tête, à partir du cumul annuel */
  if (DATA.annual && DATA.annual._meta) {
    const e = document.getElementById("entete-periode");
    e.textContent = "Cumul annuel à date " + (DATA.annual._meta.annee || "") + " — données arrêtées au " + (DATA.annual._meta.arret || "") + ".";
  }

  /* Rendu de chaque section */
  SECTIONS.forEach(s => {
    const cont = document.getElementById(s.id + "-contenu");
    if (cont && RENDERERS[s.id]) {
      try { cont.innerHTML = RENDERERS[s.id](); }
      catch (e) { cont.innerHTML = '<p class="intro">Erreur d\'affichage pour cette section.</p>'; }
    }
  });

  statut.innerHTML = erreurs
    ? '<p class="message">Données chargées (' + erreurs + " fichier(s) absent(s) — sections concernées indisponibles).</p>"
    : "";
}

document.addEventListener("DOMContentLoaded", () => {
  construireNavigation();
  charger();
});
