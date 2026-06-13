/* =========================================================
   Reporting interne 3018 — tableau de bord
   Charge les fichiers JSON de /data avec fetch() et construit
   chaque section. Aucun chiffre n'est écrit en dur.
   ========================================================= */
"use strict";

const SECTIONS = [
  { id: "synthese",     label: "Synthèse direction" },
  { id: "historique",   label: "Comparaison historique" },
  { id: "mensuel",      label: "Activité mensuelle" },
  { id: "trimestriel",  label: "Activité trimestrielle" },
  { id: "telephone",    label: "Téléphone" },
  { id: "tchat",        label: "Tchat" },
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
  anonymity:   "data/anonymity_outputs.json",
  bik:         "data/bik.json",
  methodology: "data/methodology.json",
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

/* ---------------- SYNTHÈSE DIRECTION ---------------- */
function renderSynthese() {
  const a = DATA.annual, m = DATA.monthly;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  let h = "";

  /* Hero — cumul annuel à date */
  h += '<p class="periode-tag">Cumul annuel à date 2026 — ' + esc((a._meta && a._meta.arret) ? "données arrêtées au " + a._meta.arret : "") + "</p>";
  h += '<div class="kpis hero">';
  h += kpi("Appels décrochés", show(a.telephone && a.telephone.appels_decroches), (a.telephone && a.telephone.periode) || "", "primaire");
  h += kpi("Tchats traités", show(a.tchat && a.tchat.tchats_traites), (a.tchat && a.tchat.periode) || "", "primaire");
  h += kpi("Signalements Trusted Flagger", show(a.signalements_trusted_flagger && a.signalements_trusted_flagger.total), (a.signalements_trusted_flagger && a.signalements_trusted_flagger.periode) || "", "primaire");
  h += kpi("Sorties d'anonymat", show(a.sorties_anonymat && a.sorties_anonymat.total), (a.sorties_anonymat && a.sorties_anonymat.periode) || "", "primaire");
  h += "</div>";

  if (a.volume_activite_traite) {
    h += '<div class="kpis">' + kpi("Activité traitée tous canaux (janv.–mai)", show(a.volume_activite_traite.cumul_janv_mai),
      a.volume_activite_traite.note, "accent") + "</div>";
  }

  /* Dernier mois consolidé tous canaux : janvier */
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    const s26 = c.sollicitations["2026"], s25 = c.sollicitations["2025"];
    const t26 = c.contacts_traites["2026"], t25 = c.contacts_traites["2025"];
    const r26 = c.taux_reponse_pct["2026"], r25 = c.taux_reponse_pct["2025"];
    h += '<div class="bloc"><h3 class="bloc-titre">Dernier mois consolidé tous canaux — janvier 2026 (vs janvier 2025)</h3><div class="kpis">';
    h += carteEvo("Sollicitations", s26, s25);
    h += carteEvo("Contacts traités", t26, t25);
    h += '<div class="kpi"><p class="kpi-label">Taux de réponse global</p><p class="kpi-valeur">' + showPct(r26) + "</p>" + evoBadge(r26, r25, "pt") + "</div>";
    h += "</div><p class=\"carte-note\">Taux de réponse global = contacts traités / sollicitations.</p></div>";
  }

  /* Lecture direction — tendances calculées */
  h += lectureBox("Lecture direction (janvier → mai 2026)", construireLecture());

  /* Points d'attention */
  const alertes = construireAlertes();
  if (alertes.length) {
    h += '<div class="bloc"><h3 class="bloc-titre">Points d\'attention</h3>' + alertes.map(al => noteBox("<strong>" + esc(al.titre) + "</strong> " + esc(al.txt), al.type)).join("") + "</div>";
  }

  /* Copier la synthèse */
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
  L.push("3018 — synthèse direction (cumul annuel à date 2026, arrêté au " + ((a._meta && a._meta.arret) || "n.d.") + ")");
  if (a.telephone) L.push("Appels décrochés (" + a.telephone.periode + ") : " + show(a.telephone.appels_decroches));
  if (a.tchat) L.push("Tchats traités (" + a.tchat.periode + ") : " + show(a.tchat.tchats_traites));
  if (a.signalements_trusted_flagger) L.push("Signalements Trusted Flagger (" + a.signalements_trusted_flagger.periode + ") : " + show(a.signalements_trusted_flagger.total));
  if (a.sorties_anonymat) L.push("Sorties d'anonymat (" + a.sorties_anonymat.periode + ") : " + show(a.sorties_anonymat.total));
  if (a.volume_activite_traite) L.push("Activité traitée janv.-mai (appels décrochés + tchats traités + mails ; mails mai partiels) : " + show(a.volume_activite_traite.cumul_janv_mai));
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    L.push("Janvier 2026 (consolidé tous canaux) : sollicitations " + show(c.sollicitations["2026"]) + ", contacts traités " + show(c.contacts_traites["2026"]) + ", taux de réponse global " + showPct(c.taux_reponse_pct["2026"]) + ".");
  }
  return L.join("\n");
}

/* ---------------- COMPARAISON HISTORIQUE ---------------- */
let HIST_IND = "sollicitations";
let PROT_IND = "signalements_plateformes";
const HIST_LABELS = { sollicitations: "Sollicitations reçues", contacts_traites: "Contacts traités", taux_reponse_global_pct: "Taux de réponse global" };

function renderHistorique() {
  const hd = DATA.historical;
  if (!hd) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="intro">' + esc(hd._meta.avertissement) + "</p>";

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
    note = "<strong>Lecture.</strong> Sollicitations <em>reçues</em> = appels reçus (total 3CX) + tchats reçus + mails — activité entrante, distincte des contacts traités. 2024-2025 : tableau consolidé ; 2026 février-mai <span class=\"mini-badge\">rec.</span> reconstruites. Comparaison à interpréter avec la prudence d'usage (provenance différente).";
  else if (HIST_IND === "contacts_traites")
    note = "<strong>Lecture.</strong> Contacts <em>traités</em> = appels décrochés + tchats traités + mails. 2024-2025 : tableau consolidé ; 2026 février-mai <span class=\"mini-badge\">rec.</span> reconstruits (mai : mails partiels). « Évol. » = variation vs même mois N-1.";
  else
    note = "<strong>Lecture.</strong> Taux de réponse global = contacts traités / sollicitations reçues. 2024-2025 consolidés ; 2026 reconstruit. « Évol. » en points. À interpréter avec la prudence d'usage (provenance différente).";
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
function renderSignalements() {
  const f = DATA.flagger;
  if (!f) return '<p class="intro">Données indisponibles.</p>';
  const cons = (f.par_mois_2026 || []).filter(d => d.statut === "consolidé");
  let h = '<div class="kpis hero">'
    + kpi("Total 2026", show(f.total_2026), "tous mois (juin partiel)", "primaire")
    + kpi("Cumul janv.–mai", show(f.cumul_janvier_mai_2026), "année à date", "primaire")
    + (f.par_trimestre_2026 ? kpi("Q1 (janv.–mars)", show(f.par_trimestre_2026.Q1_janv_mars), "consolidé", "") : "")
    + "</div>";
  const t = tendance(cons.map(d => d.signalements));
  if (t) h += lectureBox("Lecture", [{ cls: t.cls, txt: "Activité de signalement " + (t.cls === "hausse" ? "en hausse" : t.cls === "baisse" ? "en baisse" : "stable") + " (" + libelleCourt(cons[t.idxA].mois) + " " + show(t.premier) + " → " + libelleCourt(cons[t.idxB].mois) + " " + show(t.dernier) + ", " + t.txt + ")." }]);

  if (f.par_mois_2026) {
    const idxPart = f.par_mois_2026.findIndex(d => d.statut !== "consolidé");
    h += '<div class="bloc"><h3 class="bloc-titre">Évolution mensuelle 2026</h3><div class="graph">'
      + svgBars(f.par_mois_2026.map(d => ({ label: libelleCourt(d.mois), v: d.signalements })), BLEU, idxPart) + "</div>"
      + noteBox("Le dernier mois (hachuré) est partiel.") + "</div>";
  }
  if (f.par_plateforme) h += '<div class="bloc"><h3 class="bloc-titre">Par plateforme</h3>' + htmlHBars(f.par_plateforme.map(d => ({ label: d.plateforme, v: d.signalements })), BLEU) + "</div>";
  if (f.par_type_contenu) h += '<div class="bloc"><h3 class="bloc-titre">Par type de contenu</h3>' + htmlHBars(f.par_type_contenu.map(d => ({ label: d.type, v: d.signalements })), BLEU) + "</div>";
  if (f.par_decision) h += '<div class="bloc"><h3 class="bloc-titre">Par décision de la plateforme</h3>' + htmlHBars(f.par_decision.map(d => ({ label: d.decision, v: d.signalements })), GRIS) + "</div>";
  if (f.indicateurs_issue && f.indicateurs_issue.note) h += noteBox("<strong>Taux de retrait indicatif : " + showPct(f.indicateurs_issue.taux_retrait_indicatif_pct) + ".</strong> " + esc(f.indicateurs_issue.note), "vigilance");
  if (f.note_methodologique) h += noteBox(esc(f.note_methodologique));
  return h;
}

/* ---------------- SORTIES D'ANONYMAT ---------------- */
function renderAnonymat() {
  const a = DATA.anonymity;
  if (!a) return '<p class="intro">Données indisponibles.</p>';
  let h = '<p class="periode-tag">Cumul janvier-mai 2026 (juin partiel)</p>';
  const k = a.kpi_institutionnels_janv_mai || {};
  h += '<div class="kpis hero">'
    + kpi("Total sorties (janv.–mai)", show(a.cumul_janvier_mai_2026), "remontées institutionnelles", "primaire")
    + kpi("Harcèlement scolaire (MEN / Agri.)", show(k.harcelement_scolaire_MEN_agriculture), "", "")
    + kpi("Lignes IPS", show(k.ips_total), "", "")
    + "</div>";
  h += '<div class="kpis">'
    + kpi("Signalements au procureur", show(k.procureur), "art. 40 CPP", "accent")
    + kpi("Envois CRIP", show(k.crip), "", "")
    + kpi("Signalements OFMIN", show(k.ofmin), "", "")
    + kpi("Signalements PHAROS", show(k.pharos), "", "")
    + "</div>";
  h += noteBox("Les lignes IPS peuvent viser plusieurs autorités pour une même situation : procureur, CRIP, OFMIN et OCRTEH ne s'additionnent pas entre eux.");

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
  if (m.confidentialite) h += noteBox("<strong>Confidentialité.</strong> " + esc(m.confidentialite), "vigilance");
  return h;
}

const RENDERERS = {
  synthese: renderSynthese, historique: renderHistorique, mensuel: renderMensuel, trimestriel: renderTrimestriel,
  telephone: renderTelephone, tchat: renderTchat, signalements: renderSignalements, anonymat: renderAnonymat,
  bik: renderBik, methodologie: renderMethodologie,
};

/* ---------------- Interactions après rendu ---------------- */
function brancherInteractions(id) {
  if (id === "synthese") {
    const btn = document.getElementById("btn-copier");
    if (btn) btn.addEventListener("click", () => {
      const txt = texteSynthese();
      const ok = document.getElementById("copie-ok");
      const fini = () => { if (ok) { ok.hidden = false; setTimeout(() => ok.hidden = true, 2000); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fini).catch(fini);
      else { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); fini(); }
    });
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
  let h = "<p>Outil interne de pilotage. Aucune donnée personnelle n'est affichée.</p>";
  if (m) {
    if (m._meta && m._meta.date_mise_a_jour_donnees) h += "<p>Données mises à jour le " + esc(m._meta.date_mise_a_jour_donnees) + ". " + esc(m.perimetre_partiel_juin || "") + "</p>";
    if (m.fichiers_json) h += '<p class="pied-fichiers">Fichiers JSON : ' + m.fichiers_json.map(f => "<code>" + esc(f) + "</code>").join(" ") + "</p>";
  }
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
    document.getElementById("entete-periode").textContent = "Cumul annuel à date " + (DATA.annual._meta.annee || "") + " — données arrêtées au " + (DATA.annual._meta.arret || "") + ".";
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
