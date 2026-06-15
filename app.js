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

  /* Hero — cumul annuel à date */
  h += '<div class="kpis hero">';
  h += kpi("Appels décrochés", show(a.telephone && a.telephone.appels_decroches), (a.telephone && a.telephone.periode) || "", "primaire");
  h += kpi("Tchats traités", show(a.tchat && a.tchat.tchats_traites), (a.tchat && a.tchat.periode) || "", "primaire");
  h += kpi("Signalements envoyés", show(a.signalements_trusted_flagger && a.signalements_trusted_flagger.total), (a.signalements_trusted_flagger && a.signalements_trusted_flagger.periode) || "", "primaire");
  h += kpi("Sorties d'anonymat", show(a.sorties_anonymat && a.sorties_anonymat.total), (a.sorties_anonymat && a.sorties_anonymat.periode) || "", "primaire");
  h += "</div>";

  if (a.volume_activite_traite) {
    h += '<div class="kpis">' + kpi("Activité traitée tous canaux", show(a.volume_activite_traite.cumul_janv_mai), "janv.–mai", "accent") + "</div>";
  }

  /* Mise en perspective ETP (janv.–mai 2026, mois complets) */
  const keys = moisKeys(2026, [1, 2, 3, 4, 5]);
  const etpMoy = etpMoyenne(keys), etpTot = etpSomme(keys);
  const an = DATA.anonymity, ips = an && an.kpi_institutionnels_janv_mai ? an.kpi_institutionnels_janv_mai.ips_total : null;
  const contacts = a.volume_activite_traite ? a.volume_activite_traite.cumul_janv_mai : null;
  const sigTF = a.signalements_trusted_flagger ? a.signalements_trusted_flagger.total : null;
  h += '<div class="bloc"><h3 class="bloc-titre">Mise en perspective — ETP <span class="info" title="ETP théorique (temps dû initial Octime), hors présence réelle. Ratios = volume janv.–mai / somme des ETP des mêmes mois.">i</span></h3><div class="kpis">'
    + kpi("ETP moyen", show(etpMoy), "janv.–mai", "")
    + kpi("Contacts traités / ETP-mois", show(ratioParEtp(contacts, etpTot)), "", "")
    + kpi("Signalements plateformes / ETP-mois", show(ratioParEtp(sigTF, etpTot)), "", "")
    + kpi("Situations IPS / ETP-mois", show(ratioParEtp(ips, etpTot)), "", "")
    + "</div></div>";

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
  const keys = moisKeys(2026, [1, 2, 3, 4, 5]);
  const etpMoy = etpMoyenne(keys), etpTot = etpSomme(keys);
  const an = DATA.anonymity, ips = an && an.kpi_institutionnels_janv_mai ? an.kpi_institutionnels_janv_mai.ips_total : null;
  if (etpMoy != null) L.push("ETP moyen (janv.-mai) : " + show(etpMoy) + " — contacts traités / ETP-mois : " + show(ratioParEtp(a.volume_activite_traite ? a.volume_activite_traite.cumul_janv_mai : null, etpTot)) + ", signalements plateformes / ETP-mois : " + show(ratioParEtp(a.signalements_trusted_flagger ? a.signalements_trusted_flagger.total : null, etpTot)) + ", situations IPS / ETP-mois : " + show(ratioParEtp(ips, etpTot)));
  const c = m && m.comparaison_historique_janvier;
  if (c) {
    L.push("Janvier 2026 : sollicitations " + show(c.sollicitations["2026"]) + ", contacts traités " + show(c.contacts_traites["2026"]) + ", taux de réponse global " + showPct(c.taux_reponse_pct["2026"]) + ".");
  }
  return L.join("\n");
}

/* ---------------- COMPARAISON HISTORIQUE ---------------- */
let HIST_IND = "sollicitations";
let PROT_IND = "signalements_plateformes";
const HIST_LABELS = { sollicitations: "Sollicitations reçues", contacts_traites: "Contacts traités", taux_reponse_global_pct: "Taux de réponse global", etp: "ETP", contacts_par_etp: "Contacts / ETP-mois", signalements_par_etp: "Signalements plateformes / ETP-mois", crip_ip_sp_par_etp: "CRIP / IP / SP / ETP-mois" };
const HIST_ETP = ["etp", "contacts_par_etp", "signalements_par_etp", "crip_ip_sp_par_etp"];

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

  /* --- indicateurs ETP et ratios (séries calculées) --- */
  if (HIST_ETP.indexOf(HIST_IND) >= 0) {
    let series, note;
    if (HIST_IND === "etp") {
      series = { "2024": new Array(12).fill(null), "2025": etpSerieAnnee(2025), "2026": etpSerieAnnee(2026) };
      note = "ETP théorique (temps dû initial Octime), hors présence réelle. Pas de données 2024. Juin 2026 partiel.";
    } else if (HIST_IND === "contacts_par_etp") {
      series = { "2024": new Array(12).fill(null), "2025": etpRatioSerie(hd.series.contacts_traites["2025"], 2025), "2026": etpRatioSerie(hd.series.contacts_traites["2026"], 2026) };
      note = "Contacts traités ÷ ETP du même mois. Calculé seulement si les deux valeurs existent.";
    } else if (HIST_IND === "signalements_par_etp") {
      const sp = hd.protection.series.signalements_plateformes;
      series = { "2024": new Array(12).fill(null), "2025": etpRatioSerie(sp["2025"], 2025), "2026": etpRatioSerie(sp["2026"], 2026) };
      note = "Signalements plateformes ÷ ETP du même mois.";
    } else {
      const cr = hd.protection.series.crip_ip_sp_regroupes;
      series = { "2024": new Array(12).fill(null), "2025": etpRatioSerie(cr["2025"], 2025), "2026": etpRatioSerie(cr["2026"], 2026) };
      note = "CRIP / IP / SP regroupés ÷ ETP du même mois. Rubrique regroupée pour rester comparable à 2025.";
    }
    /* statut basé sur le mois : juin 2026 partiel */
    const statut2026 = hd.mois_labels.map((l, i) => (i === 5 ? "partiel" : "complet"));
    const infoEtp = (st, v26) => ({ comparable: v26 != null && st !== "partiel", badge: st === "partiel" ? ' <span class="mini-badge part">partiel</span>' : "" });
    zone.innerHTML = blocComparatif(hd.mois_labels, series, statut2026, "", infoEtp, note);
    return;
  }

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

  /* Bloc compact : ETP, situations IPS, IP transmises, procureur (mensuel) */
  const sdm = a.sous_destinataires_ips_mensuel && a.sous_destinataires_ips_mensuel.par_destinataire;
  if (sdm) {
    const moisIPS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
    const crip = sdm.CRIP ? sdm.CRIP.par_mois : {}, proc = sdm.Procureur ? sdm.Procureur.par_mois : {};
    h += '<div class="bloc"><h3 class="bloc-titre">ETP et IPS par mois <span class="info" title="Situations IPS non ventilées par mois dans la source : seul le cumul janv.–mai est disponible. Une situation peut viser plusieurs autorités.">i</span></h3>'
      + '<div class="table-enveloppe"><table><thead><tr><th>Mois</th><th>ETP</th><th>Situations IPS</th><th>IP transmises</th><th>Signalements au procureur</th></tr></thead><tbody>';
    moisIPS.forEach(mk => {
      h += '<tr><td class="cellule-mois">' + esc(libelleCourt(mk)) + "</td>" + td(etpDe(mk))
        + '<td class="nd">n.d.</td>' + td(crip[mk]) + td(proc[mk]) + "</tr>";
    });
    h += '<tr class="ligne-total"><td>Cumul janv.–mai</td>' + td(etpSomme(moisIPS)) + td(k.ips_total) + td(k.crip) + td(k.procureur) + "</tr>";
    h += "</tbody></table></div>" + noteBox("Situations IPS : cumul uniquement (non ventilé par mois dans la source). IP transmises = CRIP. CRIP et procureur peuvent concerner une même situation.") + "</div>";
  }

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
      + '<div class="k">Ratio mensuel</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.ratios.mensuel) + "</div>"
      + '<div class="k">Ratio cumul</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.ratios.cumul) + "</div>"
      + '<div class="k">Périmètre</div><div class="v" style="text-align:left;font-weight:500">' + esc(e.perimetre || "") + "</div>"
      + "</div>";
    if (e.limites) h += '<ul class="liste-propre">' + e.limites.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>";
    if (e.ip_procureur) h += noteBox(esc(e.ip_procureur));
    h += "</div>";
  }
  if (m.confidentialite) h += noteBox("<strong>Confidentialité.</strong> " + esc(m.confidentialite), "vigilance");
  return h;
}

const RENDERERS = {
  synthese: renderSynthese, historique: renderHistorique, mensuel: renderMensuel, trimestriel: renderTrimestriel,
  telephone: renderTelephone, tchat: renderTchat, signalements: renderSignalements, anonymat: renderAnonymat,
  bik: renderBik, methodologie: renderMethodologie,
  sollicitations: renderSollicitations, performance: renderPerformance,
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
    const etpSel = document.getElementById("sol-etp");
    if (etpSel) etpSel.addEventListener("change", () => { SOL_F.etp = (etpSel.value === "oui"); solFill(); });
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
let SOL_F = { periode: "annee", canal: "tous", comp: "aucune", persoDe: 1, persoA: 5, etp: false };

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
    + '<label class="filtre-check">Ratios ETP<select id="sol-etp"><option value="non">Masqués</option><option value="oui">Affichés</option></select></label>'
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
  const etpOn = SOL_F.etp;
  const enTeteEtp = etpOn ? "<th>ETP</th><th>Contacts / ETP</th><th>Signal. / ETP</th>" : "";
  let h = '<div class="bloc"><h3 class="bloc-titre">Tableau détaillé mensuel — valeurs sources</h3>'
    + '<div class="table-enveloppe"><table><thead><tr>'
    + "<th>Mois</th><th>Sollic. reçues</th><th>Appels reçus</th><th>Décrochés</th><th>Appels aband.</th><th>Taux rép.</th>"
    + "<th>Tchats reçus</th><th>Tchats traités</th><th>Taux prise</th><th>Mails</th>"
    + "<th>Activité traitée<br>(tous canaux)</th><th>Signal. TF</th><th>Sorties anon.</th>" + enTeteEtp
    + "</tr></thead><tbody>";
  moisAll.forEach(mo => {
    const d = mo.row;
    let etpCols = "";
    if (etpOn) {
      const e = etpDe(mo.key);
      etpCols = td(e) + td(ratioParEtp(d.volume_activite_traite, e)) + td(ratioParEtp(d.signalements_trusted_flagger, e));
    }
    h += '<tr><td class="cellule-mois">' + esc(d.libelle) + "</td>"
      + td(d.sollicitations_entrantes) + td(d.appels_recus) + td(d.appels_decroches) + td(d.appels_abandonnes) + td(d.taux_reponse_appels_pct, true)
      + td(d.tchats_recus) + td(d.tchats_traites) + td(d.taux_prise_tchat_pct, true) + td(mo.mails)
      + td(d.volume_activite_traite) + td(d.signalements_trusted_flagger) + td(d.sorties_anonymat) + etpCols + "</tr>";
  });
  h += "</tbody></table></div>";
  if (etpOn) h += noteBox("Contacts / ETP = activité traitée du mois ÷ ETP du même mois. Signal. / ETP = signalements plateformes ÷ ETP. ETP théorique (Octime), hors présence réelle.");
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
   MODULE ETP — mise en perspective des volumes par les ETP théoriques
   -----------------------------------------------------------------
   ETP = équivalent temps plein THÉORIQUE (temps dû initial Octime).
   Ne mesure ni la présence réelle, ni une quelconque performance.
   Aucune valeur 2024 (=> n.d.). Juin 2026 partiel (jamais extrapolé).
   Règle des ratios : numérateur et dénominateur portent EXACTEMENT
   sur les mêmes mois. Donnée absente => null/n.d., jamais zéro.
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
/* ratio volume / ETP, à 1 décimale ; null si une borne manque */
function ratioParEtp(volume, etp) {
  return (volume != null && etp != null && etp > 0) ? Math.round(volume / etp * 10) / 10 : null;
}
/* clés mensuelles d'une année (1..12) -> ["2026-01",...] limité aux mois fournis */
function moisKeys(annee, nums) { return nums.map(n => annee + "-" + String(n).padStart(2, "0")); }

/* série ETP d'une année sur 12 mois (null si absent) */
function etpSerieAnnee(annee) {
  const out = new Array(12).fill(null);
  const e = DATA.etp;
  if (e && e.par_mois) e.par_mois.forEach(d => {
    const p = d.mois.split("-");
    if (p[0] === String(annee)) out[+p[1] - 1] = d.etp;
  });
  return out;
}
/* série de ratio (numérateur 12 mois / ETP même année même mois) */
function etpRatioSerie(numArr, annee) {
  const etp = etpSerieAnnee(annee);
  return (numArr || []).map((v, i) => ratioParEtp(v, etp[i]));
}
