/* =========================================================
   3018 — statistiques d'activité
   Charge les fichiers JSON de /data avec fetch() et construit
   chaque section. Aucun chiffre n'est écrit en dur.
   ========================================================= */
"use strict";

const SECTIONS = [
  { id: "synthese",     label: "Synthèse" },
  { id: "historique",   label: "Comparaison historique" },
  { id: "sollicitations", label: "Sollicitations" },
  { id: "performance",  label: "Performance des canaux" },
  { id: "etp_activite", label: "ETP et activité" },
  { id: "signalements", label: "Signalements Trusted Flagger" },
  { id: "anonymat",     label: "Sorties d'anonymat" },
  { id: "bik",          label: "Données BIK / Insafe" },
  { id: "methodologie", label: "Méthodologie" },
];

const FICHIERS = {
  monthly:     "data/activity_monthly.json",
  quarterly:   "data/activity_quarterly.json",
  annual:      "data/annual_to_date.json",
  historical:  "data/historical_monthly.json",
  phone:       "data/phone.json",
  chat:        "data/chat.json",
  flagger:     "data/trusted_flagger.json",
  tf2026:      "data/trusted_flagger_2026.json",
  anonymity:   "data/anonymity_outputs.json",
  bik:         "data/bik.json",
  methodology: "data/methodology.json",
  etp:         "data/etp.json",
  absences:    "data/absences_monthly.json",
  workforce:   "data/workforce_monthly.json",
  workload:    "data/workload_config.json",
};

const DATA = {};
const BLEU = "#2337FA", JAUNE = "#FFB40A", GRIS = "#5A6072", VERT = "#1E9E5A", ROUGE = "#D92D20";

/* ---------------- Formatage ---------------- */
function nf(n) { return (n === null || n === undefined) ? null : Number(n).toLocaleString("fr-FR"); }
function show(n) { const s = nf(n); return s === null ? "n.d." : s; }
function showPct(n) { return (n === null || n === undefined) ? "n.d." : nf(n) + " %"; }
function esc(t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function td(v, isPct) {
  if (v === null || v === undefined) return '<td class="nd">n.d.</td>';
  return "<td>" + (isPct ? showPct(v) : show(v)) + "</td>";
}
const MOIS_COURT = { "01": "janv.", "02": "févr.", "03": "mars", "04": "avr.", "05": "mai", "06": "juin",
  "07": "juil.", "08": "août", "09": "sept.", "10": "oct.", "11": "nov.", "12": "déc." };
function libelleCourt(mois) { const p = String(mois).split("-"); return (MOIS_COURT[p[1]] || mois) + " " + (p[0] || ""); }

/* évolution chiffrée -> {cls, txt} */
function evoCalc(cur, prev, unite) {
  if (cur == null || prev == null || prev === 0) return { cls: "neutre", txt: "n.d." };
  if (unite === "pt") {
    const d = Math.round((cur - prev) * 10) / 10;
    return { cls: d > 0.05 ? "hausse" : (d < -0.05 ? "baisse" : "neutre"), txt: (d > 0 ? "+" : "") + d.toLocaleString("fr-FR") + " pt" };
  }
  const p = (cur - prev) / prev * 100;
  return { cls: p > 0.5 ? "hausse" : (p < -0.5 ? "baisse" : "neutre"),
    txt: (p > 0 ? "+" : "") + p.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %" };
}
function evoBadge(cur, prev, unite) { const e = evoCalc(cur, prev, unite); return '<span class="evo ' + e.cls + '">' + e.txt + "</span>"; }

/* tendance sur une série de valeurs (premier vs dernier non nuls) */
function tendance(values) {
  const pts = values.map((v, i) => ({ v, i })).filter(o => o.v != null);
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1];
  const e = evoCalc(b.v, a.v);
  return { premier: a.v, dernier: b.v, idxA: a.i, idxB: b.i, cls: e.cls, txt: e.txt };
}

/* ---------------- Graphiques ---------------- */
function svgGroupedBars(items, keyA, keyB, colorA, colorB) {
  const W = 720, H = 240, padL = 48, padR = 14, padT = 14, padB = 36;
  const max = Math.max(...items.flatMap(d => [d[keyA] || 0, d[keyB] || 0]), 1);
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const groupW = plotW / items.length, barW = Math.min(22, (groupW - 12) / 2);
  const y = v => padT + plotH - (v / max) * plotH;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
  [0, max].forEach(v => { const yy = y(v);
    s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#E4E7EC"/>';
    s += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#8A90A2">' + nf(Math.round(v)) + '</text>'; });
  items.forEach((d, i) => {
    const gx = padL + i * groupW + (groupW - barW * 2 - 6) / 2;
    const a = d[keyA] || 0, b = d[keyB] || 0;
    s += '<rect x="' + gx + '" y="' + y(a) + '" width="' + barW + '" height="' + (padT + plotH - y(a)) + '" fill="' + colorA + '" rx="2"/>';
    s += '<rect x="' + (gx + barW + 6) + '" y="' + y(b) + '" width="' + barW + '" height="' + (padT + plotH - y(b)) + '" fill="' + colorB + '" rx="2"/>';
    s += '<text x="' + (gx + barW + 3) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#5A6072">' + esc(d.label) + '</text>';
  });
  return s + "</svg>";
}

/* barres simples mensuelles, dernier mois (partiel) hachuré */
function svgBars(items, color, partialIndex) {
  const W = 720, H = 220, padL = 48, padR = 14, padT = 14, padB = 34;
  const max = Math.max(...items.map(d => d.v || 0), 1);
  const plotW = W - padL - padR, plotH = H - padT - padB, bw = plotW / items.length;
  const y = v => padT + plotH - (v / max) * plotH;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img"><defs><pattern id="hch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="' + color + '" opacity="0.35"/><line x1="0" y1="0" x2="0" y2="6" stroke="' + color + '" stroke-width="3"/></pattern></defs>';
  [0, max].forEach(v => { const yy = y(v);
    s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#E4E7EC"/>';
    s += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#8A90A2">' + nf(Math.round(v)) + '</text>'; });
  items.forEach((d, i) => {
    const x = padL + i * bw + bw * 0.2, w = bw * 0.6, v = d.v || 0;
    const fill = (i === partialIndex) ? "url(#hch)" : color;
    s += '<rect x="' + x + '" y="' + y(v) + '" width="' + w + '" height="' + (padT + plotH - y(v)) + '" fill="' + fill + '" rx="2"/>';
    s += '<text x="' + (x + w / 2) + '" y="' + (y(v) - 4) + '" text-anchor="middle" font-size="10" fill="#5A6072">' + show(v) + '</text>';
    s += '<text x="' + (x + w / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="11" fill="#5A6072">' + esc(d.label) + '</text>';
  });
  return s + "</svg>";
}

/* courbes multi-séries (comparaison annuelle) */
function svgLineChart(labels, series, unite) {
  const W = 760, H = 320, padL = 52, padR = 16, padT = 18, padB = 40;
  const all = series.flatMap(s => s.data.filter(v => v != null));
  const max = Math.max(...all, 1), plotW = W - padL - padR, plotH = H - padT - padB;
  const x = i => padL + (labels.length <= 1 ? plotW / 2 : i / (labels.length - 1) * plotW);
  const y = v => padT + plotH - v / max * plotH;
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">';
  [0, max / 2, max].forEach(v => { const yy = y(v);
    s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (W - padR) + '" y2="' + yy + '" stroke="#EEF0F5"/>';
    s += '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#8A90A2">' + nf(Math.round(v)) + (unite === "pct" ? "%" : "") + '</text>'; });
  labels.forEach((l, i) => { s += '<text x="' + x(i) + '" y="' + (H - 14) + '" text-anchor="middle" font-size="10" fill="#5A6072">' + esc(l) + '</text>'; });
  series.forEach(serie => {
    let dpath = "", started = false;
    serie.data.forEach((v, i) => {
      if (v == null) { started = false; return; }
      dpath += (started ? " L" : " M") + x(i) + " " + y(v); started = true;
    });
    if (dpath) s += '<path d="' + dpath.trim() + '" fill="none" stroke="' + serie.color + '" stroke-width="2.5"/>';
    serie.data.forEach((v, i) => { if (v != null) s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + serie.color + '"/>'; });
  });
  return s + "</svg>";
}

function htmlHBars(items, color, max) {
  const m = max || Math.max(...items.map(d => d.v || 0), 1);
  return '<div class="hbars">' + items.map(d => {
    const v = d.v || 0, w = (v / m * 100).toFixed(1);
    return '<div class="hbar-row"><div class="hbar-label" title="' + esc(d.label) + '">' + esc(d.label) + '</div>'
      + '<div class="hbar-track"><div class="hbar-fill" style="width:' + w + '%;background:' + color + '"></div></div>'
      + '<div class="hbar-val">' + show(v) + '</div></div>';
  }).join("") + "</div>";
}
function legende(parts) {
  return '<div class="legende">' + parts.map(p => '<span><span class="pastille" style="background:' + p.color + '"></span>' + esc(p.label) + "</span>").join("") + "</div>";
}

/* ---------------- Briques d'interface ---------------- */
function kpi(label, value, sub, tone) {
  return '<div class="kpi ' + (tone || "") + '"><p class="kpi-label">' + esc(label) + "</p>"
    + '<p class="kpi-valeur">' + value + "</p>" + (sub ? '<p class="kpi-sub">' + esc(sub) + "</p>" : "") + "</div>";
}
function carteEvo(label, cur, prev, sub) {
  return '<div class="kpi"><p class="kpi-label">' + esc(label) + "</p><p class=\"kpi-valeur\">" + show(cur) + "</p>"
    + evoBadge(cur, prev) + (sub ? ' <span class="kpi-sub-inline">' + esc(sub) + "</span>" : "") + "</div>";
}
function noteBox(txt, type) { return '<div class="note ' + (type || "") + '">' + txt + "</div>"; }
function lectureBox(titre, bullets) {
  return '<div class="lecture"><h3 class="lecture-titre">' + esc(titre) + "</h3><ul>"
    + bullets.map(b => '<li class="pt-' + (b.cls || "neutre") + '">' + b.txt + "</li>").join("") + "</ul></div>";
}

/* ---------------- SYNTHÈSE ---------------- */
function renderSynthese() {
  const a = DATA.annual, m = DATA.monthly;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  let h = "";

  /* Export Excel — boutons accessibles dès la Synthèse. */
  h += '<div class="bloc export-actions">'
    + '<button id="btn-export-complet" class="bouton">Exporter toutes les données</button>'
    + '<button id="btn-export-perso" class="bouton bouton-secondaire">Créer un export personnalisé</button>'
    + '</div>';

  /* Hero — cumul annuel à date */
  h += '<div class="kpis hero">';
  h += kpi("Appels décrochés", show(a.telephone && a.telephone.appels_decroches), (a.telephone && a.telephone.periode) || "", "primaire");
  h += kpi("Tchats traités", show(a.tchat && a.tchat.tchats_traites), (a.tchat && a.tchat.periode) || "", "primaire");
  h += kpi("Signalements envoyés", show(a.signalements_trusted_flagger && a.signalements_trusted_flagger.total), (a.signalements_trusted_flagger && a.signalements_trusted_flagger.periode) || "", "primaire");
  h += kpi("Sorties d'anonymat", show(a.sorties_anonymat && a.sorties_anonymat.total), (a.sorties_anonymat && a.sorties_anonymat.periode) || "", "primaire");
  h += "</div>";

  /* Activité traitée tous canaux (cumul, volume — indicateur existant conservé). */
  if (a.volume_activite_traite) {
    h += '<div class="kpis">';
    h += kpi("Activité traitée tous canaux", show(a.volume_activite_traite.cumul_janv_mai), "janv.–mai", "accent");
    h += "</div>";
  }

  /* ETP et activité — dernier mois complet. C'est le SEUL endroit où l'ETP
     apparaît dans la Synthèse ; le détail est dans l'onglet « ETP et activité ». */
  h += blocEtpSynthese();

  /* Janvier 2026 / janvier 2025 */
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    const s26 = c.sollicitations["2026"], s25 = c.sollicitations["2025"];
    const t26 = c.contacts_traites["2026"], t25 = c.contacts_traites["2025"];
    const r26 = c.taux_reponse_pct["2026"], r25 = c.taux_reponse_pct["2025"];
    h += '<div class="bloc"><h3 class="bloc-titre">Janvier 2026 / janvier 2025</h3><div class="kpis">';
    h += carteEvo("Sollicitations", s26, s25);
    h += carteEvo("Contacts traités", t26, t25);
    h += '<div class="kpi"><p class="kpi-label">Taux de réponse global</p><p class="kpi-valeur">' + showPct(r26) + "</p>" + evoBadge(r26, r25, "pt") + "</div>";
    h += "</div></div>";
  }

  /* Copier les chiffres clés */
  h += '<div class="bloc"><button id="btn-copier" class="bouton">Copier les chiffres clés</button>'
    + '<span id="copie-ok" class="copie-ok" hidden>Copié.</span></div>';

  return h;
}

function serieMensuelle(arr, key) { return (arr || []).map(d => d[key]); }

function construireLecture() {
  const b = [];
  const f = DATA.flagger, an = DATA.anonymity, ph = DATA.phone, ch = DATA.chat;
  function ligne(label, values, labels, suffixe) {
    const t = tendance(values);
    if (!t) return null;
    const mot = t.cls === "hausse" ? "en hausse" : (t.cls === "baisse" ? "en baisse" : "stable");
    return { cls: t.cls, txt: "<strong>" + esc(label) + " :</strong> " + mot + " (" + esc(labels[t.idxA]) + " " + show(t.premier) + " → " + esc(labels[t.idxB]) + " " + show(t.dernier) + (suffixe || "") + ", " + t.txt + ")." };
  }
  if (f && f.par_mois_2026) {
    const cons = f.par_mois_2026.filter(d => d.statut === "consolidé");
    b.push(ligne("Signalements Trusted Flagger", cons.map(d => d.signalements), cons.map(d => libelleCourt(d.mois))));
  }
  if (an && an.par_mois_2026) {
    const cons = an.par_mois_2026.filter(d => d.statut === "consolidé");
    b.push(ligne("Sorties d'anonymat", cons.map(d => d.sorties), cons.map(d => libelleCourt(d.mois))));
  }
  if (ph && ph.par_mois) b.push(ligne("Taux de réponse téléphone", ph.par_mois.map(d => d.taux_reponse_pct), ph.par_mois.map(d => libelleCourt(d.mois)), " %"));
  if (ch && ch.par_mois) b.push(ligne("Taux de prise tchat", ch.par_mois.map(d => d.taux_prise_pct), ch.par_mois.map(d => libelleCourt(d.mois)), " %"));
  /* éléments partiels / prudence */
  b.push({ cls: "neutre", txt: "<strong>À interpréter avec prudence :</strong> 2026 reconstruit depuis les fichiers sources (sollicitations reçues = entrants ; contacts traités = décrochés/traités) ; mai porte des mails partiels (26/05) ; tchat de janvier absent ; juin partiel sur signalements et sorties." });
  return b.filter(Boolean);
}

function construireAlertes() {
  const out = [];
  const ph = DATA.phone;
  if (ph && ph.synthese_periode && ph.synthese_periode.taux_reponse_pct != null && ph.synthese_periode.taux_reponse_pct < 30) {
    out.push({ titre: "Taux de réponse téléphone sous tension.", txt: "Sur janvier-mai, " + showPct(ph.synthese_periode.taux_reponse_pct) + " des appels reçus sont décrochés (base files 3CX, susceptible de recompter des appels via débordement).", type: "vigilance" });
  }
  const f = DATA.flagger;
  if (f && f.par_mois_2026) {
    const cons = f.par_mois_2026.filter(d => d.statut === "consolidé");
    const t = tendance(cons.map(d => d.signalements));
    if (t && t.cls === "hausse") out.push({ titre: "Activité de signalement en hausse.", txt: "Les signalements Trusted Flagger progressent sur la période (" + t.txt + " entre le premier et le dernier mois consolidé)." });
  }
  return out;
}

function texteSynthese() {
  const a = DATA.annual, m = DATA.monthly;
  const L = [];
  L.push("3018 — synthèse (cumul 2026 au " + ((a._meta && a._meta.arret) || "n.d.") + ")");
  if (a.telephone) L.push("Appels décrochés (" + a.telephone.periode + ") : " + show(a.telephone.appels_decroches));
  if (a.tchat) L.push("Tchats traités (" + a.tchat.periode + ") : " + show(a.tchat.tchats_traites));
  if (a.signalements_trusted_flagger) L.push("Signalements envoyés (" + a.signalements_trusted_flagger.periode + ") : " + show(a.signalements_trusted_flagger.total));
  if (a.sorties_anonymat) L.push("Sorties d'anonymat (" + a.sorties_anonymat.periode + ") : " + show(a.sorties_anonymat.total));
  if (a.volume_activite_traite) L.push("Activité traitée janv.-mai : " + show(a.volume_activite_traite.cumul_janv_mai));
  const dmc = dernierMoisComplet();
  if (dmc) {
    const sol = solDuMois(dmc), etp = etpDe(dmc), ratio = (sol != null && etp) ? Math.round(sol / etp * 10) / 10 : null;
    L.push("ETP et activité (" + libelleCourt(dmc) + ", dernier mois complet) : ETP " + show(etp)
      + ", sollicitations prises en charge " + show(sol) + ", soit " + show(ratio) + " par ETP.");
  }
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    L.push("Janvier 2026 : sollicitations " + show(c.sollicitations["2026"]) + ", contacts traités " + show(c.contacts_traites["2026"]) + ", taux de réponse global " + showPct(c.taux_reponse_pct["2026"]) + ".");
  }
  return L.join("\n");
}

/* ---------------- COMPARAISON HISTORIQUE ---------------- */
let HIST_IND = "sollicitations";
let PROT_IND = "signalements_plateformes";
const HIST_LABELS = { sollicitations: "Sollicitations reçues", contacts_traites: "Contacts traités", taux_reponse_global_pct: "Taux de réponse global" };

/* Cumul janvier-mai (indices 0 à 4) d'une série {2024:[12], 2025:[12], 2026:[12]}.
   Renvoie null pour une année si une valeur indispensable manque (jamais 0). */
function histCumulJM(serie) {
  const out = {};
  ["2024", "2025", "2026"].forEach(y => {
    const arr = (serie && serie[y]) ? serie[y].slice(0, 5) : null;
    out[y] = (arr && arr.length === 5 && arr.every(v => v != null)) ? arr.reduce((a, b) => a + b, 0) : null;
  });
  return out;
}

/* Tableau « Vue d'ensemble — janvier à mai » : indicateurs côte à côte sur une
   période strictement comparable (1er janv. → 31 mai de chaque année).
   Aucun total général, aucune somme entre indicateurs de nature différente. */
function histVueEnsemble() {
  const hd = DATA.historical;
  if (!hd) return "";
  const S = hd.series || {}, P = (hd.protection && hd.protection.series) || {};

  const sol = histCumulJM(S.sollicitations);
  const con = histCumulJM(S.contacts_traites);
  const sig = histCumulJM(P.signalements_plateformes);
  const men = histCumulJM(P.men);
  const pha = histCumulJM(P.pharos);
  const crip = histCumulJM(P.crip_ip_sp_regroupes);

  /* Taux de réponse global = cumul contacts traités / cumul sollicitations × 100
     (recalculé sur les cumuls, jamais une moyenne des taux mensuels). */
  const taux = {};
  ["2024", "2025", "2026"].forEach(y => {
    taux[y] = (con[y] != null && sol[y] != null && sol[y] > 0) ? Math.round(con[y] / sol[y] * 1000) / 10 : null;
  });

  /* ETP retiré de cet onglet : les ETP n'apparaissent que dans « Synthèse »
     et « ETP et activité ». */

  function evoCell(c, unite) {
    if (c["2026"] == null || c["2025"] == null || c["2025"] === 0) return '<td><span class="nd">n.d.</span></td>';
    return "<td>" + evoBadge(c["2026"], c["2025"], unite || "") + "</td>";
  }
  function rowVol(label, c) {
    return '<tr><td class="vue-ind">' + esc(label) + "</td>" + td(c["2024"]) + td(c["2025"]) + td(c["2026"]) + evoCell(c, "") + "</tr>";
  }
  function rowTaux(label, c) {
    return '<tr><td class="vue-ind">' + esc(label) + "</td>" + td(c["2024"], true) + td(c["2025"], true) + td(c["2026"], true) + evoCell(c, "pt") + "</tr>";
  }
  function sousTitre(t) { return '<tr class="vue-groupe"><td colspan="5">' + esc(t) + "</td></tr>"; }

  let h = '<div class="bloc"><h3 class="bloc-titre">Vue d\'ensemble — janvier à mai</h3>';
  h += '<div class="table-enveloppe"><table class="vue-ensemble"><thead><tr>'
    + "<th>Indicateur</th><th>2024</th><th>2025</th><th>2026</th><th>Évolution 2026 / 2025</th></tr></thead><tbody>";
  h += sousTitre("Contacts");
  h += rowVol("Sollicitations reçues", sol);
  h += rowVol("Contacts traités", con);
  h += rowTaux("Taux de réponse global", taux);
  h += sousTitre("Actions de protection");
  h += rowVol("Signalements plateformes", sig);
  h += rowVol("Remontées MEN", men);
  h += rowVol("PHAROS", pha);
  h += rowVol("CRIP / IP / signalements au procureur regroupés", crip);
  h += "</tbody></table></div>";
  h += noteBox("Comparaison limitée à la période de janvier à mai pour permettre une lecture homogène entre 2024, 2025 et 2026.");
  h += noteBox("Ces indicateurs décrivent des activités de nature et de durée différentes. Ils ne doivent pas être additionnés.");
  h += "</div>";
  return h;
}

function renderHistorique() {
  const hd = DATA.historical;
  if (!hd) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="intro">' + esc(hd._meta.avertissement) + "</p>";

  /* Tableau transversal janvier-mai, avant les graphiques mensuels */
  h += histVueEnsemble();

  /* Bloc 1 — activité */
  h += '<div class="bloc"><h3 class="bloc-titre">Activité (globale et traitée)</h3>';
  h += '<div class="selecteur" id="hist-selecteur">';
  Object.keys(HIST_LABELS).forEach(k => h += '<button class="seg' + (k === HIST_IND ? " actif" : "") + '" data-ind="' + k + '">' + esc(HIST_LABELS[k]) + "</button>");
  h += '</div><div id="hist-zone"></div></div>';

  /* Bloc 2 — protection / signalement */
  if (hd.protection) {
    h += '<div class="bloc"><h3 class="bloc-titre">Protection et signalement</h3>';
    h += '<p class="intro">' + esc(hd.protection.notes.comparabilite) + "</p>";
    h += '<div class="selecteur" id="prot-selecteur">';
    Object.keys(hd.protection.indicateurs).forEach(k => h += '<button class="seg' + (k === PROT_IND ? " actif" : "") + '" data-ind="' + k + '">' + esc(hd.protection.indicateurs[k]) + "</button>");
    h += '</div><div id="prot-zone"></div></div>';
  }
  return h;
}

/* Constructeur générique : courbe + tableau + évolutions */
function blocComparatif(labels, s, statut2026, unite, statutInfo, note) {
  const series = [
    { name: "2024", color: "#9AA2B8", data: s["2024"] || [] },
    { name: "2025", color: JAUNE, data: s["2025"] || [] },
    { name: "2026", color: BLEU, data: s["2026"] || [] },
  ];
  let h = '<div class="graph">' + svgLineChart(labels, series, unite) + "</div>"
    + legende([{ label: "2024", color: "#9AA2B8" }, { label: "2025", color: JAUNE }, { label: "2026", color: BLEU }]);
  const isPct = unite === "pct", uniteEvo = isPct ? "pt" : "";
  h += '<div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>2024</th><th>2025</th><th>Évol. 25/24</th><th>2026</th><th>Évol. 26/25</th></tr></thead><tbody>';
  labels.forEach((lab, i) => {
    const v24 = (s["2024"] || [])[i], v25 = (s["2025"] || [])[i], v26 = (s["2026"] || [])[i];
    const info = statutInfo(statut2026 ? statut2026[i] : null, v26);
    const evo2625 = info.comparable ? evoBadge(v26, v25, uniteEvo) : (v26 != null ? '<span class="evo neutre">non comparable</span>' : '<span class="nd">n.d.</span>');
    h += "<tr><td class=\"cellule-mois\">" + esc(lab) + "</td>"
      + td(v24, isPct) + td(v25, isPct) + "<td>" + evoBadge(v25, v24, uniteEvo) + "</td>"
      + (v26 == null ? '<td class="nd">n.d.</td>' : "<td>" + (isPct ? showPct(v26) : show(v26)) + (info.badge || "") + "</td>")
      + "<td>" + evo2625 + "</td></tr>";
  });
  h += "</tbody></table></div>";
  if (note) h += noteBox(note);
  return h;
}

function statutActivite(st, v26) {
  if (v26 == null) return { comparable: false, badge: "" };
  if (st === "consolidé") return { comparable: true, badge: "" };
  if (st && st.indexOf("mails partiels") >= 0) return { comparable: true, badge: ' <span class="mini-badge">rec.</span> <span class="mini-badge part">mails part.</span>' };
  if (st === "reconstruit") return { comparable: true, badge: ' <span class="mini-badge">rec.</span>' };
  return { comparable: false, badge: "" };
}
function statutProtection(st, v26) {
  if (v26 == null) return { comparable: false, badge: "" };
  if (st === "partiel") return { comparable: false, badge: ' <span class="mini-badge part">partiel</span>' };
  return { comparable: true, badge: ' <span class="mini-badge">2026</span>' };
}

function remplirHistorique() {
  const hd = DATA.historical, zone = document.getElementById("hist-zone");
  if (!zone) return;

  const unite = HIST_IND === "taux_reponse_global_pct" ? "pct" : "";
  function info(st, v26) {
    if (v26 == null) return { comparable: false, badge: "" };
    if (st === "consolidé") return { comparable: true, badge: "" };
    let badge = ' <span class="mini-badge">rec.</span>';
    if (st && st.indexOf("mails partiels") >= 0) badge += ' <span class="mini-badge part">mails part.</span>';
    return { comparable: true, badge: badge };
  }
  let note;
  if (HIST_IND === "sollicitations")
    note = "Sollicitations reçues = appels reçus + tchats reçus + mails (activité entrante). 2026 fév.–mai reconstruites.";
  else if (HIST_IND === "contacts_traites")
    note = "Contacts traités = appels décrochés + tchats traités + mails. 2026 fév.–mai reconstruits (mai : mails partiels).";
  else
    note = "Taux de réponse global = contacts traités / sollicitations reçues. Évolution en points.";
  zone.innerHTML = blocComparatif(hd.mois_labels, hd.series[HIST_IND], hd.statut_2026, unite, info, note);
}
function remplirProtection() {
  const hd = DATA.historical, zone = document.getElementById("prot-zone");
  if (!zone || !hd.protection) return;
  const p = hd.protection;
  const note = "<strong>Sources.</strong> " + esc(p.notes.source_2024_2025) + " pour 2024-2025 ; " + esc(p.notes.source_2026) + " pour 2026. " + esc(p.notes.indicateurs_partiels);
  zone.innerHTML = blocComparatif(p.mois_labels, p.series[PROT_IND], p.statut_2026, "", statutProtection, note);
}

/* ---------------- ACTIVITÉ MENSUELLE ---------------- */
function renderMensuel() {
  const m = DATA.monthly;
  if (!m || !m.mois) return '<p class="intro">Données indisponibles.</p>';
  const mois = m.mois;
  let h = '<p class="intro">' + esc((m._meta && m._meta.avertissement) || "") + "</p>";

  /* évolution M/M-1 sur le dernier mois disponible */
  const last = mois[mois.length - 1], prev = mois[mois.length - 2];
  if (last && prev) {
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution ' + esc(libelleCourt(last.mois)) + " vs " + esc(libelleCourt(prev.mois)) + '</h3><div class="kpis">'
      + carteEvo("Appels décrochés", last.appels_decroches, prev.appels_decroches)
      + carteEvo("Tchats traités", last.tchats_traites, prev.tchats_traites)
      + carteEvo("Volume d'activité traité", last.volume_activite_traite, prev.volume_activite_traite)
      + carteEvo("Signalements TF", last.signalements_trusted_flagger, prev.signalements_trusted_flagger)
      + "</div></div>";
  }

  h += '<div class="table-enveloppe"><table><thead><tr>'
    + "<th>Mois</th><th>Appels reçus</th><th>Décrochés</th><th>Taux rép.</th><th>Tchats reçus</th><th>Tchats traités</th><th>Taux prise</th><th>Activité traitée<br>(tous canaux)</th><th>Signal. TF</th><th>Sorties anon.</th>"
    + "</tr></thead><tbody>";
  mois.forEach(d => {
    h += '<tr><td class="cellule-mois">' + esc(d.libelle) + "</td>"
      + td(d.appels_recus) + td(d.appels_decroches) + td(d.taux_reponse_appels_pct, true)
      + td(d.tchats_recus) + td(d.tchats_traites) + td(d.taux_prise_tchat_pct, true)
      + td(d.volume_activite_traite) + td(d.signalements_trusted_flagger) + td(d.sorties_anonymat) + "</tr>";
  });
  h += "</tbody></table></div>";
  h += noteBox("Taux de réponse téléphone = appels décrochés / appels reçus (base files 3CX). Activité traitée : janvier via le tableau d'activité ; février-mai reconstruite = appels décrochés (3CX) + tchats traités (export tchat) + mails (export SF Case). Mai : appels et tchats complets, mails partiels (26/05).");

  /* Activité traitée tous canaux (appels décrochés + tchats traités + mails) */
  const tc = m.activite_traitee_tous_canaux;
  if (tc) {
    h += '<div class="bloc"><h3 class="bloc-titre">Activité traitée tous canaux (appels décrochés + tchats traités + mails)</h3>';
    h += '<div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Appels décrochés</th><th>Tchats traités</th><th>Mails</th><th>Total</th></tr></thead><tbody>';
    tc.par_mois.forEach(d => {
      const part = String(d.statut).includes("partiel");
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + (part ? ' <span class="mini-badge part">mails part.</span>' : "") + "</td>"
        + td(d.appels_decroches) + td(d.tchats_traites) + td(d.mails) + "<td><strong>" + show(d.total) + "</strong></td></tr>";
    });
    if (tc.totaux_fev_mai) {
      const t = tc.totaux_fev_mai;
      h += '<tr class="ligne-total"><td>Total fév.\u2013mai' + (t.mails_mai_partiels ? " (mails mai partiels)" : "") + "</td>" + td(t.appels_decroches) + td(t.tchats_traites) + td(t.mails) + "<td>" + show(t.total) + "</td></tr>";
    }
    h += "</tbody></table></div>" + noteBox(esc(tc.note));
    const items = tc.par_mois.map(d => ({ label: libelleCourt(d.mois), v: d.total }));
    const idxPart = tc.par_mois.findIndex(d => String(d.statut).includes("partiel"));
    h += '<div class="graph">' + svgBars(items, BLEU, idxPart) + "</div></div>";
  }

  const items = mois.map(d => ({ label: libelleCourt(d.mois), recus: d.appels_recus, decroches: d.appels_decroches }));
  h += '<div class="bloc"><h3 class="bloc-titre">Appels reçus et décrochés par mois</h3><div class="graph">'
    + svgGroupedBars(items, "recus", "decroches", BLEU, JAUNE) + "</div>"
    + legende([{ label: "Appels reçus", color: BLEU }, { label: "Appels décrochés", color: JAUNE }]) + "</div>";

  /* observations */
  h += '<div class="bloc"><h3 class="bloc-titre">Observations</h3><ul class="liste-propre">'
    + mois.filter(d => d.observation).map(d => "<li><strong>" + esc(d.libelle) + " :</strong> " + esc(d.observation) + "</li>").join("") + "</ul></div>";
  return h;
}

/* ---------------- TRIMESTRIEL ---------------- */
function renderTrimestriel() {
  const q = DATA.quarterly;
  if (!q || !q.trimestres) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="intro">' + esc((q._meta && q._meta.avertissement) || "") + "</p>";
  q.trimestres.forEach(t => {
    const partiel = String(t.statut).includes("incomplet") || String(t.statut).includes("partiel") || String(t.statut).includes("cours");
    h += '<div class="bloc"><h3 class="bloc-titre">' + esc(t.trimestre) + ' <span class="badge ' + (partiel ? "partiel" : "consolide") + '">' + esc(t.statut) + "</span></h3>";
    h += '<div class="kv">';
    const notes = [];
    Object.keys(t).forEach(k => {
      if (["trimestre", "statut", "observation"].includes(k)) return;
      const v = t[k];
      if (typeof v === "string") { notes.push(v); return; }
      h += '<div class="k">' + esc(etiquette(k)) + '</div><div class="v">' + (k.endsWith("pct") ? showPct(v) : show(v)) + "</div>";
    });
    h += "</div>";
    notes.forEach(n => h += noteBox(esc(n)));
    if (t.observation) h += noteBox(esc(t.observation));
    h += "</div>";
  });
  return h;
}
function etiquette(k) {
  return k.replace(/_/g, " ").replace(/\bpct\b/, "(%)").replace("recus", "reçus").replace("decroches", "décrochés")
    .replace("abandonnes", "abandonnés").replace("signalements trusted flagger", "signalements TF");
}

/* ---------------- TÉLÉPHONE ---------------- */
function renderTelephone() {
  const p = DATA.phone;
  if (!p) return '<p class="intro">Données indisponibles.</p>';
  const s = p.synthese_periode || {};
  let h = '<p class="periode-tag">' + esc((p._meta && p._meta.periode) || "") + "</p>";
  h += '<div class="kpis">'
    + kpi("Appels reçus", show(s.appels_recus), "période", "")
    + kpi("Appels décrochés", show(s.appels_decroches), "indicateur prioritaire", "primaire")
    + kpi("Appels abandonnés", show(s.appels_abandonnes), "non répondus", "")
    + kpi("Taux de réponse", showPct(s.taux_reponse_pct), "décrochés / reçus", (s.taux_reponse_pct != null && s.taux_reponse_pct < 30) ? "vigilance" : "")
    + "</div>";
  if (p.par_mois) {
    const tx = tendance(p.par_mois.map(d => d.taux_reponse_pct));
    if (tx) h += lectureBox("Lecture", [{ cls: tx.cls, txt: "Taux de réponse " + (tx.cls === "hausse" ? "en amélioration" : tx.cls === "baisse" ? "en recul" : "stable") + " sur la période (" + libelleCourt(p.par_mois[tx.idxA].mois) + " " + showPct(tx.premier) + " → " + libelleCourt(p.par_mois[tx.idxB].mois) + " " + showPct(tx.dernier) + ")." }]);
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th><th>Taux rép.</th><th>Durée moy.</th></tr></thead><tbody>';
    p.par_mois.forEach(d => { h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>" + td(d.appels_recus) + td(d.appels_decroches) + td(d.appels_abandonnes) + td(d.taux_reponse_pct, true) + "<td>" + esc(d.duree_moyenne_appel || "n.d.") + "</td></tr>"; });
    h += "</tbody></table></div></div>";
  }
  if (p.par_file_periode) {
    h += '<div class="bloc"><h3 class="bloc-titre">Files 3CX (période)</h3><div class="table-enveloppe"><table><thead><tr><th>File</th><th>Rôle supposé</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th></tr></thead><tbody>';
    p.par_file_periode.forEach(f => { h += "<tr><td>" + esc(f.libelle || f.file_3cx) + '</td><td style="text-align:left">' + esc(f.role_suppose || "") + "</td>" + td(f.appels_recus) + td(f.appels_decroches) + td(f.appels_abandonnes) + "</tr>"; });
    h += "</tbody></table></div></div>";
  }
  if (p.note_methodologique) h += noteBox(esc(p.note_methodologique));
  return h;
}

/* ---------------- TCHAT ---------------- */
function renderTchat() {
  const c = DATA.chat;
  if (!c) return '<p class="intro">Données indisponibles.</p>';
  const s = c.synthese_periode || {};
  let h = '<p class="periode-tag">' + esc((c._meta && c._meta.periode) || "") + "</p>";
  if (c._meta && c._meta.perimetre) h += '<p class="intro">' + esc(c._meta.perimetre) + "</p>";
  h += '<div class="kpis">'
    + kpi("Tchats reçus", show(s.tchats_recus), "période", "")
    + kpi("Tchats traités", show(s.tchats_traites), "un écoutant a rejoint", "primaire")
    + kpi("Tchats abandonnés", show(s.tchats_abandonnes), "jamais pris", "")
    + kpi("Taux de prise", showPct(s.taux_prise_pct), "traités / reçus", "")
    + "</div>";
  if (c.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Reçus</th><th>Traités</th><th>Abandonnés</th><th>Taux prise</th></tr></thead><tbody>';
    c.par_mois.forEach(d => { h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>" + td(d.tchats_recus) + td(d.tchats_traites) + td(d.tchats_abandonnes) + td(d.taux_prise_pct, true) + "</tr>"; });
    h += "</tbody></table></div></div>";
    const items = c.par_mois.map(d => ({ label: libelleCourt(d.mois), recus: d.tchats_recus, traites: d.tchats_traites }));
    h += '<div class="bloc"><h3 class="bloc-titre">Tchats reçus et traités par mois</h3><div class="graph">'
      + svgGroupedBars(items, "recus", "traites", BLEU, JAUNE) + "</div>"
      + legende([{ label: "Tchats reçus", color: BLEU }, { label: "Tchats traités", color: JAUNE }]) + "</div>";
  }
  if (c.note_methodologique) h += noteBox(esc(c.note_methodologique));
  return h;
}

/* ---------------- SIGNALEMENTS TF ---------------- */
/* ===== Tableau de bord Trusted Flagger (dynamique, 2026) ===== */
let TF_F = { periode: "annee", plat: "__all__", theme: "__all__" };
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
function pctSafe(num, den) { return den > 0 ? Math.round(num / den * 1000) / 10 : null; }
function showNA(v, suffixe) { return (v === null || v === undefined) ? "N/A" : nf(v) + (suffixe || ""); }
function tdNA(v, suffixe) { return (v === null || v === undefined) ? '<td class="nd">N/A</td>' : "<td>" + nf(v) + (suffixe || "") + "</td>"; }

function tfPeriodMatch(m, p) {
  if (p === "annee") return true;
  if (p.charAt(0) === "Q") return Math.ceil(m / 3) === (+p.charAt(1));
  if (p.slice(0, 2) === "m:") return m === (+p.slice(2));
  return true;
}
function tfFilter(recs, f, use) {
  const TF = DATA.tf2026;
  use = use || {};
  const pIdx = (use.plat !== false && f.plat !== "__all__") ? TF.plats_index.indexOf(f.plat) : -1;
  const tIdx = (use.theme !== false && f.theme !== "__all__") ? TF.themes_index.indexOf(f.theme) : -1;
  return recs.filter(r => {
    if (use.periode !== false && !tfPeriodMatch(r.m, f.periode)) return false;
    if (pIdx >= 0 && r.p !== pIdx) return false;
    if (tIdx >= 0 && r.t.indexOf(tIdx) < 0) return false;
    return true;
  });
}
function tfDelais(recs) {
  const v = []; recs.forEach(r => { if (r.d !== undefined && r.d !== null) v.push(r.d); });
  if (!v.length) return { n: 0, mean: null, median: null, min: null, max: null };
  v.sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const med = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, mean: Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10, median: med, min: v[0], max: v[v.length - 1] };
}
function tfAgg(recs) {
  let relT = 0, rel = 0, rens = 0, rep = 0, refus = 0, repS = 0, repA = 0;
  recs.forEach(r => {
    relT += r.rl || 0; const re = (r.rl || 0) > 0; if (re) rel++;
    if (r.ty !== "non_renseigne") rens++;
    const isRep = (r.ty === "action" || r.ty === "refus");
    if (isRep) { rep++; if (re) repA++; else repS++; }
    if (r.ty === "refus") refus++;
  });
  const env = recs.length, nonRens = env - rens;
  return { env: env, relT: relT, rel: rel, tauxRel: pctSafe(rel, env), rens: rens, nonRens: nonRens,
    tauxNonRens: pctSafe(nonRens, env), rep: rep, repS: repS, repA: repA,
    tauxRep: pctSafe(rep, rens), refus: refus, tauxRefus: pctSafe(refus, rep), del: tfDelais(recs) };
}
function tfGroup(recs, byTheme) {
  const TF = DATA.tf2026, g = {};
  recs.forEach(r => { if (byTheme) r.t.forEach(ti => { (g[ti] = g[ti] || []).push(r); }); else { (g[r.p] = g[r.p] || []).push(r); } });
  return Object.keys(g).map(k => ({ label: (byTheme ? TF.themes_index : TF.plats_index)[k], agg: tfAgg(g[k]) }))
    .sort((a, b) => b.agg.env - a.agg.env);
}
function htmlHBarsPct(items, color) {
  return '<div class="hbars">' + items.map(d => {
    const w = (d.v == null) ? 0 : Math.min(d.v, 100);
    return '<div class="hbar-row"><div class="hbar-label" title="' + escAttr(d.label) + '">' + esc(d.label) + '</div>'
      + '<div class="hbar-track"><div class="hbar-fill" style="width:' + w + '%;background:' + color + '"></div></div>'
      + '<div class="hbar-val">' + showNA(d.v, " %") + "</div></div>";
  }).join("") + "</div>";
}

function renderSignalements() {
  const TF = DATA.tf2026;
  if (!TF) return '<p class="intro">Données indisponibles.</p>';
  /* filtres dynamiques */
  const moisDispo = []; TF.records.forEach(r => { if (moisDispo.indexOf(r.m) < 0) moisDispo.push(r.m); }); moisDispo.sort((a, b) => a - b);
  let perOpts = '<option value="annee">Année 2026 complète</option><option value="Q1">T1 (janv.–mars)</option><option value="Q2">T2 (avr.–juin, partiel)</option>';
  moisDispo.forEach(m => { perOpts += '<option value="m:' + m + '">' + esc(MOIS_COURT[String(m).padStart(2, "0")]) + ' 2026</option>'; });
  let platOpts = '<option value="__all__">Toutes les plateformes</option>' + TF.plateformes.map(p => '<option value="' + escAttr(p) + '">' + esc(p) + "</option>").join("");
  let themeOpts = '<option value="__all__">Toutes les thématiques</option>' + TF.thematiques.map(t => '<option value="' + escAttr(t) + '">' + esc(t) + "</option>").join("");

  let h = '<p class="periode-tag">Données 2026</p>';
  h += '<div class="tf-filtres">'
    + '<label>Période<select id="tf-periode">' + perOpts + "</select></label>"
    + '<label>Plateforme<select id="tf-plat">' + platOpts + "</select></label>"
    + '<label>Thématique<select id="tf-theme">' + themeOpts + "</select></label>"
    + "</div>";
  h += '<div id="tf-zone"></div>';
  return h;
}

function tfFill() {
  const TF = DATA.tf2026, zone = document.getElementById("tf-zone");
  if (!zone) return;
  const recs = TF.records;
  const full = tfFilter(recs, TF_F, {});                 /* tous filtres */
  const noPlat = tfFilter(recs, TF_F, { plat: false });  /* pour répartition/tableau plateforme */
  const noTheme = tfFilter(recs, TF_F, { theme: false });/* pour répartition/tableau thématique */
  const noPer = tfFilter(recs, TF_F, { periode: false });/* pour évolution mensuelle */
  const a = tfAgg(full);

  /* KPI */
  let h = '<div class="kpis hero">'
    + kpi("Signalements envoyés", show(a.env), "sur la sélection", "primaire")
    + kpi("Relances (total)", show(a.relT), "toutes relances", "")
    + kpi("Signalements relancés", show(a.rel), "≥ 1 relance", "")
    + kpi("Taux de relance", showNA(a.tauxRel, " %"), "relancés / envoyés", "")
    + "</div><div class=\"kpis\">"
    + kpi("Taux de réponse", showNA(a.tauxRep, " %"), "réponses / renseignés", "primaire")
    + kpi("Taux de refus", showNA(a.tauxRefus, " %"), "refus / réponses", "")
    + kpi("Taux de non-renseignement", showNA(a.tauxNonRens, " %"), "non renseignés / envoyés", (a.tauxNonRens != null && a.tauxNonRens >= 30) ? "vigilance" : "")
    + kpi("Délai moyen de réponse", a.del.n ? show(a.del.mean) + " j" : "N/A", a.del.n ? "sur " + show(a.del.n) + " réponses datées" : "aucune date", "")
    + "</div>";
  h += noteBox("Réponses obtenues <strong>sans relance</strong> : " + show(a.repS) + " — <strong>après relance</strong> : " + show(a.repA) + ". Délais (jours) — médian " + showNA(a.del.median) + ", min " + showNA(a.del.min) + ", max " + showNA(a.del.max) + " (sur " + show(a.del.n) + " lignes datées).");

  /* Évolution mensuelle (filtres plateforme + thématique, toutes périodes) */
  const months = [1, 2, 3, 4, 5, 6];
  const evoSig = months.map(m => ({ label: MOIS_COURT[String(m).padStart(2, "0")], v: noPer.filter(r => r.m === m).length }));
  const evoRel = months.map(m => ({ label: MOIS_COURT[String(m).padStart(2, "0")], v: noPer.filter(r => r.m === m).reduce((s, r) => s + (r.rl || 0), 0) }));
  const idxJuin = 5;
  h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle des signalements</h3><div class="graph">' + svgBars(evoSig, BLEU, idxJuin) + "</div>" + noteBox("Juin partiel.") + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle des relances</h3><div class="graph">' + svgBars(evoRel, JAUNE, idxJuin) + "</div></div>";

  /* Répartitions */
  const byPlat = tfGroup(noPlat, false), byTheme = tfGroup(noTheme, true), byCat = (function () { const c = {}; full.forEach(r => { c[r.c] = (c[r.c] || 0) + 1; }); return Object.keys(c).map(k => ({ label: TF.cats_index[k], v: c[k] })).sort((x, y) => y.v - x.v); })();
  h += '<div class="bloc"><h3 class="bloc-titre">Répartition par plateforme</h3>' + htmlHBars(byPlat.slice(0, 12).map(d => ({ label: d.label, v: d.agg.env })), BLEU) + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Répartition par thématique</h3>' + htmlHBars(byTheme.slice(0, 12).map(d => ({ label: d.label, v: d.agg.env })), BLEU) + noteBox("Thématiques non exclusives.") + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Répartition des catégories de réponse</h3>' + htmlHBars(byCat.map(d => ({ label: d.label, v: d.v })), GRIS) + "</div>";

  /* Taux par plateforme (top 12 par volume) */
  const topP = byPlat.slice(0, 12);
  h += '<div class="bloc"><h3 class="bloc-titre">Taux de réponse par plateforme</h3>' + htmlHBarsPct(topP.map(d => ({ label: d.label, v: d.agg.tauxRep })), VERT) + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Taux de refus par plateforme</h3>' + htmlHBarsPct(topP.map(d => ({ label: d.label, v: d.agg.tauxRefus })), ROUGE) + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Taux de non-renseignement par plateforme</h3>' + htmlHBarsPct(topP.map(d => ({ label: d.label, v: d.agg.tauxNonRens })), JAUNE) + "</div>";
  h += '<div class="bloc"><h3 class="bloc-titre">Délai moyen de réponse par plateforme (jours)</h3>' + htmlHBars(topP.map(d => ({ label: d.label, v: d.agg.del.mean })), BLEU) + "</div>";

  /* Tableau par plateforme */
  const totEnvP = byPlat.reduce((s, d) => s + d.agg.env, 0);
  h += '<div class="bloc"><h3 class="bloc-titre">Tableau comparatif par plateforme</h3><div class="table-enveloppe"><table><thead><tr>'
    + "<th>Plateforme</th><th>Envoyés</th><th>Part</th><th>Relances</th><th>Relancés</th><th>Taux relance</th><th>Renseignés</th><th>Non rens.</th><th>Tx non-rens.</th><th>Tx réponse</th><th>Tx refus</th><th>Délai moy.</th><th>Médian</th><th>Min</th><th>Max</th>"
    + "</tr></thead><tbody>";
  byPlat.forEach(d => {
    const g = d.agg;
    h += "<tr><td>" + esc(d.label) + "</td>" + td(g.env) + tdNA(pctSafe(g.env, totEnvP), " %") + td(g.relT) + td(g.rel) + tdNA(g.tauxRel, " %")
      + td(g.rens) + td(g.nonRens) + tdNA(g.tauxNonRens, " %") + tdNA(g.tauxRep, " %") + tdNA(g.tauxRefus, " %")
      + tdNA(g.del.mean) + tdNA(g.del.median) + tdNA(g.del.min) + tdNA(g.del.max) + "</tr>";
  });
  h += "</tbody></table></div></div>";

  /* Tableau par thématique */
  const totEnvT = byTheme.reduce((s, d) => s + d.agg.env, 0);
  h += '<div class="bloc"><h3 class="bloc-titre">Tableau comparatif par thématique</h3><div class="table-enveloppe"><table><thead><tr>'
    + "<th>Thématique</th><th>Envoyés</th><th>Part</th><th>Relances</th><th>Taux relance</th><th>Tx non-rens.</th><th>Tx réponse</th><th>Tx refus</th><th>Délai moy.</th><th>Médian</th><th>Min</th><th>Max</th>"
    + "</tr></thead><tbody>";
  byTheme.forEach(d => {
    const g = d.agg;
    h += "<tr><td>" + esc(d.label) + "</td>" + td(g.env) + tdNA(pctSafe(g.env, totEnvT), " %") + td(g.relT) + tdNA(g.tauxRel, " %")
      + tdNA(g.tauxNonRens, " %") + tdNA(g.tauxRep, " %") + tdNA(g.tauxRefus, " %")
      + tdNA(g.del.mean) + tdNA(g.del.median) + tdNA(g.del.min) + tdNA(g.del.max) + "</tr>";
  });
  h += "</tbody></table></div>" + noteBox("Thématiques non exclusives.") + "</div>";

  /* Détail catégories de réponse */
  h += '<div class="bloc"><h3 class="bloc-titre">Détail des catégories de réponse</h3><div class="table-enveloppe"><table><thead><tr><th>Catégorie (libellé exact)</th><th>Nombre</th><th>Part</th></tr></thead><tbody>';
  byCat.forEach(d => { h += "<tr><td style=\"text-align:left\">" + esc(d.label) + "</td>" + td(d.v) + tdNA(pctSafe(d.v, a.env), " %") + "</tr>"; });
  h += "</tbody></table></div>" + noteBox("« Non renseigné » (cellule vide) distinct de « Pas de réponse ».") + "</div>";

  zone.innerHTML = h;
}

/* ---------------- SORTIES D'ANONYMAT ---------------- */
function renderAnonymat() {
  const a = DATA.anonymity;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="periode-tag">Cumul janvier-mai 2026 (juin partiel)</p>';
  const k = a.kpi_institutionnels_janv_mai || {};
  h += '<div class="kpis hero">'
    + kpi("Total sorties", show(a.cumul_janvier_mai_2026), "janv.–mai", "primaire")
    + kpi("Harcèlement scolaire (MEN / Agri.)", show(k.harcelement_scolaire_MEN_agriculture), "", "")
    + kpi("Situations IPS", show(k.ips_total), "", "")
    + "</div>";
  h += '<div class="kpis">'
    + kpi("Signalements au procureur", show(k.procureur), "art. 40 CPP", "accent")
    + kpi("IP transmises", show(k.crip), "CRIP", "")
    + kpi("Signalements OFMIN", show(k.ofmin), "", "")
    + kpi("Signalements PHAROS", show(k.pharos), "", "")
    + "</div>";
  h += noteBox("Une situation peut être transmise à plusieurs autorités.");

  if (a.par_mois_2026) {
    const idxPart = a.par_mois_2026.findIndex(d => d.statut !== "consolidé");
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle 2026</h3><div class="graph">'
      + svgBars(a.par_mois_2026.map(d => ({ label: libelleCourt(d.mois), v: d.sorties })), BLEU, idxPart) + "</div>"
      + noteBox("Le dernier mois (hachuré) est partiel.") + "</div>";
  }
  if (a.par_destinataire_janv_mai) h += '<div class="bloc"><h3 class="bloc-titre">Par destinataire (janv.–mai)</h3>' + htmlHBars(a.par_destinataire_janv_mai.map(d => ({ label: d.destinataire, v: d.sorties })), BLEU) + "</div>";

  /* IPS sous-destinataires mensuel */
  if (a.sous_destinataires_ips_mensuel) {
    const sd = a.sous_destinataires_ips_mensuel.par_destinataire;
    const mois = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
    h += '<div class="bloc"><h3 class="bloc-titre">Détail IPS par autorité (mensuel)</h3><div class="table-enveloppe"><table><thead><tr><th>Autorité</th>'
      + mois.map(m => "<th>" + esc(MOIS_COURT[m.split("-")[1]]) + "</th>").join("") + "<th>Cumul</th></tr></thead><tbody>";
    Object.keys(sd).forEach(name => {
      h += "<tr><td>" + esc(name) + "</td>" + mois.map(m => td(sd[name].par_mois[m])).join("") + "<td><strong>" + show(sd[name].cumul_janv_mai) + "</strong></td></tr>";
    });
    h += "</tbody></table></div>" + noteBox(esc(a.sous_destinataires_ips_mensuel.note)) + "</div>";
  }
  if (a.note_methodologique) h += noteBox(esc(a.note_methodologique));
  return h;
}

/* ---------------- BIK ---------------- */
function renderBik() {
  const b = DATA.bik;
  if (!b) return '<p class="intro">Données indisponibles.</p>';
  let h = noteBox(esc((b._meta && b._meta.avertissement) || ""), "vigilance");
  h += '<div class="kpis">' + kpi("Contacts totaux déclarés", show(b.contacts_total_declares), (b._meta && b._meta.trimestre) || "", "primaire") + "</div>";
  if (b.canaux) h += '<div class="bloc"><h3 class="bloc-titre">Canaux</h3>' + htmlHBars(Object.keys(b.canaux).map(k => ({ label: k, v: b.canaux[k] })), BLEU) + "</div>";
  if (b.public_cible) {
    h += '<div class="bloc"><h3 class="bloc-titre">Public cible</h3><div class="kv">';
    Object.keys(b.public_cible).forEach(k => h += '<div class="k">' + esc(k.replace(/_/g, " ")) + '</div><div class="v">' + show(b.public_cible[k]) + "</div>");
    h += "</div></div>";
  }
  if (b.categories_bik_non_exclusives) {
    const items = Object.keys(b.categories_bik_non_exclusives).map(k => ({ label: k, v: b.categories_bik_non_exclusives[k] })).sort((x, y) => y.v - x.v);
    h += '<div class="bloc"><h3 class="bloc-titre">Catégories BIK <span class="badge partiel">non exclusives — ne pas additionner</span></h3>' + htmlHBars(items, GRIS) + "</div>";
  }
  if (b.dsa) h += '<div class="bloc"><h3 class="bloc-titre">Digital Services Act</h3><div class="kv">'
    + '<div class="k">Trusted Flagger</div><div class="v">' + esc(b.dsa.trusted_flagger) + "</div>"
    + '<div class="k">Désigné depuis</div><div class="v">' + esc(b.dsa.designe_depuis) + "</div>"
    + '<div class="k">Signalements du trimestre</div><div class="v">' + show(b.dsa.signalements_trimestre) + "</div></div></div>";
  if (b.narratif) {
    h += '<div class="bloc"><h3 class="bloc-titre">Tendances et faits marquants</h3><div class="bloc-texte">';
    const map = { tendances: "Tendances et enjeux", success_story: "Réussite", difficultes: "Difficultés", commentaire_categories: "Note sur les catégories" };
    Object.keys(map).forEach(k => { if (b.narratif[k]) h += '<span class="etiquette">' + esc(map[k]) + "</span><p>" + esc(b.narratif[k]) + "</p>"; });
    h += "</div></div>";
  }
  return h;
}

/* ---------------- MÉTHODOLOGIE ---------------- */
function renderMethodologie() {
  const m = DATA.methodology;
  if (!m) return '<p class="intro">Données indisponibles.</p>';
  let h = "";
  /* traçabilité */
  h += '<div class="bloc"><h3 class="bloc-titre">Traçabilité</h3><div class="kv">';
  if (m._meta) {
    if (m._meta.date_mise_a_jour_donnees) h += '<div class="k">Dernière mise à jour des données</div><div class="v">' + esc(m._meta.date_mise_a_jour_donnees) + "</div>";
    if (m._meta.periode_couverte) h += '<div class="k">Période couverte</div><div class="v" style="text-align:left;font-weight:500">' + esc(m._meta.periode_couverte) + "</div>";
  }
  if (m.perimetre_partiel_juin) h += '<div class="k">Données partielles</div><div class="v" style="text-align:left;font-weight:500">' + esc(m.perimetre_partiel_juin) + "</div>";
  h += "</div></div>";

  if (m.fichiers_utilises) {
    h += '<div class="bloc"><h3 class="bloc-titre">Fichiers sources utilisés</h3><div class="table-enveloppe"><table><thead><tr><th>Fichier</th><th>Usage</th><th>Période</th><th>Limite</th></tr></thead><tbody>';
    m.fichiers_utilises.forEach(f => h += '<tr><td style="text-align:left">' + esc(f.fichier) + '</td><td style="text-align:left">' + esc(f.usage) + '</td><td style="text-align:left">' + esc(f.periode) + '</td><td style="text-align:left">' + esc(f.limite) + "</td></tr>");
    h += "</tbody></table></div></div>";
  }
  if (m.regles_de_calcul) {
    h += '<div class="bloc"><h3 class="bloc-titre">Formules utilisées</h3><div class="kv">';
    Object.keys(m.regles_de_calcul).forEach(k => h += '<div class="k">' + esc(k.replace(/_/g, " ")) + '</div><div class="v" style="text-align:left;font-weight:500">' + esc(m.regles_de_calcul[k]) + "</div>");
    h += "</div></div>";
  }
  if (m.controles_coherence) {
    h += '<div class="bloc"><h3 class="bloc-titre">Contrôles de cohérence</h3><div class="table-enveloppe"><table><thead><tr><th>Contrôle</th><th>Attendu</th><th>Calculé</th><th>Résultat</th></tr></thead><tbody>';
    m.controles_coherence.forEach(c => h += '<tr><td style="text-align:left">' + esc(c.controle) + "</td>" + td(c.attendu) + td(c.calcule) + '<td><span class="badge consolide">' + esc(c.resultat) + "</span></td></tr>");
    h += "</tbody></table></div></div>";
  }
  function liste(titre, arr) { return arr ? '<div class="bloc"><h3 class="bloc-titre">' + titre + '</h3><ul class="liste-propre">' + arr.map(x => "<li>" + (typeof x === "string" ? esc(x) : "<strong>" + esc(x.sujet) + " :</strong> " + esc(x.ecart) + " <em>Source retenue : " + esc(x.source_retenue) + "</em>") + "</li>").join("") + "</ul></div>" : ""; }
  h += liste("Données consolidées, partielles, calculées et absentes", m.donnees_manquantes);
  h += liste("Écarts entre sources", m.ecarts_entre_sources);
  h += liste("Ruptures méthodologiques", m.ruptures_methodologiques);
  if (m.comparaisons_temporelles) {
    h += '<div class="bloc"><h3 class="bloc-titre">Comparaisons temporelles</h3><ul class="liste-propre">'
      + (m.comparaisons_temporelles.disponibles || []).map(x => "<li>" + esc(x) + "</li>").join("")
      + (m.comparaisons_temporelles.non_disponibles || []).map(x => '<li class="pt-baisse">Non disponible : ' + esc(x) + "</li>").join("") + "</ul></div>";
  }
  if (m.pourquoi_nd) h += noteBox("<strong>Pourquoi « n.d. ».</strong> " + esc(m.pourquoi_nd));
  if (m.etp) {
    const e = m.etp;
    h += '<div class="bloc"><h3 class="bloc-titre">ETP</h3><div class="kv">'
      + '<div class="k">Source</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.source) + "</div>"
      + '<div class="k">Champ retenu</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.champ_retenu) + "</div>"
      + '<div class="k">Formule</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.formule) + "</div>"
      + '<div class="k">Nature</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.nature) + "</div>"
      + (e.usage ? '<div class="k">Usage</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.usage) + "</div>" : "")
      + '<div class="k">Périmètre</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.perimetre || "") + "</div>"
      + "</div>";
    if (e.limites) h += '<ul class="liste-propre">' + e.limites.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>";
    if (e.ip_procureur) h += noteBox(esc(e.ip_procureur));
    h += "</div>";
  }
  /* Méthodologie « ETP et activité » (temps standards) */
  h += eaMethodologie();

  if (m.confidentialite) h += noteBox("<strong>Confidentialité.</strong> " + esc(m.confidentialite), "vigilance");
  return h;
}

const RENDERERS = {
  synthese: renderSynthese, historique: renderHistorique, mensuel: renderMensuel, trimestriel: renderTrimestriel,
  telephone: renderTelephone, tchat: renderTchat, signalements: renderSignalements, anonymat: renderAnonymat,
  bik: renderBik, methodologie: renderMethodologie,
  sollicitations: renderSollicitations, performance: renderPerformance,
  etp_activite: renderEtpActivite,
};

/* ---------------- Interactions après rendu ---------------- */
function brancherInteractions(id) {
  if (id === "synthese") {
    const bExpAll = document.getElementById("btn-export-complet");
    if (bExpAll) bExpAll.addEventListener("click", exportComplet);
    const bExpPerso = document.getElementById("btn-export-perso");
    if (bExpPerso) bExpPerso.addEventListener("click", ouvrirModalExport);
    const btn = document.getElementById("btn-copier");
    if (btn) btn.addEventListener("click", () => {
      const txt = texteSynthese();
      const ok = document.getElementById("copie-ok");
      const fini = () => { if (ok) { ok.hidden = false; setTimeout(() => ok.hidden = true, 2000); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fini).catch(fini);
      else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); fini(); }
    });
  }
  if (id === "signalements") {
    tfFill();
    const wire = (selId, key) => {
      const el = document.getElementById(selId);
      if (el) el.addEventListener("change", () => { TF_F[key] = el.value; tfFill(); });
    };
    wire("tf-periode", "periode"); wire("tf-plat", "plat"); wire("tf-theme", "theme");
  }
  if (id === "sollicitations") {
    solFill();
    const wire = (selId, key) => {
      const el = document.getElementById(selId);
      if (el) el.addEventListener("change", () => { SOL_F[key] = el.value; solFill(); });
    };
    wire("sol-canal", "canal"); wire("sol-comp", "comp");
    const dde = document.getElementById("sol-de"), da = document.getElementById("sol-a");
    if (dde) dde.addEventListener("change", () => { SOL_F.persoDe = +dde.value; if (SOL_F.periode === "perso") solFill(); });
    if (da) da.addEventListener("change", () => { SOL_F.persoA = +da.value; if (SOL_F.periode === "perso") solFill(); });
    const per = document.getElementById("sol-periode");
    if (per) per.addEventListener("change", () => {
      SOL_F.periode = per.value;
      const wrap = document.getElementById("sol-perso");
      if (wrap) wrap.hidden = (per.value !== "perso");
      solFill();
    });
  }
  if (id === "performance") {
    perfFill();
    const can = document.getElementById("perf-canal");
    if (can) can.addEventListener("change", () => {
      PERF_F.canal = can.value;
      const fw = document.getElementById("perf-file-wrap");
      if (fw) fw.style.display = (can.value === "telephone") ? "" : "none";
      perfFill();
    });
    const wireP = (selId, key) => {
      const el = document.getElementById(selId);
      if (el) el.addEventListener("change", () => { PERF_F[key] = el.value; perfFill(); });
    };
    wireP("perf-periode", "periode"); wireP("perf-file", "file");
  }
  if (id === "historique") {
    remplirHistorique();
    remplirProtection();
    const sel = document.getElementById("hist-selecteur");
    if (sel) sel.querySelectorAll(".seg").forEach(btn => btn.addEventListener("click", () => {
      HIST_IND = btn.dataset.ind;
      sel.querySelectorAll(".seg").forEach(b => b.classList.toggle("actif", b === btn));
      remplirHistorique();
    }));
    const selP = document.getElementById("prot-selecteur");
    if (selP) selP.querySelectorAll(".seg").forEach(btn => btn.addEventListener("click", () => {
      PROT_IND = btn.dataset.ind;
      selP.querySelectorAll(".seg").forEach(b => b.classList.toggle("actif", b === btn));
      remplirProtection();
    }));
  }
  if (id === "etp_activite") {
    eaFill();
    const per = document.getElementById("ea-periode");
    if (per) per.addEventListener("change", () => {
      EA_F.periode = per.value;
      const wrap = document.getElementById("ea-perso");
      if (wrap) wrap.hidden = (per.value !== "perso");
      eaFill();
    });
    const de = document.getElementById("ea-de"), a = document.getElementById("ea-a");
    if (de) de.addEventListener("change", () => { EA_F.persoDe = de.value; if (EA_F.periode === "perso") eaFill(); });
    if (a) a.addEventListener("change", () => { EA_F.persoA = a.value; if (EA_F.periode === "perso") eaFill(); });
  }
}

/* ---------------- Navigation ---------------- */
function construireNavigation() {
  const nav = document.getElementById("navigation");
  nav.innerHTML = SECTIONS.map((s, i) => '<button class="nav-bouton' + (i === 0 ? " actif" : "") + '" data-cible="' + s.id + '">' + esc(s.label) + "</button>").join("");
  nav.querySelectorAll(".nav-bouton").forEach(btn => btn.addEventListener("click", () => activerSection(btn.dataset.cible)));
}
function activerSection(id) {
  document.querySelectorAll(".nav-bouton").forEach(b => b.classList.toggle("actif", b.dataset.cible === id));
  document.querySelectorAll(".section").forEach(sec => sec.hidden = sec.id !== id);
  const cible = document.getElementById(id);
  if (cible) cible.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
  brancherInteractions(id);
}

/* ---------------- Pied / traçabilité ---------------- */
function construirePied() {
  const m = DATA.methodology, el = document.getElementById("pied-contenu");
  if (!el) return;
  let h = "";
  if (m && m._meta && m._meta.date_mise_a_jour_donnees) h += "<p>Mise à jour : " + esc(m._meta.date_mise_a_jour_donnees) + " · juin partiel.</p>";
  el.innerHTML = h;
}

/* ---------------- Chargement ---------------- */
async function charger() {
  const statut = document.getElementById("statut");
  statut.innerHTML = '<p class="message">Chargement des données…</p>';
  const cles = Object.keys(FICHIERS);
  const res = await Promise.allSettled(cles.map(k => fetch(FICHIERS[k]).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })));
  let erreurs = 0;
  res.forEach((r, i) => { if (r.status === "fulfilled") DATA[cles[i]] = r.value; else erreurs++; });

  if (Object.keys(DATA).length === 0) {
    statut.innerHTML = '<div class="erreur"><strong>Impossible de charger les données.</strong> Si l\'adresse commence par <code>file://</code>, le navigateur bloque la lecture des JSON. Lancez un serveur local (voir le README), puis rechargez la page.</div>';
    return;
  }
  if (DATA.annual && DATA.annual._meta) {
    const MP = { "01": "janvier", "02": "février", "03": "mars", "04": "avril", "05": "mai", "06": "juin", "07": "juillet", "08": "août", "09": "septembre", "10": "octobre", "11": "novembre", "12": "décembre" };
    const ar = String(DATA.annual._meta.arret || "").split("/");
    const court = (ar.length === 3) ? (+ar[0] + " " + (MP[ar[1]] || "")) : "";
    document.getElementById("entete-periode").textContent = court ? "Cumul 2026 au " + court : "";
  }
  SECTIONS.forEach(s => {
    const cont = document.getElementById(s.id + "-contenu");
    if (cont && RENDERERS[s.id]) { try { cont.innerHTML = RENDERERS[s.id](); } catch (e) { cont.innerHTML = '<p class="intro">Erreur d\'affichage pour cette section.</p>'; } }
  });
  construirePied();
  brancherInteractions("synthese");
  statut.innerHTML = erreurs ? '<p class="message">Données chargées (' + erreurs + " fichier(s) absent(s)).</p>" : "";
}

document.addEventListener("DOMContentLoaded", () => { construireNavigation(); charger(); });

/* =================================================================
   NOUVEAUX ONGLETS — « Sollicitations » et « Performance des canaux »
   -----------------------------------------------------------------
   Principe : ces deux onglets REGROUPENT le contenu des anciens onglets
   « Activité mensuelle », « Activité trimestrielle », « Téléphone » et
   « Tchat », SANS rien perdre.
   - Les données mensuelles (activity_monthly.json) sont la source unique.
   - Les trimestres sont calculés par AGRÉGATION des mois (les totaux
     trimestriels = somme des mois ; les taux trimestriels sont recalculés
     à partir des volumes agrégés, jamais comme moyenne des taux mensuels).
   - La comparaison « même période N-1 » s'appuie sur historical_monthly.json
     (séries 2024 / 2025 / 2026) pour le total tous canaux.
   - Distinction stricte conservée : reçues ≠ prises en charge.
   - Aucune valeur n'est inventée : donnée absente => « n.d. » / « N/A ».
   ================================================================= */

/* ---------- briques communes aux deux onglets ---------- */

/* Liste des mois 2026 disponibles, avec les mails rattachés. */
function solMois() {
  const m = DATA.monthly;
  if (!m || !m.mois) return [];
  const tc = (m.activite_traitee_tous_canaux && m.activite_traitee_tous_canaux.par_mois) || [];
  const mailsByKey = {};
  tc.forEach(d => { mailsByKey[d.mois] = d; });
  return m.mois.map(d => {
    const num = parseInt(String(d.mois).split("-")[1], 10);
    const mail = mailsByKey[d.mois] || {};
    return {
      num: num, key: d.mois, libelle: d.libelle, court: libelleCourt(d.mois),
      row: d,
      mails: (mail.mails === undefined ? null : mail.mails),
      mailStatut: mail.statut || null
    };
  });
}

/* Numéros de mois disponibles en 2026, ex. [1,2,3,4,5]. */
function solNumsDispo() { return solMois().map(o => o.num); }

/* Valeurs reçu / pris / non pris d'UN mois pour UN canal. */
function solCanalVals(mo, canal) {
  const r = mo.row;
  if (canal === "telephone") {
    return { recu: r.appels_recus, pris: r.appels_decroches, nonPris: r.appels_abandonnes };
  }
  if (canal === "tchat") {
    const recu = r.tchats_recus, pris = r.tchats_traites;
    return { recu: recu, pris: pris, nonPris: (recu != null && pris != null) ? recu - pris : null };
  }
  if (canal === "mail") {
    return { recu: null, pris: mo.mails, nonPris: null };
  }
  /* tous canaux */
  const recu = r.sollicitations_entrantes, pris = r.volume_activite_traite;
  return { recu: recu, pris: pris, nonPris: (recu != null && pris != null) ? recu - pris : null };
}

/* Timeline « à plat » sur 36 mois : index 0 = janv. 2024 … 35 = déc. 2026.
   indic = "recu" ou "pris". Pour le total tous canaux on lit l'historique
   multi-années ; par canal on n'a que 2026 (le reste reste null). */
function solFlat(canal, indic) {
  const out = new Array(36).fill(null);
  if (canal === "tous") {
    const h = DATA.historical && DATA.historical.series;
    const src = h ? (indic === "recu" ? h.sollicitations : h.contacts_traites) : null;
    if (src) {
      ["2024", "2025", "2026"].forEach((y, yi) => {
        (src[y] || []).forEach((v, mi) => { out[yi * 12 + mi] = (v == null ? null : v); });
      });
    }
    return out;
  }
  solMois().forEach(mo => {
    const v = solCanalVals(mo, canal);
    out[24 + (mo.num - 1)] = (indic === "recu" ? v.recu : v.pris);
  });
  return out;
}

/* Somme « null-safe » sur des index : renvoie null si aucune valeur. */
function solSum(arr, idxs) {
  let s = 0, has = false;
  idxs.forEach(i => { if (arr[i] != null) { s += arr[i]; has = true; } });
  return has ? s : null;
}

/* Index (0..11) des mois retenus en 2026 selon les filtres. */
function solMoisRetenus(F) {
  const avail = solNumsDispo();
  let nums;
  if (F.periode === "annee") nums = avail.slice();
  else if (F.periode === "Q1") nums = avail.filter(n => n <= 3);
  else if (F.periode === "Q2") nums = avail.filter(n => n >= 4 && n <= 6);
  else if (F.periode.slice(0, 2) === "m:") { const n = +F.periode.slice(2); nums = avail.indexOf(n) >= 0 ? [n] : []; }
  else if (F.periode === "perso") {
    const a = +F.persoDe, b = +F.persoA, lo = Math.min(a, b), hi = Math.max(a, b);
    nums = avail.filter(n => n >= lo && n <= hi);
  } else nums = avail.slice();
  return nums;
}

/* Agrégat reçu/pris/non-pris/taux pour un canal sur des numéros de mois 2026. */
function solAgg(canal, nums) {
  const idx = nums.map(n => 24 + (n - 1));
  const recu = solSum(solFlat(canal, "recu"), idx);
  const pris = solSum(solFlat(canal, "pris"), idx);
  let nonPris = null;
  if (recu != null && pris != null) nonPris = recu - pris;
  else { /* mail : reçu inconnu => non-pris inconnu */ nonPris = null; }
  const taux = (recu != null && recu > 0 && pris != null) ? Math.round(pris / recu * 1000) / 10 : null;
  return { recu: recu, pris: pris, nonPris: nonPris, taux: taux };
}

/* Agrégat de comparaison (mode "prec" = période précédente, "n1" = N-1)
   sur la même longueur de période. Renvoie null si rien d'exploitable. */
function solAggComp(canal, nums, mode) {
  if (!nums.length) return null;
  const fr = solFlat(canal, "recu"), fp = solFlat(canal, "pris");
  const idx2026 = nums.map(n => 24 + (n - 1));
  let idx;
  if (mode === "n1") idx = idx2026.map(i => i - 12);       /* même mois, année précédente */
  else idx = idx2026.map(i => i - nums.length);            /* fenêtre de même longueur juste avant */
  if (idx.some(i => i < 0)) return null;
  const recu = solSum(fr, idx), pris = solSum(fp, idx);
  if (recu == null && pris == null) return null;
  const nonPris = (recu != null && pris != null) ? recu - pris : null;
  const taux = (recu != null && recu > 0 && pris != null) ? Math.round(pris / recu * 1000) / 10 : null;
  return { recu: recu, pris: pris, nonPris: nonPris, taux: taux };
}

/* Libellé lisible de la période sélectionnée. */
function solLibellePeriode(F) {
  if (F.periode === "annee") return "année 2026 à date";
  if (F.periode === "Q1") return "T1 2026 (janv.–mars)";
  if (F.periode === "Q2") return "T2 2026 (avr.–juin, partiel)";
  if (F.periode.slice(0, 2) === "m:") return MOIS_COURT[String(+F.periode.slice(2)).padStart(2, "0")] + " 2026";
  if (F.periode === "perso") {
    const a = MOIS_COURT[String(F.persoDe).padStart(2, "0")], b = MOIS_COURT[String(F.persoA).padStart(2, "0")];
    return "de " + a + " à " + b + " 2026";
  }
  return "";
}
function solLibelleComp(F) {
  if (F.comp === "prec") return "période précédente";
  if (F.comp === "n1") return "même période 2025";
  return null;
}

/* KPI avec badge d'évolution optionnel. unite "pct" => écart en points. */
function kpiCmp(label, cur, comp, sub, isPct, tone) {
  let h = '<div class="kpi ' + (tone || "") + '"><p class="kpi-label">' + esc(label) + "</p>";
  h += '<p class="kpi-valeur">' + (isPct ? showPct(cur) : show(cur)) + "</p>";
  if (comp !== null && comp !== undefined && cur != null) h += evoBadge(cur, comp, isPct ? "pt" : undefined);
  if (sub) h += '<p class="kpi-sub">' + esc(sub) + "</p>";
  return h + "</div>";
}

/* ================================================================
   ONGLET « SOLLICITATIONS »  (ex activité mensuelle + trimestrielle)
   ================================================================ */
let SOL_F = { periode: "annee", canal: "tous", comp: "aucune", persoDe: 1, persoA: 5 };

const SOL_CANAUX = [
  { v: "tous", label: "Tous les canaux" },
  { v: "telephone", label: "Téléphone" },
  { v: "tchat", label: "Tchat" },
  { v: "mail", label: "Mail" }
];

function solOptionsPeriode() {
  const avail = solNumsDispo();
  let o = '<option value="annee">Année 2026 (cumul à date)</option>';
  o += '<option value="Q1">T1 — janv. à mars</option>';
  o += '<option value="Q2">T2 — avr. à juin (partiel)</option>';
  avail.forEach(n => { o += '<option value="m:' + n + '">' + MOIS_COURT[String(n).padStart(2, "0")] + ' 2026</option>'; });
  o += '<option value="perso">Période personnalisée…</option>';
  return o;
}
function solOptionsMois(sel) {
  return solNumsDispo().map(n =>
    '<option value="' + n + '"' + (n === sel ? " selected" : "") + ">" + MOIS_COURT[String(n).padStart(2, "0")] + "</option>"
  ).join("");
}

function renderSollicitations() {
  const m = DATA.monthly;
  if (!m || !m.mois) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="intro">' + esc((m._meta && m._meta.avertissement) || "") +
    ' Reçues ≠ prises en charge.</p>';

  h += '<div class="tf-filtres">'
    + '<label>Période<select id="sol-periode">' + solOptionsPeriode() + "</select></label>"
    + '<label>Canal<select id="sol-canal">' + SOL_CANAUX.map(c => '<option value="' + c.v + '">' + c.label + "</option>").join("") + "</select></label>"
    + '<label>Comparaison<select id="sol-comp">'
    + '<option value="aucune">Aucune</option>'
    + '<option value="prec">Période précédente</option>'
    + '<option value="n1">Même période 2025</option>'
    + "</select></label>"
    + '<span id="sol-perso" class="sol-perso" hidden>'
    + '<label>De<select id="sol-de">' + solOptionsMois(1) + "</select></label>"
    + '<label>À<select id="sol-a">' + solOptionsMois(5) + "</select></label>"
    + "</span>"
    + "</div>";
  h += '<div id="sol-zone"></div>';
  return h;
}

function solFill() {
  const zone = document.getElementById("sol-zone");
  if (!zone) return;
  const F = SOL_F;
  const nums = solMoisRetenus(F);
  const canalLabel = (SOL_CANAUX.find(c => c.v === F.canal) || {}).label;
  const a = solAgg(F.canal, nums);
  const comp = (F.comp === "aucune") ? null : solAggComp(F.canal, nums, F.comp);
  const compLbl = solLibelleComp(F);

  let h = '<p class="periode-tag">Sélection : ' + esc(canalLabel) + " — " + esc(solLibellePeriode(F))
    + (compLbl ? " · comparé à : " + esc(compLbl) : "") + "</p>";

  if (!nums.length) {
    return void (zone.innerHTML = h + noteBox("Aucun mois disponible pour cette sélection.", "vigilance"));
  }

  /* ----- 4 cartes KPI (distinction reçu / pris stricte) ----- */
  const subMail = (F.canal === "mail") ? "mails : prise en charge uniquement (pas de « reçus » dans les sources)" : "";
  h += '<div class="kpis hero">'
    + kpiCmp("Sollicitations reçues", a.recu, comp ? comp.recu : null, F.canal === "mail" ? "non disponible pour le mail" : "entrantes", false, "")
    + kpiCmp("Prises en charge", a.pris, comp ? comp.pris : null, "traitées", false, "primaire")
    + kpiCmp("Non prises en charge", a.nonPris, comp ? comp.nonPris : null, subMail || "reçues − prises", false, "")
    + kpiCmp("Taux de prise en charge", a.taux, comp ? comp.taux : null, "prises / reçues", true,
        (a.taux != null && a.taux < 30) ? "vigilance" : "")
    + "</div>";

  if (F.canal === "mail") h += noteBox("Canal mail : seules les sollicitations <strong>traitées</strong> existent dans les sources (fév.–mai, mai partiel au 26/05). « Reçus », « non prises » et « taux » ne sont donc pas calculables.");

  /* ----- bloc comparaison chiffrée (écart absolu + %) ----- */
  if (comp) {
    h += '<div class="bloc"><h3 class="bloc-titre">Comparaison avec la ' + esc(compLbl) + '</h3>'
      + '<div class="table-enveloppe"><table><thead><tr><th>Indicateur</th><th>Sélection</th><th>' + esc(compLbl) + '</th><th>Écart</th><th>Évolution</th></tr></thead><tbody>'
      + solLigneComp("Reçues", a.recu, comp.recu, false)
      + solLigneComp("Prises en charge", a.pris, comp.pris, false)
      + solLigneComp("Non prises en charge", a.nonPris, comp.nonPris, false)
      + solLigneComp("Taux de prise en charge", a.taux, comp.taux, true)
      + "</tbody></table></div>";
    if (F.comp === "n1" && F.canal !== "tous") h += noteBox("Comparaison 2025 par canal indisponible : l'historique mensuel ne distingue pas les canaux. Disponible pour « Tous les canaux ».", "vigilance");
    h += "</div>";
  }

  /* ----- répartition par canal (uniquement vue « tous ») ----- */
  if (F.canal === "tous") {
    const parCanal = ["telephone", "tchat", "mail"].map(c => {
      const ag = solAgg(c, nums);
      return { label: (SOL_CANAUX.find(x => x.v === c) || {}).label, recu: ag.recu, pris: ag.pris };
    });
    h += '<div class="bloc"><h3 class="bloc-titre">Répartition par canal — prises en charge (' + esc(solLibellePeriode(F)) + ")</h3>"
      + htmlHBars(parCanal.map(d => ({ label: d.label, v: d.pris })), BLEU) + "</div>";
    h += '<div class="bloc"><h3 class="bloc-titre">Répartition par canal — sollicitations reçues</h3>'
      + htmlHBars(parCanal.filter(d => d.recu != null).map(d => ({ label: d.label, v: d.recu })), JAUNE)
      + noteBox("Le mail n'apparaît pas en « reçues » (donnée absente des sources).") + "</div>";
  }

  /* ----- évolution mensuelle (toute l'année dispo, canal sélectionné) ----- */
  const moisAll = solMois();
  const idxPart = moisAll.findIndex(mo => String(mo.row.observation || "").toLowerCase().includes("partiel") || (mo.mailStatut && String(mo.mailStatut).includes("partiel")));
  const serieRecu = moisAll.map(mo => ({ label: mo.court.replace(" 2026", ""), v: solCanalVals(mo, F.canal).recu }));
  const seriePris = moisAll.map(mo => ({ label: mo.court.replace(" 2026", ""), v: solCanalVals(mo, F.canal).pris }));

  if (serieRecu.some(d => d.v != null)) {
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle — sollicitations reçues</h3><div class="graph">'
      + svgBars(serieRecu, BLEU, -1) + "</div></div>";
  }
  if (seriePris.some(d => d.v != null)) {
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle — prises en charge</h3><div class="graph">'
      + svgBars(seriePris, JAUNE, F.canal === "mail" ? idxPart : -1) + "</div>"
      + (F.canal === "mail" ? noteBox("Barre hachurée : mois aux mails partiels.") : "") + "</div>";
  }
  /* reçu vs pris (si les deux existent) */
  if (serieRecu.some(d => d.v != null) && seriePris.some(d => d.v != null)) {
    const grp = moisAll.map(mo => {
      const v = solCanalVals(mo, F.canal);
      return { label: mo.court.replace(" 2026", ""), recus: v.recu, pris: v.pris };
    });
    h += '<div class="bloc"><h3 class="bloc-titre">Reçues vs prises en charge par mois</h3><div class="graph">'
      + svgGroupedBars(grp, "recus", "pris", BLEU, JAUNE) + "</div>"
      + legende([{ label: "Reçues", color: BLEU }, { label: "Prises en charge", color: JAUNE }]) + "</div>";
    /* taux mensuel */
    const labelsM = moisAll.map(mo => mo.court.replace(" 2026", ""));
    const tauxM = moisAll.map(mo => { const v = solCanalVals(mo, F.canal); return (v.recu && v.recu > 0 && v.pris != null) ? Math.round(v.pris / v.recu * 1000) / 10 : null; });
    h += '<div class="bloc"><h3 class="bloc-titre">Taux de prise en charge par mois</h3><div class="graph">'
      + svgLineChart(labelsM, [{ data: tauxM, color: VERT }], "pct") + "</div></div>";
  }

  /* ----- comparaison multi-années (vue « tous » + comparaison N-1) ----- */
  if (F.canal === "tous" && F.comp === "n1") {
    const h2 = DATA.historical;
    if (h2 && h2.series) {
      const labels = h2.mois_labels;
      h += '<div class="bloc"><h3 class="bloc-titre">Sollicitations reçues — 2024 / 2025 / 2026</h3><div class="graph">'
        + svgLineChart(labels, [
          { data: h2.series.sollicitations["2024"], color: GRIS },
          { data: h2.series.sollicitations["2025"], color: JAUNE },
          { data: h2.series.sollicitations["2026"], color: BLEU }
        ]) + "</div>"
        + legende([{ label: "2024", color: GRIS }, { label: "2025", color: JAUNE }, { label: "2026", color: BLEU }])
        + noteBox("Vue complète dans l'onglet « Comparaison historique ».") + "</div>";
    }
  }

  /* ----- VUE TRIMESTRIELLE (T1, T2) — reprise de l'ancien onglet ----- */
  h += solBlocTrimestres();

  /* ----- TABLEAUX DÉTAILLÉS (toutes les valeurs sources, vérifiables) ----- */
  h += solTableauMensuelDetaille();
  h += solTableauTousCanaux();
  h += solObservations();

  zone.innerHTML = h;
}

function solLigneComp(label, cur, comp, isPct) {
  const ecart = (cur != null && comp != null) ? (Math.round((cur - comp) * 10) / 10) : null;
  const ecartTxt = ecart == null ? '<td class="nd">n.d.</td>' : "<td>" + (ecart > 0 ? "+" : "") + nf(ecart) + (isPct ? " pt" : "") + "</td>";
  return "<tr><td style=\"text-align:left\">" + esc(label) + "</td>"
    + (isPct ? td(cur, true) : td(cur)) + (isPct ? td(comp, true) : td(comp))
    + ecartTxt + "<td>" + (cur != null && comp != null ? evoBadge(cur, comp, isPct ? "pt" : undefined) : '<span class="evo neutre">n.d.</span>') + "</td></tr>";
}

/* Trimestres calculés par agrégation des mois (totaux = somme ; taux recalculés). */
function solBlocTrimestres() {
  const q = DATA.quarterly || {};
  let h = '<div class="bloc"><h3 class="bloc-titre">Vue trimestrielle 2026 (calculée par agrégation des mois)</h3>';
  if (q._meta && q._meta.avertissement) h += noteBox(esc(q._meta.avertissement));
  [["Q1", [1, 2, 3]], ["Q2", [4, 5, 6]]].forEach(([qLabel, qNums]) => {
    const nums = qNums.filter(n => solNumsDispo().indexOf(n) >= 0);
    if (!nums.length) return;
    const tous = solAgg("tous", nums), tel = solAgg("telephone", nums), tch = solAgg("tchat", nums), mail = solAgg("mail", nums);
    const sig = solSumChamp(nums, "signalements_trusted_flagger");
    const sorties = solSumChamp(nums, "sorties_anonymat");
    const partiel = (qLabel === "Q2");
    h += '<div class="sous-bloc"><h4 class="sous-bloc-titre">' + qLabel + " 2026 "
      + '<span class="badge ' + (partiel ? "partiel" : "consolide") + '">'
      + (partiel ? "en cours (juin non inclus)" : "consolidé") + "</span></h4>";
    h += '<div class="kv">'
      + solKV("Sollicitations reçues", tous.recu) + solKV("Prises en charge (tous canaux)", tous.pris)
      + solKV("Taux de prise en charge", tous.taux, true)
      + solKV("Appels reçus", tel.recu) + solKV("Appels décrochés", tel.pris)
      + solKV("Appels abandonnés", tel.nonPris) + solKV("Taux de réponse appels", tel.taux, true)
      + solKV("Tchats reçus", tch.recu) + solKV("Tchats traités", tch.pris)
      + solKV("Taux de prise tchat", tch.taux, true)
      + solKV("Mails traités", mail.pris)
      + solKV("Signalements TF", sig) + solKV("Sorties d'anonymat", sorties)
      + "</div></div>";
  });
  h += noteBox("Conformément aux règles : totaux trimestriels = somme des mois ; taux trimestriels recalculés sur les volumes agrégés (pas une moyenne des taux mensuels). Tchat Q1 = févr.+mars (janvier absent de l'export tchat).");
  return h + "</div>";
}
function solSumChamp(nums, champ) {
  let s = 0, has = false;
  solMois().forEach(mo => { if (nums.indexOf(mo.num) >= 0 && mo.row[champ] != null) { s += mo.row[champ]; has = true; } });
  return has ? s : null;
}
function solKV(label, v, isPct) {
  return '<div class="k">' + esc(label) + '</div><div class="v">' + (v == null ? "n.d." : (isPct ? showPct(v) : show(v))) + "</div>";
}

/* Grand tableau mensuel : toutes les colonnes de l'ancien onglet + champs
   auparavant masqués (abandonnés, reçues entrantes, mails). */
function solTableauMensuelDetaille() {
  const moisAll = solMois();
  let h = '<div class="bloc"><h3 class="bloc-titre">Tableau détaillé mensuel — valeurs sources</h3>'
    + '<div class="table-enveloppe"><table><thead><tr>'
    + "<th>Mois</th><th>Sollic. reçues</th><th>Appels reçus</th><th>Décrochés</th><th>Appels aband.</th><th>Taux rép.</th>"
    + "<th>Tchats reçus</th><th>Tchats traités</th><th>Taux prise</th><th>Mails</th>"
    + "<th>Activité traitée<br>(tous canaux)</th><th>Signal. TF</th><th>Sorties anon.</th>"
    + "</tr></thead><tbody>";
  moisAll.forEach(mo => {
    const d = mo.row;
    h += '<tr><td class="cellule-mois">' + esc(d.libelle) + "</td>"
      + td(d.sollicitations_entrantes) + td(d.appels_recus) + td(d.appels_decroches) + td(d.appels_abandonnes) + td(d.taux_reponse_appels_pct, true)
      + td(d.tchats_recus) + td(d.tchats_traites) + td(d.taux_prise_tchat_pct, true) + td(mo.mails)
      + td(d.volume_activite_traite) + td(d.signalements_trusted_flagger) + td(d.sorties_anonymat) + "</tr>";
  });
  h += "</tbody></table></div>";
  h += "</div>";
  return h;
}

/* Tableau « activité traitée tous canaux » repris de l'ancien onglet mensuel. */
function solTableauTousCanaux() {
  const m = DATA.monthly, tc = m && m.activite_traitee_tous_canaux;
  if (!tc || !tc.par_mois) return "";
  let h = '<div class="bloc"><h3 class="bloc-titre">Activité traitée tous canaux (appels décrochés + tchats traités + mails)</h3>'
    + '<div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Appels décrochés</th><th>Tchats traités</th><th>Mails</th><th>Total</th></tr></thead><tbody>';
  tc.par_mois.forEach(d => {
    const part = String(d.statut).includes("partiel");
    h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + (part ? ' <span class="mini-badge part">mails part.</span>' : "") + "</td>"
      + td(d.appels_decroches) + td(d.tchats_traites) + td(d.mails) + "<td><strong>" + show(d.total) + "</strong></td></tr>";
  });
  if (tc.totaux_fev_mai) {
    const t = tc.totaux_fev_mai;
    h += '<tr class="ligne-total"><td>Total fév.–mai' + (t.mails_mai_partiels ? " (mails mai partiels)" : "") + "</td>"
      + td(t.appels_decroches) + td(t.tchats_traites) + td(t.mails) + "<td>" + show(t.total) + "</td></tr>";
  }
  h += "</tbody></table></div>" + noteBox(esc(tc.note)) + "</div>";
  return h;
}

/* Observations mensuelles reprises de l'ancien onglet. */
function solObservations() {
  const moisAll = solMois().filter(mo => mo.row.observation);
  if (!moisAll.length) return "";
  return '<div class="bloc"><h3 class="bloc-titre">Observations</h3><ul class="liste-propre">'
    + moisAll.map(mo => "<li><strong>" + esc(mo.row.libelle) + " :</strong> " + esc(mo.row.observation) + "</li>").join("")
    + "</ul></div>";
}

/* ================================================================
   ONGLET « PERFORMANCE DES CANAUX »  (ex Téléphone + Tchat + Mail)
   ================================================================ */
let PERF_F = { canal: "telephone", periode: "annee", file: "__all__" };

function perfOptionsPeriode() {
  const avail = solNumsDispo();
  let o = '<option value="annee">Toute la période</option>';
  o += '<option value="Q1">T1 — janv. à mars</option>';
  o += '<option value="Q2">T2 — avr. à juin (partiel)</option>';
  avail.forEach(n => { o += '<option value="m:' + n + '">' + MOIS_COURT[String(n).padStart(2, "0")] + ' 2026</option>'; });
  return o;
}

function renderPerformance() {
  let h = "";
  const canaux = [
    { v: "telephone", label: "Téléphone" },
    { v: "tchat", label: "Tchat" },
    { v: "mail", label: "Mail" },
    { v: "tous", label: "Tous les canaux (agglomérés)" }
  ];
  h += '<div class="tf-filtres">'
    + '<label>Canal<select id="perf-canal">' + canaux.map(c => '<option value="' + c.v + '">' + c.label + "</option>").join("") + "</select></label>"
    + '<label>Période<select id="perf-periode">' + perfOptionsPeriode() + "</select></label>"
    + '<span id="perf-file-wrap"><label>File téléphonique<select id="perf-file">'
    + '<option value="__all__">Toutes les files</option>'
    + (((DATA.phone && DATA.phone.par_file_periode) || []).map(f => '<option value="' + escAttr(f.file_3cx) + '">' + esc(f.libelle || f.file_3cx) + "</option>").join(""))
    + "</select></label></span>"
    + "</div>";
  h += '<div id="perf-zone"></div>';
  return h;
}

function perfFill() {
  const zone = document.getElementById("perf-zone");
  if (!zone) return;
  const F = PERF_F;
  if (F.canal === "telephone") zone.innerHTML = perfTelephone(F);
  else if (F.canal === "tchat") zone.innerHTML = perfTchat(F);
  else if (F.canal === "mail") zone.innerHTML = perfMail(F);
  else zone.innerHTML = perfTous(F);
}

/* nums de mois retenus pour Performance (réutilise la logique) */
function perfNums(F) { return solMoisRetenus({ periode: F.periode }); }

/* ---- Téléphone : reprend tout l'ancien onglet + filtre période/file ---- */
function perfTelephone(F) {
  const p = DATA.phone;
  if (!p) return '<p class="intro">Données indisponibles.</p>';
  const nums = perfNums(F);
  const moisDansP = (p.par_mois || []).filter(d => nums.indexOf(parseInt(String(d.mois).split("-")[1], 10)) >= 0);

  /* KPI agrégés sur la période choisie (ou file si sélectionnée) */
  let recu, dec, aband, tauxLbl;
  if (F.file !== "__all__") {
    const f = (p.par_file_periode || []).find(x => x.file_3cx === F.file) || {};
    recu = f.appels_recus; dec = f.appels_decroches; aband = f.appels_abandonnes;
    tauxLbl = "file — sur toute la période";
  } else {
    recu = moisDansP.reduce((s, d) => s + (d.appels_recus || 0), 0);
    dec = moisDansP.reduce((s, d) => s + (d.appels_decroches || 0), 0);
    aband = moisDansP.reduce((s, d) => s + (d.appels_abandonnes || 0), 0);
    if (!moisDansP.length) { recu = dec = aband = null; }
    tauxLbl = "décrochés / reçus";
  }
  const taux = (recu && recu > 0) ? Math.round(dec / recu * 1000) / 10 : null;

  let h = '<p class="periode-tag">' + esc((p._meta && p._meta.periode) || "") + " · " + esc(solLibellePeriode({ periode: F.periode }))
    + (F.file !== "__all__" ? " · file sélectionnée" : "") + "</p>";
  h += '<div class="kpis">'
    + kpi("Appels reçus", show(recu), "période", "")
    + kpi("Appels décrochés", show(dec), "indicateur prioritaire", "primaire")
    + kpi("Appels abandonnés", show(aband), "non répondus", "")
    + kpi("Taux de réponse", showPct(taux), tauxLbl, (taux != null && taux < 30) ? "vigilance" : "")
    + "</div>";
  if (F.file !== "__all__") h += noteBox("Les statistiques par file ne sont disponibles que sur l'ensemble de la période (pas de ventilation mensuelle par file dans les sources). Le filtre « période » n'affecte donc pas ce bloc.", "vigilance");

  /* tendance taux de réponse */
  if (p.par_mois) {
    const tx = tendance(p.par_mois.map(d => d.taux_reponse_pct));
    if (tx) h += lectureBox("Lecture", [{ cls: tx.cls, txt: "Taux de réponse " + (tx.cls === "hausse" ? "en amélioration" : tx.cls === "baisse" ? "en recul" : "stable") + " sur la période (" + libelleCourt(p.par_mois[tx.idxA].mois) + " " + showPct(tx.premier) + " → " + libelleCourt(p.par_mois[tx.idxB].mois) + " " + showPct(tx.dernier) + ")." }]);
  }

  /* tableau mensuel (+ temps total auparavant masqué) */
  if (p.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th><th>Taux rép.</th><th>Durée moy.</th><th>Temps total conv.</th></tr></thead><tbody>';
    p.par_mois.forEach(d => {
      const dim = nums.indexOf(parseInt(String(d.mois).split("-")[1], 10)) < 0 ? ' class="hors-periode"' : "";
      h += "<tr" + dim + '><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>"
        + td(d.appels_recus) + td(d.appels_decroches) + td(d.appels_abandonnes) + td(d.taux_reponse_pct, true)
        + "<td>" + esc(d.duree_moyenne_appel || "n.d.") + "</td><td>" + esc(d.temps_total_conversation || "n.d.") + "</td></tr>";
    });
    h += "</tbody></table></div>" + noteBox("Les mois hors période sélectionnée sont grisés mais conservés pour vérification.") + "</div>";
  }

  /* graphe reçus vs décrochés */
  if (p.par_mois) {
    const items = p.par_mois.map(d => ({ label: libelleCourt(d.mois).replace(" 2026", ""), recus: d.appels_recus, dec: d.appels_decroches }));
    h += '<div class="bloc"><h3 class="bloc-titre">Appels reçus et décrochés par mois</h3><div class="graph">'
      + svgGroupedBars(items, "recus", "dec", BLEU, JAUNE) + "</div>"
      + legende([{ label: "Reçus", color: BLEU }, { label: "Décrochés", color: JAUNE }]) + "</div>";
  }

  /* tableau files 3CX (filtré) */
  if (p.par_file_periode) {
    const files = p.par_file_periode.filter(f => F.file === "__all__" || f.file_3cx === F.file);
    h += '<div class="bloc"><h3 class="bloc-titre">Files 3CX (sur toute la période)</h3><div class="table-enveloppe"><table><thead><tr><th>File</th><th>Rôle supposé</th><th>Reçus</th><th>Décrochés</th><th>Abandonnés</th></tr></thead><tbody>';
    files.forEach(f => { h += "<tr><td>" + esc(f.libelle || f.file_3cx) + '</td><td style="text-align:left">' + esc(f.role_suppose || "") + "</td>" + td(f.appels_recus) + td(f.appels_decroches) + td(f.appels_abandonnes) + "</tr>"; });
    h += "</tbody></table></div>" + noteBox("Files 900 (3018 Mineur), 902 (après 17h) et 903 (violence numérique) isolables via le filtre ci-dessus.") + "</div>";
  }
  if (p.note_methodologique) h += noteBox(esc(p.note_methodologique));
  return h;
}

/* ---- Tchat : reprend tout l'ancien onglet + indicateurs auparavant masqués ---- */
function perfTchat(F) {
  const c = DATA.chat;
  if (!c) return '<p class="intro">Données indisponibles.</p>';
  const nums = perfNums(F);
  const s = c.synthese_periode || {};
  const moisDans = (c.par_mois || []).filter(d => nums.indexOf(parseInt(String(d.mois).split("-")[1], 10)) >= 0);
  const recu = moisDans.reduce((a, d) => a + (d.tchats_recus || 0), 0);
  const trait = moisDans.reduce((a, d) => a + (d.tchats_traites || 0), 0);
  const aband = moisDans.reduce((a, d) => a + (d.tchats_abandonnes || 0), 0);
  const taux = (recu > 0) ? Math.round(trait / recu * 1000) / 10 : null;
  const vide = moisDans.length === 0;

  let h = '<p class="periode-tag">' + esc((c._meta && c._meta.periode) || "") + " · " + esc(solLibellePeriode({ periode: F.periode })) + "</p>";
  if (c._meta && c._meta.perimetre) h += '<p class="intro">' + esc(c._meta.perimetre) + "</p>";
  h += '<div class="kpis">'
    + kpi("Tchats reçus", vide ? "n.d." : show(recu), "période", "")
    + kpi("Tchats traités", vide ? "n.d." : show(trait), "un écoutant a rejoint", "primaire")
    + kpi("Tchats abandonnés", vide ? "n.d." : show(aband), "jamais pris", "")
    + kpi("Taux de prise", vide ? "n.d." : showPct(taux), "traités / reçus", "")
    + "</div>";
  /* indicateurs auparavant non affichés (niveau période globale) */
  h += '<div class="kpis">'
    + kpi("Attente médiane", show(s.attente_mediane_min) + " min", "avant prise en charge", "")
    + kpi("Attente moyenne", show(s.attente_moyenne_min) + " min", "avant prise en charge", "")
    + kpi("Durée médiane d'échange", show(s.duree_mediane_session_min) + " min", "par session", "")
    + "</div>" + noteBox("Temps d'attente et durée d'échange : disponibles uniquement sur l'ensemble de la période (fév.–mai), pas par mois.");

  if (c.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Reçus</th><th>Traités</th><th>Abandonnés</th><th>Taux prise</th></tr></thead><tbody>';
    c.par_mois.forEach(d => {
      const dim = nums.indexOf(parseInt(String(d.mois).split("-")[1], 10)) < 0 ? ' class="hors-periode"' : "";
      h += "<tr" + dim + '><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + "</td>" + td(d.tchats_recus) + td(d.tchats_traites) + td(d.tchats_abandonnes) + td(d.taux_prise_pct, true) + "</tr>";
    });
    h += "</tbody></table></div></div>";
    const items = c.par_mois.map(d => ({ label: libelleCourt(d.mois).replace(" 2026", ""), recus: d.tchats_recus, traites: d.tchats_traites }));
    h += '<div class="bloc"><h3 class="bloc-titre">Tchats reçus et traités par mois</h3><div class="graph">'
      + svgGroupedBars(items, "recus", "traites", BLEU, JAUNE) + "</div>"
      + legende([{ label: "Reçus", color: BLEU }, { label: "Traités", color: JAUNE }]) + "</div>";
  }
  if (c.note_methodologique) h += noteBox(esc(c.note_methodologique));
  return h;
}

/* ---- Mail ---- */
function perfMail(F) {
  const moisAll = solMois();
  const nums = perfNums(F);
  const dans = moisAll.filter(mo => nums.indexOf(mo.num) >= 0 && mo.mails != null);
  const tot = dans.length ? dans.reduce((a, mo) => a + mo.mails, 0) : null;
  let h = '<p class="periode-tag">Mail — ' + esc(solLibellePeriode({ periode: F.periode })) + "</p>";
  h += '<div class="kpis">'
    + kpi("Mails traités", show(tot), "sur la période", "primaire")
    + kpi("Mails reçus", "N/A", "non disponible dans les sources", "")
    + kpi("Taux de prise", "N/A", "non calculable", "")
    + "</div>";
  h += noteBox("Le mail n'est suivi qu'en <strong>traités</strong> (export Salesforce Case), de février à mai, mai partiel au 26/05. Pas de volume « reçu » dans les sources, donc pas de taux de prise.", "vigilance");
  h += '<div class="bloc"><h3 class="bloc-titre">Mails traités par mois</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Mails traités</th><th>Statut</th></tr></thead><tbody>';
  moisAll.forEach(mo => {
    h += '<tr><td class="cellule-mois">' + esc(mo.libelle) + "</td>" + td(mo.mails) + "<td>" + esc(mo.mailStatut || "n.d.") + "</td></tr>";
  });
  h += "</tbody></table></div>";
  const items = moisAll.filter(mo => mo.mails != null).map(mo => ({ label: mo.court.replace(" 2026", ""), v: mo.mails }));
  if (items.length) h += '<div class="graph">' + svgBars(items, BLEU, items.length - 1) + "</div>" + noteBox("Dernière barre hachurée : mai (mails partiels).");
  return h + "</div>";
}

/* ---- Tous canaux agglomérés ---- */
function perfTous(F) {
  const m = DATA.monthly, tc = m && m.activite_traitee_tous_canaux;
  const nums = perfNums(F);
  let h = '<p class="periode-tag">Tous canaux agglomérés — ' + esc(solLibellePeriode({ periode: F.periode })) + "</p>";

  const tel = solAgg("telephone", nums), tch = solAgg("tchat", nums), mail = solAgg("mail", nums), tous = solAgg("tous", nums);
  h += '<div class="kpis hero">'
    + kpi("Activité traitée tous canaux", show(tous.pris), "appels décrochés + tchats traités + mails", "primaire")
    + kpi("dont téléphone (décrochés)", show(tel.pris), "", "")
    + kpi("dont tchat (traités)", show(tch.pris), "", "")
    + kpi("dont mail (traités)", show(mail.pris), "partiel", "")
    + "</div>";
  h += noteBox("« Tous canaux » agglomère les sollicitations <strong>prises en charge</strong> (traitées) de chaque canal. À ne pas confondre avec les sollicitations reçues, suivies dans l'onglet « Sollicitations ».");

  /* répartition par canal */
  h += '<div class="bloc"><h3 class="bloc-titre">Répartition des prises en charge par canal</h3>'
    + htmlHBars([
      { label: "Téléphone (décrochés)", v: tel.pris },
      { label: "Tchat (traités)", v: tch.pris },
      { label: "Mail (traités)", v: mail.pris }
    ], BLEU) + "</div>";

  /* tableau par mois (appels décrochés / tchats traités / mails / total) */
  if (tc && tc.par_mois) {
    h += '<div class="bloc"><h3 class="bloc-titre">Détail mensuel — activité traitée par canal</h3><div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>Appels décrochés</th><th>Tchats traités</th><th>Mails</th><th>Total</th></tr></thead><tbody>';
    tc.par_mois.forEach(d => {
      const part = String(d.statut).includes("partiel");
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(d.mois)) + (part ? ' <span class="mini-badge part">mails part.</span>' : "") + "</td>"
        + td(d.appels_decroches) + td(d.tchats_traites) + td(d.mails) + "<td><strong>" + show(d.total) + "</strong></td></tr>";
    });
    if (tc.totaux_fev_mai) {
      const t = tc.totaux_fev_mai;
      h += '<tr class="ligne-total"><td>Total fév.–mai</td>' + td(t.appels_decroches) + td(t.tchats_traites) + td(t.mails) + "<td>" + show(t.total) + "</td></tr>";
    }
    h += "</tbody></table></div>" + noteBox(esc(tc.note)) + "</div>";
    const items = tc.par_mois.map(d => ({ label: libelleCourt(d.mois).replace(" 2026", ""), v: d.total }));
    const idxPart = tc.par_mois.findIndex(d => String(d.statut).includes("partiel"));
    h += '<div class="bloc"><h3 class="bloc-titre">Total d\'activité traitée par mois</h3><div class="graph">' + svgBars(items, BLEU, idxPart) + "</div></div>";
  }
  return h;
}

/* =================================================================
   MODULE ETP — contextualisation des ressources globales
   -----------------------------------------------------------------
   ETP = équivalent temps plein THÉORIQUE (temps dû initial Octime).
   Ne mesure ni la présence réelle, ni une quelconque performance.
   Aucune valeur 2024 (=> n.d.). Juin 2026 partiel (jamais extrapolé).
   Utilisé uniquement comme indicateur de ressources dans la Synthèse
   et la Comparaison historique (ETP moyen). Aucun ratio par ETP.
   ================================================================= */

/* index "2026-01" -> {etp, statut} */
function etpIndex() {
  const e = DATA.etp, o = {};
  if (e && e.par_mois) e.par_mois.forEach(d => { o[d.mois] = d; });
  return o;
}
function etpDe(key) { const d = etpIndex()[key]; return d ? d.etp : null; }
function etpStatut(key) { const d = etpIndex()[key]; return d ? d.statut : null; }
function etpEstPartiel(key) { const s = etpStatut(key); return s != null && String(s).indexOf("partiel") >= 0; }

/* somme des ETP sur une liste de clés "AAAA-MM" (null si rien) */
function etpSomme(keys) {
  let s = 0, has = false;
  keys.forEach(k => { const v = etpDe(k); if (v != null) { s += v; has = true; } });
  return has ? Math.round(s * 100) / 100 : null;
}
/* moyenne des ETP : exclut par défaut les mois partiels */
function etpMoyenne(keys, inclurePartiels) {
  const ks = keys.filter(k => etpDe(k) != null && (inclurePartiels || !etpEstPartiel(k)));
  if (!ks.length) return null;
  return Math.round(etpSomme(ks) / ks.length * 100) / 100;
}
/* clés mensuelles d'une année (1..12) -> ["2026-01",...] limité aux mois fournis */
function moisKeys(annee, nums) { return nums.map(n => annee + "-" + String(n).padStart(2, "0")); }

/* =================================================================
   MODULE « ETP ET ACTIVITÉ »
   -----------------------------------------------------------------
   Met côte à côte ETP, absences, sollicitations prises en charge,
   temps consacré aux sollicitations et aux activités annexes.
   Données observées : ETP (Octime), absences (Octime), volumes,
   durée réelle des appels (3CX). Données estimées : temps standards.
   Une donnée absente reste « n.d. », jamais zéro. Aucune extrapolation.
   Temps standards et base ETP : data/workload_config.json.
   ================================================================= */

let EA_F = { periode: "cumul", persoDe: "2026-01", persoA: "2026-05" };

/* ---- accès configuration ---- */
function cfgEA() { return DATA.workload || {}; }
function heuresEtpMois() { return cfgEA().heures_par_etp_mois || 151.67; }
function minEA(k, def) { const v = cfgEA()[k]; return (v == null ? def : v); }

/* ---- petits utilitaires ---- */
function hmsMin(s) { if (s == null) return null; const p = String(s).split(":").map(Number); if (p.some(isNaN)) return null; return (p[0] || 0) * 60 + (p[1] || 0) + (p[2] || 0) / 60; }
function sumNN(arr) { let s = 0, has = false; arr.forEach(v => { if (v != null) { s += v; has = true; } }); return has ? s : null; }
function mulNN(n, t) { return n == null ? null : n * t; }
function h1(x) { return x == null ? null : Math.round(x * 10) / 10; }      /* arrondi 1 décimale */
function fmtHe(x) { return x == null ? '<span class="nd">n.d.</span>' : nf(h1(x)) + " h"; }

/* ---- index mensuels des différentes sources ---- */
function solMoisIndex() { const o = {}; const p = DATA.monthly && DATA.monthly.activite_traitee_tous_canaux && DATA.monthly.activite_traitee_tous_canaux.par_mois; if (p) p.forEach(m => o[m.mois] = m); return o; }
function solDuMois(key) { const m = solMoisIndex()[key]; return m ? m.total : null; }
function solStatut(key) { const m = solMoisIndex()[key]; return m ? (m.statut || "") : ""; }

function absIndex() { const o = {}; const p = DATA.absences && DATA.absences.par_mois; if (p) p.forEach(m => o[m.mois] = m); return o; }
function absDuMois(key) { return absIndex()[key] || null; }

function wfIndex() { const o = {}; const p = DATA.workforce && DATA.workforce.par_mois; if (p) p.forEach(m => o[m.mois] = m); return o; }
function ecoutantsDuMois(key) { const m = wfIndex()[key]; return (m && m.nombre_ecoutants != null) ? m.nombre_ecoutants : null; }

function phoneIndex() { const o = {}; const p = DATA.phone && DATA.phone.par_mois; if (p) p.forEach(m => o[m.mois] = m); return o; }
function chatIndex() { const o = {}; const p = DATA.chat && DATA.chat.par_mois; if (p) p.forEach(m => o[m.mois] = m); return o; }
function mailDuMois(key) { const m = solMoisIndex()[key]; return m ? (m.mails == null ? null : m.mails) : null; }

function tfMoisDe(key) { const p = DATA.flagger && DATA.flagger.par_mois_2026; if (!p) return null; const o = p.find(x => x.mois === key); return o ? o.signalements : null; }
function anDetailDe(grp, key) { try { const v = DATA.anonymity.detail_par_mois_destinataire[grp][key]; return v == null ? null : v; } catch (e) { return null; } }
function anIpsDe(dest, key) { try { const v = DATA.anonymity.sous_destinataires_ips_mensuel.par_destinataire[dest].par_mois[key]; return v == null ? null : v; } catch (e) { return null; } }

/* dernier mois complet de l'activité traitée (exclut tout mois marqué « partiel ») */
function dernierMoisComplet() {
  const p = DATA.monthly && DATA.monthly.activite_traitee_tous_canaux && DATA.monthly.activite_traitee_tous_canaux.par_mois;
  if (!p) return null;
  let dmc = null;
  p.forEach(m => { if (m.total != null && String(m.statut || "").indexOf("partiel") < 0) dmc = m.mois; });
  return dmc;
}

/* ---- calcul d'un mois (2026) ---- */
function eaMois(key) {
  const T = {
    saisieAppel: minEA("minutes_saisie_appel", 10), tchat: minEA("minutes_tchat", 30), mail: minEA("minutes_mail", 15),
    men: minEA("minutes_men", 10), plat: minEA("minutes_plateforme", 20), art40: minEA("minutes_article_40", 120),
    crip: minEA("minutes_ip_crip", 105), pharos: minEA("minutes_pharos", 30), sport: minEA("minutes_signal_sports", 20),
    reunion: minEA("heures_reunions_par_ecoutant_mois", 5),
  };
  const etp = etpDe(key), partiel = etpEstPartiel(key);
  const ab = absDuMois(key);
  const eco = ecoutantsDuMois(key);
  const heuresEtp = etp != null ? etp * heuresEtpMois() : null;
  const heuresAbs = ab ? ab.total_heures_absence : null;
  const heuresApres = (heuresEtp != null && heuresAbs != null) ? heuresEtp - heuresAbs : null;

  const ph = phoneIndex()[key];
  const ad = ph ? ph.appels_decroches : null;
  const dureeMin = ph ? hmsMin(ph.temps_total_conversation) : null;
  const hAppelConv = dureeMin == null ? null : dureeMin / 60;
  const hAppelSaisie = ad == null ? null : ad * T.saisieAppel / 60;
  const hAppels = sumNN([hAppelConv, hAppelSaisie]);

  const ch = chatIndex()[key];
  const tc = ch ? ch.tchats_traites : null;
  const hTchats = tc == null ? null : tc * T.tchat / 60;

  const ml = mailDuMois(key);
  const hMails = ml == null ? null : ml * T.mail / 60;

  const tempsSol = sumNN([hAppels, hTchats, hMails]);

  const plat = tfMoisDe(key), men = anDetailDe("harcelement_scolaire", key),
        proc = anIpsDe("Procureur", key), crip = anIpsDe("CRIP", key), pharos = anDetailDe("pharos", key);
  const hPlat = mulNN(plat, T.plat) == null ? null : plat * T.plat / 60;
  const hMen = men == null ? null : men * T.men / 60;
  const hProc = proc == null ? null : proc * T.art40 / 60;
  const hCrip = crip == null ? null : crip * T.crip / 60;
  const hPharos = pharos == null ? null : pharos * T.pharos / 60;
  const hSport = null; /* Signal-Sports : n.d. */
  const tempsSignal = sumNN([hPlat, hMen, hProc, hCrip, hPharos]);

  const hReunions = eco == null ? null : eco * T.reunion;
  const tempsAnnexes = sumNN([tempsSignal, hReunions]);
  const total = sumNN([tempsSol, tempsAnnexes]);

  return {
    key: key, label: libelleCourt(key), etp: etp, etpPartiel: partiel, ecoutants: eco,
    abs: ab, heuresEtp: heuresEtp, heuresAbs: heuresAbs, heuresApres: heuresApres,
    sollicitations: solDuMois(key), solPartiel: String(solStatut(key)).indexOf("partiel") >= 0,
    appels: ad, dureeMin: dureeMin, hAppelConv: hAppelConv, hAppelSaisie: hAppelSaisie, hAppels: hAppels,
    tchats: tc, hTchats: hTchats, mails: ml, hMails: hMails, tempsSol: tempsSol,
    plat: plat, men: men, proc: proc, crip: crip, pharos: pharos,
    hPlat: hPlat, hMen: hMen, hProc: hProc, hCrip: hCrip, hPharos: hPharos, hSport: hSport,
    tempsSignal: tempsSignal, hReunions: hReunions, tempsAnnexes: tempsAnnexes, total: total,
  };
}

/* mois 2026 disponibles pour l'analyse de temps (téléphone présent) */
function eaMoisDispo() {
  const p = DATA.phone && DATA.phone.par_mois;
  return p ? p.filter(m => String(m.mois).indexOf("2026") === 0).map(m => m.mois) : [];
}

/* liste de clés selon le filtre */
function eaKeys() {
  const all = eaMoisDispo();
  if (EA_F.periode === "T1") return all.filter(k => ["2026-01", "2026-02", "2026-03"].indexOf(k) >= 0);
  if (/^2026-\d\d$/.test(EA_F.periode)) return all.filter(k => k === EA_F.periode);
  if (EA_F.periode === "perso") {
    return all.filter(k => k >= EA_F.persoDe && k <= EA_F.persoA);
  }
  return all; /* cumul annuel à date */
}

/* agrégation d'une liste de mois */
function eaAgg(keys) {
  const rows = keys.map(eaMois);
  const sum = f => sumNN(rows.map(r => r[f]));
  const etpMoisComplets = rows.filter(r => r.etp != null && !r.etpPartiel);
  const etpMoyen = etpMoisComplets.length ? Math.round(etpMoisComplets.reduce((s, r) => s + r.etp, 0) / etpMoisComplets.length * 100) / 100 : null;
  const heuresEtp = sum("heuresEtp");
  const heuresAbs = sum("heuresAbs");
  const heuresApres = (heuresEtp != null && heuresAbs != null) ? heuresEtp - heuresAbs : null;
  const sol = sum("sollicitations");
  const solParEtp = (sol != null && etpMoyen) ? Math.round(sol / etpMoyen * 10) / 10 : null;
  return {
    rows: rows, etpMoyen: etpMoyen, heuresEtp: heuresEtp, heuresAbs: heuresAbs, heuresApres: heuresApres,
    sollicitations: sol, solParEtp: solParEtp,
    tempsSol: sum("tempsSol"), tempsAnnexes: sum("tempsAnnexes"), tempsSignal: sum("tempsSignal"),
    hReunions: sum("hReunions"), total: sum("total"),
    hAppels: sum("hAppels"), hAppelConv: sum("hAppelConv"), hAppelSaisie: sum("hAppelSaisie"),
    hTchats: sum("hTchats"), hMails: sum("hMails"),
    hPlat: sum("hPlat"), hMen: sum("hMen"), hProc: sum("hProc"), hCrip: sum("hCrip"), hPharos: sum("hPharos"),
    appels: sum("appels"), tchats: sum("tchats"), mails: sum("mails"),
    plat: sum("plat"), men: sum("men"), proc: sum("proc"), crip: sum("crip"), pharos: sum("pharos"),
    partielSol: rows.some(r => r.solPartiel), nbMois: keys.length,
  };
}

function eaPeriodeLabel() {
  if (EA_F.periode === "T1") return "T1 2026 (janv.–mars)";
  if (/^2026-\d\d$/.test(EA_F.periode)) return libelleCourt(EA_F.periode);
  if (EA_F.periode === "perso") return libelleCourt(EA_F.persoDe) + " → " + libelleCourt(EA_F.persoA);
  return "Cumul janv.–mai 2026";
}

/* badge observé / estimé */
function tag(estime) { return estime ? ' <span class="ea-tag est" title="Donnée estimée à partir d\'un temps standard.">estimé</span>' : ' <span class="ea-tag obs" title="Donnée observée.">observé</span>'; }

/* ====================== SYNTHÈSE : bloc simple ====================== */
function blocEtpSynthese() {
  const dmc = dernierMoisComplet();
  if (!dmc || !DATA.etp) return "";
  const etp = etpDe(dmc), sol = solDuMois(dmc);
  const ratio = (sol != null && etp) ? Math.round(sol / etp * 10) / 10 : null;
  let h = '<div class="bloc"><h3 class="bloc-titre">ETP et activité — ' + esc(libelleCourt(dmc)) + ' <span class="kpi-sub-inline">dernier mois complet</span></h3><div class="kpis">';
  h += kpi("ETP", show(etp), esc(libelleCourt(dmc)), "primaire");
  h += kpi("Sollicitations prises en charge", show(sol), esc(libelleCourt(dmc)), "accent");
  h += kpi("Sollicitations par ETP", show(ratio), esc(libelleCourt(dmc)), "");
  h += "</div>";
  /* phrase d'évolution vs mois complet précédent, si possible */
  const dispo = eaMoisDispo().filter(k => k < dmc && String(solStatut(k)).indexOf("partiel") < 0);
  const prev = dispo.length ? dispo[dispo.length - 1] : null;
  if (prev && sol != null && solDuMois(prev) != null) {
    const solP = solDuMois(prev), diff = sol - solP;
    const pct = solP ? Math.round(diff / solP * 1000) / 10 : null;
    const sens = diff > 0 ? "en hausse" : (diff < 0 ? "en baisse" : "stable");
    h += '<p class="intro">Sollicitations prises en charge ' + sens + " de " + nf(Math.abs(diff))
      + (pct != null ? " (" + nf(Math.abs(pct)) + " %)" : "") + " par rapport à " + esc(libelleCourt(prev)) + ".</p>";
  }
  h += noteBox("Détail complet (heures, absences, activités annexes) dans l'onglet « ETP et activité ».");
  h += "</div>";
  return h;
}

/* ====================== MÉTHODOLOGIE : temps standards ====================== */
function eaMethodologie() {
  const c = cfgEA();
  if (!DATA.workload) return "";
  let h = '<div class="bloc"><h3 class="bloc-titre">ETP et activité — temps standards</h3>';
  h += '<p class="intro">Ces temps servent à comparer les activités entre elles, et non à mesurer une performance individuelle. Modifiables dans data/workload_config.json.</p>';
  h += '<ul class="liste-propre">';
  h += "<li>1 ETP = " + show(c.heures_par_etp_mois) + " heures par mois (35 × 52 ÷ 12)</li>";
  h += "<li>heures après absences = heures ETP − heures d'absence</li>";
  h += "<li>appel = durée réelle ou moyenne + " + show(c.minutes_saisie_appel) + " minutes</li>";
  h += "<li>tchat = " + show(c.minutes_tchat) + " minutes</li>";
  h += "<li>mail = " + show(c.minutes_mail) + " minutes</li>";
  h += "<li>MEN = " + show(c.minutes_men) + " minutes</li>";
  h += "<li>plateforme = " + show(c.minutes_plateforme) + " minutes</li>";
  h += "<li>Procureur / article 40 = " + show(c.minutes_article_40) + " minutes</li>";
  h += "<li>IP / CRIP = " + show(c.minutes_ip_crip) + " minutes</li>";
  h += "<li>Pharos = " + show(c.minutes_pharos) + " minutes</li>";
  h += "<li>Signal-Sports = " + show(c.minutes_signal_sports) + " minutes (donnée actuellement n.d.)</li>";
  h += "<li>réunions, interventions et supervisions = " + show(c.heures_reunions_par_ecoutant_mois) + " heures par mois et par écoutant</li>";
  h += "</ul>";
  h += noteBox("La formation figurant dans l'export d'absences est déduite des heures disponibles et n'est jamais recomptée dans les activités annexes.");
  h += "</div>";
  return h;
}

/* ====================== ONGLET : structure ====================== */
function renderEtpActivite() {
  if (!DATA.etp || !DATA.workload) return '<p class="intro">Données ETP / configuration indisponibles.</p>';
  if (!eaMoisDispo().length) return '<p class="intro">Aucun mois d\'activité disponible.</p>';

  let h = '<p class="intro">Pourquoi les sollicitations prises en charge peuvent baisser alors que les ETP augmentent : les activités annexes prennent une place croissante. On met ici côte à côte les ETP, les absences, les sollicitations et le temps consacré aux différentes activités.</p>';

  /* 1. Filtres */
  h += '<div class="bloc"><label class="filtre-label" for="ea-periode">Période</label> ';
  h += '<select id="ea-periode" class="filtre-select">'
    + '<option value="cumul">Cumul janv.–mai 2026</option>'
    + '<option value="T1">Trimestre T1 (janv.–mars)</option>';
  eaMoisDispo().forEach(k => { h += '<option value="' + k + '">' + esc(libelleCourt(k)) + "</option>"; });
  h += '<option value="perso">Période personnalisée</option></select>';
  h += '<span id="ea-perso" hidden> &nbsp;de <select id="ea-de" class="filtre-select">'
    + eaMoisDispo().map(k => '<option value="' + k + '"' + (k === EA_F.persoDe ? " selected" : "") + ">" + esc(libelleCourt(k)) + "</option>").join("")
    + '</select> à <select id="ea-a" class="filtre-select">'
    + eaMoisDispo().map(k => '<option value="' + k + '"' + (k === EA_F.persoA ? " selected" : "") + ">" + esc(libelleCourt(k)) + "</option>").join("")
    + "</select></span>";
  h += "</div>";

  /* zone recalculée (blocs 1,2,3) */
  h += '<div id="ea-zone"></div>';

  /* 4. Comparaison 2025 / 2026 (fixe, janv.–mai) */
  h += eaComparaison();

  /* 5. Absences (toute la période disponible) */
  h += eaBlocAbsences();

  /* 6. Limites */
  h += '<div class="bloc"><h3 class="bloc-titre">Limites</h3>';
  h += noteBox("Les temps affichés sont des estimations. Ils ne couvrent pas toutes les activités du service, notamment les pauses, la coordination, le management, les relances, les recherches, les validations, les incidents techniques et les autres tâches non mesurées.");
  h += '<ul class="liste-propre">'
    + "<li>février 2026 correspond au passage à Salesforce</li>"
    + "<li>une partie des tchats entrants n'a pas été distribuée aux écoutants</li>"
    + "<li>le nombre exact de tchats concernés n'est pas disponible</li>"
    + "<li>certaines données de mai sont partielles</li>"
    + "<li>juin 2026 est partiel</li></ul>";
  h += noteBox("La différence entre les heures correspondant aux ETP et les heures mesurées ne doit pas être lue comme de l'inactivité : de nombreuses activités ne sont pas mesurées ici.");
  h += "</div>";
  return h;
}

/* ====================== zone recalculée selon la période ====================== */
function eaFill() {
  const zone = document.getElementById("ea-zone");
  if (!zone) return;
  const keys = eaKeys();
  if (!keys.length) { zone.innerHTML = '<p class="intro">Aucune donnée pour cette période.</p>'; return; }
  const A = eaAgg(keys);
  let h = "";

  /* --- Bloc 1 : vue d'ensemble --- */
  h += '<div class="bloc"><h3 class="bloc-titre">Vue d\'ensemble — ' + esc(eaPeriodeLabel()) + "</h3><div class=\"kpis\">";
  h += kpi("ETP" + (keys.length > 1 ? " (moyen)" : ""), show(A.etpMoyen), keys.length > 1 ? "moyenne des mois complets" : "", "primaire");
  h += kpi("Heures correspondant aux ETP", fmtHe(A.heuresEtp), "ETP × 151,67 h", "");
  h += kpi("Heures d'absence", fmtHe(A.heuresAbs), "Octime", "");
  h += kpi("Heures après déduction des absences connues", fmtHe(A.heuresApres), "", "accent");
  h += kpi("Sollicitations prises en charge", show(A.sollicitations) + (A.partielSol ? ' <span class="mini-badge part">partiel</span>' : ""), "", "primaire");
  h += kpi("Temps consacré aux sollicitations", fmtHe(A.tempsSol), "appels + tchats + mails", "");
  h += kpi("Temps consacré aux activités annexes", fmtHe(A.tempsAnnexes), "signalements" + (A.hReunions == null ? " (réunions n.d.)" : " + réunions"), "");
  h += kpi("Total du temps représenté dans les données", fmtHe(A.total), "estimation partielle", "accent");
  h += "</div>";
  h += noteBox("« Heures correspondant aux ETP » et « heures après déduction des absences connues » ne sont pas une mesure de présence réelle : seules les absences présentes dans le fichier sont déduites.");
  h += "</div>";

  /* --- Bloc 2 : répartition du temps par activité --- */
  h += '<div class="bloc"><h3 class="bloc-titre">Répartition du temps par activité</h3>';
  h += '<div class="table-enveloppe"><table><thead><tr><th>Activité</th><th>Volume</th><th>Temps moyen retenu</th><th>Temps total (h)</th><th>Nature</th></tr></thead><tbody>';
  function ligne(act, vol, moyen, heures, estime, ndNature) {
    return "<tr><td style=\"text-align:left\">" + esc(act) + "</td>"
      + "<td>" + (vol == null ? '<span class="nd">n.d.</span>' : vol) + "</td>"
      + "<td>" + esc(moyen) + "</td>"
      + "<td>" + fmtHe(heures) + "</td>"
      + "<td style=\"text-align:left;font-size:12px\">" + (ndNature ? '<span class="nd">n.d.</span>' : (estime ? "estimé" : "observé")) + "</td></tr>";
  }
  h += '<tr class="vue-groupe"><td colspan="5">Temps consacré aux sollicitations</td></tr>';
  h += ligne("Appels", A.appels == null ? null : show(A.appels) + " décrochés", "durée réelle ou moyenne + 10 min", A.hAppels, true);
  h += ligne("Rédaction et saisie après appel", A.appels == null ? null : show(A.appels), "10 min / appel", A.hAppelSaisie, true);
  h += ligne("Tchats", A.tchats == null ? null : show(A.tchats) + " traités", "30 min", A.hTchats, true);
  h += ligne("Mails", A.mails == null ? null : show(A.mails) + " traités", "15 min", A.hMails, true);
  h += '<tr class="vue-groupe"><td colspan="5">Temps consacré aux activités annexes</td></tr>';
  h += ligne("Signalements plateformes", A.plat == null ? null : show(A.plat), "20 min", A.hPlat, true);
  h += ligne("Signalements MEN", A.men == null ? null : show(A.men), "10 min", A.hMen, true);
  h += ligne("Procureur / article 40", A.proc == null ? null : show(A.proc), "120 min", A.hProc, true);
  h += ligne("IP / CRIP", A.crip == null ? null : show(A.crip), "105 min", A.hCrip, true);
  h += ligne("Pharos", A.pharos == null ? null : show(A.pharos), "30 min", A.hPharos, true);
  h += ligne("Signal-Sports", null, "20 min", null, true, true);
  h += ligne("Réunions, interventions et supervisions", null, "5 h / écoutant", A.hReunions, true, A.hReunions == null);
  h += '<tr style="font-weight:700;background:#fafbff"><td style="text-align:left">Total du temps représenté</td><td></td><td></td><td>' + fmtHe(A.total) + "</td><td></td></tr>";
  h += "</tbody></table></div>";
  h += noteBox("Signal-Sports : aucune donnée (n.d.). Réunions : n.d. tant que le nombre d'écoutants mensuel n'est pas renseigné (data/workforce_monthly.json).");
  h += "</div>";

  /* --- Bloc 3 : évolution mensuelle --- */
  h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle</h3>';
  h += '<div class="table-enveloppe"><table class="compact"><thead><tr>'
    + "<th>Mois</th><th>ETP</th><th>Écoutants</th><th>Heures ETP</th><th>H. absence</th><th>H. après abs.</th>"
    + "<th>Sollicit.</th><th>H. appels</th><th>H. tchats</th><th>H. mails</th><th>H. signal.</th><th>H. réunions</th><th>H. annexes</th><th>Total h</th></tr></thead><tbody>";
  A.rows.forEach(r => {
    h += "<tr><td style=\"text-align:left\">" + esc(r.label) + (r.etpPartiel ? ' <span class="mini-badge part">part.</span>' : "") + "</td>"
      + td(r.etp) + (r.ecoutants == null ? '<td class="nd">n.d.</td>' : td(r.ecoutants))
      + "<td>" + fmtHe(r.heuresEtp) + "</td><td>" + fmtHe(r.heuresAbs) + "</td><td>" + fmtHe(r.heuresApres) + "</td>"
      + td(r.sollicitations) + "<td>" + fmtHe(r.hAppels) + "</td><td>" + fmtHe(r.hTchats) + "</td><td>" + fmtHe(r.hMails) + "</td>"
      + "<td>" + fmtHe(r.tempsSignal) + "</td><td>" + fmtHe(r.hReunions) + "</td><td>" + fmtHe(r.tempsAnnexes) + "</td><td>" + fmtHe(r.total) + "</td></tr>";
  });
  h += "</tbody></table></div>";

  /* deux graphiques simples (unités séparées) */
  const labs = A.rows.map(r => r.label);
  h += '<div class="ea-charts">';
  h += '<div class="ea-chart"><h4 class="bloc-titre">ETP par mois</h4><div class="graph">'
    + svgLineChart(labs, [{ name: "ETP", color: BLEU, data: A.rows.map(r => r.etp) }], "") + "</div>";
  h += '<h4 class="bloc-titre">Sollicitations prises en charge par mois</h4><div class="graph">'
    + svgLineChart(labs, [{ name: "Sollicitations", color: JAUNE, data: A.rows.map(r => r.sollicitations) }], "") + "</div></div>";
  h += '<div class="ea-chart"><h4 class="bloc-titre">Heures : sollicitations et activités annexes</h4><div class="graph">'
    + svgLineChart(labs, [
        { name: "Sollicitations", color: BLEU, data: A.rows.map(r => h1(r.tempsSol)) },
        { name: "Activités annexes", color: JAUNE, data: A.rows.map(r => h1(r.tempsAnnexes)) },
      ], "") + "</div>"
    + legende([{ label: "Sollicitations", color: BLEU }, { label: "Activités annexes", color: JAUNE }]) + "</div>";
  h += "</div>";
  h += noteBox("Les heures de réunions sont « n.d. » tant que le nombre d'écoutants n'est pas renseigné ; elles ne sont donc pas incluses dans les heures d'activités annexes ci-dessus.");
  h += "</div>";

  zone.innerHTML = h;
}

/* ====================== Bloc 4 : comparaison 2025 / 2026 (janv.–mai) ====================== */
function histContactsTraites(annee, moisNum) {
  try {
    const arr = DATA.historical.series.contacts_traites[String(annee)];
    return arr ? (arr[moisNum - 1] == null ? null : arr[moisNum - 1]) : null;
  } catch (e) { return null; }
}
function eaComparaison() {
  const moisN = [1, 2, 3, 4, 5];
  /* 2026 : agrégat réel */
  const A26 = eaAgg(moisKeys(2026, moisN).filter(k => eaMoisDispo().indexOf(k) >= 0));
  /* ETP moyen */
  const etp25 = etpMoyenne(moisKeys(2025, moisN)), etp26 = A26.etpMoyen;
  /* absences */
  const abs25 = sumNN(moisKeys(2025, moisN).map(k => { const a = absDuMois(k); return a ? a.total_heures_absence : null; }));
  const abs26 = A26.heuresAbs;
  /* heures ETP */
  const hEtp25 = sumNN(moisKeys(2025, moisN).map(k => { const e = etpDe(k); return e == null ? null : e * heuresEtpMois(); }));
  const hEtp26 = A26.heuresEtp;
  const apres25 = (hEtp25 != null && abs25 != null) ? hEtp25 - abs25 : null;
  const apres26 = A26.heuresApres;
  /* sollicitations prises en charge */
  const sol25 = sumNN(moisN.map(n => histContactsTraites(2025, n)));
  const sol26 = A26.sollicitations;
  const solEtp25 = (sol25 != null && etp25) ? Math.round(sol25 / etp25 * 10) / 10 : null;
  const solEtp26 = A26.solParEtp;

  function rowH(label, v25, v26, isHeure) {
    const fmt = isHeure ? (x => fmtHe(x)) : (x => show(x));
    let evo = '<td class="nd">n.d.</td>', pct = '<td class="nd">n.d.</td>';
    if (v25 != null && v26 != null) {
      const d = v26 - v25;
      evo = "<td>" + (isHeure ? nf(h1(d)) + " h" : nf(Math.round(d * 10) / 10)) + "</td>";
      pct = "<td>" + (v25 ? nf(Math.round(d / v25 * 1000) / 10) + " %" : '<span class="nd">n.d.</span>') + "</td>";
    }
    return "<tr><td style=\"text-align:left\">" + esc(label) + "</td><td>" + fmt(v25) + "</td><td>" + fmt(v26) + "</td>" + evo + pct + "</tr>";
  }

  let h = '<div class="bloc"><h3 class="bloc-titre">Comparaison 2025 / 2026 — janvier à mai</h3>';
  h += '<div class="table-enveloppe"><table><thead><tr><th>Indicateur</th><th>janv.–mai 2025</th><th>janv.–mai 2026</th><th>Écart</th><th>Évolution</th></tr></thead><tbody>';
  h += rowH("ETP moyen", etp25, etp26, false);
  h += rowH("Heures correspondant aux ETP", hEtp25, hEtp26, true);
  h += rowH("Heures d'absence", abs25, abs26, true);
  h += rowH("Heures après absences", apres25, apres26, true);
  h += rowH("Sollicitations prises en charge", sol25, sol26, false);
  h += rowH("Sollicitations prises en charge par ETP", solEtp25, solEtp26, false);
  h += rowH("Temps consacré aux sollicitations", null, A26.tempsSol, true);
  h += rowH("Temps consacré aux activités annexes", null, A26.tempsAnnexes, true);
  h += rowH("Temps consacré aux signalements et transmissions", null, A26.tempsSignal, true);
  h += rowH("Temps consacré aux réunions, interventions et supervisions", null, A26.hReunions, true);
  h += rowH("Total du temps représenté dans les données", null, A26.total, true);
  h += "</tbody></table></div>";
  h += noteBox("Pour 2025, le détail par canal et les durées d'appels ne sont pas disponibles : les temps en heures restent « n.d. » et aucune évolution n'est calculée. Les volumes (sollicitations) et les ETP/absences restent comparables.");

  /* tableau mensuel 2025 / 2026 */
  h += '<div class="table-enveloppe"><table class="compact"><thead><tr>'
    + "<th>Mois</th><th>ETP 2025</th><th>ETP 2026</th><th>Sollicit. 2025</th><th>Sollicit. 2026</th>"
    + "<th>H. absence 2025</th><th>H. absence 2026</th><th>H. annexes 2025</th><th>H. annexes 2026</th></tr></thead><tbody>";
  const MN = ["janv.", "févr.", "mars", "avr.", "mai"];
  moisN.forEach((n, i) => {
    const k25 = "2025-" + String(n).padStart(2, "0"), k26 = "2026-" + String(n).padStart(2, "0");
    const a25 = absDuMois(k25), a26 = absDuMois(k26);
    const r26 = eaMoisDispo().indexOf(k26) >= 0 ? eaMois(k26) : null;
    h += "<tr><td style=\"text-align:left\">" + MN[i] + "</td>"
      + td(etpDe(k25)) + td(etpDe(k26))
      + td(histContactsTraites(2025, n)) + td(r26 ? r26.sollicitations : null)
      + "<td>" + fmtHe(a25 ? a25.total_heures_absence : null) + "</td><td>" + fmtHe(a26 ? a26.total_heures_absence : null) + "</td>"
      + '<td class="nd">n.d.</td>' + "<td>" + fmtHe(r26 ? r26.tempsAnnexes : null) + "</td></tr>";
  });
  h += "</tbody></table></div>";
  h += noteBox("Heures d'activités annexes 2025 : n.d. (le détail des transmissions 2025 regroupe CRIP/IP/procureur et n'est pas convertible avec les mêmes temps standards).");
  h += "</div>";
  return h;
}

/* ====================== Bloc 5 : absences ====================== */
function eaBlocAbsences() {
  const p = DATA.absences && DATA.absences.par_mois;
  if (!p) return "";
  const CATS = [["conges_payes", "Congés payés"], ["maladie", "Maladie"], ["rtt", "RTT"], ["maternite", "Maternité"],
    ["formation", "Formation"], ["evenements_familiaux", "Événements familiaux"], ["recuperation", "Récupération"], ["autres", "Autres"]];
  /* catégories réellement présentes (somme > 0 sur l'ensemble) */
  const presentes = CATS.filter(([k]) => p.some(m => (m[k] || 0) > 0));

  let h = '<div class="bloc"><h3 class="bloc-titre">Absences (en heures)</h3>';
  h += '<p class="intro">Source : export Octime des absences en heures. Données non nominatives. Période disponible : ' + esc(libelleCourt(p[0].mois)) + " → " + esc(libelleCourt(p[p.length - 1].mois)) + ".</p>";
  h += '<div class="table-enveloppe"><table class="compact"><thead><tr><th>Mois</th><th>Total h</th>'
    + presentes.map(([, lab]) => "<th>" + esc(lab) + "</th>").join("")
    + "<th>Personnes</th></tr></thead><tbody>";
  p.forEach(m => {
    h += "<tr><td style=\"text-align:left\">" + esc(libelleCourt(m.mois)) + (String(m.statut).indexOf("partiel") >= 0 ? ' <span class="mini-badge part">part.</span>' : "") + "</td>"
      + "<td>" + fmtHe(m.total_heures_absence) + "</td>"
      + presentes.map(([k]) => "<td>" + fmtHe(m[k]) + "</td>").join("")
      + td(m.personnes_concernees) + "</tr>";
  });
  h += "</tbody></table></div>";
  h += '<div class="graph">' + svgLineChart(p.map(m => libelleCourt(m.mois)), [{ name: "Absences", color: ROUGE, data: p.map(m => h1(m.total_heures_absence)) }], "") + "</div>";
  h += noteBox("« Personnes » = nombre de personnes distinctes ayant au moins une absence dans le mois. Catégories affichées uniquement si présentes dans les données.");
  h += "</div>";
  return h;
}


/* =================================================================
   EXPORT EXCEL (.xlsx) — bloc AJOUTÉ à la fin de app.js
   -----------------------------------------------------------------
   Rien de l'application existante n'est modifié : ce bloc ne fait
   qu'AJOUTER des fonctions. Il a besoin de la bibliothèque SheetJS
   (fichier vendor/xlsx.full.min.js), chargée dans index.html AVANT
   app.js : elle fournit la variable globale « XLSX ».

   Deux points d'entrée, appelés par les deux boutons de la Synthèse :
     - exportComplet()        -> un fichier Excel avec TOUTES les données.
     - ouvrirModalExport()    -> la fenêtre « export personnalisé ».

   Règles respectées partout :
     - une donnée absente s'écrit « n.d. » (jamais 0, jamais inventée) ;
     - les nombres sont écrits comme des nombres ;
     - les pourcentages comme de vrais pourcentages (format 0,0 %) ;
     - les calculs (cumuls, parts, moyennes) sont refaits UNIQUEMENT
       sur la période demandée.
   ================================================================= */

/* ---------- petites aides de période / date ---------- */
var EXP_MOIS_LONG = { "01": "janvier", "02": "février", "03": "mars", "04": "avril",
  "05": "mai", "06": "juin", "07": "juillet", "08": "août", "09": "septembre",
  "10": "octobre", "11": "novembre", "12": "décembre" };

function expLabelMois(ym) { // "2025-10" -> "octobre 2025"
  var p = String(ym).split("-");
  return (EXP_MOIS_LONG[p[1]] || p[1]) + " " + p[0];
}
function expListeMois(deYM, aYM) { // bornes incluses -> ["2025-10", ... ]
  var out = [], a = deYM.split("-"), b = aYM.split("-");
  var y = +a[0], m = +a[1], yb = +b[0], mb = +b[1];
  while (y < yb || (y === yb && m <= mb)) {
    out.push(y + "-" + String(m).padStart(2, "0"));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function expAujourdhui() {
  var d = new Date();
  var jj = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var aaaa = d.getFullYear();
  return { iso: aaaa + "-" + mm + "-" + jj, fr: jj + "/" + mm + "/" + aaaa };
}

/* Marqueur « pourcentage » : on enveloppe une valeur en % pour que le
   tableur l'enregistre comme un vrai pourcentage. Renvoie « n.d. » si vide. */
function PCT(x) { return (x === null || x === undefined) ? "n.d." : { __pct: x }; }
/* Nombre simple ou « n.d. ». */
function NUM(x) { return (x === null || x === undefined) ? "n.d." : x; }

/* ---------- accès aux données mois par mois (null si absent) ---------- */
function expMapMois(arr, cle) { // tableau d'objets -> { "2026-01": objet }
  var m = {};
  (arr || []).forEach(function (o) { m[o[cle || "mois"]] = o; });
  return m;
}
function expHistVal(seriesObj, ym) { // séries historiques { 2024:[12], 2025:[12], 2026:[12] }
  if (!seriesObj) return null;
  var y = ym.slice(0, 4), i = parseInt(ym.slice(5, 7), 10) - 1;
  if (!seriesObj[y]) return null;
  var v = seriesObj[y][i];
  return (v === undefined ? null : v);
}

/* Construit, une fois, des index pratiques à partir de DATA. */
function expIndex() {
  var A = DATA.monthly || {}, P = DATA.phone || {}, C = DATA.chat || {};
  var H = DATA.historical || {}, TF = DATA.flagger || {}, AN = DATA.anonymity || {};
  var E = DATA.etp || {}, AB = DATA.absences || {}, WF = DATA.workforce || {};
  var idx = {
    act: expMapMois(A.mois),                                   // 2026-01..05
    phone: expMapMois(P.par_mois),                             // 2026-01..05
    chat: expMapMois(C.par_mois),                              // 2026-02..05
    mails: expMapMois(((A.activite_traitee_tous_canaux || {}).par_mois) || []), // 2026-02..05 (+janv null)
    tf: expMapMois(TF.par_mois_2026),                          // 2026-01..06
    sor: expMapMois(AN.par_mois_2026),                         // 2026-01..06
    etp: expMapMois(E.par_mois),                               // 2025-01..2026-06
    abs: expMapMois(AB.par_mois),                              // 2025-01..2026-06
    wf: expMapMois(WF.par_mois),                               // effectif (null partout pour l'instant)
    histContacts: (H.series || {}).contacts_traites,
    histSollic: (H.series || {}).sollicitations,
    histTaux: (H.series || {}).taux_reponse_global_pct,
    histSignal: (((H.protection || {}).series) || {}).signalements_plateformes,
  };
  return idx;
}

/* Contacts traités (tous canaux) pour un mois : 2026 via le tableau mensuel,
   2025 via la série historique. null sinon. */
function expContactsTraites(I, ym) {
  if (I.act[ym] && I.act[ym].volume_activite_traite != null) return I.act[ym].volume_activite_traite;
  return expHistVal(I.histContacts, ym);
}
function expSollicitations(I, ym) {
  if (I.act[ym] && I.act[ym].sollicitations_entrantes != null) return I.act[ym].sollicitations_entrantes;
  return expHistVal(I.histSollic, ym);
}
function expSignalements(I, ym) {
  if (I.tf[ym] && I.tf[ym].signalements != null) return I.tf[ym].signalements;
  return expHistVal(I.histSignal, ym); // 2024/2025
}
function expSorties(I, ym) { return I.sor[ym] ? I.sor[ym].sorties : null; }
function expAppels(I, ym) { // {recus, decroches, abandonnes, taux}
  var o = I.phone[ym] || I.act[ym];
  if (!o) return null;
  return {
    recus: o.appels_recus != null ? o.appels_recus : null,
    decroches: o.appels_decroches != null ? o.appels_decroches : null,
    abandonnes: o.appels_abandonnes != null ? o.appels_abandonnes : null,
    taux: o.taux_reponse_pct != null ? o.taux_reponse_pct : (o.taux_reponse_appels_pct != null ? o.taux_reponse_appels_pct : null),
  };
}
function expTchat(I, ym) {
  var o = I.chat[ym] || I.act[ym];
  if (!o) return null;
  return {
    recus: o.tchats_recus != null ? o.tchats_recus : null,
    traites: o.tchats_traites != null ? o.tchats_traites : null,
    abandonnes: o.tchats_abandonnes != null ? o.tchats_abandonnes : null,
    taux: o.taux_prise_pct != null ? o.taux_prise_pct : (o.taux_prise_tchat_pct != null ? o.taux_prise_tchat_pct : null),
  };
}
function expMails(I, ym) {
  var o = I.mails[ym];
  return (o && o.mails != null) ? o.mails : null;
}
function expEtp(I, ym) { return I.etp[ym] ? I.etp[ym].etp : null; }

/* Somme « prudente » : null si AUCUNE valeur disponible ; sinon somme des
   valeurs présentes (les mois absents ne sont pas comptés comme 0). */
function expSomme(vals) {
  var presentes = vals.filter(function (v) { return v != null; });
  if (presentes.length === 0) return null;
  return presentes.reduce(function (a, b) { return a + b; }, 0);
}
function expArr1(x) { return (x == null) ? null : Math.round(x * 10) / 10; }
function expPart(part, total) { // part en % (1 décimale) ou null
  if (part == null || total == null || total === 0) return null;
  return Math.round(part / total * 1000) / 10;
}

/* =================================================================
   Construction d'une FEUILLE à partir d'un tableau de lignes (AOA).
   Chaque cellule peut être : un texte, un nombre, null (-> « n.d. »),
   ou { __pct: x } (-> vrai pourcentage). Options : filtre auto.
   ================================================================= */
function expFeuille(rows, opts) {
  opts = opts || {};
  var plain = [];          // version « brute » donnée à SheetJS
  var pctCells = [];       // adresses des cellules en pourcentage
  var largeurs = [];

  rows.forEach(function (row, r) {
    var ligne = [];
    (row || []).forEach(function (cell, c) {
      var valeur, longueurAffichee;
      if (cell && typeof cell === "object" && cell.__pct !== undefined) {
        valeur = cell.__pct / 100;                 // 21,2 -> 0,212
        pctCells.push({ r: r, c: c });
        longueurAffichee = String(cell.__pct).length + 2; // "54,0 %"
      } else if (cell === null || cell === undefined) {
        valeur = "n.d.";
        longueurAffichee = 4;
      } else {
        valeur = cell;
        longueurAffichee = String(cell).length;
      }
      ligne.push(valeur);
      largeurs[c] = Math.max(largeurs[c] || 8, Math.min(60, longueurAffichee + 2));
    });
    plain.push(ligne);
  });

  var ws = XLSX.utils.aoa_to_sheet(plain);
  ws["!cols"] = largeurs.map(function (w) { return { wch: w }; });

  // format pourcentage sur les cellules repérées
  pctCells.forEach(function (p) {
    var ad = XLSX.utils.encode_cell({ r: p.r, c: p.c });
    if (ws[ad] && ws[ad].t === "n") ws[ad].z = "0.0%";
  });

  // filtre automatique (si demandé et si la feuille est un seul tableau)
  if (opts.filtre) {
    var ref = XLSX.utils.decode_range(ws["!ref"]);
    var ligneEntete = opts.ligneEntete || 0;
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range(
        { r: ligneEntete, c: ref.s.c },
        { r: ref.e.r, c: ref.e.c })
    };
  }
  return ws;
}

/* Nettoie un nom d'onglet (Excel : 31 caractères max, pas de : \ / ? * [ ]). */
function expNomOnglet(nom) {
  return String(nom).replace(/[:\\\/\?\*\[\]]/g, " ").slice(0, 31);
}
function expAjouter(wb, nom, ws) {
  XLSX.utils.book_append_sheet(wb, ws, expNomOnglet(nom));
}

/* =================================================================
   FEUILLES — chacune renvoie une worksheet prête à ajouter.
   ================================================================= */
function feuilleSynthese(I) {
  var an = DATA.annual || {}, t = an.telephone || {}, c = an.tchat || {},
      s = an.signalements_trusted_flagger || {}, so = an.sorties_anonymat || {},
      v = an.volume_activite_traite || {}, sr = an.sollicitations_recues || {};
  var meta = (DATA.methodology || {})._meta || {};
  var rows = [
    ["Reporting interne 3018 — export complet"],
    ["Date de génération", expAujourdhui().fr],
    ["Période des données", meta.periode_couverte || (an._meta && an._meta.arret ? ("cumul 2026 au " + an._meta.arret) : "n.d.")],
    ["Avertissement", "Année incomplète. Données BIK déclaratives séparées. Aucune donnée personnelle."],
    [],
    ["Indicateur", "Valeur", "Période", "Source / note"],
    ["Appels décrochés (cumul)", NUM(t.appels_decroches), t.periode || "", "3CX"],
    ["Appels reçus (cumul)", NUM(t.appels_recus), t.periode || "", "3CX"],
    ["Taux de réponse téléphone", PCT(t.taux_reponse_pct), t.periode || "", "décrochés / reçus"],
    ["Tchats traités (cumul)", NUM(c.tchats_traites), c.periode || "", "export tchat"],
    ["Tchats reçus (cumul)", NUM(c.tchats_recus), c.periode || "", "export tchat"],
    ["Signalements Trusted Flagger", NUM(s.total), s.periode || "", "Signalements RS"],
    ["Sorties d'anonymat", NUM(so.total), so.periode || "", "Sorties d'anonymat"],
    ["Activité traitée tous canaux (cumul)", NUM(v.cumul_janv_mai), "janv.–mai 2026", "appels décrochés + tchats traités + mails"],
    ["Sollicitations reçues (cumul)", NUM(sr.cumul_janv_mai), "janv.–mai 2026", "appels reçus + tchats reçus + mails"],
  ];
  return expFeuille(rows);
}

function feuilleMensuelle(I, mois) {
  var liste = mois || Object.keys(I.act).sort();
  var rows = [["Mois", "Appels reçus", "Appels décrochés", "Taux réponse appels",
    "Tchats reçus", "Tchats traités", "Taux prise tchat", "Activité traitée tous canaux",
    "Signalements TF", "Sorties anonymat", "Observation"]];
  liste.forEach(function (ym) {
    var a = I.act[ym]; if (!a) {
      rows.push([expLabelMois(ym), null, null, "n.d.", null, null, "n.d.", expContactsTraites(I, ym), expSignalements(I, ym), expSorties(I, ym), "données mensuelles détaillées absentes"]);
      return;
    }
    rows.push([
      a.libelle || expLabelMois(ym),
      NUM(a.appels_recus), NUM(a.appels_decroches), PCT(a.taux_reponse_appels_pct),
      NUM(a.tchats_recus), NUM(a.tchats_traites), PCT(a.taux_prise_tchat_pct),
      NUM(a.volume_activite_traite), NUM(a.signalements_trusted_flagger), NUM(a.sorties_anonymat),
      a.observation || ""
    ]);
  });
  return expFeuille(rows, { filtre: true });
}

function feuilleTrimestrielle() {
  var q = (DATA.quarterly || {}).trimestres || [];
  var rows = [["Trimestre", "Statut", "Appels reçus", "Appels décrochés", "Taux réponse",
    "Tchats reçus", "Tchats traités", "Signalements TF", "Sorties anonymat",
    "Activité traitée", "Sollicitations reçues", "Observation"]];
  q.forEach(function (o) {
    rows.push([
      o.trimestre, o.statut,
      NUM(o.appels_recus != null ? o.appels_recus : o.appels_recus_avril_mai),
      NUM(o.appels_decroches != null ? o.appels_decroches : o.appels_decroches_avril_mai),
      PCT(o.taux_reponse_appels_pct != null ? o.taux_reponse_appels_pct : o.taux_reponse_appels_avril_mai_pct),
      NUM(o.tchats_recus != null ? o.tchats_recus : o.tchats_recus_avril_mai),
      NUM(o.tchats_traites != null ? o.tchats_traites : o.tchats_traites_avril_mai),
      NUM(o.signalements_trusted_flagger != null ? o.signalements_trusted_flagger : o.signalements_trusted_flagger_avril_mai),
      NUM(o.sorties_anonymat != null ? o.sorties_anonymat : o.sorties_anonymat_avril_mai),
      NUM(o.volume_activite_traite != null ? o.volume_activite_traite : o.volume_activite_traite_avril_mai),
      NUM(o.sollicitations_recues != null ? o.sollicitations_recues : o.sollicitations_recues_avril_mai),
      o.observation || (o.tchat_note || "")
    ]);
  });
  return expFeuille(rows, { filtre: true });
}

function feuilleAnnuelle() {
  var an = DATA.annual || {}, t = an.telephone || {}, c = an.tchat || {},
      s = an.signalements_trusted_flagger || {}, so = an.sorties_anonymat || {},
      v = an.volume_activite_traite || {}, sr = an.sollicitations_recues || {};
  var d = v.detail_fev_mai || {}, dr = sr.detail_fev_mai || {};
  var rows = [
    ["Cumul annuel à date — 2026 (" + (an._meta ? ("arrêté au " + an._meta.arret) : "") + ")"],
    [],
    ["Indicateur", "Valeur", "Période", "Note"],
    ["Appels reçus", NUM(t.appels_recus), t.periode || "", ""],
    ["Appels décrochés", NUM(t.appels_decroches), t.periode || "", ""],
    ["Appels abandonnés", NUM(t.appels_abandonnes), t.periode || "", ""],
    ["Taux de réponse téléphone", PCT(t.taux_reponse_pct), t.periode || "", "décrochés / reçus"],
    ["Tchats reçus", NUM(c.tchats_recus), c.periode || "", ""],
    ["Tchats traités", NUM(c.tchats_traites), c.periode || "", ""],
    ["Taux de prise tchat", PCT(c.taux_prise_pct), c.periode || "", "traités / reçus"],
    ["Signalements Trusted Flagger", NUM(s.total), s.periode || "", ""],
    ["Sorties d'anonymat", NUM(so.total), so.periode || "", ""],
    ["Activité traitée tous canaux (cumul)", NUM(v.cumul_janv_mai), "janv.–mai 2026", v.definition || ""],
    ["  dont janvier (tous canaux)", NUM(v.janvier_tous_canaux), "janv. 2026", "tableau d'activité"],
    ["  dont appels décrochés (fév.–mai)", NUM(d.appels_decroches), "fév.–mai 2026", "reconstruit"],
    ["  dont tchats traités (fév.–mai)", NUM(d.tchats_traites), "fév.–mai 2026", "reconstruit"],
    ["  dont mails (fév.–mai)", NUM(d.mails), "fév.–mai 2026", "mai partiel (26/05)"],
    ["Sollicitations reçues (cumul)", NUM(sr.cumul_janv_mai), "janv.–mai 2026", sr.definition || ""],
    ["  dont appels reçus 3CX (fév.–mai)", NUM(dr.appels_recus_3cx), "fév.–mai 2026", ""],
    ["  dont tchats reçus (fév.–mai)", NUM(dr.tchats_recus), "fév.–mai 2026", ""],
    ["  dont mails (fév.–mai)", NUM(dr.mails), "fév.–mai 2026", ""],
  ];
  return expFeuille(rows);
}

function feuilleTelephone(I, mois) {
  var liste = mois || Object.keys(I.phone).sort();
  var rows = [["Mois", "Appels reçus", "Appels décrochés", "Appels abandonnés",
    "Taux de réponse", "Temps total conversation", "Durée moyenne appel"]];
  liste.forEach(function (ym) {
    var o = I.phone[ym]; if (!o) return;
    rows.push([expLabelMois(ym), NUM(o.appels_recus), NUM(o.appels_decroches),
      NUM(o.appels_abandonnes), PCT(o.taux_reponse_pct),
      o.temps_total_conversation || "n.d.", o.duree_moyenne_appel || "n.d."]);
  });
  // répartition par file (toute la période)
  var files = (DATA.phone || {}).par_file_periode || [];
  if (files.length) {
    rows.push([]);
    rows.push(["Répartition par file (cumul période)"]);
    rows.push(["File 3CX", "Libellé", "Rôle supposé", "Incluse au total ?", "Appels reçus", "Appels décrochés", "Appels abandonnés"]);
    files.forEach(function (f) {
      rows.push([f.file_3cx, f.libelle, f.role_suppose, f.incluse_total ? "oui" : "non",
        NUM(f.appels_recus), NUM(f.appels_decroches), NUM(f.appels_abandonnes)]);
    });
  }
  return expFeuille(rows, { filtre: true });
}

function feuilleTchat(I, mois) {
  var liste = mois || Object.keys(I.chat).sort();
  var rows = [["Mois", "Tchats reçus", "Tchats traités", "Tchats abandonnés", "Taux de prise"]];
  liste.forEach(function (ym) {
    var o = I.chat[ym]; if (!o) return;
    rows.push([expLabelMois(ym), NUM(o.tchats_recus), NUM(o.tchats_traites),
      NUM(o.tchats_abandonnes), PCT(o.taux_prise_pct)]);
  });
  var sp = (DATA.chat || {}).synthese_periode;
  if (sp) {
    rows.push([]);
    rows.push(["Synthèse période (" + ((DATA.chat || {})._meta || {}).periode + ")"]);
    rows.push(["Tchats reçus", NUM(sp.tchats_recus)]);
    rows.push(["Tchats traités", NUM(sp.tchats_traites)]);
    rows.push(["Taux de prise", PCT(sp.taux_prise_pct)]);
    rows.push(["Attente médiane (min)", NUM(sp.attente_mediane_min)]);
    rows.push(["Durée médiane session (min)", NUM(sp.duree_mediane_session_min)]);
    rows.push(["Périmètre", "tchats web et application 3018 non distingués dans les sources"]);
  }
  return expFeuille(rows, { filtre: true });
}

function feuilleTrustedFlagger() {
  var tf = DATA.flagger || {};
  var rows = [["Signalements Trusted Flagger — 2026"], [],
    ["Total 2026", NUM(tf.total_2026)], ["Cumul janv.–mai 2026", NUM(tf.cumul_janvier_mai_2026)], []];
  rows.push(["Par mois", "Signalements", "Statut"]);
  (tf.par_mois_2026 || []).forEach(function (o) { rows.push([expLabelMois(o.mois), NUM(o.signalements), o.statut]); });
  rows.push([]);
  rows.push(["Par plateforme", "Signalements"]);
  (tf.par_plateforme || []).forEach(function (o) { rows.push([o.plateforme, NUM(o.signalements)]); });
  rows.push([]);
  rows.push(["Par type de contenu", "Signalements"]);
  (tf.par_type_contenu || []).forEach(function (o) { rows.push([o.type, NUM(o.signalements)]); });
  rows.push([]);
  rows.push(["Par décision plateforme", "Signalements"]);
  (tf.par_decision || []).forEach(function (o) { rows.push([o.decision, NUM(o.signalements)]); });
  var ii = tf.indicateurs_issue;
  if (ii) {
    rows.push([]);
    rows.push(["Indicateurs d'issue (indicatif)", ""]);
    rows.push(["Suppressions (indicatif)", NUM(ii.suppressions_indicatif)]);
    rows.push(["Refus / non violation (indicatif)", NUM(ii.refus_non_violation_indicatif)]);
    rows.push(["Issue connue (indicatif)", NUM(ii.signalements_issue_connue_indicatif)]);
    rows.push(["Taux de retrait (indicatif)", PCT(ii.taux_retrait_indicatif_pct)]);
    rows.push(["Note", ii.note || ""]);
  }
  return expFeuille(rows);
}

function feuilleSortiesAnonymat() {
  var an = DATA.anonymity || {};
  var rows = [["Sorties d'anonymat / remontées institutionnelles — 2026"], [],
    ["Cumul janv.–mai 2026", NUM(an.cumul_janvier_mai_2026)], []];
  rows.push(["Par mois", "Sorties", "Statut"]);
  (an.par_mois_2026 || []).forEach(function (o) { rows.push([expLabelMois(o.mois), NUM(o.sorties), o.statut]); });
  rows.push([]);
  rows.push(["Par destinataire (cumul janv.–mai)", "Sorties"]);
  (an.par_destinataire_janv_mai || []).forEach(function (o) { rows.push([o.destinataire, NUM(o.sorties)]); });
  var ips = an.sous_destinataires_ips;
  if (ips) {
    rows.push([]);
    rows.push(["Détail IPS (catégories NON exclusives — ne pas additionner)", "Cumul janv.–mai"]);
    ["Procureur", "CRIP", "OFMIN", "OCRTEH"].forEach(function (k) { if (ips[k] != null) rows.push([k, NUM(ips[k])]); });
    rows.push(["Note", ips.note || ""]);
  }
  return expFeuille(rows);
}

function feuilleBikGlobal() {
  var b = DATA.bik || {};
  var meta = b._meta || {}, op = b.operationnel || {}, pc = b.public_cible || {},
      cat = b.categories_bik_non_exclusives || {}, can = b.canaux || {},
      ou = b.ou_le_probleme_a_eu_lieu || {}, dsa = b.dsa || {}, na = b.narratif || {};
  var rows = [["Données BIK / Insafe — " + (meta.trimestre || "")], [meta.avertissement || ""], []];
  rows.push(["Contacts totaux déclarés", NUM(b.contacts_total_declares)]);
  rows.push(["Type de helpline", op.type_helpline || "n.d.", "Part général (%)", PCT(op.part_general_pct)]);
  rows.push(["Conseillers (total / nouveaux)", NUM(op.conseillers_total), NUM(op.conseillers_nouveaux)]);
  rows.push([]);
  rows.push(["Public cible", "Nombre"]);
  Object.keys(pc).forEach(function (k) { rows.push([k.replace(/_/g, " "), NUM(pc[k])]); });
  rows.push([]);
  rows.push(["Catégories BIK (NON exclusives)", "Contacts"]);
  Object.keys(cat).forEach(function (k) { rows.push([k.replace(/_/g, " "), NUM(cat[k])]); });
  rows.push([]);
  rows.push(["Canaux (BIK)", "Contacts"]);
  Object.keys(can).forEach(function (k) { rows.push([k, NUM(can[k])]); });
  rows.push([]);
  rows.push(["Où le problème a eu lieu", "Contacts"]);
  Object.keys(ou).forEach(function (k) { rows.push([k, NUM(ou[k])]); });
  rows.push([]);
  rows.push(["DSA — Trusted Flagger", dsa.trusted_flagger || "n.d."]);
  rows.push(["DSA — désigné depuis", dsa.designe_depuis || "n.d."]);
  rows.push(["DSA — signalements trimestre", NUM(dsa.signalements_trimestre)]);
  rows.push([]);
  rows.push(["Tendances", na.tendances || ""]);
  rows.push(["Success story", na.success_story || ""]);
  rows.push(["Difficultés", na.difficultes || ""]);
  return expFeuille(rows);
}

function feuilleEtpAbsences(I, mois) {
  var liste = mois || Object.keys(I.etp).concat(Object.keys(I.abs))
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
  var rows = [["Mois", "ETP théorique", "Statut ETP", "Absences totales (h)",
    "Congés payés", "Maladie", "RTT", "Maternité", "Formation",
    "Évén. familiaux", "Récupération", "Autres", "Personnes concernées", "Nb écoutants"]];
  liste.forEach(function (ym) {
    var e = I.etp[ym], ab = I.abs[ym], wf = I.wf[ym];
    rows.push([
      expLabelMois(ym),
      e ? NUM(e.etp) : null, e ? e.statut : "n.d.",
      ab ? NUM(ab.total_heures_absence) : null,
      ab ? NUM(ab.conges_payes) : null, ab ? NUM(ab.maladie) : null, ab ? NUM(ab.rtt) : null,
      ab ? NUM(ab.maternite) : null, ab ? NUM(ab.formation) : null, ab ? NUM(ab.evenements_familiaux) : null,
      ab ? NUM(ab.recuperation) : null, ab ? NUM(ab.autres) : null, ab ? NUM(ab.personnes_concernees) : null,
      (wf && wf.nombre_ecoutants != null) ? wf.nombre_ecoutants : null
    ]);
  });
  return expFeuille(rows, { filtre: true });
}

/* Feuille « Données consolidées » : tout au même format (format long). */
function feuilleConsolidee(I, mois) {
  var entete = ["Catégorie", "Sous-catégorie", "Indicateur", "Période", "Valeur", "Unité", "Source", "Type de donnée"];
  var rows = [entete];
  function add(cat, sous, ind, per, val, unite, src, type) {
    rows.push([cat, sous, ind, per, val, unite, src, type]);
  }
  var liste = mois || ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

  liste.forEach(function (ym) {
    var L = expLabelMois(ym);
    var a = expAppels(I, ym);
    if (a) {
      add("Téléphone", "", "Appels reçus", L, NUM(a.recus), "appels", "3CX", "importée");
      add("Téléphone", "", "Appels décrochés", L, NUM(a.decroches), "appels", "3CX", "importée");
      add("Téléphone", "", "Appels abandonnés", L, NUM(a.abandonnes), "appels", "3CX", "importée");
      add("Téléphone", "", "Taux de réponse", L, PCT(a.taux), "%", "3CX", "calculée");
    }
    var t = expTchat(I, ym);
    if (t && (t.recus != null || t.traites != null)) {
      add("Tchat", "", "Tchats reçus", L, NUM(t.recus), "tchats", "export tchat", "importée");
      add("Tchat", "", "Tchats traités", L, NUM(t.traites), "tchats", "export tchat", "importée");
      add("Tchat", "", "Taux de prise", L, PCT(t.taux), "%", "export tchat", "calculée");
    }
    var mails = expMails(I, ym);
    if (mails != null) add("Mail", "", "Mails traités", L, NUM(mails), "mails", "export SF Case", "importée");
    var vol = expContactsTraites(I, ym);
    if (vol != null) add("Tous canaux", "", "Activité traitée", L, NUM(vol), "contacts", "consolidé / reconstruit", I.act[ym] ? "calculée" : "importée");
    var sol = expSollicitations(I, ym);
    if (sol != null) add("Tous canaux", "", "Sollicitations reçues", L, NUM(sol), "contacts", "reconstruit", "calculée");
    var sig = expSignalements(I, ym);
    if (sig != null) add("Trusted Flagger", "", "Signalements envoyés", L, NUM(sig), "signalements", "Signalements RS", "importée");
    var sor = expSorties(I, ym);
    if (sor != null) add("Sorties d'anonymat", "", "Sorties d'anonymat", L, NUM(sor), "sorties", "Sorties d'anonymat", "importée");
  });

  // ETP + absences (toute la profondeur disponible)
  Object.keys(I.etp).sort().forEach(function (ym) {
    var e = I.etp[ym]; if (e && e.etp != null) add("ETP", "", "ETP théorique", expLabelMois(ym), e.etp, "ETP", "Octime", "importée");
  });
  Object.keys(I.abs).sort().forEach(function (ym) {
    var ab = I.abs[ym]; if (ab && ab.total_heures_absence != null) add("Absences", "", "Heures d'absence", expLabelMois(ym), ab.total_heures_absence, "heures", "Octime", "importée");
  });
  return expFeuille(rows, { filtre: true });
}

function feuilleMethodologie() {
  var m = DATA.methodology || {};
  var rows = [["Méthodologie"], []];
  rows.push(["Fichiers utilisés", "Usage", "Période", "Limite"]);
  (m.fichiers_utilises || []).forEach(function (f) { rows.push([f.fichier, f.usage, f.periode, f.limite]); });
  rows.push([]);
  rows.push(["Règles de calcul", ""]);
  var rc = m.regles_de_calcul || {};
  Object.keys(rc).forEach(function (k) {
    var v = rc[k]; rows.push([k.replace(/_/g, " "), (typeof v === "string") ? v : JSON.stringify(v)]);
  });
  rows.push([]);
  rows.push(["Données manquantes"]);
  (m.donnees_manquantes || []).forEach(function (s) { rows.push(["", s]); });
  rows.push([]);
  rows.push(["Écarts entre sources", "Écart", "Source retenue"]);
  (m.ecarts_entre_sources || []).forEach(function (e) { rows.push([e.sujet, e.ecart, e.source_retenue]); });
  rows.push([]);
  rows.push(["À propos de cet export Excel"]);
  rows.push(["", "Les nombres sont enregistrés comme nombres, les pourcentages comme pourcentages, les dates au format français."]);
  rows.push(["", "Les données absentes sont écrites « n.d. » : elles ne sont jamais remplacées par zéro ni extrapolées."]);
  rows.push(["", "Filtres automatiques activés sur les tableaux à une seule grille. Pour figer la première ligne : dans Excel, Affichage > Figer les volets."]);
  rows.push(["", "Confidentialité : aucune donnée personnelle. " + ((m.confidentialite || "") || "")]);
  return expFeuille(rows);
}

/* =================================================================
   1) EXPORT GLOBAL — toutes les feuilles.
   ================================================================= */
function construireClasseurComplet() {
  var I = expIndex();
  var wb = XLSX.utils.book_new();
  expAjouter(wb, "Synthèse", feuilleSynthese(I));
  expAjouter(wb, "Activité mensuelle", feuilleMensuelle(I));
  expAjouter(wb, "Activité trimestrielle", feuilleTrimestrielle());
  expAjouter(wb, "Activité annuelle", feuilleAnnuelle());
  expAjouter(wb, "Téléphone", feuilleTelephone(I));
  expAjouter(wb, "Tchat", feuilleTchat(I));
  expAjouter(wb, "Trusted flagger", feuilleTrustedFlagger());
  expAjouter(wb, "Sorties anonymat", feuilleSortiesAnonymat());
  expAjouter(wb, "BIK", feuilleBikGlobal());
  expAjouter(wb, "ETP et absences", feuilleEtpAbsences(I));
  expAjouter(wb, "Données consolidées", feuilleConsolidee(I));
  expAjouter(wb, "Méthodologie", feuilleMethodologie());
  return wb;
}
function exportComplet() {
  try {
    if (typeof XLSX === "undefined") { alert("La bibliothèque d'export (SheetJS) n'est pas chargée."); return; }
    var wb = construireClasseurComplet();
    XLSX.writeFile(wb, "export_complet_3018_" + expAujourdhui().iso + ".xlsx");
  } catch (e) {
    alert("Une erreur est survenue pendant l'export : " + e.message);
  }
}

/* =================================================================
   2) EXPORT BIK — Grant agreement (1er octobre 2025 -> 31 mai 2026).
   ================================================================= */
var BIK_DE = "2025-10", BIK_A = "2026-05";

function feuilleBikSyntheseGA(I, mois) {
  var total = expSomme(mois.map(function (ym) { return expContactsTraites(I, ym); }));
  // canaux sur la sous-période cohérente fév.–mai 2026 (téléphone décroché + tchat traité + mails)
  var moisCanaux = mois.filter(function (ym) { return I.chat[ym] && I.mails[ym] && I.phone[ym]; });
  var tel = expSomme(moisCanaux.map(function (ym) { return (I.phone[ym] || {}).appels_decroches; }));
  var tch = expSomme(moisCanaux.map(function (ym) { return (I.chat[ym] || {}).tchats_traites; }));
  var mai = expSomme(moisCanaux.map(function (ym) { return expMails(I, ym); }));
  var baseCanaux = expSomme([tel, tch, mai]);
  var libCanaux = moisCanaux.length ? (expLabelMois(moisCanaux[0]) + " à " + expLabelMois(moisCanaux[moisCanaux.length - 1])) : "n.d.";
  var rows = [
    ["Synthèse BIK — Grant agreement"],
    ["Période analysée", "du 1er octobre 2025 au 31 mai 2026"],
    ["Date de génération", expAujourdhui().fr],
    [],
    ["Total des sollicitations traitées sur la période", NUM(total), "", "somme des contacts traités des mois disponibles"],
    ["  couverture", expSomme(mois.map(function (ym) { return expContactsTraites(I, ym) != null ? 1 : 0; })) + " mois sur " + mois.length, "", "octobre–décembre 2025 : total tous canaux issu de l'historique ; janvier–mai 2026 : tableau d'activité"],
    [],
    ["Répartition par canal (base : " + libCanaux + ")", "Nombre", "Part (%)", "Note"],
    ["Téléphone (appels décrochés)", NUM(tel), PCT(expPart(tel, baseCanaux)), ""],
    ["Tchat (site + application, non distingués)", NUM(tch), PCT(expPart(tch, baseCanaux)), "site vs application : n.d."],
    ["  dont tchat du site", null, "n.d.", "non distingué dans les sources"],
    ["  dont tchat de l'application", null, "n.d.", "non distingué dans les sources"],
    ["Mails", NUM(mai), PCT(expPart(mai, baseCanaux)), "mai partiel (26/05)"],
    ["Formulaires", null, "n.d.", "non distingués des mails dans les sources"],
    ["Total canaux (base)", NUM(baseCanaux), baseCanaux != null ? { __pct: 100 } : "n.d.", ""],
    [],
    ["Téléchargements de l'application au 31/05/2026", null, "", "n.d. — donnée non présente dans les fichiers intégrés"],
  ];
  return expFeuille(rows);
}

function feuilleBikCanaux(I, mois) {
  var rows = [["Mois", "Téléphone (décrochés)", "Tchat (traités)", "Mails", "Total canaux"]];
  mois.forEach(function (ym) {
    var tel = (I.phone[ym] || {}).appels_decroches;
    var tch = (I.chat[ym] || {}).tchats_traites;
    var mai = expMails(I, ym);
    var tot = expSomme([tel, tch, mai]);
    rows.push([expLabelMois(ym), NUM(tel), NUM(tch), NUM(mai), NUM(tot)]);
  });
  rows.push([]);
  rows.push(["Note", "Sur octobre–décembre 2025, le détail par canal n'est pas disponible (n.d.). Le tchat du site et celui de l'application ne sont pas distingués dans les sources."]);
  return expFeuille(rows, { filtre: true });
}

function feuilleBikTelephone(I, mois) {
  var rows = [["Mois", "Appels reçus", "Appels pris (décrochés)", "Appels non répondus",
    "Taux de réponse", "Durée moyenne appel"]];
  var sr = 0, sp = 0, dispo = false;
  mois.forEach(function (ym) {
    var o = I.phone[ym];
    if (!o) { rows.push([expLabelMois(ym), null, null, null, "n.d.", "n.d."]); return; }
    dispo = true; sr += o.appels_recus || 0; sp += o.appels_decroches || 0;
    rows.push([expLabelMois(ym), NUM(o.appels_recus), NUM(o.appels_decroches),
      NUM(o.appels_abandonnes), PCT(o.taux_reponse_pct), o.duree_moyenne_appel || "n.d."]);
  });
  rows.push([]);
  rows.push(["Total période disponible", NUM(dispo ? sr : null), NUM(dispo ? sp : null), "",
    PCT(dispo ? expPart(sp, sr) : null), ""]);
  rows.push(["Temps moyen d'attente", "n.d.", "", "", "", "donnée non présente dans les fichiers"]);
  rows.push(["Situations à contacts multiples", "n.d.", "", "", "", "donnée non présente dans les fichiers"]);
  return expFeuille(rows, { filtre: true });
}

function feuilleBikTchats(I, mois) {
  var rows = [["Mois", "Tchats reçus", "Tchats traités", "Taux de prise",
    "Tchat du site", "Tchat de l'application"]];
  mois.forEach(function (ym) {
    var o = I.chat[ym];
    if (!o) { rows.push([expLabelMois(ym), null, null, "n.d.", "n.d.", "n.d."]); return; }
    rows.push([expLabelMois(ym), NUM(o.tchats_recus), NUM(o.tchats_traites), PCT(o.taux_prise_pct),
      "n.d.", "n.d."]);
  });
  rows.push([]);
  rows.push(["Note", "Le tchat du site et celui de l'application ne sont pas distingués dans les sources : « n.d. » plutôt qu'une répartition artificielle."]);
  return expFeuille(rows, { filtre: true });
}

function feuilleBikMailsFormulaires(I, mois) {
  var rows = [["Mois", "Mails reçus", "Mails traités", "Formulaires reçus", "Formulaires traités"]];
  mois.forEach(function (ym) {
    var mai = expMails(I, ym);
    rows.push([expLabelMois(ym), "n.d.", NUM(mai), "n.d.", "n.d."]);
  });
  rows.push([]);
  rows.push(["Note", "Seuls les mails traités sont disponibles (export SF Case). Les formulaires ne sont pas distingués des mails dans les sources : « n.d. »."]);
  return expFeuille(rows, { filtre: true });
}

function feuilleBikApplication(I, mois) {
  var rows = [["Indicateur application 3018", "Valeur", "Note"],
    ["Téléchargements au 31/05/2026", "n.d.", "donnée non présente dans les fichiers intégrés"],
    ["Sollicitations via le tchat de l'application", "n.d.", "tchat application non distingué du tchat site"],
    ["Preuves / pièces jointes transmises via l'application", "n.d.", "donnée non présente dans les fichiers intégrés"]];
  return expFeuille(rows);
}

function feuilleBikDonneesSources(I, mois) {
  // tableau de contrôle de couverture : indicateur x mois + couverture complète
  var indicateurs = [
    ["Contacts traités (tous canaux)", function (ym) { return expContactsTraites(I, ym); }],
    ["Téléphone — appels décrochés", function (ym) { return (I.phone[ym] || {}).appels_decroches; }],
    ["Tchat — tchats traités", function (ym) { return (I.chat[ym] || {}).tchats_traites; }],
    ["Mails traités", function (ym) { return expMails(I, ym); }],
    ["Signalements Trusted Flagger", function (ym) { return expSignalements(I, ym); }],
    ["Sorties d'anonymat", function (ym) { return expSorties(I, ym); }],
  ];
  var entete = ["Indicateur"].concat(mois.map(expLabelMois)).concat(["Couverture complète"]);
  var rows = [["Tableau de contrôle de couverture (1 valeur par mois attendu)"], [], entete];
  indicateurs.forEach(function (def) {
    var ligne = [def[0]], complet = true;
    mois.forEach(function (ym) {
      var v = def[1](ym);
      ligne.push(v == null ? null : v);
      if (v == null) complet = false;
    });
    ligne.push(complet ? "oui" : "non");
    rows.push(ligne);
  });
  rows.push([]);
  rows.push(["Une donnée ne couvrant qu'une partie de la période n'est pas extrapolée sur les mois manquants."]);
  return expFeuille(rows);
}

function feuilleBikMethodo(I, mois) {
  var rows = [["Méthodologie — export BIK Grant agreement"], [],
    ["Période", "1er octobre 2025 au 31 mai 2026 (8 mois)"],
    ["Total sollicitations traitées", "contacts effectivement pris en charge (lexique de l'outil) ; PAS les contacts entrants ni les tentatives."],
    ["Parts par canal", "nombre de sollicitations traitées du canal ÷ total des sollicitations traitées de la base × 100."],
    ["Taux de réponse téléphone", "appels pris ÷ appels reçus × 100 (jamais sur le total tous canaux)."],
    ["Recalcul", "tous les agrégats, totaux, moyennes et parts sont recalculés uniquement sur la période sélectionnée."],
    ["Données absentes", "écrites « n.d. », jamais remplacées par zéro, jamais extrapolées."],
    ["Couverture", "octobre–décembre 2025 : seul le total tous canaux et les signalements plateformes sont disponibles ; le détail par canal commence en février 2026."],
    ["Confidentialité", "aucune donnée personnelle."],
  ];
  return expFeuille(rows);
}

function construireClasseurBIK() {
  var I = expIndex();
  var mois = expListeMois(BIK_DE, BIK_A);
  var wb = XLSX.utils.book_new();
  expAjouter(wb, "Synthèse BIK", feuilleBikSyntheseGA(I, mois));
  expAjouter(wb, "Canaux", feuilleBikCanaux(I, mois));
  expAjouter(wb, "Téléphone", feuilleBikTelephone(I, mois));
  expAjouter(wb, "Tchats", feuilleBikTchats(I, mois));
  expAjouter(wb, "Mails et formulaires", feuilleBikMailsFormulaires(I, mois));
  expAjouter(wb, "Application 3018", feuilleBikApplication(I, mois));
  expAjouter(wb, "Données sources", feuilleBikDonneesSources(I, mois));
  expAjouter(wb, "Méthodologie", feuilleBikMethodo(I, mois));
  return wb;
}
function exportBIK() {
  var wb = construireClasseurBIK();
  XLSX.writeFile(wb, "export_BIK_2025-10-01_2026-05-31.xlsx");
}

/* =================================================================
   3) EXPORT PERSONNALISÉ — sous-ensemble de feuilles sur une période.
   ================================================================= */
function construireClasseurPerso(mois, sections, titrePeriode) {
  var I = expIndex();
  var wb = XLSX.utils.book_new();
  if (sections.synthese) expAjouter(wb, "Synthèse", feuilleSynthese(I));
  if (sections.mensuel) expAjouter(wb, "Activité mensuelle", feuilleMensuelle(I, mois));
  if (sections.trimestriel) expAjouter(wb, "Activité trimestrielle", feuilleTrimestrielle());
  if (sections.annuel) expAjouter(wb, "Activité annuelle", feuilleAnnuelle());
  if (sections.telephone) expAjouter(wb, "Téléphone", feuilleTelephone(I, mois.filter(function (m) { return I.phone[m]; })));
  if (sections.tchat) expAjouter(wb, "Tchat", feuilleTchat(I, mois.filter(function (m) { return I.chat[m]; })));
  if (sections.tf) expAjouter(wb, "Trusted flagger", feuilleTrustedFlagger());
  if (sections.anonymat) expAjouter(wb, "Sorties anonymat", feuilleSortiesAnonymat());
  if (sections.bik) expAjouter(wb, "BIK", feuilleBikGlobal());
  if (sections.etp) expAjouter(wb, "ETP et absences", feuilleEtpAbsences(I, mois));
  if (sections.historique) expAjouter(wb, "Comparaison historique", feuilleHistoriquePerso(mois));
  if (sections.consolidee) expAjouter(wb, "Données consolidées", feuilleConsolidee(I, mois));
  expAjouter(wb, "Méthodologie", feuilleMethodologie());
  return wb;
}

function feuilleHistoriquePerso(mois) {
  var I = expIndex();
  var rows = [["Comparaison historique (mois sélectionnés)"], [],
    ["Mois", "Sollicitations 2024", "Sollicitations 2025", "Sollicitations 2026",
      "Contacts traités 2024", "Contacts traités 2025", "Contacts traités 2026"]];
  mois.forEach(function (ym) {
    var i = parseInt(ym.slice(5, 7), 10) - 1;
    var moisLabel = EXP_MOIS_LONG[ym.slice(5, 7)];
    rows.push([moisLabel,
      NUM(expHistVal(I.histSollic, "2024-" + ym.slice(5, 7))),
      NUM(expHistVal(I.histSollic, "2025-" + ym.slice(5, 7))),
      NUM(expHistVal(I.histSollic, "2026-" + ym.slice(5, 7))),
      NUM(expHistVal(I.histContacts, "2024-" + ym.slice(5, 7))),
      NUM(expHistVal(I.histContacts, "2025-" + ym.slice(5, 7))),
      NUM(expHistVal(I.histContacts, "2026-" + ym.slice(5, 7))),
    ]);
  });
  return expFeuille(rows, { filtre: true });
}

/* ---- modèles prédéfinis : période + sections ---- */
var EXP_MODELES = {
  bik_ga: { label: "BIK – Grant agreement", de: "2025-10", a: "2026-05", special: "bik" },
  tf: { label: "Trusted flagger", de: "2026-01", a: "2026-06", sections: { tf: true, consolidee: true } },
  annuel: { label: "Activité annuelle", de: "2026-01", a: "2026-05", sections: { synthese: true, mensuel: true, trimestriel: true, annuel: true, consolidee: true } },
  histo: { label: "Comparaison historique", de: "2026-01", a: "2026-05", sections: { historique: true } },
  libre: { label: "Export libre", de: "2026-01", a: "2026-05", sections: { synthese: true, mensuel: true, consolidee: true } },
};

/* =================================================================
   Fenêtre « export personnalisé » (modale)
   ================================================================= */
var EXP_MODAL_PRET = false;
function initModalExport() {
  if (EXP_MODAL_PRET) return; EXP_MODAL_PRET = true;
  var sel = document.getElementById("exp-modele");
  if (sel) sel.addEventListener("change", function () { appliquerModele(sel.value); });
  var gen = document.getElementById("exp-generer");
  if (gen) gen.addEventListener("click", lancerExportPerso);
  document.querySelectorAll("#modal-export [data-fermer]").forEach(function (b) {
    b.addEventListener("click", fermerModalExport);
  });
  var rapide = document.getElementById("exp-rapide");
  if (rapide) rapide.addEventListener("change", function () {
    var de = document.getElementById("exp-de"), a = document.getElementById("exp-a");
    var p = { tout: ["2026-01", "2026-06"], "2026": ["2026-01", "2026-12"],
      t1: ["2026-01", "2026-03"], t2: ["2026-04", "2026-06"] }[rapide.value];
    if (p && de && a) { de.value = p[0]; a.value = p[1]; }
  });
}
function ouvrirModalExport() {
  var modal = document.getElementById("modal-export");
  if (!modal) return;
  initModalExport();
  modal.hidden = false;
  appliquerModele("libre"); // valeurs par défaut
}
function fermerModalExport() {
  var modal = document.getElementById("modal-export");
  if (modal) modal.hidden = true;
}
function appliquerModele(cle) {
  var m = EXP_MODELES[cle]; if (!m) return;
  var de = document.getElementById("exp-de"), a = document.getElementById("exp-a");
  if (de) de.value = m.de; if (a) a.value = m.a;
  var sel = document.getElementById("exp-modele"); if (sel) sel.value = cle;
  // cases à cocher des sections
  var sections = m.sections || {};
  document.querySelectorAll("#modal-export input[data-section]").forEach(function (chk) {
    chk.checked = !!sections[chk.dataset.section];
    chk.disabled = (m.special === "bik"); // le modèle BIK a sa propre structure
  });
  var info = document.getElementById("exp-info");
  if (info) info.textContent = (m.special === "bik")
    ? "Le modèle BIK génère sa structure dédiée (8 onglets) sur la période. Vous pouvez ajuster les dates."
    : "Cochez les sections à inclure. La période ci-dessus est modifiable.";
}
function lancerExportPerso() {
  var cle = (document.getElementById("exp-modele") || {}).value || "libre";
  var de = (document.getElementById("exp-de") || {}).value || "2026-01";
  var a = (document.getElementById("exp-a") || {}).value || "2026-05";
  var m = EXP_MODELES[cle] || {};
  try {
    if (m.special === "bik") {
      BIK_DE = de; BIK_A = a;
      var wbb = construireClasseurBIK();
      XLSX.writeFile(wbb, "export_BIK_" + de + "-01_" + a + "-31.xlsx");
      fermerModalExport(); return;
    }
    var mois = expListeMois(de, a);
    var sections = {};
    document.querySelectorAll("#modal-export input[data-section]").forEach(function (chk) {
      if (chk.checked) sections[chk.dataset.section] = true;
    });
    var wb = construireClasseurPerso(mois, sections, de + " à " + a);
    XLSX.writeFile(wb, "export_personnalise_3018_" + de + "_" + a + ".xlsx");
    fermerModalExport();
  } catch (e) {
    alert("Erreur pendant l'export personnalisé : " + e.message);
  }
}
