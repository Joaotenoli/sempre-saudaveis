/* Sempre Saudáveis — sono, fichas de alimentação e meta de peso. Sem build: JavaScript puro. */
(function () {
"use strict";

/* ================= utilidades ================= */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const toMin = s => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
const keyOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayKey = () => keyOf(new Date());
const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const dur = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h${pad(r)}` : `${h}h`; };
const durLong = m => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}min` : `${h}h`) : `${r}min`; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const fmt = (n, d = 0) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const sign = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), d);
const dec = v => String(+(+v).toFixed(1)).replace(".", ",");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (x, lo, hi, def) => { const n = parseFloat(String(x).replace(",", ".")); return n >= lo && n <= hi ? n : def; };
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const clone = o => JSON.parse(JSON.stringify(o));
const shortDate = k => parseKey(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");

/* ================= estado ================= */
const DEFAULT = () => ({
  v: 2,
  profile: { name: "", sex: "m", age: 27, height: 181, weight: 61.5, train: 5, wake: "04:30", bed: "20:00", bedNow: "", shiftStart: "", creatine: false, setup: false, u: 0 },
  goal: { type: "ganhar", start: 61.5, startDate: todayKey(), target: 69.5, endDate: keyOf(addDays(new Date(), 91)), u: 0 },
  sleep: {}, days: {}, weights: {}, badges: {}, custom: {}, shop: {}, fichas: {}
});
let S = DEFAULT();
let uid = null;            // id da conta (null = só neste aparelho)
let sb = null;             // cliente Supabase
let syncState = "local";   // local | ok | busy | off
let lastSync = 0;
const CFG = window.VIGOR_CONFIG || {};
const HAS_CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
const lsKey = () => "vigor.v2." + (uid || "local");

/* Aparência: automático (segue o aparelho), claro ou escuro. Vale por aparelho. */
function themePref() { try { return localStorage.getItem("ss.theme") || "auto"; } catch (e) { return "auto"; } }
function applyTheme(t) {
  t = t || themePref();
  const root = document.documentElement;
  if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.setAttribute("content", dark ? "#0C0F0B" : "#F2F4EE"); m.removeAttribute("media"); });
}
applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());

function lsRead(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function lsWrite() { try { localStorage.setItem(lsKey(), JSON.stringify(S)); } catch (e) {} }
function flag(name, val) { try { if (val === undefined) return localStorage.getItem(name); if (val === null) localStorage.removeItem(name); else localStorage.setItem(name, val); } catch (e) { return null; } }

function normalize(x) {
  const d = DEFAULT(); x = x || {};
  return { v: 2, profile: { ...d.profile, ...(x.profile || {}) }, goal: { ...d.goal, ...(x.goal || {}) },
    sleep: x.sleep || {}, days: x.days || {}, weights: x.weights || {}, badges: x.badges || {}, custom: x.custom || {}, shop: x.shop || {}, fichas: x.fichas || {} };
}
/* Junta dois estados sem perder nada: em cada item vence a edição mais recente. */
function mergeMap(a, b) {
  const out = { ...a };
  for (const k in b) if (!out[k] || (b[k].u || 0) > (out[k].u || 0)) out[k] = b[k];
  return out;
}
function merge(a, b) {
  a = normalize(a); b = normalize(b);
  return {
    v: 2,
    profile: (b.profile.u || 0) > (a.profile.u || 0) ? b.profile : a.profile,
    goal: (b.goal.u || 0) > (a.goal.u || 0) ? b.goal : a.goal,
    sleep: mergeMap(a.sleep, b.sleep), days: mergeMap(a.days, b.days),
    weights: mergeMap(a.weights, b.weights), badges: { ...b.badges, ...a.badges }, custom: mergeMap(a.custom, b.custom), shop: mergeMap(a.shop, b.shop), fichas: mergeMap(a.fichas, b.fichas)
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function commit() { lsWrite(); schedulePush(); }

const sleepOf = k => { const e = S.sleep[k]; return e && !e.del ? e : null; };
/* Dia em edição: hoje por padrão; dá para voltar e corrigir dias anteriores. */
let curDay = todayKey(), dayPinned = false;
const isToday = () => curDay === todayKey();
function dayLabel(k) { const t = todayKey(); if (k === t) return "Hoje"; if (k === keyOf(addDays(new Date(), -1))) return "Ontem"; return parseKey(k).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""); }
const getDay = k => ({ meals: {}, water: 0, gut: 0, habits: {}, ...(S.days[k || curDay] || {}) });
function editDay(fn, k) { k = k || curDay; const d = getDay(k); fn(d); d.u = Date.now(); S.days[k] = d; commit(); }
const weightList = () => Object.keys(S.weights).filter(k => !S.weights[k].del).sort().map(k => ({ d: k, kg: S.weights[k].kg }));
const currentWeight = () => { const w = weightList(); return w.length ? w[w.length - 1].kg : S.profile.weight; };

/* Horário de hoje na transição: adianta 15 min a cada 2 dias até chegar na meta. */
function effP() {
  const p = S.profile, B = toMin(p.bed), W = toMin(p.wake);
  let left = 0, total = 0;
  if (p.bedNow && p.shiftStart) {
    total = ((toMin(p.bedNow) - B) + 1440) % 1440;
    if (total > 0 && total <= 360) left = Math.max(0, total - Math.floor(Math.max(0, daysBetween(p.shiftStart, todayKey())) / 2) * 15);
    else total = 0;
  }
  return { ...p, bed: fromMin(B + left), wake: fromMin(W + left), left, total, daysLeft: Math.ceil(left / 15) * 2, targetBed: p.bed, targetWake: p.wake };
}

/* ================= sincronização ================= */
let pushTimer = null, channel = null, pendingRender = false;

function setSync(s) { syncState = s; renderSync(); }
function schedulePush() {
  if (!uid || !sb) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 900);
}
async function syncNow() {
  if (!uid || !sb) return;
  if (!navigator.onLine) { setSync("off"); return; }
  setSync("busy");
  try {
    const { data, error } = await sb.from("vigor_state").select("data").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    const before = clone(S);
    if (data && data.data) S = merge(S, data.data);
    if (!data || !same(S, normalize(data.data))) {
      const up = await sb.from("vigor_state").upsert({ user_id: uid, data: S, updated_at: new Date().toISOString() });
      if (up.error) throw up.error;
    }
    lsWrite(); lastSync = Date.now(); setSync("ok");
    if (!same(before, S)) softRender();
  } catch (e) { setSync("off"); }
}
function listen() {
  if (!sb || !uid) return;
  if (channel) { sb.removeChannel(channel); channel = null; }
  channel = sb.channel("vigor-" + uid)
    .on("postgres_changes", { event: "*", schema: "public", table: "vigor_state", filter: "user_id=eq." + uid }, payload => {
      const remote = payload.new && payload.new.data; if (!remote) return;
      const merged = merge(S, remote);
      if (!same(merged, S)) { S = merged; lsWrite(); softRender(); }
      lastSync = Date.now(); setSync("ok");
    }).subscribe();
}
function softRender() {
  const editing = $("#scrim") || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
  if (editing) pendingRender = true; else render();
}
window.addEventListener("online", syncNow);
window.addEventListener("offline", () => uid && setSync("off"));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { syncNow(); if (!$("#scrim")) softRender(); } });

function nameFromAccount(session) {
  const n = session && session.user && session.user.user_metadata && session.user.user_metadata.name;
  if (n && !S.profile.name) S.profile.name = String(n).slice(0, 40);
}
async function adoptSession(session) {
  uid = session.user.id;
  const mine = lsRead(lsKey()), loose = lsRead("vigor.v2.local");
  S = normalize(mine || DEFAULT());
  if (loose && normalize(loose).profile.setup) { S = merge(S, loose); try { localStorage.removeItem("vigor.v2.local"); } catch (e) {} }
  lsWrite();
  await syncNow(); nameFromAccount(session); listen(); render();
}

/* ================= ciência → números ================= */
const GOALS = {
  ganhar: { label: "Ganhar peso", verb: "ganhar", prot: 1.8, lo: 0.25, hi: 0.5 },
  perder: { label: "Perder peso", verb: "perder", prot: 2.0, lo: 0.5, hi: 1.0 },
  manter: { label: "Manter", verb: "manter", prot: 1.6, lo: 0, hi: 0 }
};
function energy() {
  const p = S.profile, w = currentWeight();
  const bmr = 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5);
  const act = 1.35 + 0.045 * clamp(+p.train || 0, 0, 7);
  return { bmr: Math.round(bmr), tdee: Math.round(bmr * act), w };
}
function goalInfo() {
  const g = S.goal, G = GOALS[g.type] || GOALS.ganhar, cur = currentWeight(), t = todayKey();
  const total = g.target - g.start, done = cur - g.start;
  const daysTotal = Math.max(1, daysBetween(g.startDate, g.endDate));
  const daysLeft = Math.max(0, daysBetween(t, g.endDate));
  const pct = g.type === "manter" || !total ? 1 : clamp(done / total, 0, 1);
  const timePct = clamp(1 - daysLeft / daysTotal, 0, 1);
  const planWeek = total / (daysTotal / 7);
  const needWeek = daysLeft > 0 ? (g.target - cur) / (daysLeft / 7) : 0;
  const ratePct = Math.abs(planWeek) / g.start * 100;
  const reached = g.type === "ganhar" ? cur >= g.target : g.type === "perder" ? cur <= g.target : false;
  let verdict = "ok";
  if (g.type !== "manter") { if (ratePct > G.hi * 1.02) verdict = "fast"; else if (ratePct < G.lo * 0.6) verdict = "slow"; }
  const healthyWeeks = g.type === "manter" ? 0 : Math.abs(total) / (g.start * G.hi / 100);
  // peso esperado hoje, se estivesse exatamente na rota
  const expected = g.start + total * timePct;
  return { g, G, cur, total, done, pct, timePct, daysTotal, daysLeft, planWeek, needWeek, ratePct, verdict, reached,
    healthyMonths: Math.ceil(healthyWeeks / 4.345), expected, weekLo: g.start * G.lo / 100, weekHi: g.start * G.hi / 100 };
}
function targets() {
  const E = energy(), I = goalInfo(), g = S.goal;
  let adjPct = 0, capped = false;
  if (g.type !== "manter" && !I.reached) {
    const raw = (g.target - I.cur) * 7700 / Math.max(I.daysLeft, 14) / E.tdee;
    if (g.type === "ganhar") { adjPct = clamp(raw, 0.05, 0.20); capped = raw > 0.20; }
    else { adjPct = clamp(raw, -0.25, -0.05); capped = raw < -0.25; }
  }
  const kcal = Math.round(E.tdee * (1 + adjPct) / 10) * 10;
  const prot = Math.round(E.w * I.G.prot);
  const fat = Math.round(kcal * 0.27 / 9);
  const carb = Math.round((kcal - prot * 4 - fat * 9) / 4);
  return { ...E, kcal, prot, fat, carb, adjPct, capped,
    fiber: Math.round(kcal / 1000 * 14), sugar10: Math.round(kcal * 0.10 / 4), sugar5: Math.round(kcal * 0.05 / 4),
    satFat: Math.round(kcal * 0.10 / 9), water: Math.round(E.w * 35 / 250), perMeal: Math.round(E.w * 0.4) };
}

/* ================= fichas de alimentação ================= */
const FICHAS = [
  { id: "cafe", n: "Café da manhã", at: p => toMin(p.wake) + 120, why: "Cerca de 25 g de proteína logo cedo. Pular essa refeição aparece como gatilho de dor de cabeça.", opts: [
    { t: "Vitamina completa", tag: "Pouca fome", k: 510, p: 33, i: [["Leite integral", 300, "ml"], ["Banana", 1, "un"], ["Aveia", 30, "g"], ["Whey", 25, "g"]] },
    { t: "Cuscuz com ovos e queijo", tag: "Mais sabor", k: 500, p: 28, i: [["Cuscuz de milho", 150, "g"], ["Ovos", 2, "un"], ["Queijo coalho", 50, "g"]] },
    { t: "Pão, ovos e café com leite", tag: "Clássico", k: 520, p: 26, i: [["Pão francês", 1, "un"], ["Ovos", 2, "un"], ["Queijo minas", 30, "g"], ["Café com leite", 200, "ml"]] } ] },
  { id: "lanche1", n: "Lanche da manhã", at: p => toMin(p.wake) + 300, why: "Segura a energia até o almoço sem pesar.", opts: [
    { t: "Banana com pasta de amendoim", tag: "Rápido", k: 270, p: 8, i: [["Banana", 1, "un"], ["Pasta de amendoim", 30, "g"]] },
    { t: "Sanduíche de frango", tag: "Mais proteína", k: 330, p: 20, i: [["Pão de forma", 2, "fatias"], ["Queijo", 1, "fatia"], ["Frango desfiado", 50, "g"]] },
    { t: "Iogurte com kiwi e chia", tag: "Intestino", k: 320, p: 10, i: [["Iogurte natural", 170, "g"], ["Kiwi", 2, "un"], ["Chia", 1, "col. sopa"], ["Mel", 1, "col. chá"]] } ] },
  { id: "almoco", n: "Almoço", at: p => toMin(p.wake) + 480, why: "A maior refeição do dia. O feijão entra pela fibra, ferro e magnésio; limão na salada ajuda a absorver o ferro.", opts: [
    { t: "Arroz, feijão e frango", tag: "Mais proteína", k: 720, p: 55, i: [["Arroz", 200, "g"], ["Frango grelhado", 150, "g"], ["Feijão", 140, "g"], ["Salada com azeite e limão"]] },
    { t: "Arroz, feijão e carne", tag: "Sua base", k: 750, p: 45, i: [["Arroz", 200, "g"], ["Carne bovina", 130, "g"], ["Feijão", 140, "g"], ["Salada com azeite e limão"]] },
    { t: "Macarrão com carne moída", tag: "Para variar", k: 720, p: 40, i: [["Macarrão cozido", 250, "g"], ["Carne moída", 120, "g"], ["Salada"]] } ] },
  { id: "treino", n: "Lanche do treino", at: p => toMin(p.wake) + 660, why: "Antes ou depois do treino. Sem café ou pré-treino com cafeína a esta hora.", opts: [
    { t: "Shake de whey com banana", tag: "Mais proteína", k: 310, p: 28, i: [["Whey", 25, "g"], ["Banana", 1, "un"], ["Aveia", 20, "g"]] },
    { t: "Pão com ovo e queijo", tag: "Salgado", k: 400, p: 20, i: [["Pão francês", 1, "un"], ["Ovos", 2, "un"], ["Queijo minas", 30, "g"]] },
    { t: "Vitamina de banana", tag: "Leve", k: 390, p: 11, i: [["Leite integral", 300, "ml"], ["Banana", 1, "un"], ["Mel", 1, "col. sopa"]] } ] },
  { id: "jantar", n: "Jantar", at: p => toMin(p.bed) - 120, why: "Última refeição grande, 2 horas antes de deitar.", opts: [
    { t: "Arroz, frango e legumes", tag: "Mais proteína", k: 600, p: 42, i: [["Arroz", 150, "g"], ["Frango", 120, "g"], ["Legumes refogados", 150, "g"]] },
    { t: "Cuscuz com carne de sol", tag: "Mais sabor", k: 560, p: 30, i: [["Cuscuz de milho", 150, "g"], ["Carne de sol", 80, "g"], ["Queijo coalho", 40, "g"]] },
    { t: "Omelete com pão", tag: "Rápido", k: 620, p: 30, i: [["Ovos", 3, "un"], ["Queijo", 30, "g"], ["Pão de forma", 2, "fatias"], ["Suco de laranja", 200, "ml"]] } ] },
  { id: "ceia", n: "Ceia leve", at: p => toMin(p.bed) - 45, why: "Pequena de propósito. Um lanche à noite foi associado a menos dor de cabeça no dia seguinte.", fixed: true, opts: [
    { t: "Iogurte com fruta", tag: "Leve", k: 190, p: 7, i: [["Iogurte natural", 170, "g"], ["Fruta", 1, "un"]] },
    { t: "Leite morno com torradas", tag: "Aconchego", k: 210, p: 9, i: [["Leite", 200, "ml"], ["Torradas", 2, "un"]] },
    { t: "Banana com pasta de amendoim", tag: "Rápido", k: 180, p: 5, i: [["Banana", 1, "un"], ["Pasta de amendoim", 15, "g"]] } ] }
];
const BASE_KCAL = FICHAS.reduce((s, f) => s + f.opts.reduce((a, o) => a + o.k, 0) / f.opts.length, 0);
const FIXED_KCAL = FICHAS.filter(f => f.fixed).reduce((s, f) => s + f.opts.reduce((a, o) => a + o.k, 0) / f.opts.length, 0);
function portion(T) { return clamp((T.kcal - FIXED_KCAL) / (BASE_KCAL - FIXED_KCAL), 0.6, 1.45); }
function scaleQty(q, u, f) {
  const v = q * f;
  if (u === "g") return v < 60 ? Math.max(5, Math.round(v / 5) * 5) : Math.round(v / 10) * 10;
  if (u === "ml") return Math.max(50, Math.round(v / 50) * 50);
  return Math.max(1, Math.round(v));
}
function optView(fi, o, f) {
  const k = fi.fixed ? 1 : f;
  return { ...o, kcal: Math.round(o.k * k / 10) * 10, prot: Math.round(o.p * k),
    items: o.i.map(([n, q, u]) => q ? `${n} · ${scaleQty(q, u, k)} ${u}` : n) };
}
function autoMin(fi) { return ((fi.at(effP()) % 1440) + 1440) % 1440; }
function mealPlan(T, all) {
  const f = portion(T), mt = S.profile.mealTimes || {}, off = S.profile.mealOff || {};
  return FICHAS.filter(fi => all || !off[fi.id]).map(fi => {
    const options = fi.opts.map((o, i) => {
      const v = optView(fi, o, f), key = fi.id + ":" + i, ov = S.fichas[key];
      v.key = key;
      if (ov && !ov.del) {
        if (ov.t) { v.t = ov.t; v.edited = true; }
        if (ov.tag != null) v.tag = ov.tag;
        if (ov.items) { v.items = ov.items; v.edited = true; }
        if (ov.k) { v.kcal = ov.k; v.edited = true; }
        if (ov.p != null && ov.p !== "") v.prot = ov.p;
        v.hidden = !!ov.hidden;
      }
      return v;
    });
    const vis = options.filter(o => !o.hidden), base = vis.length ? vis : options;
    const avg = Math.round(base.reduce((a, o) => a + o.kcal, 0) / base.length), avgP = Math.round(base.reduce((a, o) => a + o.prot, 0) / base.length);
    for (const cid in S.custom) { const c = S.custom[cid]; if (c && !c.del && c.meal === fi.id) options.push({ t: c.t, tag: c.tag || "Minha ficha", kcal: c.k || avg, prot: c.p != null ? c.p : avgP, items: c.items || (c.d ? [c.d] : []), cid }); }
    return { ...fi, min: mt[fi.id] ? toMin(mt[fi.id]) : autoMin(fi), auto: !mt[fi.id], off: !!off[fi.id], options, avg, avgP };
  }).sort((a, b) => a.min - b.min);
}
/* Registro de uma refeição: ficha pronta {i}, ficha minha {c} ou texto livre {t,k,p}; q = quanto comeu. */
const entryOf = (d, id) => { const v = d.meals[id]; return v == null ? null : typeof v === "number" ? { i: v, q: 1 } : v; };
function resolve(m, en) {
  if (!en) return null; const q = en.q || 1;
  const o = en.c ? m.options.find(x => x.cid === en.c) : en.i != null ? m.options[en.i] : null;
  if (o) return { t: o.t, kcal: Math.round(o.kcal * q), prot: Math.round(o.prot * q), q };
  if (en.t) return { t: en.t, kcal: en.k != null ? en.k : Math.round(m.avg * q), prot: en.p != null ? en.p : Math.round(m.avgP * q), q, free: true };
  return null;
}
const isChosen = (en, o, i) => !!en && (o.cid ? en.c === o.cid : (en.i === i && !en.c));
function eatenOn(k, plan) {
  const d = getDay(k); let kcal = 0, prot = 0, n = 0;
  for (const m of plan) { const r = resolve(m, entryOf(d, m.id)); if (r) { kcal += r.kcal; prot += r.prot; n++; } }
  return { kcal, prot, n };
}

/* ================= rotina de sono ================= */
function routine() {
  const p = effP(), W = toMin(p.wake), B = toMin(p.bed);
  return [
    { m: W, t: "Acordar", s: "Mesmo horário todo dia, inclusive fim de semana.", src: "Horário fixo de acordar é o ponto de partida das diretrizes para ajustar o relógio biológico (AASM)." },
    { m: W + 5, t: "Luz forte", s: "Luz do dia ou lâmpada forte logo ao acordar.", src: "Luz forte de manhã adianta o relógio e faz o sono chegar mais cedo; luz forte à noite atrasa (CDC, NHLBI)." },
    { m: B - 360, t: "Último café", s: "Cafeína só até 6 horas antes de deitar.", src: "400 mg de cafeína até 6 h antes de deitar ainda tiraram mais de 1 h de sono (Drake e colegas, 2013). O NICE é mais rígido: nada depois do meio-dia." },
    { m: B - 120, t: "Jantar", s: "Última refeição grande do dia.", src: "Evitar refeição grande nas 2 h antes de deitar (NICE, guia de insônia). Um lanche pequeno depois está liberado." },
    { m: B - 60, t: "Fim do treino pesado", s: "Exercício intenso fora da última hora.", src: "Exercício melhora a qualidade do sono (81 ensaios, 2024), mas o vigoroso na última hora antes de deitar atrapalha (NICE)." },
    { m: B - 45, t: "Modo noite", s: "Luzes baixas, telas interativas fora, ceia leve.", src: "Ler em tablet antes de dormir reduziu a melatonina em cerca de 55% e atrasou o relógio em 1h30 (PNAS, 2015)." },
    { m: B - 10, t: "Celular fora da cama", s: "Na cama, sem tela.", src: "O que mais tirou sono foi usar tela já na cama, principalmente jogo ou chat: cada 10 min de jogo, 17 min a menos de sono (JAMA Pediatrics, 2024)." },
    { m: B, t: "Dormir", s: `Meta: ${durLong(((W - B) + 1440) % 1440)} de sono.`, src: "Adultos: 7 horas ou mais por noite. Mais de 9 h pode ser adequado para quem está recuperando sono (AASM e Sleep Research Society)." }
  ].map(r => ({ ...r, m: ((r.m % 1440) + 1440) % 1440 })).sort((a, b) => a.m - b.m);
}
const sleepDur = e => ((toMin(e.wake) - toMin(e.bed)) + 1440) % 1440;
function sleepScore(e) {
  const p = S.profile, goal = Math.max(420, ((toMin(p.wake) - toMin(p.bed)) + 1440) % 1440 - 30);
  return Math.round(Math.min(1, sleepDur(e) / goal) * 60 + (e.q || 3) / 5 * 30 + (e.wakes === 0 ? 10 : e.wakes === 1 ? 5 : 0));
}
const goalDur = () => ((toMin(S.profile.wake) - toMin(S.profile.bed)) + 1440) % 1440;
const eveMin = m => (m < 720 ? m + 1440 : m); // horário de deitar contado a partir do meio-dia
const sd = a => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
function sleepAnalysis() {
  const N = lastNights(14).filter(x => x.e).map(x => x.e), L7 = lastNights(7).filter(x => x.e).map(x => x.e);
  const P7 = lastNights(14).slice(0, 7).filter(x => x.e).map(x => x.e);
  const need = Math.max(420, goalDur());
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const durs = N.map(sleepDur), beds = N.map(e => eveMin(toMin(e.bed))), wakesT = N.map(e => toMin(e.wake));
  const A = {
    n: N.length, avgDur: avg(durs), avgBed: avg(beds) % 1440, avgWake: avg(wakesT),
    sdBed: sd(beds), sdWake: sd(wakesT), debt: L7.reduce((s, e) => s + Math.max(0, need - sleepDur(e)), 0),
    pct7: N.length ? N.filter(e => sleepDur(e) >= 420).length / N.length : 0,
    lat: avg(N.filter(e => e.lat != null).map(e => e.lat)), latN: N.filter(e => e.lat != null).length,
    wakes: avg(N.map(e => e.wakes || 0)), q: avg(N.map(e => e.q || 0)),
    trend: L7.length >= 3 && P7.length >= 3 ? avg(L7.map(sleepDur)) - avg(P7.map(sleepDur)) : null, need, F: []
  };
  if (A.n < 3) return A;
  const F = A.F, reg = Math.max(A.sdBed, A.sdWake);
  if (A.avgDur < 360) F.push(["bad", "Você está dormindo pouco", `Média de ${dur(A.avgDur)} por noite. Abaixo de 6 h, o corpo não recupera e a fome e o cansaço aumentam.`, "Recomendação: 7 h ou mais (AASM)."]);
  else if (A.avgDur < 420) F.push(["warn", "Quase lá na duração", `Média de ${dur(A.avgDur)}. Faltam ${durLong(420 - A.avgDur)} por noite para as 7 h.`, "Recomendação: 7 h ou mais (AASM)."]);
  else F.push(["good", "Duração boa", `Média de ${dur(A.avgDur)} por noite, dentro da recomendação.`, "Recomendação: 7 h ou mais (AASM)."]);
  if (reg > 60) F.push(["bad", "Horários irregulares", `Seu horário varia cerca de ${Math.round(reg)} min de uma noite para outra. Isso confunde o relógio biológico.`, "Fixe o horário de acordar, inclusive no fim de semana."]);
  else if (reg > 30) F.push(["warn", "Horários um pouco soltos", `Variação de cerca de ${Math.round(reg)} min entre as noites.`, "Tente manter a diferença abaixo de 30 min."]);
  else F.push(["good", "Horários regulares", `Variação de só ${Math.round(reg)} min entre as noites.`, "Regularidade ajuda a pegar no sono mais rápido."]);
  const late = A.avgBed - eveMin(toMin(S.profile.bed));
  if (late > 45) F.push(["warn", `Deitando ${durLong(late)} depois da meta`, `Você deita em média às ${fromMin(A.avgBed)}; a meta é ${S.profile.bed}.`, "Adiante 15 a 30 min por vez, nunca tudo de uma vez."]);
  if (A.debt >= 300) F.push(["bad", "Débito de sono alto", `Faltaram ${durLong(A.debt)} para a sua meta de ${dur(A.need)} por noite, somando os últimos 7 dias.`, "Recupere aos poucos: deitar 30 min mais cedo por alguns dias."]);
  else if (A.debt >= 120) F.push(["warn", "Débito de sono", `Faltaram ${durLong(A.debt)} para a sua meta de ${dur(A.need)} por noite nos últimos 7 dias.`, "Pequenas compensações ajudam; o que mais conta é a regularidade."]);
  if (A.wakes >= 1) { const reasons = {}; N.forEach(e => (e.why || []).forEach(r => reasons[r] = (reasons[r] || 0) + 1)); const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    F.push([A.wakes >= 2 ? "bad" : "warn", "Despertares no meio da noite", `${fmt(A.wakes, 1)} por noite em média${top ? `; o mais comum é ${top[0].toLowerCase()}` : ""}.`, top && top[0] === "Banheiro" ? "Reduza líquidos na última hora antes de deitar." : "Em quem tem enxaqueca, cada despertar aumentou 17% a chance de crise no dia seguinte."]); }
  if (A.latN >= 3 && A.lat > 30) F.push(["warn", "Demora para pegar no sono", `Cerca de ${Math.round(A.lat)} min para dormir, em média.`, "Se não dormir em ~20 min, levante e volte com sono. Persistindo, a terapia TCC-I é o tratamento de 1ª linha."]);
  const sc = N.filter(e => e.screen && e.screen !== "nao"), ns = N.filter(e => e.screen === "nao");
  if (sc.length >= 2 && ns.length >= 2) { const dd = avg(ns.map(sleepDur)) - avg(sc.map(sleepDur)); if (dd > 10) F.push(["warn", "Tela na cama custa sono", `Nas noites com tela na cama você dormiu ${durLong(dd)} a menos.`, "Celular fora da cama é o hábito com mais efeito nos estudos."]); }
  return A;
}
function sleepTimesChart() {
  const p = S.profile, nights = lastNights(14);
  const W = 340, H = 170, L = 34, R = 6, top = 8, bot = 22, cw = (W - L - R) / nights.length;
  const t = m => ((m - 1080) + 1440) % 1440; // minutos a partir das 18h
  const y = m => top + (H - top - bot) * (t(m) / 1080);
  let g = "";
  [[1080, "18h"], [1320, "22h"], [120, "2h"], [360, "6h"], [600, "10h"]].forEach(([m, l]) => { g += `<line x1="${L}" x2="${W - R}" y1="${y(m)}" y2="${y(m)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(m) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${l}</text>`; });
  const tb = toMin(p.bed), tw = toMin(p.wake);
  g += `<rect x="${L}" y="${y(tb)}" width="${W - L - R}" height="${Math.max(0, y(tw) - y(tb))}" fill="var(--sleep)" opacity=".07"/>`;
  nights.forEach((n, i) => {
    const x = L + i * cw + cw * 0.25, bw = cw * 0.5;
    if (n.e) { const a = toMin(n.e.bed), b = toMin(n.e.wake); if (t(b) > t(a)) g += `<rect x="${x}" y="${y(a)}" width="${bw}" height="${y(b) - y(a)}" rx="${bw / 2}" fill="var(--sleep)"><title>${shortDate(n.k)}: ${n.e.bed} → ${n.e.wake}</title></rect>`; }
    const last = i === nights.length - 1;
    g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${last ? "var(--fg)" : "var(--muted)"}" font-weight="${last ? 700 : 400}">${WD[parseKey(n.k).getDay()][0].toUpperCase()}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Horário em que dormiu e acordou nas últimas 14 noites">${g}</svg></div>`;
}
function lastNights(n) { const out = [], t = new Date(); for (let i = n - 1; i >= 0; i--) { const k = keyOf(addDays(t, -i)); out.push({ k, e: sleepOf(k) }); } return out; }

/* ================= pontos, nível, sequência, conquistas ================= */
function habitList() {
  const p = effP();
  const list = [
    { id: "luz", n: "Luz forte ao acordar", ic: "sun" },
    { id: "cafe", n: `Café só até ${fromMin(toMin(p.bed) - 360)}`, ic: "cup" },
    { id: "treino", n: "Treinei hoje", ic: "dumb" }
  ];
  if (p.creatine) list.push({ id: "creatina", n: "Creatina 3–5 g", ic: "drop" });
  return list;
}
let _T = null, _plan = null;
function ctx() { if (!_T) { _T = targets(); _plan = mealPlan(_T); } return { T: _T, plan: _plan }; }
function dayScore(k) {
  const { T, plan } = ctx(), d = S.days[k], e = sleepOf(k);
  if (!d && !e) return 0;
  const day = getDay(k), eat = eatenOn(k, plan), H = habitList();
  const sl = e ? 25 * sleepScore(e) / 100 : 0;
  const me = 35 * eat.n / plan.length;
  const pr = eat.prot >= T.prot * 0.9 ? 10 : 10 * eat.prot / (T.prot * 0.9);
  const wa = 15 * Math.min(1, (day.water || 0) / T.water);
  const ha = 15 * H.filter(h => day.habits[h.id]).length / H.length;
  return Math.round(sl + me + pr + wa + ha);
}
const LEVELS = [[0, "Primeiro passo"], [200, "Pegando ritmo"], [500, "Constante"], [900, "Firme"], [1400, "Forte"], [2000, "Vigoroso"], [2800, "Incansável"], [3800, "Inabalável"], [5000, "Referência"], [6500, "Lenda da casa"]];
function activeDays() { return [...new Set([...Object.keys(S.days), ...Object.keys(S.sleep).filter(k => sleepOf(k))])].sort(); }
function progress() { const r = progress_(); progressCache = r; return r; }
function progress_() {
  const days = activeDays(); let xp = 0; const scores = {};
  for (const k of days) { scores[k] = dayScore(k); xp += scores[k]; }
  let lvl = 0; while (lvl + 1 < LEVELS.length && xp >= LEVELS[lvl + 1][0]) lvl++;
  const cur = LEVELS[lvl][0], nxt = LEVELS[lvl + 1] ? LEVELS[lvl + 1][0] : null;
  // sequência com perdão: uma falta a cada 7 dias não quebra
  let streak = 0, sinceMiss = 99, shieldUsed = false;
  const t = new Date(); let i = (scores[todayKey()] || 0) >= 50 ? 0 : 1;
  for (; i < 400; i++) {
    const k = keyOf(addDays(t, -i));
    if ((scores[k] || 0) >= 50) { streak++; sinceMiss++; }
    else if (streak > 0 && sinceMiss >= 6) { sinceMiss = 0; shieldUsed = true; }
    else break;
  }
  return { xp, lvl, name: LEVELS[lvl][1], cur, nxt, pct: nxt ? (xp - cur) / (nxt - cur) : 1, streak, shieldUsed, scores, days };
}
const BADGES = [
  { id: "noite1", n: "Primeira noite", ic: "moon", d: "Registrou uma noite de sono", ok: c => c.nights >= 1 },
  { id: "noite7", n: "7 noites", ic: "moon", d: "7 noites registradas", ok: c => c.nights >= 7 },
  { id: "sono7h", n: "Dorminhoco", ic: "star", d: "5 noites com 7 h ou mais", ok: c => c.nights7h >= 5 },
  { id: "semtela", n: "Cama sem tela", ic: "shield", d: "5 noites sem tela na cama", ok: c => c.noScreen >= 5 },
  { id: "dia1", n: "Dia completo", ic: "bowl", d: "Todas as fichas em um dia", ok: c => c.fullDays >= 1 },
  { id: "dia5", n: "5 dias cheios", ic: "bowl", d: "5 dias com todas as fichas", ok: c => c.fullDays >= 5 },
  { id: "agua7", n: "Hidratado", ic: "drop", d: "Meta de água em 7 dias", ok: c => c.waterDays >= 7 },
  { id: "peso1", n: "Na balança", ic: "scale", d: "Primeiro peso registrado", ok: c => c.weights >= 1 },
  { id: "kg1", n: "Primeiro quilo", ic: "target", d: "1 kg na direção da meta", ok: c => c.towards >= 1 },
  { id: "meio", n: "Meio caminho", ic: "target", d: "50% da meta de peso", ok: c => c.goalPct >= 0.5 },
  { id: "meta", n: "Meta batida", ic: "trophy", d: "Chegou no peso da meta", ok: c => c.reached },
  { id: "seq7", n: "7 em sequência", ic: "flame", d: "7 dias seguidos acima de 50 pontos", ok: c => c.streak >= 7 },
  { id: "seq30", n: "30 em sequência", ic: "flame", d: "30 dias seguidos", ok: c => c.streak >= 30 },
  { id: "nivel5", n: "Nível 5", ic: "star", d: "Chegou ao nível Forte", ok: c => c.lvl >= 4 },
  { id: "top", n: "Dia 90+", ic: "trophy", d: "Um dia com 90 pontos ou mais", ok: c => c.best >= 90 },
  { id: "mes", n: "Mês forte", ic: "trophy", d: "1.500 XP num mesmo mês", ok: c => c.monthXp >= 1500 },
  { id: "treino12", n: "12 treinos", ic: "dumb", d: "12 treinos marcados", ok: c => c.trains >= 12 }
];
function badgeCtx(P) {
  const { T, plan } = ctx(), I = goalInfo();
  const nights = Object.keys(S.sleep).map(sleepOf).filter(Boolean);
  const dayKeys = Object.keys(S.days);
  const dir = S.goal.type === "perder" ? -1 : 1;
  return {
    nights: nights.length, nights7h: nights.filter(e => sleepDur(e) >= 420).length, noScreen: nights.filter(e => e.screen === "nao").length,
    fullDays: dayKeys.filter(k => eatenOn(k, plan).n >= plan.length).length,
    waterDays: dayKeys.filter(k => (S.days[k].water || 0) >= T.water).length,
    trains: dayKeys.filter(k => S.days[k].habits && S.days[k].habits.treino).length,
    weights: weightList().length, towards: S.goal.type === "manter" ? 0 : (I.cur - S.goal.start) * dir,
    goalPct: S.goal.type === "manter" ? 0 : I.pct, reached: I.reached, streak: P.streak, lvl: P.lvl,
    best: Math.max(0, ...Object.values(P.scores)),
    monthXp: (() => { const n = new Date(), pre = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-`; let x = 0; for (const k in P.scores) if (k.startsWith(pre)) x += P.scores[k]; return x; })()
  };
}
const STREAK_MARKS = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
function checkBadges(P, silent) {
  const c = badgeCtx(P); const shows = [], n0 = Object.keys(S.badges).length;
  for (const b of BADGES) if (!S.badges[b.id] && b.ok(c)) { S.badges[b.id] = todayKey(); shows.push({ big: b.n, sub: "CONQUISTA DESBLOQUEADA", msg: `${b.d}. Que orgulho!`, icon: b.ic }); }
  for (const n of STREAK_MARKS) if (P.streak >= n && !S.badges["~s" + n]) { S.badges["~s" + n] = todayKey(); if (P.streak === n) shows.push({ big: String(n), sub: "DIAS SEGUIDOS", msg: n >= 30 ? "Isso já virou hábito. Muito orgulho de você!" : n >= 7 ? "Uma semana inteira! Continue assim." : "Começou a sequência. Amanhã tem mais!" }); }
  for (let l = 1; l <= P.lvl; l++) if (!S.badges["~l" + l]) { S.badges["~l" + l] = todayKey(); if (l === P.lvl) shows.push({ big: "Nível " + (l + 1), sub: LEVELS[l][1].toUpperCase(), msg: "Você subiu de nível! Seu mascote ficou mais forte." }); }
  if (!S.badges["~p" + todayKey()] && (P.scores[todayKey()] || 0) >= 85) { S.badges["~p" + todayKey()] = 1; shows.push({ big: String(P.scores[todayKey()]), sub: "XP HOJE · DIA REDONDO", msg: "Dia completo! Sono, comida e hábitos em dia." }); }
  if (Object.keys(S.badges).length !== n0) { lsWrite(); schedulePush(); }
  if (!silent) shows.slice(0, 2).forEach(x => party(x));
}
if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) window.__ssParty = party; // só para testes locais
const realBadges = () => BADGES.filter(b => S.badges[b.id]).length;
let partyQ = [];
function party(x) { partyQ.push(x); if (partyQ.length === 1) showParty(); }
function showParty() {
  const x = partyQ[0]; if (!x) return;
  const el = document.createElement("div"); el.className = "party"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="party-in"><div class="bubble">${esc(x.msg)}</div>
    <div class="party-star"><svg viewBox="0 0 200 190" aria-hidden="true"><path d="M100 8l26 56 61 7-45 42 12 60-54-30-54 30 12-60L13 71l61-7z" fill="#FFC93C" stroke="#FFE8A3" stroke-width="10" stroke-linejoin="round"/></svg><span class="sp s1">✦</span><span class="sp s2">✦</span><span class="sp s3">✦</span>${mascot("wow", 150, null, true)}</div>
    <div class="party-big num">${esc(x.big)}</div><div class="party-sub">${esc(x.sub)}</div>
    <button class="party-btn" data-party="ok">Bora!</button></div>`;
  document.body.appendChild(el); celebrate();
  el.querySelector("[data-party]").addEventListener("click", () => { el.remove(); partyQ.shift(); if (partyQ.length) setTimeout(showParty, 250); });
}

/* ================= insights ================= */
function insights() {
  const { T, plan } = ctx(), list = [];
  const nights = Object.keys(S.sleep).map(k => ({ k, ...(sleepOf(k) || {}) })).filter(n => n.bed);
  if (nights.length >= 4) {
    const w = nights.filter(n => n.wakes > 0), nw = nights.filter(n => !n.wakes);
    const rate = a => a.length ? a.filter(n => n.head).length / a.length : 0;
    if (w.length >= 2 && nw.length >= 2 && nights.some(n => n.head))
      list.push(`Dor de cabeça apareceu em ${Math.round(rate(w) * 100)}% das manhãs depois de noites com despertar, contra ${Math.round(rate(nw) * 100)}% nas noites diretas.`);
    const reasons = {}; nights.forEach(n => (n.why || []).forEach(r => reasons[r] = (reasons[r] || 0) + 1));
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) list.push(`O que mais te acorda até agora: ${top[0].toLowerCase()} (${top[1]} noites). ${top[0] === "Banheiro" ? "Vale reduzir líquidos na última hora." : top[0] === "Fome" ? "A ceia leve antes de deitar ajuda nisso." : top[0] === "Calor" ? "Quarto mais fresco costuma ajudar." : "Mais noites registradas mostram o padrão."}`);
    const sc = nights.filter(n => n.screen && n.screen !== "nao"), ns = nights.filter(n => n.screen === "nao");
    if (sc.length >= 2 && ns.length >= 2) {
      const avg = a => a.reduce((s, n) => s + sleepDur(n), 0) / a.length;
      list.push(`Noites com tela na cama: ${dur(avg(sc))} de sono em média. Sem tela: ${dur(avg(ns))}.`);
    }
    const l7 = lastNights(7).filter(x => x.e);
    if (l7.length >= 3) { const avg = l7.reduce((s, x) => s + sleepDur(x.e), 0) / l7.length;
      list.push(avg >= 420 ? `Média recente: ${dur(avg)} por noite, acima das 7 h recomendadas.` : `Média recente: ${dur(avg)} por noite. Faltam ${durLong(420 - avg)} para as 7 h recomendadas.`); }
  }
  const past = Object.keys(S.days).filter(k => k !== todayKey()).sort().slice(-7);
  if (past.length >= 3) list.push(`Você fez todas as fichas em ${past.filter(k => eatenOn(k, plan).n >= plan.length).length} dos últimos ${past.length} dias registrados.`);
  const I = goalInfo();
  if (S.goal.type !== "manter" && weightList().length >= 2) list.push(`Você está em ${fmt(I.cur, 1)} kg. Na rota da meta, hoje seria ${fmt(I.expected, 1)} kg.`);
  list.push(
    `Proteína rende mais dividida: cerca de ${T.perMeal} g em cada refeição, em 4 refeições ou mais.`,
    "Superávit maior não vira mais músculo. Acima de 15%, o ganho extra tende a ser gordura.",
    "Calorias líquidas (vitamina) não tiram a fome do resto do dia. Boa saída para quem acorda sem apetite.",
    "Creatina é o suplemento com mais evidência: 3 a 5 g por dia, todo dia, em qualquer horário.",
    "Kiwi (2 a 3 por dia) e feijão no almoço têm teste direto para o intestino.",
    "Luz forte ao acordar adianta o relógio biológico e faz o sono chegar mais cedo à noite.",
    "O que decide na balança é a média da semana, não o número de um dia.",
    "Cada despertar à noite aumentou em 17% a chance de dor de cabeça no dia seguinte, em quem tem enxaqueca."
  );
  return list;
}

/* ================= ícones ================= */
const svg = (d, s = 22, extra = "") => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const IC = {
  moon: s => svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', s),
  home: s => svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>', s),
  bowl: s => svg('<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4"/>', s),
  user: s => svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', s),
  target: s => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', s),
  flame: s => svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-1.800 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>', s),
  star: s => svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.300 1 6.100L12 17l-5.400 2.900 1-6.100-4.400-4.300 6.100-.9z"/>', s),
  sun: s => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400"/>', s),
  cup: s => svg('<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 5h-2M7 3v2M11 3v2"/>', s),
  dumb: s => svg('<path d="M6.500 6.500v11M17.500 6.500v11M3 9.500v5M21 9.500v5M6.500 12h11"/>', s),
  drop: s => svg('<path d="M12 3s6 6.500 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z"/>', s),
  scale: s => svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a5 5 0 0 1 8 0M12 9.500l1.500-2"/>', s),
  shield: s => svg('<path d="M12 3 4.500 6v6c0 4.500 3.200 7.700 7.500 9 4.300-1.300 7.500-4.500 7.500-9V6z"/>', s),
  trophy: s => svg('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.500a3.500 3.500 0 0 0 3.500 4M16 6h3.500a3.500 3.500 0 0 1-3.500 4M12 13v4M8.500 20h7M10 17h4"/>', s),
  check: s => `<svg width="${s || 15}" height="${s || 15}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>`,
  spark: () => '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.200 6.600L21 11l-6.800 2.400L12 20l-2.200-6.600L3 11l6.800-2.400z"/></svg>',
  cart: s => svg('<path d="M3 4h2l2.400 11.200a1 1 0 0 0 1 .800h9.200a1 1 0 0 0 1-.800L21 8H6.200"/><circle cx="9.500" cy="20" r="1.300"/><circle cx="17" cy="20" r="1.300"/>', s),
  edit: s => svg('<path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16z"/><path d="M13.500 6.500l4 4"/>', s),
  gear: s => svg('<path d="M12.220 2h-.440a2 2 0 0 0-2 2v.180a2 2 0 0 1-1 1.730l-.430.250a2 2 0 0 1-2 0l-.150-.080a2 2 0 0 0-2.730.730l-.220.380a2 2 0 0 0 .730 2.730l.150.100a2 2 0 0 1 1 1.720v.510a2 2 0 0 1-1 1.740l-.150.090a2 2 0 0 0-.730 2.730l.220.380a2 2 0 0 0 2.730.730l.150-.080a2 2 0 0 1 2 0l.430.250a2 2 0 0 1 1 1.730V20a2 2 0 0 0 2 2h.440a2 2 0 0 0 2-2v-.180a2 2 0 0 1 1-1.730l.430-.250a2 2 0 0 1 2 0l.150.080a2 2 0 0 0 2.730-.730l.220-.390a2 2 0 0 0-.730-2.730l-.150-.080a2 2 0 0 1-1-1.740v-.500a2 2 0 0 1 1-1.740l.150-.090a2 2 0 0 0 .730-2.730l-.220-.380a2 2 0 0 0-2.730-.730l-.150.080a2 2 0 0 1-2 0l-.430-.250a2 2 0 0 1-1-1.730V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>', s),
  cal: s => svg('<rect x="3" y="4.500" width="18" height="16.500" rx="3"/><path d="M3 9.500h18M8 2.500v4M16 2.500v4"/>', s),
  auto: s => svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>', s),
  up: () => svg('<path d="m6 15 6-6 6 6"/>', 18),
  down: () => svg('<path d="m6 9 6 6 6-6"/>', 18),
  plus: s => svg('<path d="M12 5v14M5 12h14"/>', s),
  arrowup: s => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', s),
  arrow: s => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s || 18)
};
const TABS = [["hoje", "Hoje", "home"], ["sono", "Sono", "moon"], ["comida", "Comida", "bowl"], ["compras", "Compras", "cart"], ["meta", "Meta", "target"], ["perfil", "Ajustes", "gear"]];

/* ================= controles fáceis: setas para horário, − e + para números ================= */
function tpick(name, value, opt) {
  opt = opt || {}; const step = opt.step || 5, empty = !value;
  const [h, m] = empty ? ["--", "--"] : value.split(":");
  return `<div class="tpick ${opt.small ? "sm" : ""}" data-step="${step}" data-def="${opt.def || "21:00"}">
    <input type="hidden" ${opt.id ? `id="${opt.id}"` : ""} ${name ? `name="${name}"` : ""} value="${value || ""}">
    <div class="tcol"><button type="button" data-tp="h+1" aria-label="Mais uma hora">${IC.up()}</button><b class="tv-h num">${h}</b><button type="button" data-tp="h-1" aria-label="Menos uma hora">${IC.down()}</button></div>
    <span class="tsep">:</span>
    <div class="tcol"><button type="button" data-tp="m+" aria-label="Mais ${step} minutos">${IC.up()}</button><b class="tv-m num">${m}</b><button type="button" data-tp="m-" aria-label="Menos ${step} minutos">${IC.down()}</button></div>
    ${opt.clear ? `<button type="button" class="tclear" data-tp="clear" ${empty ? "hidden" : ""}>Limpar</button>` : ""}
  </div>`;
}
function nstep(attrs, value, opt) {
  return `<div class="nstep" data-step="${opt.step}" data-min="${opt.min}" data-max="${opt.max}" data-dec="${opt.dec || 0}">
    <button type="button" data-ns="-1" aria-label="Diminuir">−</button><input ${attrs} type="text" inputmode="${opt.dec ? "decimal" : "numeric"}" autocomplete="off" value="${value}"><button type="button" data-ns="1" aria-label="Aumentar">+</button></div>`;
}
document.addEventListener("click", e => {
  const tb = e.target.closest("[data-tp]");
  if (tb) {
    const box = tb.closest(".tpick"), inp = box.querySelector("input"), step = +box.dataset.step, act = tb.dataset.tp;
    if (act === "clear") inp.value = "";
    else {
      let t = inp.value ? toMin(inp.value) : toMin(box.dataset.def);
      if (inp.value || act) {
        if (!inp.value) t = toMin(box.dataset.def);
        else if (act === "h+1") t += 60; else if (act === "h-1") t -= 60;
        else if (act === "m+") t = Math.floor(t / step) * step + step; else if (act === "m-") t = Math.ceil(t / step) * step - step;
      }
      inp.value = fromMin(t);
    }
    const [h, m] = inp.value ? inp.value.split(":") : ["--", "--"];
    box.querySelector(".tv-h").textContent = h; box.querySelector(".tv-m").textContent = m;
    const c = box.querySelector(".tclear"); if (c) c.hidden = !inp.value;
    inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
    e.preventDefault(); return;
  }
  const nb = e.target.closest("[data-ns]");
  if (nb) {
    const box = nb.closest(".nstep"), inp = box.querySelector("input"), dec = +box.dataset.dec;
    const cur = num(inp.value, -1e9, 1e9, +box.dataset.min);
    const v = clamp(Math.round((cur + +nb.dataset.ns * +box.dataset.step) * 10) / 10, +box.dataset.min, +box.dataset.max);
    inp.value = dec ? dec_(v) : String(Math.round(v));
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    e.preventDefault();
  }
}, true);
const dec_ = v => String(+(+v).toFixed(1)).replace(".", ",");

/* ================= mascote: Broto ================= */
let _mid = 0;
const STAGES = ["Semente", "Broto", "Muda", "Florzinha"];
const stageOf = lvl => Math.min(3, Math.floor((lvl + 1) / 2));
/* Rosto compartilhado pelos mascotes */
function face(mood, y, ink, gap) {
  gap = gap || 14; const L = 60 - gap, Rr = 60 + gap;
  const eyes = mood === "sleep" ? `<path d="M${L - 8} ${y}q8 6 16 0M${Rr - 8} ${y}q8 6 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : mood === "wow" ? `<circle cx="${L}" cy="${y}" r="8" fill="${ink}"/><circle cx="${Rr}" cy="${y}" r="8" fill="${ink}"/><circle cx="${L + 3}" cy="${y - 3}" r="2.800" fill="#fff"/><circle cx="${Rr + 3}" cy="${y - 3}" r="2.800" fill="#fff"/>`
    : mood === "calm" ? `<circle cx="${L}" cy="${y + 2}" r="4.800" fill="${ink}"/><circle cx="${Rr}" cy="${y + 2}" r="4.800" fill="${ink}"/><circle cx="${L + 1.500}" cy="${y + 0.500}" r="1.500" fill="#fff"/><circle cx="${Rr + 1.500}" cy="${y + 0.500}" r="1.500" fill="#fff"/>`
    : `<path d="M${L - 8} ${y + 3}q8-10 16 0M${Rr - 8} ${y + 3}q8-10 16 0" stroke="${ink}" stroke-width="4.500" fill="none" stroke-linecap="round"/>`;
  const my = y + 15;
  const mouth = mood === "sleep" ? `<ellipse cx="60" cy="${my + 2}" rx="3.500" ry="2.500" fill="${ink}"/>`
    : mood === "wow" || mood === "happy" ? `<path d="M50 ${my}q10 14 20 0z" fill="${ink}"/><path d="M54 ${my + 6}q6 4 12 0" fill="#FF7E86"/>`
    : `<path d="M54 ${my + 2}q6 5 12 0" stroke="${ink}" stroke-width="3.500" fill="none" stroke-linecap="round"/>`;
  const zz = mood === "sleep" ? `<text x="94" y="40" font-size="15" font-weight="700" fill="${ink}" opacity=".45" style="font-family:var(--f-display)">z</text><text x="104" y="28" font-size="11" font-weight="700" fill="${ink}" opacity=".3">z</text>` : "";
  const spark = mood === "wow" ? `<path d="M101 34l2.500 6 6 2.500-6 2.500-2.500 6-2.500-6-6-2.500 6-2.500z" fill="#FFC93C"/>` : "";
  return eyes + mouth + zz + spark;
}
const crown = st => st >= 3 ? `<path d="M46 26l5 9 9-11 9 11 5-9 2 16H44z" fill="#FFC93C"/><circle cx="60" cy="22" r="2.500" fill="#FF8FB0"/>` : "";
const blush = (y, gap) => `<ellipse cx="${60 - gap - 10}" cy="${y}" rx="7" ry="4.500" fill="#FF9AA8" opacity=".7"/><ellipse cx="${60 + gap + 10}" cy="${y}" rx="7" ry="4.500" fill="#FF9AA8" opacity=".7"/>`;
const PETS = {
  broto: { n: "Broto", d: "um brotinho que cresce com você" },
  chama: { n: "Chama", d: "um foguinho que não deixa a sequência apagar" },
  urso: { n: "Polar", d: "um ursinho calmo de cachecol" },
  pinguim: { n: "Pingo", d: "um pinguim que adora uma soneca" },
  dino: { n: "Dino", d: "um dinossaurinho cheio de energia" }
};
const PET_IDS = Object.keys(PETS);
const petId = () => PETS[S.profile.pet] ? S.profile.pet : "broto";
function petSVG(id, mood, st) {
  const ink = "#1E2A14", up = mood === "wow" || mood === "happy";
  if (id === "chama") return `<ellipse cx="60" cy="114" rx="30" ry="4" fill="#000" opacity=".1"/>
    <rect x="42" y="100" width="12" height="13" rx="6" fill="#F06A2A"/><rect x="66" y="100" width="12" height="13" rx="6" fill="#F06A2A"/>
    <path d="${up ? "M24 76q-10-6-10-18M96 76q10-6 10-18" : "M24 82q-8 6-8 14M96 82q8 6 8 14"}" stroke="#FF7A33" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M60 10c6 12 16 14 22 26 4-6 4-12 2-18 14 12 22 30 22 48 0 30-20 44-46 44S14 96 14 66c0-16 8-28 18-36 0 8 4 14 10 16-2-16 6-28 18-36z" fill="#FF8A3D"/>
    <path d="M60 46c14 8 26 22 26 38 0 18-12 24-26 24s-26-6-26-24c0-12 8-20 14-26 2 8 6 10 10 10-2-8 0-16 2-22z" fill="#FFB25C"/>
    ${crown(st)}${blush(80, 14)}${face(mood, 66, ink)}`;
  if (id === "urso") return `<ellipse cx="60" cy="114" rx="32" ry="4" fill="#000" opacity=".1"/>
    <circle cx="30" cy="34" r="12" fill="#F4EFE6"/><circle cx="90" cy="34" r="12" fill="#F4EFE6"/><circle cx="30" cy="34" r="6" fill="#FFC9D2"/><circle cx="90" cy="34" r="6" fill="#FFC9D2"/>
    <path d="${up ? "M20 80q-12-4-12-16M100 80q12-4 12-16" : "M20 86q-8 6-8 14M100 86q8 6 8 14"}" stroke="#EDE6DA" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="M60 24c26 0 44 20 44 46 0 26-14 42-44 42S16 96 16 70c0-26 18-46 44-46z" fill="#FFFDF8" stroke="#E8E1D4" stroke-width="2"/>
    <path d="M30 92l30 14 30-14-6 8-24 10-24-10z" fill="#C4F26A"/><path d="M34 90q26 16 52 0l-4 8q-22 12-44 0z" fill="#A8DE48"/>
    <ellipse cx="60" cy="74" rx="6" ry="4.500" fill="#3A2614"/>
    ${crown(st)}${blush(78, 16)}${face(mood, 62, ink, 18).replace(/<path d="M50 [^"]*z" fill="[^"]*"\/><path d="M54 [^"]*" fill="#FF7E86"\/>/, `<path d="M52 82q8 10 16 0z" fill="${ink}"/>`)}`;
  if (id === "pinguim") return `<ellipse cx="60" cy="114" rx="30" ry="4" fill="#000" opacity=".1"/>
    <ellipse cx="46" cy="110" rx="9" ry="5" fill="#FFA24C"/><ellipse cx="74" cy="110" rx="9" ry="5" fill="#FFA24C"/>
    <path d="${up ? "M22 66q-14-4-14-18M98 66q14-4 14-18" : "M22 70q-10 14-6 26M98 70q10 14 6 26"}" stroke="#A48BEA" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M60 18c26 0 40 24 40 52 0 28-14 40-40 40S20 98 20 70c0-28 14-52 40-52z" fill="#BBA6F4"/>
    <path d="M60 48c16 0 26 14 26 30 0 18-10 28-26 28S34 96 34 78c0-16 10-30 26-30z" fill="#F4F0FF"/>
    <path d="M55 74h10l-5 7z" fill="#FFA24C"/>
    ${crown(st)}${blush(72, 14)}${face(mood, 60, ink).replace(/<path d="M50 [^"]*z" fill="[^"]*"\/><path d="M54 [^"]*" fill="#FF7E86"\/>|<path d="M54 [^"]*" stroke="[^"]*" stroke-width="3.500" fill="none" stroke-linecap="round"\/>|<ellipse cx="60" cy="77"[^>]*\/>/, "")}`;
  if (id === "dino") return `<ellipse cx="60" cy="114" rx="34" ry="4" fill="#000" opacity=".1"/>
    <path d="M96 96q18 4 20-10-6 4-14 2z" fill="#FFC21A"/>
    <rect x="40" y="100" width="12" height="13" rx="6" fill="#F2B200"/><rect x="68" y="100" width="12" height="13" rx="6" fill="#F2B200"/>
    <path d="M42 26l6-12 6 12M56 22l6-13 6 13M70 26l6-12 6 12" fill="#FF8A3D"/>
    <path d="${up ? "M22 78q-12-4-12-16M98 78q12-4 12-16" : "M22 84q-8 6-8 14M98 84q8 6 8 14"}" stroke="#F7B800" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M60 22c26 0 42 20 42 46 0 28-14 42-42 42S18 96 18 68c0-26 16-46 42-46z" fill="#FFD43D"/>
    <path d="M60 70c14 0 24 8 24 20 0 12-10 18-24 18s-24-6-24-18c0-12 10-20 24-20z" fill="#FFF1B5"/>
    ${crown(st)}${blush(76, 16)}${face(mood, 60, ink, 16)}`;
  return null;
}
function mascot(mood, size, body, live, stage) {
  const pid = petId();
  if (pid !== "broto") { stage = stage == null ? stageOf(progressCache ? progressCache.lvl : 0) : stage;
    return `<svg class="mascot ${live ? "live" : ""}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">${petSVG(pid, mood, stage)}</svg>`; }
  const ink = "#1E3A16", g1 = body || "#A6E05F", g2 = "#C4EE8C", g3 = "#7FC646";
  stage = stage == null ? stageOf(progressCache ? progressCache.lvl : 0) : stage;
  const eyes = mood === "sleep" ? `<path d="M38 72q8 6 16 0M66 72q8 6 16 0" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : mood === "wow" ? `<circle cx="46" cy="70" r="8.500" fill="${ink}"/><circle cx="74" cy="70" r="8.500" fill="${ink}"/><circle cx="49" cy="67" r="3" fill="#fff"/><circle cx="77" cy="67" r="3" fill="#fff"/>`
    : mood === "calm" ? `<circle cx="46" cy="72" r="5" fill="${ink}"/><circle cx="74" cy="72" r="5" fill="${ink}"/><circle cx="47.500" cy="70.500" r="1.600" fill="#fff"/><circle cx="75.500" cy="70.500" r="1.600" fill="#fff"/>`
    : `<path d="M38 74q8-10 16 0M66 74q8-10 16 0" stroke="${ink}" stroke-width="4.500" fill="none" stroke-linecap="round"/>`;
  const mouth = mood === "sleep" ? `<ellipse cx="60" cy="88" rx="3.500" ry="2.500" fill="${ink}"/>`
    : mood === "wow" || mood === "happy" ? `<path d="M50 84q10 14 20 0z" fill="${ink}"/><path d="M54 90q6 4 12 0" fill="#FF7E86"/>`
    : `<path d="M54 86q6 5 12 0" stroke="${ink}" stroke-width="3.500" fill="none" stroke-linecap="round"/>`;
  const extra = mood === "sleep" ? `<text x="94" y="42" font-size="15" font-weight="700" fill="${ink}" opacity=".45" style="font-family:var(--f-display)">z</text><text x="104" y="30" font-size="11" font-weight="700" fill="${ink}" opacity=".3">z</text>`
    : mood === "wow" ? `<path d="M101 38l2.500 6 6 2.500-6 2.500-2.500 6-2.500-6-6-2.500 6-2.500z" fill="#FFC93C"/><circle cx="16" cy="56" r="3" fill="#FF8FB0"/>` : "";
  const sc = [0.6, 0.8, 1, 1][stage];
  const leaves = `<g transform="translate(60 40) scale(${sc}) translate(-60 -40)"><path d="M60 41c-2-13 5-23 19-26 2 13-5 22-19 26z" fill="#3E9E4B"/><path d="M60 41c0-12-7-20-20-22-1 13 6 21 20 22z" fill="#5CBF5A"/></g>`;
  const flower = stage >= 3 ? `<g transform="translate(79 17)">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-6" rx="4.500" ry="6.500" fill="#FF9EC0" transform="rotate(${a})"/>`).join("")}<circle r="4" fill="#FFD23F"/></g>` : "";
  const arms = mood === "wow" || mood === "happy"
    ? `<path d="M17 84q-11-4-12-16" stroke="${g3}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M103 84q11-4 12-16" stroke="${g3}" stroke-width="9" fill="none" stroke-linecap="round"/>`
    : `<path d="M17 88q-8 6-8 14" stroke="${g3}" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M103 88q8 6 8 14" stroke="${g3}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
  return `<svg class="mascot ${live ? "live" : ""}" width="${size}" height="${size}" viewBox="0 0 120 120" aria-hidden="true">
    <ellipse cx="60" cy="114" rx="32" ry="4" fill="#000" opacity=".1"/>
    ${leaves}${flower}${arms}
    <path d="M60 38c27 0 46 23 46 50 0 18-17 25-46 25S14 106 14 88c0-27 19-50 46-50z" fill="${g1}"/>
    <path d="M60 38c27 0 46 23 46 50 0 4-1 8-3 11-4-24-20-46-43-48-18-1-33 9-41 24 7-21 23-37 41-37z" fill="${g2}" opacity=".7"/>
    <ellipse cx="36" cy="84" rx="7" ry="4.500" fill="#FF9AA8" opacity=".75"/><ellipse cx="84" cy="84" rx="7" ry="4.500" fill="#FF9AA8" opacity=".75"/>
    ${eyes}${mouth}${extra}</svg>`;
}
let progressCache = null;
function moodNow(score) {
  const p = effP(), n = nowMin(), B = toMin(p.bed), W = toMin(p.wake);
  const asleep = B > W ? (n >= B || n < W) : (n >= B && n < W);
  return asleep ? "sleep" : score >= 85 ? "wow" : score >= 35 ? "happy" : "calm";
}

/* ================= foto de perfil ================= */
function avatar(cls) {
  const name = S.profile.name || (userEmail ? userEmail.split("@")[0] : "?");
  return S.profile.photo ? `<span class="${cls} has-photo"><img src="${S.profile.photo}" alt=""></span>` : `<span class="${cls}">${esc((name[0] || "?").toUpperCase())}</span>`;
}
function photoFrom(file) {
  return new Promise((ok, bad) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement("canvas"), n = 192; c.width = c.height = n; const g = c.getContext("2d"), m = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, n, n); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.82)); };
    img.onerror = () => { URL.revokeObjectURL(url); bad(); };
    img.src = url;
  });
}
document.addEventListener("change", async e => {
  if (e.target.id !== "photo-in" || !e.target.files || !e.target.files[0]) return;
  try { S.profile.photo = await photoFrom(e.target.files[0]); S.profile.u = Date.now(); commit(); render(); toast("Foto atualizada."); }
  catch (err) { toast("Não consegui abrir essa imagem. Tente outra."); }
});

/* ================= cena pintada (muda com a hora do dia) ================= */
function period() { const h = new Date().getHours(); return h < 5 || h >= 20 ? "night" : h < 8 ? "dawn" : h < 16 ? "day" : "dusk"; }
function scene(per) {
  const id = "sc" + (++_mid);
  const sky = { dawn: ["#FFC39C", "#FFE2BC", "#DCEFD6"], day: ["#9ED3EC", "#D4EEF0", "#EEF7DE"], dusk: ["#F1906F", "#F8C392", "#E9C1D2"], night: ["#121838", "#262C66", "#47468A"] }[per];
  const hl = per === "night" ? ["#2B3768", "#22405A", "#1C4A3A", "#163A2E"] : per === "dusk" ? ["#C6A3B8", "#97B27C", "#64A24E", "#4E8C3E"] : ["#B5D6C6", "#8CC67A", "#63B34C", "#4A9A3A"];
  const cl = per === "night" ? 0.12 : 0.78, sunC = per === "dusk" ? "#FFB27A" : "#FFE39A";
  const stars = per === "night" ? Array.from({ length: 22 }, (_, i) => `<circle cx="${(i * 97) % 600}" cy="${(i * 53) % 120 + 8}" r="${i % 3 ? 1 : 1.700}" fill="#fff" opacity="${0.4 + (i % 4) * 0.15}"/>`).join("") : "";
  const birds = per !== "night" ? `<g stroke="${per === "dusk" ? "#6A4A5A" : "#4F5A6A"}" stroke-width="1.700" fill="none" stroke-linecap="round" opacity=".7"><path d="M290 64q6-6 12 0q6-6 12 0"/><path d="M322 50q5-5 10 0q5-5 10 0"/><path d="M262 82q4-4 8 0q4-4 8 0"/></g>` : "";
  const grass = Array.from({ length: 34 }, (_, i) => { const x = 8 + i * 18 + (i % 3) * 4, y = 236 - (i % 5) * 3; return `<path d="M${x} ${y + 14}q${i % 2 ? 2 : -2} -8 ${i % 2 ? 5 : -3} -${12 + (i % 4) * 3}"/>`; }).join("");
  return `<svg class="scene" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".55" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <filter id="${id}p" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="12"/></filter>
    <filter id="${id}c" x="-20%" y="-40%" width="140%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="16"/><feGaussianBlur stdDeviation="1.400"/></filter>
    <radialGradient id="${id}g"><stop offset="0" stop-color="${per === "night" ? "#E8E6FF" : "#FFF4CF"}" stop-opacity=".9"/><stop offset="1" stop-color="#FFF4CF" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="260" fill="url(#${id}s)"/>
  <g filter="url(#${id}c)" opacity=".5"><path d="M0 40 C120 20 260 60 380 30 S560 10 600 30" stroke="#fff" stroke-width="18" fill="none" opacity=".35"/><path d="M40 110 C160 90 300 120 420 100" stroke="#fff" stroke-width="10" fill="none" opacity=".25"/></g>
  ${stars}
  <circle cx="455" cy="70" r="90" fill="url(#${id}g)"/>
  ${per === "night" ? `<circle cx="455" cy="68" r="20" fill="#F3EFD8"/><circle cx="465" cy="62" r="18" fill="${sky[1]}" opacity=".9"/>` : `<circle cx="455" cy="72" r="26" fill="${sunC}"/>`}
  <g filter="url(#${id}c)" fill="#fff" opacity="${cl}"><ellipse cx="110" cy="62" rx="46" ry="16"/><ellipse cx="148" cy="52" rx="34" ry="18"/><ellipse cx="180" cy="64" rx="38" ry="13"/><ellipse cx="350" cy="102" rx="40" ry="12"/><ellipse cx="382" cy="94" rx="26" ry="13"/><ellipse cx="560" cy="120" rx="34" ry="10"/></g>
  ${birds}
  <path filter="url(#${id}p)" d="M-10 172 C70 132 160 142 240 152 S420 118 610 140 V270 H-10z" fill="${hl[0]}"/>
  <path filter="url(#${id}p)" d="M-10 200 C90 160 200 176 300 186 S480 158 610 176 V270 H-10z" fill="${hl[1]}"/>
  <g filter="url(#${id}p)"><rect x="96" y="150" width="6" height="40" fill="#5A4030"/><circle cx="99" cy="148" r="18" fill="${hl[3]}"/><circle cx="86" cy="158" r="13" fill="${hl[2]}"/><circle cx="112" cy="156" r="14" fill="${hl[2]}"/></g>
  <path filter="url(#${id}p)" d="M-10 238 C120 212 260 224 360 220 S520 196 610 202 V270 H-10z" fill="${hl[2]}"/>
  <g stroke="${per === "night" ? "#2F6A4E" : "#9BD86E"}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7">${grass}</g>
  </svg>`;
}

/* ================= navegação ================= */
let tab = (location.hash || "").slice(1);
if (!TABS.some(t => t[0] === tab)) tab = "hoje";
let scrollTo = null;
window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (TABS.some(x => x[0] === t) && t !== tab) { tab = t; render(); if (!scrollTo) window.scrollTo(0, 0); } });
function go(t, anchor) { scrollTo = anchor || null; if (tab === t) { render(); } else location.hash = t; }

function renderTabs() {
  $("#tabs").innerHTML = TABS.map(([id, l, ic]) => `<a href="#${id}" data-t="${id}" class="t-${id} ${tab === id ? "on" : ""}" ${tab === id ? 'aria-current="page"' : ""}>${IC[ic](22)}<span>${l}</span></a>`).join("");
  const foot = $("#sidefoot"); if (!foot) return;
  const name = S.profile.name || (uid ? userEmail.split("@")[0] : "Sem conta");
  foot.innerHTML = `<div class="seg themeseg" data-seg="theme" aria-label="Aparência">${[["auto", "auto", "Automático"], ["light", "sun", "Claro"], ["dark", "moon", "Escuro"]].map(([v, ic, l]) => `<button type="button" class="${themePref() === v ? "on" : ""}" data-v="${v}" title="${l}" aria-label="${l}">${IC[ic](17)}</button>`).join("")}</div>
    <a class="sidelink ${tab === "perfil" ? "on" : ""}" href="#perfil">${IC.gear(20)}<span>Ajustes</span></a>
    <a class="acct" href="#perfil">${avatar("av")}<span class="at"><b>${esc(name)}</b><small id="sync2"></small></span></a>`;
}
const SYNC_TXT = { local: ["", "Só neste aparelho"], ok: ["ok", "Sincronizado"], busy: ["busy", "Sincronizando"], off: ["off", "Offline · salvo aqui"] };
function renderSync() {
  const [c, t] = SYNC_TXT[syncState];
  const el = $("#sync"); if (el) { el.className = "me " + c + (S.profile.photo ? " has-photo" : ""); el.title = t; el.setAttribute("aria-label", "Ajustes · " + t); }
  const s2 = $("#sync2"); if (s2) { s2.textContent = t; s2.className = c; }
}
function header(title, sub) {
  const date = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return `<header class="top"><div class="stack" style="gap:6px"><span class="sub">${sub || date}</span><h1>${title}</h1></div><button id="sync" class="me" data-a="go" data-t="perfil">${avatar("mei")}</button></header>`;
}
function ring(pct, size, color, inner, track) {
  const sw = Math.round(size / 11), r = size / 2 - sw / 2 - 1, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Math.round(pct * 100)} por cento" style="flex:0 0 auto">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track || "var(--surface2)"}" stroke-width="${sw}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .6s"/>${inner || ""}</svg>`;
}

/* ================= HOJE ================= */
/* Faixa com os 7 dias da semana do dia em edição; toque num dia para registrar nele. */
function weekStrip(k, P) {
  const base = parseKey(k), dow = (base.getDay() + 6) % 7, mon = addDays(base, -dow), t = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => keyOf(addDays(mon, i)));
  const label = parseKey(k).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return `<div class="wstrip">
    <div class="wshead"><b>${label[0].toUpperCase() + label.slice(1)}</b><div class="row" style="gap:6px">${k !== t ? `<button class="pillbtn" data-a="day" data-d="0">Hoje</button>` : ""}<button class="iconround" data-a="day" data-d="-7" aria-label="Semana anterior">‹</button><button class="iconround" data-a="day" data-d="7" aria-label="Próxima semana" ${days[6] >= t ? "disabled" : ""}>›</button><button class="pillbtn" data-a="cal">${IC.cal(15)} Calendário</button></div></div>
    <div class="wdays">${days.map(dk => { const d = parseKey(dk), sc = P.scores[dk] || 0, fut = dk > t;
      return `<button class="wday ${dk === k ? "on" : ""} ${dk === t ? "today" : ""}" data-a="pickday" data-k="${dk}" ${fut ? "disabled" : ""} aria-label="${dayLabel(dk)}"><small>${WD[d.getDay()]}</small><b class="num">${d.getDate()}</b><i class="${sc >= 80 ? "l3" : sc >= 50 ? "l2" : sc > 0 ? "l1" : ""}"></i></button>`; }).join("")}</div>
  </div>`;
}
function calSheet() {
  let ref = parseKey(curDay); ref = new Date(ref.getFullYear(), ref.getMonth(), 1);
  openSheet((s, box) => {
    const draw = () => {
      const P = progressCache || progress(), t = todayKey(), y = ref.getFullYear(), mo = ref.getMonth();
      const first = (new Date(y, mo, 1).getDay() + 6) % 7, n = new Date(y, mo + 1, 0).getDate();
      const cells = [...Array(first).fill(""), ...Array.from({ length: n }, (_, i) => keyOf(new Date(y, mo, i + 1)))];
      const name = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      box.innerHTML = `<div class="grab"></div><div class="row between"><h2>${name[0].toUpperCase() + name.slice(1)}</h2><div class="row" style="gap:6px"><button class="iconround" data-m="-1" aria-label="Mês anterior">‹</button><button class="iconround" data-m="1" aria-label="Próximo mês" ${keyOf(new Date(y, mo + 1, 1)) > t ? "disabled" : ""}>›</button></div></div>
        <div class="mcal">${["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map(w => `<span class="mw">${w}</span>`).join("")}
        ${cells.map(dk => { if (!dk) return `<span></span>`; const sc = P.scores[dk] || 0, fut = dk > t;
          return `<button class="mday ${sc >= 80 ? "l3" : sc >= 50 ? "l2" : sc > 0 ? "l1" : ""} ${dk === curDay ? "on" : ""} ${dk === t ? "today" : ""}" data-k="${dk}" ${fut ? "disabled" : ""}><b class="num">${parseKey(dk).getDate()}</b>${sc ? `<small class="num">${sc}</small>` : ""}</button>`; }).join("")}</div>
        <div class="legend"><span><i style="background:var(--surface2)"></i>sem registro</span><span><i style="background:var(--lime);opacity:.45"></i>começou</span><span><i style="background:var(--lime)"></i>50+ pontos</span><span><i style="background:var(--food)"></i>80+</span></div>
        <p class="small muted">Toque num dia para ver ou corrigir o que registrou nele.</p>`;
    };
    draw();
    s.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.m) { ref = new Date(ref.getFullYear(), ref.getMonth() + +b.dataset.m, 1); draw(); }
      else if (b.dataset.k) { curDay = b.dataset.k; dayPinned = curDay !== todayKey(); closeSheet(true); if (tab !== "hoje") go("hoje"); else render(); } });
  });
}
function renderHoje() {
  const { T, plan } = ctx(), p = S.profile, k = curDay, d = getDay(k), now = nowMin(), P = progress(), today = isToday();
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const name = p.name ? `, ${esc(p.name.split(" ")[0])}` : "";
  const score = P.scores[k] ?? dayScore(k);
  const eat = eatenOn(k, plan), H = habitList(), e = sleepOf(k);
  const msg = !today ? (score >= 85 ? "Foi um dia redondo." : score >= 60 ? "Foi um dia forte." : score > 0 ? "Dia registrado em parte." : "Nada registrado nesse dia.") : score >= 85 ? "Dia redondo. Bom trabalho." : score >= 60 ? "Dia forte. Falta pouco." : score >= 30 ? "Bom começo. Siga daí." : hour < 12 ? "Comece pela noite e pelo café." : "Ainda dá tempo de salvar o dia.";
  const daynav = weekStrip(k, P);

  const events = [...routine().map(r => ({ ...r, kind: "sleep" })), ...plan.map(m => ({ m: m.min, t: m.n, kind: "food", id: m.id }))].sort((a, b) => a.m - b.m);
  const nx = events.find(ev => ev.m > now && !(ev.kind === "food" && d.meals[ev.id] != null)) || { ...events[0], m: events[0].m + 1440 };
  const currentMeal = today ? [...plan].reverse().find(m => m.min <= now + 30 && d.meals[m.id] == null) : null;

  const sc = e ? sleepScore(e) : 0;
  const sleepRow = e
    ? `<button class="rowcard" data-a="sleep"><span class="ric sleep">${IC.moon(20)}</span><span class="rbody"><b>${durLong(sleepDur(e))} de sono</b><small class="num">${e.bed} → ${e.wake}${e.wakes ? ` · ${e.wakes} despertar${e.wakes > 1 ? "es" : ""}` : ""}</small></span><span class="pill ${sc >= 80 ? "good" : sc >= 60 ? "warn" : "bad"}">${sc} pts</span></button>`
    : `<button class="rowcard cta" data-a="sleep"><span class="ric sleep">${IC.moon(20)}</span><span class="rbody"><b>${today ? "Como você dormiu?" : "Registrar a noite desse dia"}</b><small>Leva 10 segundos</small></span><span class="chev">›</span></button>`;
  const nextRow = `<${nx.kind === "food" ? `button data-a="ficha" data-id="${nx.id}"` : "div"} class="rowcard"><span class="ric ${nx.kind === "food" ? "food" : "sleep"}">${nx.kind === "food" ? IC.bowl(20) : IC.sun(20)}</span><span class="rbody"><small>Próximo · em ${durLong(nx.m - now)}</small><b>${esc(nx.t)}</b></span><span class="clock num">${fromMin(nx.m)}</span></${nx.kind === "food" ? "button" : "div"}>`;
  const ins = insights(), insight = ins[hash(k) % ins.length];

  return `${header(`${hi}${name}`)}
  ${daynav}
  <div class="cols three">
   <div class="col">
    <section class="hero">
      ${mascot(moodNow(score), 104, null, true)}
      <div class="hero-top">
        ${ring(score / 100, 96, "#1E3A16", `<text x="48" y="53" text-anchor="middle" style="font-family:var(--f-display)" font-size="30" font-weight="600" fill="currentColor">${score}</text><text x="48" y="69" text-anchor="middle" font-size="10" opacity=".75" fill="currentColor">de 100</text>`, "rgba(30,58,22,.12)")}
        <div style="min-width:0"><div class="lbl">${today ? "Seu dia" : dayLabel(k)}</div><div class="big">${msg}</div></div>
      </div>
      <div class="hero-chips"><span class="hchip">${IC.flame(14)} ${P.streak} ${P.streak === 1 ? "dia seguido" : "dias seguidos"}</span><span class="hchip">Nível ${P.lvl + 1}</span></div>
    </section>
    ${sleepRow}
    ${today ? nextRow : ""}
    <div class="card">
      <div class="qrow"><span class="ql"><b>Água</b><small class="num">${d.water} de ${T.water} copos</small></span><div class="mini"><button data-a="water" data-d="-1" aria-label="Menos um copo">−</button><button class="plus" data-a="water" data-d="1" aria-label="Mais um copo">+</button></div></div>
      <div class="qrow"><span class="ql"><b>Intestino</b><small class="num">${d.gut} ${d.gut === 1 ? "vez" : "vezes"} hoje</small></span><div class="mini"><button data-a="gut" data-d="-1" aria-label="Menos uma">−</button><button class="plus" data-a="gut" data-d="1" aria-label="Mais uma">+</button></div></div>
      <div class="qrow col"><span class="ql"><b>Hábitos</b><small>${H.filter(h => d.habits[h.id]).length} de ${H.length} hoje</small></span>
        <div class="hpills">${H.map(h => `<button class="hpill ${d.habits[h.id] ? "on" : ""}" data-a="habit" data-id="${h.id}" aria-pressed="${!!d.habits[h.id]}">${d.habits[h.id] ? IC.check(14) : IC[h.ic](15)}${esc(h.n)}</button>`).join("")}</div></div>
    </div>
   </div>
   <div class="col">
    <div class="card">
      <div class="row between"><h2>Refeições</h2><a class="pillbtn" href="#comida">Ver fichas ${IC.arrow(14)}</a></div>
      <div><div class="bar" style="height:8px"><span style="width:${Math.min(100, eat.kcal / T.kcal * 100)}%"></span></div>
        <div class="mline" style="margin:8px 0 0"><span class="small muted num">${eat.n} de ${plan.length} · ${fmt(eat.kcal)} de ${fmt(T.kcal)} kcal</span><span class="small muted num">${fmt(eat.prot)} de ${fmt(T.prot)} g proteína</span></div></div>
      <div>${plan.map(m => { const o = resolve(m, entryOf(d, m.id));
        return `<button class="meal ${o ? "on" : ""}" data-a="ficha" data-id="${m.id}"><span class="check">${IC.check(15)}</span>
          <span class="meal-body"><span class="n">${m.n}${currentMeal && currentMeal.id === m.id ? '<span class="tagnow">agora</span>' : ""}</span><span class="d" style="display:${o ? "block" : "none"}">${o ? `${esc(o.t)}${o.q !== 1 && !o.free ? ` (${o.q < 1 ? "metade" : "repeti"})` : ""} · ${o.kcal} kcal` : ""}</span></span>
          <span class="t">${fromMin(m.min)}</span><span class="chev">›</span></button>`; }).join("")}</div>
    </div>
   </div>
   <div class="col side">
    <div class="card profile-panel desk">
      <a class="iconround pp-gear" href="#perfil" aria-label="Ajustes" title="Ajustes">${IC.gear(17)}</a>
      <div class="pp-top">${avatar("avatar xl")}<b class="pp-name">${esc(p.name || "Você")}</b><span class="pill">Nível ${P.lvl + 1} · ${P.name}</span></div>
      <div class="pp-stats">
        <a href="#meta"><span class="ic sleep">${IC.flame(18)}</span><b class="num">${P.streak}</b><small>dias seguidos</small></a>
        <a href="#meta"><span class="ic amber">${IC.star(18)}</span><b class="num">${fmt(P.xp)}</b><small>XP total</small></a>
        <a href="#meta"><span class="ic food">${IC.trophy(18)}</span><b class="num">${realBadges()}</b><small>conquistas</small></a>
      </div>
    </div>
    ${today ? `<div class="card tipcard"><span class="tipic">${IC.spark()}</span><div><b>Dica do dia</b><p>${esc(insight)}</p></div></div>` : ""}
   </div>
  </div>`;
}

/* ================= SONO ================= */
function sleepChart() {
  const p = S.profile, nights = lastNights(14);
  const W = 340, H = 150, L = 24, R = 6, top = 12, bot = 22, max = 600, cw = (W - L - R) / nights.length;
  const y = m => top + (H - top - bot) * (1 - Math.min(m, max) / max);
  const goal = ((toMin(p.wake) - toMin(p.bed)) + 1440) % 1440;
  let g = "";
  [0, 4, 8].forEach(h => { g += `<line x1="${L}" x2="${W - R}" y1="${y(h * 60)}" y2="${y(h * 60)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(h * 60) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${h}h</text>`; });
  nights.forEach((n, i) => {
    const x = L + i * cw + cw * 0.18, bw = cw * 0.64;
    if (n.e) { const m = sleepDur(n.e);
      g += `<rect x="${x}" y="${y(m)}" width="${bw}" height="${Math.max(2, y(0) - y(m))}" rx="4" fill="var(--sleep)" opacity="${m >= 420 ? 1 : 0.45}"><title>${shortDate(n.k)}: ${dur(m)}</title></rect>`;
      if (n.e.head) g += `<circle cx="${x + bw / 2}" cy="${y(m) - 7}" r="3" fill="var(--danger)"/>`;
    } else g += `<rect x="${x}" y="${y(0) - 2}" width="${bw}" height="2" rx="1" fill="var(--line)"/>`;
    const last = i === nights.length - 1;
    g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${last ? "var(--fg)" : "var(--muted)"}" font-weight="${last ? 700 : 400}">${WD[parseKey(n.k).getDay()][0].toUpperCase()}</text>`;
  });
  if (goal <= max) g += `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--food)" stroke-width="1.500" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(goal) - 5}" text-anchor="end" font-size="10" fill="var(--food)" font-weight="600">meta ${dur(goal)}</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas de sono nas últimas 14 noites">${g}</svg></div>`;
}
function renderSono() {
  const p = S.profile, now = nowMin(), E = effP();
  const n7 = lastNights(7).filter(x => x.e).map(x => x.e);
  const avg = n7.length ? n7.reduce((s, e) => s + sleepDur(e), 0) / n7.length : 0;
  const avgQ = n7.length ? n7.reduce((s, e) => s + (e.q || 0), 0) / n7.length : 0;
  const wakes = n7.length ? n7.reduce((s, e) => s + (e.wakes || 0), 0) / n7.length : 0;
  const head = n7.filter(e => e.head).length;
  const logs = Object.keys(S.sleep).filter(sleepOf).sort().reverse().slice(0, 12);
  const R = routine(), nextIdx = R.findIndex(r => r.m > now), A = sleepAnalysis();
  const reg = Math.round(Math.max(A.sdBed, A.sdWake));
  const analysis = A.n >= 3 ? `<div class="card">
      <div class="row between"><h2>Análise do sono</h2><span class="small muted">últimas ${A.n} noites</span></div>
      <div class="stats s4">
        <div class="stat"><div class="v num">${dur(A.avgDur)}</div><div class="l">média por noite</div></div>
        <div class="stat"><div class="v num">${A.debt ? dur(A.debt) : "0h"}</div><div class="l">abaixo da meta (7 dias)</div></div>
        <div class="stat"><div class="v num">±${reg}<small> min</small></div><div class="l">variação de horário</div></div>
        <div class="stat"><div class="v num">${Math.round(A.pct7 * 100)}%</div><div class="l">noites com 7 h+</div></div>
      </div>
      <div class="mline" style="margin:0"><span class="small muted num">Deita em média ${fromMin(A.avgBed)} · acorda ${fromMin(A.avgWake)}</span>${A.trend != null ? `<span class="small ${A.trend >= 0 ? "good-t" : "bad-t"} num">${A.trend >= 0 ? "+" : "−"}${durLong(Math.abs(A.trend))} vs semana anterior</span>` : ""}</div>
      <div class="findings">${A.F.map(([lv, t, d, src]) => `<div class="finding ${lv}"><i></i><div><b>${esc(t)}</b><p>${esc(d)}</p><span class="src">${esc(src)}</span></div></div>`).join("")}</div>
    </div>` : `<div class="card"><h2>Análise do sono</h2><p class="small muted">Com 3 noites registradas, aparece aqui o diagnóstico: média de sono, débito, regularidade dos horários, despertares e o que mais está pesando. ${A.n ? `Faltam ${3 - A.n}.` : ""}</p></div>`;
  const shift = E.left > 0 ? `<div class="card"><div class="row between"><span class="eyebrow">Transição até ${E.targetBed}</span><span class="small muted">faltam ~${E.daysLeft} dias</span></div>
      <div class="shift"><div><div class="tb">${E.bed}</div><div class="small muted">deitar hoje</div></div><div style="min-width:0"><b>Acordar às ${E.wake}</b><p class="small muted">15 minutos mais cedo a cada 2 dias.</p></div></div>
      <div class="bar" style="height:8px"><span style="width:${Math.max(4, (1 - E.left / E.total) * 100)}%;background:var(--sleep)"></span></div></div>` : "";
  return `${header("Sono", `Meta: deitar ${p.bed} · acordar ${p.wake}`)}
  <div class="cols">
   <div class="col">
    ${shift}
    <button class="btn sleep block" data-a="sleep" data-k="${todayKey()}">${IC.moon(20)} ${sleepOf(todayKey()) ? "Editar a noite de hoje" : "Registrar a noite de hoje"}</button>
    ${analysis}
    ${A.n ? `<div class="card"><div class="row between"><h2>Que horas você dorme</h2><span class="small muted">14 noites</span></div>${sleepTimesChart()}<div class="legend"><span><i style="background:var(--sleep)"></i>tempo na cama</span><span><i style="background:var(--sleep);opacity:.18"></i>sua meta (${S.profile.bed} → ${S.profile.wake})</span></div></div>` : ""}
    <div class="card">
      <div class="row between"><h2>Últimos 7 dias</h2><span class="small muted">${n7.length} de 7 noites</span></div>
      ${n7.length ? `<div class="stats">
        <div class="stat"><div class="v num">${dur(avg)}</div><div class="l">média por noite</div></div>
        <div class="stat"><div class="v num">${fmt(avgQ, 1)}<small>/5</small></div><div class="l">qualidade</div></div>
        <div class="stat"><div class="v num">${fmt(wakes, 1)}</div><div class="l">despertares</div></div>
      </div>` : `<p class="small muted">Registre a primeira noite para ver sua média, a qualidade e os despertares.</p>`}
      ${sleepChart()}
      <div class="legend"><span><i style="background:var(--sleep)"></i>7 h ou mais</span><span><i style="background:var(--sleep);opacity:.45"></i>menos de 7 h</span>${head ? `<span><i style="background:var(--danger);border-radius:50%"></i>dor de cabeça (${head})</span>` : ""}</div>
    </div>
    ${logs.length ? `<div class="card"><h2>Histórico</h2><div>${logs.map(k => { const e = sleepOf(k), d = parseKey(k), sc = sleepScore(e);
        return `<div class="log"><div class="dd"><b class="num">${d.getDate()}</b><span>${WD[d.getDay()]}</span></div>
          <div class="mid"><div class="row wrap" style="gap:8px"><b class="num">${durLong(sleepDur(e))}</b><span class="small muted num">${e.bed} → ${e.wake}</span></div>
          <div class="tags"><span class="pill ${sc >= 80 ? "good" : sc >= 60 ? "warn" : "bad"}">${sc} pts</span>${e.wakes ? `<span class="pill">${e.wakes} despertar${e.wakes > 1 ? "es" : ""}</span>` : ""}${e.head ? '<span class="pill bad">dor de cabeça</span>' : ""}${e.screen && e.screen !== "nao" ? '<span class="pill warn">tela na cama</span>' : ""}${(e.why || []).map(w => `<span class="pill">${esc(w)}</span>`).join("")}</div></div>
          <button class="btn sm ghost" data-a="sleep" data-k="${k}">Editar</button></div>`; }).join("")}</div></div>` : ""}
   </div>
   <div class="col">
    <div class="card">
      <div class="row between"><h2>Rotina de hoje</h2><a class="pillbtn" href="#perfil">${IC.edit(14)} Mudar horários</a></div>
      <p class="small muted" style="margin-top:-6px">Toque em um horário para ver o que dizem os estudos.</p>
      <div class="timeline">${R.map((r, i) => `<div class="tl ${r.m <= now ? "past" : ""} ${i === nextIdx ? "nextup" : ""}"><span class="h">${fromMin(r.m)}</span><span class="rail"><b></b></span><details class="x" ${i === nextIdx ? "open" : ""}><summary><strong>${r.t}</strong></summary><span>${r.s}</span><span class="why">${esc(r.src)}</span></details></div>`).join("")}</div>
      ${!p.bedNow ? `<p class="small muted">Ainda não dorme às ${p.bed}? Informe em <a href="#perfil">Ajustes</a> a hora em que dorme hoje, e o app adianta 15 minutos a cada 2 dias.</p>` : ""}
      <details><summary>De onde vem cada horário</summary><div class="stack">
        <p><b>Horário fixo de acordar</b> é a base. Para adiantar a hora de dormir, mude 15 a 30 minutos por vez.</p>
        <p><b>Luz forte de manhã</b> adianta o relógio; luz forte à noite atrasa. Se acordar antes do sol, use lâmpada forte.</p>
        <p><b>Cafeína</b>: 400 mg até 6 horas antes de deitar ainda atrapalharam o sono. A diretriz britânica (NICE) é mais rígida: nada depois do meio-dia.</p>
        <p><b>Tela na cama</b>, principalmente interativa (jogo, chat), foi o que mais pesou. Tela nas 2 horas antes, por si só, pesou pouco.</p>
        <p><b>Deitar cedo demais</b>, sem sono, favorece acordar de madrugada. Vá para a cama com sono.</p>
        <p class="src">Fontes: AASM/SRS, NICE CKS, Drake 2013 (JCSM), PNAS 2015, JAMA Pediatrics 2024, JAMA Netw Open 2025.</p>
      </div></details>
    </div>
   </div>
  </div>`;
}

/* ================= COMIDA (fichas) ================= */
function optCard(m, o, i, en) {
  const on = isChosen(en, o, i);
  return `<button class="opt ${on ? "on" : ""}" data-a="pick" data-id="${m.id}" data-i="${i}" aria-pressed="${on}">
    <span class="ob"><span class="letter">${"ABCDEFGH"[i] || "+"}</span>${o.tag ? `<span class="tag">${esc(o.tag)}${o.edited ? " · editada" : ""}</span>` : ""}</span>
    <span class="title">${esc(o.t)}</span>
    <ul>${o.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <span class="mac"><span>${o.kcal} kcal</span><span class="p">${o.prot} g proteína</span></span>
    <span class="pick">${on ? "Comi esta ✓" : "Marcar como feita"}</span></button>`;
}
let foodView = "fichas";
const shopItems = () => Object.keys(S.shop).filter(k => !S.shop[k].del).map(k => ({ id: k, ...S.shop[k] })).sort((a, b) => (a.done - b.done) || (a.c || 0) - (b.c || 0));
function shopAdd(t) {
  t = t.trim().slice(0, 60); if (!t) return false;
  if (shopItems().some(x => x.t.toLowerCase() === t.toLowerCase() && !x.done)) return false;
  const now = Date.now(); S.shop["s" + now.toString(36) + Math.random().toString(36).slice(2, 5)] = { t, done: 0, c: now, u: now }; return true;
}
/* Monta a lista a partir das fichas que você marcou nos últimos 7 dias (ou da opção A de cada refeição). */
function shopFromFichas() {
  const { plan } = ctx(), names = new Set(), add = o => (o.items || []).forEach(x => names.add(String(x).split(" · ")[0].replace(/ com azeite e limão/, "").trim()));
  for (let i = 0; i < 7; i++) { const d = getDay(keyOf(addDays(new Date(), -i)));
    for (const m of plan) { const en = entryOf(d, m.id); if (!en) continue; const o = en.c ? m.options.find(x => x.cid === en.c) : en.i != null ? m.options[en.i] : null; if (o) add(o); } }
  if (!names.size) plan.forEach(m => { const o = m.options.find(x => !x.hidden); if (o) add(o); });
  let n = 0; names.forEach(t => { if (t && shopAdd(t)) n++; });
  return n;
}
function renderCompras() {
  const items = shopItems(), todo = items.filter(x => !x.done), done = items.filter(x => x.done);
  const row = x => `<div class="shop ${x.done ? "done" : ""}"><button class="check" data-a="shop-toggle" data-id="${x.id}" aria-pressed="${!!x.done}" aria-label="Marcar ${esc(x.t)}">${IC.check(15)}</button><span class="st">${esc(x.t)}</span><button class="rm" data-a="shop-del" data-id="${x.id}" aria-label="Remover ${esc(x.t)}">×</button></div>`;
  return `<div class="card">
    <form id="shopf" class="row" autocomplete="off"><div class="field" style="flex:1"><label for="shop-in" class="eyebrow">O que precisa comprar</label><input id="shop-in" name="item" placeholder="Ex.: ovos, aveia, frango" maxlength="60" enterkeyhint="done"></div><button class="btn food" type="submit" style="align-self:flex-end">Adicionar</button></form>
    <button class="btn ghost block" data-a="shop-gen">Montar a partir das minhas fichas</button>
  </div>
  <div class="card"><div class="row between"><h2>Para comprar</h2><span class="small muted">${todo.length} ${todo.length === 1 ? "item" : "itens"}</span></div>
    ${todo.length ? `<div>${todo.map(row).join("")}</div>` : `<p class="small muted">${done.length ? "Tudo comprado." : "Sua lista está vazia. Adicione itens acima ou monte a partir das fichas: o app puxa os ingredientes do que você marcou nos últimos 7 dias."}</p>`}
  </div>
  ${done.length ? `<div class="card"><div class="row between"><h2>Já comprado</h2><button class="pillbtn" data-a="shop-clear">Limpar comprados</button></div><div>${done.map(row).join("")}</div></div>` : ""}`;
}
function renderComida() {
  const { T, plan } = ctx(), p = S.profile, d = getDay(), eat = eatenOn(curDay, plan), f = portion(T), I = goalInfo();
  const switcher = isToday() ? "" : `<div class="pastbar"><span>Registrando as refeições de <b>${dayLabel(curDay).toLowerCase()}</b></span><button class="link small" data-a="day" data-d="0">Voltar para hoje</button></div>`;
  const adjTxt = T.adjPct > 0 ? `${fmt(T.tdee)} de gasto + ${Math.round(T.adjPct * 100)}% para ganhar` : T.adjPct < 0 ? `${fmt(T.tdee)} de gasto − ${Math.round(-T.adjPct * 100)}% para perder` : `igual ao seu gasto estimado`;
  return `${header("Alimentação", `${I.G.label} · ${fmt(T.w, 1)} kg · treino ${p.train}×/sem`)}
  ${switcher}
  <div class="card">
    <div class="kcal-head"><div><div class="eyebrow">Meta diária</div><div class="v num">${fmt(T.kcal)}<small> kcal</small></div></div><span class="small muted num">${fmt(eat.kcal)} kcal · ${fmt(eat.prot)} g proteína ${isToday() ? "hoje" : dayLabel(curDay).toLowerCase()}</span></div>
    <div class="bar" style="height:9px"><span style="width:${Math.min(100, eat.kcal / T.kcal * 100)}%"></span></div>
    <details><summary>Macros e como calculamos</summary><div class="stack">
      <div class="targets">
        <div class="target"><div class="v num">${T.prot}<small> g</small></div><div class="l">Proteína</div></div>
        <div class="target"><div class="v num">${T.carb}<small> g</small></div><div class="l">Carboidrato</div></div>
        <div class="target"><div class="v num">${T.fat}<small> g</small></div><div class="l">Gordura</div></div>
        <div class="target"><div class="v num">${T.fiber}<small> g</small></div><div class="l">Fibra</div></div>
      </div>
      <p>Calorias: ${adjTxt}.${T.capped ? " O ajuste foi limitado à faixa segura." : ""} As porções das fichas já estão ajustadas para essa meta${Math.abs(f - 1) > 0.04 ? ` (${f > 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}% sobre a receita base)` : ""}.</p>
      <p>Gasto pela fórmula de Mifflin-St Jeor vezes o nível de treino. Limites: ganho de +5% a +20%, perda de −5% a −25%. Proteína: ${fmt(I.G.prot, 1)} g por kg (faixa dos estudos: 1,6 a 2,2), e só funciona com musculação.</p>
      <p class="src">Valores pela tabela TACO (Unicamp) e rótulos, aproximados. Fontes: ISSN, Morton 2018, Sports Medicine 2023, OMS, NICE, BDA 2025. Um nutricionista ajusta ao seu caso.</p>
    </div></details>
  </div>
  ${plan.map(m => `<section class="card" id="f-${m.id}">
    <div class="ficha-head"><div class="stack" style="gap:2px"><span class="time">${fromMin(m.min)}${m.auto ? "" : " · seu horário"}</span><h2>${m.n}</h2></div><div class="row" style="gap:8px">${d.meals[m.id] != null ? '<span class="pill good">Feita</span>' : ""}<button class="btn sm ghost" data-a="mealedit" data-id="${m.id}" aria-label="Editar fichas e horário de ${esc(m.n)}">${IC.edit(15)} Editar</button></div></div>
    <div class="opts">${m.options.map((o, i) => o.hidden ? "" : optCard(m, o, i, entryOf(d, m.id))).join("")}</div>
    <div class="ficha-foot"><span class="swipe-hint">Deslize para ver as ${m.options.filter(o => !o.hidden).length} opções</span><button class="btn sm ghost" data-a="ficha" data-id="${m.id}">Comi outra coisa</button></div>
  </section>`).join("")}
  <div class="card"><h2>Guia rápido</h2>
    <details><summary>Bons alimentos para o seu objetivo</summary><div class="stack"><div class="guide">${foodGuide(S.goal.type)}</div>
      <p>Nenhum alimento sozinho faz ganhar ou perder peso. O que decide é o total do dia; estes facilitam chegar nele.</p></div></details>
    <details><summary>Açúcar: quanto cabe no seu dia</summary><div class="stack">
      <p>Conta só o açúcar livre: o que você adiciona, mais mel, xarope e suco. Fruta inteira não entra.</p>
      <div class="eq">
        <div><span class="muted">Limite (10%)</span><b class="num">${T.sugar10} g</b>≈ ${Math.round(T.sugar10 / 4)} colheres de chá</div>
        <div><span class="muted">Ideal (5%)</span><b class="num">${T.sugar5} g</b>≈ ${Math.round(T.sugar5 / 4)} colheres de chá</div>
        <div><span class="muted">Café com 2 colheres</span><b class="num">~8 g</b>${Math.round(8 / T.sugar10 * 100)}% do limite</div>
        <div><span class="muted">Barrinha de chocolate</span><b class="num">~12 g</b>${Math.round(12 / T.sugar10 * 100)}% do limite</div>
        <div><span class="muted">Lata de refrigerante</span><b class="num">~35 g</b>${Math.round(35 / T.sugar10 * 100)}% do limite</div>
        <div><span class="muted">Na prática</span><b>1 doce</b>pequeno por dia cabe</div>
      </div>
      <p>Açúcar não dá energia que dura: em 31 estudos, as pessoas ficaram mais cansadas na primeira hora depois de comer. A exceção é logo após treino pesado.</p></div></details>
    <details><summary>Energia e intestino</summary><div class="stack" style="color:var(--fg)">
      <div class="tip">Proteína em todas as refeições: cerca de ${T.perMeal} g em cada.</div>
      <div class="tip">Sem fome de manhã? Vá de vitamina. Caloria líquida não tira a fome do resto do dia.</div>
      <div class="tip">Uma concha de feijão no almoço cobre um terço da fibra do dia.</div>
      <div class="tip">Kiwi: 2 a 3 por dia, por 4 semanas, tem teste direto para o intestino.</div>
      <div class="tip">Água: ${T.water} copos, cerca de ${fmt(T.w * 0.035, 1)} L por dia.</div>
      <div class="tip">Creatina: 3 a 5 g por dia, todo dia. Ative o lembrete em Ajustes, se usar.</div></div></details>
  </div>`;
}
function foodGuide(type) {
  const gain = `<div><h3><i style="background:var(--lime2)"></i>Para ganhar massa</h3><ul>
    <li><b>Cuscuz</b> com ovo, queijo ou carne</li><li><b>Arroz com feijão</b>, a base de sempre</li><li><b>Ovos, frango, carne, peixe</b> em toda refeição</li>
    <li><b>Leite integral, queijo, iogurte</b></li><li><b>Aveia, banana, pasta de amendoim</b></li><li><b>Vitaminas</b> no liquidificador, quando faltar fome</li></ul></div>`;
  const lose = `<div><h3><i style="background:var(--sleep)"></i>Para perder peso</h3><ul>
    <li><b>Frango, peixe, ovos, carne magra</b> seguram a fome</li><li><b>Feijão e lentilha</b>: fibra e proteína</li><li><b>Legumes e salada</b> em volume no prato</li>
    <li><b>Fruta inteira</b> no lugar de suco</li><li><b>Batata cozida, arroz</b> em porção menor</li><li><b>Iogurte natural</b> sem açúcar</li></ul></div>`;
  const avoid = `<div><h3><i style="background:var(--amber)"></i>Só de vez em quando</h3><ul>
    <li><b>Refrigerante e suco de caixinha</b></li><li><b>Biscoito recheado e salgadinho</b></li><li><b>Fritura</b> no dia a dia</li>
    <li><b>Doce</b> todo dia, mais de um</li><li><b>Embutidos</b>: salsicha, presunto, mortadela</li><li><b>Álcool</b>, que também piora o sono</li></ul></div>`;
  return type === "perder" ? lose + gain + avoid : gain + lose + avoid;
}

/* ================= META ================= */
function weightChart(I) {
  const w = weightList(), g = S.goal;
  const pts = w.filter(x => x.d >= g.startDate);
  const W = 340, H = 170, L = 34, R = 12, top = 16, bot = 24;
  const x0 = parseKey(g.startDate).getTime(), x1 = Math.max(parseKey(g.endDate).getTime(), Date.now());
  let lo = Math.min(g.start, g.target, ...pts.map(p => p.kg)), hi = Math.max(g.start, g.target, ...pts.map(p => p.kg));
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const x = t => L + (W - L - R) * clamp((t - x0) / Math.max(1, x1 - x0), 0, 1);
  const y = v => top + (H - top - bot) * (1 - (v - lo) / (hi - lo));
  let s = "";
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(v, 0)}</text>`; }
  if (g.type !== "manter") {
    s += `<line x1="${x(x0)}" y1="${y(g.start)}" x2="${x(parseKey(g.endDate).getTime())}" y2="${y(g.target)}" stroke="var(--amber)" stroke-width="2" stroke-dasharray="5 5"/>`;
    s += `<circle cx="${x(parseKey(g.endDate).getTime())}" cy="${y(g.target)}" r="5" fill="var(--surface)" stroke="var(--amber)" stroke-width="2.500"/>`;
    s += `<text x="${x(parseKey(g.endDate).getTime()) - 9}" y="${y(g.target) + (g.target > g.start ? -9 : 17)}" text-anchor="end" font-size="10.500" font-weight="600" fill="var(--amber)">meta ${fmt(g.target, 1)} kg</text>`;
  }
  const all = [{ d: g.startDate, kg: g.start }, ...pts.filter(p => p.d !== g.startDate)];
  const line = all.map(p => `${x(parseKey(p.d).getTime())},${y(p.kg)}`).join(" ");
  if (all.length > 1) s += `<polyline points="${line}" fill="none" stroke="var(--food)" stroke-width="2.500" stroke-linejoin="round" stroke-linecap="round"/>`;
  all.forEach((p, i) => { const last = i === all.length - 1; s += `<circle cx="${x(parseKey(p.d).getTime())}" cy="${y(p.kg)}" r="${last ? 5 : 3}" fill="${last ? "var(--food)" : "var(--surface)"}" stroke="var(--food)" stroke-width="2"/>`; });
  s += `<text x="${L}" y="${H - 6}" font-size="10" fill="var(--muted)">${shortDate(g.startDate)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--muted)">${shortDate(g.endDate)}</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso registrado e rota da meta">${s}</svg></div>
    <div class="legend"><span><i style="background:var(--food)"></i>seu peso</span>${g.type !== "manter" ? '<span><i style="background:var(--amber)"></i>rota da meta</span>' : ""}</div>`;
}
/* Desafio do mês: XP somado no mês corrente */
function monthChallenge(P) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), last = new Date(y, m + 1, 0).getDate();
  const pre = `${y}-${pad(m + 1)}-`; let xp = 0; for (const k in P.scores) if (k.startsWith(pre)) xp += P.scores[k];
  const goal = 1500, left = last - now.getDate(), done = xp >= goal;
  const mes = now.toLocaleDateString("pt-BR", { month: "long" });
  return `<section class="card challenge">
    <div class="ch-top"><div><span class="ch-tag">${mes.toUpperCase()}</span><h2>Desafio do mês</h2><p>Junte ${fmt(goal)} XP em ${mes} e ganhe a conquista Mês forte.</p></div>${mascot("wow", 84, null, false)}</div>
    <div class="ch-bar"><span style="width:${Math.min(100, Math.max(3, xp / goal * 100))}%"></span><i class="num">${fmt(Math.min(xp, goal))}/${fmt(goal)}</i></div>
    <div class="mline" style="margin:0"><b class="${done ? "good-t" : ""}">${done ? "Desafio completo!" : `Faltam ${fmt(goal - xp)} XP`}</b><span class="small muted">${left} ${left === 1 ? "dia restante" : "dias restantes"}</span></div>
  </section>`;
}
function petCard(P, week) {
  const { T, plan } = ctx(), k = todayKey(), d = getDay(k), eat = eatenOn(k, plan), H = habitList();
  const st = stageOf(P.lvl), nextSt = st < 3 ? STAGES[st + 1] : null;
  let needLvl = P.lvl; while (needLvl + 1 < LEVELS.length && stageOf(needLvl) === st) needLvl++;
  const toNext = nextSt && LEVELS[needLvl] ? Math.max(0, LEVELS[needLvl][0] - P.xp) : 0;
  const tasks = [
    ["Registrar a noite", !!sleepOf(k), 25], ["Fazer todas as refeições", eat.n >= plan.length, 35],
    ["Beber a água da meta", (d.water || 0) >= T.water, 15], ["Marcar todos os hábitos", H.every(h => d.habits[h.id]), 15], ["Bater a proteína do dia", eat.prot >= T.prot * 0.9, 10]
  ];
  return `<section class="pet">
    <div class="pet-top"><div><span class="eyebrow">Sequência</span><div class="pet-streak num">${P.streak}<small> ${P.streak === 1 ? "dia" : "dias"}</small></div></div><span class="pill">Nível ${P.lvl + 1} · ${P.name}</span></div>
    <div class="pet-hero"><button class="pet-arrow" data-a="pet" data-d="-1" aria-label="Mascote anterior">‹</button>${mascot(moodNow(P.scores[k] || 0), 150, null, true, st)}<button class="pet-arrow" data-a="pet" data-d="1" aria-label="Próximo mascote">›</button></div>
    <div class="pet-name">${PETS[petId()].n} <small>· ${STAGES[st]}</small></div>
    <div class="pet-bar"><span style="width:${Math.max(4, P.pct * 100)}%"></span></div>
    <p class="pet-sub">${nextSt ? `Faltam <b class="num">${fmt(toNext)} XP</b> para a forma ${nextSt.toLowerCase()}` : `Forma máxima. Continue cuidando dele.`}</p>
    <div class="week">${week.map(w => { const dd = parseKey(w.k), l = w.s >= 80 ? "l3" : w.s >= 50 ? "l2" : w.s > 0 ? "l1" : "";
      return `<div class="wd ${w.k === k ? "today" : ""}"><span>${WD[dd.getDay()][0].toUpperCase()}</span><div class="sq ${l}">${w.s >= 50 ? IC.check(13) : w.s || ""}</div></div>`; }).join("")}</div>
    <div class="pet-tasks"><b>Faça ${petId() === "chama" ? "a" : "o"} ${PETS[petId()].n} crescer hoje</b>${tasks.map(([t, ok, pts]) => `<div class="ptask ${ok ? "on" : ""}"><span class="pc">${ok ? IC.check(13) : ""}</span><span>${t}</span><small>+${pts} XP</small></div>`).join("")}</div>
  </section>
  ${monthChallenge(P)}`;
}
function renderMeta() {
  const { T } = ctx(), I = goalInfo(), g = S.goal, P = progress();
  const week = []; for (let i = 6; i >= 0; i--) { const k = keyOf(addDays(new Date(), -i)); week.push({ k, s: P.scores[k] || 0 }); }
  let alert = "";
  if (g.type !== "manter") {
    if (I.reached) alert = `<div class="alert good"><div><b>Meta batida.</b>Você chegou em ${fmt(I.cur, 1)} kg. As calorias voltaram para manutenção.</div></div>`;
    else if (I.verdict === "fast") alert = `<div class="alert"><div><b>Ritmo acima do recomendado.</b>${fmt(Math.abs(I.planWeek), 2)} kg por semana é ${fmt(I.ratePct, 1)}% do seu peso; a faixa dos estudos vai até ${fmt(I.G.hi, 1)}% (${fmt(I.weekHi, 2)} kg). ${g.type === "ganhar" ? "Acima disso, o que entra a mais é principalmente gordura." : "Acima disso, perde-se mais músculo."} Em ritmo saudável, leva cerca de ${I.healthyMonths} meses.</div></div>`;
    else if (I.verdict === "slow") alert = `<div class="alert good"><div><b>Ritmo bem tranquilo.</b>Dá para chegar antes, se quiser: a faixa saudável vai até ${fmt(I.weekHi, 2)} kg por semana.</div></div>`;
  }
  const onTrack = g.type === "manter" ? null : (g.type === "ganhar" ? I.cur >= I.expected - 0.3 : I.cur <= I.expected + 0.3);
  const got = BADGES.filter(b => S.badges[b.id]), locked = BADGES.filter(b => !S.badges[b.id]);
  const badge = b => `<div class="badge ${S.badges[b.id] ? "on" : ""}" title="${esc(b.d)}"><span class="b">${IC[b.ic](24)}</span>${esc(b.n)}</div>`;
  return `${header("Meta", g.type === "manter" ? "Manter o peso" : `${I.G.label.split(" ")[0]} ${fmt(Math.abs(I.total), 1)} kg até ${shortDate(g.endDate)}`)}
  <div class="cols">
   <div class="col">
    <div class="card">
      <div class="row between"><h2>Seu peso</h2><button class="pillbtn" data-a="goal">${IC.edit(14)} Editar meta</button></div>
      ${g.type === "manter" ? `<div class="row" style="gap:10px;align-items:baseline"><span class="score num" style="color:var(--amber)">${fmt(I.cur, 1)}</span><span class="muted">kg · manter</span></div>` : `
      <div class="goal-hero"><div><div class="k">${fmt(I.cur, 1)}<small> kg</small></div><div class="small muted">agora</div></div>
        <div class="arrow">${IC.arrow(20)}</div><div><div class="k" style="color:var(--amber)">${fmt(g.target, 1)}<small> kg</small></div><div class="small muted">meta</div></div></div>
      <div><div class="prog"><span style="width:${Math.max(2, I.pct * 100)}%"></span><i style="left:${I.timePct * 100}%" title="onde você deveria estar hoje"></i></div>
        <div class="mline" style="margin:8px 0 0"><span class="small muted num">${sign(I.done)} kg de ${sign(I.total)} · ${Math.round(I.pct * 100)}%</span><span class="small muted num">${I.daysLeft} dias restantes</span></div></div>
      <div class="stats">
        <div class="stat"><div class="v num">${fmt(Math.abs(I.needWeek), 2)}<small> kg</small></div><div class="l">por semana</div></div>
        <div class="stat"><div class="v num">${fmt(T.kcal)}</div><div class="l">kcal/dia</div></div>
        <div class="stat"><div class="v">${onTrack ? "Na rota" : "Atrás"}</div><div class="l">${onTrack ? "siga assim" : `esperado ${fmt(I.expected, 1)}`}</div></div>
      </div>`}
      ${alert}
      <button class="btn amber block" data-a="weight">${IC.scale(20)} Registrar peso</button>
    </div>
    <div class="card"><h2>Evolução</h2>${weightChart(I)}
      <p class="small muted">Pese-se de manhã, depois do banheiro, antes de comer. O que vale é a média da semana.</p></div>
   </div>
   <div class="col">
    ${petCard(P, week)}
    <div class="card"><div class="row between"><h2>Conquistas</h2><span class="small muted">${got.length} de ${BADGES.length}</span></div>
      <div class="badges">${[...got, ...locked].slice(0, 8).map(badge).join("")}</div>
      ${BADGES.length > 8 ? `<details><summary>Ver todas</summary><div class="badges" style="margin-top:14px">${[...got, ...locked].slice(8).map(badge).join("")}</div></details>` : ""}
    </div>
   </div>
  </div>`;
}

/* ================= PERFIL ================= */
function profileFields(p, prefix) {
  return `<div class="field"><label for="${prefix}-name">Nome</label><input id="${prefix}-name" name="name" value="${esc(p.name)}" placeholder="Como quer ser chamado" autocomplete="given-name"></div>
    <div class="field"><span class="lab">Sexo (muda a fórmula de gasto)</span><div class="seg" data-seg="sex"><button type="button" class="${p.sex === "m" ? "on" : ""}" data-v="m">Masculino</button><button type="button" class="${p.sex === "f" ? "on" : ""}" data-v="f">Feminino</button></div></div>
    <div class="grid3">
      <div class="field"><label for="${prefix}-age">Idade</label>${nstep(`id="${prefix}-age" name="age"`, p.age, { step: 1, min: 14, max: 90 })}</div>
      <div class="field"><label for="${prefix}-height">Altura (cm)</label>${nstep(`id="${prefix}-height" name="height"`, p.height, { step: 1, min: 130, max: 220 })}</div>
      <div class="field"><label for="${prefix}-weight">Peso (kg)</label>${nstep(`id="${prefix}-weight" name="weight"`, dec(currentWeight()), { step: 0.5, min: 35, max: 200, dec: 1 })}</div>
    </div>
    <div class="field"><label for="${prefix}-train">Treinos por semana</label><select id="${prefix}-train" name="train">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${+p.train === n ? "selected" : ""}>${n === 0 ? "Não treino" : n + "×"}</option>`).join("")}</select></div>
    <div class="grid2">
      <div class="field"><span class="lab">Quero dormir às</span>${tpick("bed", p.bed, { step: 15 })}</div>
      <div class="field"><span class="lab">Quero acordar às</span>${tpick("wake", p.wake, { step: 15 })}</div>
    </div>
    <div class="field"><span class="lab">Hoje costumo dormir às (opcional)</span>${tpick("bedNow", p.bedNow || "", { step: 15, clear: true, def: fromMin(toMin(p.bed) + 60) })}<span class="small muted">Se for mais tarde que a meta, o app adianta 15 minutos a cada 2 dias até chegar lá.</span></div>`;
}
function readProfile(f) {
  const v = n => f.querySelector(`[name="${n}"]`).value, seg = n => { const b = f.querySelector(`[data-seg="${n}"] .on`); return b ? b.dataset.v : null; };
  const p = S.profile, w = num(v("weight"), 35, 200, currentWeight());
  const bed = v("bed") || p.bed, bedNow = v("bedNow") || "";
  const shiftStart = bedNow && (bedNow !== p.bedNow || bed !== p.bed || !p.shiftStart) ? todayKey() : bedNow ? p.shiftStart : "";
  return { p: { ...p, name: v("name").trim().slice(0, 40), sex: seg("sex") || p.sex, age: num(v("age"), 14, 90, p.age), height: num(v("height"), 130, 220, p.height),
    weight: w, train: +v("train"), bed, wake: v("wake") || p.wake, bedNow, shiftStart }, w };
}
function setWeight(kg, k) { k = k || todayKey(); S.weights[k] = { kg: +kg.toFixed(1), u: Date.now() }; S.profile.weight = +kg.toFixed(1); S.profile.u = Date.now(); }

function renderPerfil() {
  const p = S.profile, T = ctx().T, I = goalInfo(), g = S.goal;
  const name = p.name || (uid ? userEmail.split("@")[0] : "Sem conta");
  const who = `<div class="row" style="gap:14px">${avatar("avatar lg")}<div class="stack" style="gap:6px;min-width:0"><b style="font-size:17px">${esc(name)}</b><span class="small muted">${uid ? esc(userEmail) : "Dados só neste aparelho"}</span>
    <div class="row" style="gap:8px;flex-wrap:wrap"><label class="pillbtn" for="photo-in">${IC.edit(14)} ${p.photo ? "Trocar foto" : "Colocar foto"}</label><input id="photo-in" type="file" accept="image/*" hidden>${p.photo ? `<button class="pillbtn" data-a="photo-rm">Remover</button>` : ""}</div></div></div>`;
  const acct = !HAS_CLOUD ? `${who}<p class="small muted">A sincronização ainda não foi configurada neste app.</p>`
    : uid ? `${who}<div class="setrow"><span>Sincronização</span><span class="small muted">${SYNC_TXT[syncState][1]}</span></div>
       <div class="row" style="gap:8px"><button class="btn sm ghost" style="flex:1" data-a="syncnow">Sincronizar agora</button><button class="btn sm ghost" style="flex:1" data-a="signout">Sair da conta</button></div>`
    : `${who}<p class="small muted">Entre para sincronizar celular e computador e não perder seus dados.</p><button class="btn sleep block" data-a="login">Entrar ou criar conta</button>`;
  return `${header("Ajustes", "Conta, aparência e seus dados")}
  <div class="cols">
   <div class="col">
    <div class="card"><h2>Conta</h2>${acct}</div>
    <div class="card"><h2>Seu mascote</h2><div class="petpick">${PET_IDS.map(id => { const cur = S.profile.pet; S.profile.pet = id; const svg = mascot("happy", 64, null, false); S.profile.pet = cur; return `<button class="pp ${petId() === id ? "on" : ""}" data-a="setpet" data-id="${id}" aria-pressed="${petId() === id}">${svg}<span>${PETS[id].n}</span></button>`; }).join("")}</div>
      <p class="small muted">Ele aparece na tela inicial, comemora suas conquistas e cresce com seu nível.</p></div>
    <div class="card"><h2>Aparência</h2>
      <div class="seg" data-seg="theme">${[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]].map(([v, l]) => `<button type="button" class="${themePref() === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div>
      <p class="small muted">Automático segue o modo do seu aparelho.</p></div>
    <form class="card" id="hf" autocomplete="off"><h2>Refeições e horários</h2>
      <p class="small muted" style="margin-top:-6px">Os horários automáticos seguem sua hora de acordar e de dormir. Mude o que quiser.</p>
      <div class="mlist">${mealPlan(T, true).map(m => `<div class="mrow"><label class="mcheck"><input type="checkbox" name="on-${m.id}" ${m.off ? "" : "checked"}><span>${esc(m.n)}</span></label>${tpick("t-" + m.id, fromMin(m.min), { step: 15, small: true })}</div>`).join("")}</div>
      <div class="row" style="gap:8px"><button class="btn block" type="submit" style="flex:1">Salvar horários</button><button class="btn ghost" type="button" data-a="autotimes">Automáticos</button></div>
    </form>
    <div class="card"><h2>Meta de peso</h2>
      <div class="setrow"><span>${g.type === "manter" ? "Manter o peso" : `${I.G.label} ${fmt(Math.abs(I.total), 1)} kg`}</span><span class="small muted">${g.type === "manter" ? "" : `até ${shortDate(g.endDate)}`}</span></div>
      <button class="btn ghost block" data-a="goal">Editar meta</button></div>
    <div class="card"><h2>Instalar em outro aparelho</h2><p class="small muted">Abra a página de downloads no outro aparelho e entre com a mesma conta.</p><a class="btn ghost block" href="../">Página de downloads</a></div>
   </div>
   <div class="col">
    <form class="card" id="pf" autocomplete="off"><h2>Seus dados</h2>${profileFields(p, "p")}
      <button type="button" class="toggle ${p.creatine ? "on" : ""}" data-a="creatine" aria-pressed="${!!p.creatine}"><span><b>Uso creatina</b><br><span class="small muted">Mostra o lembrete diário de 3 a 5 g</span></span><span class="sw"></span></button>
      <button class="btn block" type="submit">Salvar</button>
      <p class="small muted">Gasto estimado: <b class="num">${fmt(T.tdee)} kcal</b> por dia. Em repouso: <span class="num">${fmt(T.bmr)} kcal</span>.</p>
    </form>
    <p class="small muted" style="padding:0 4px">O Sempre Saudáveis organiza hábitos com base em estudos e diretrizes. Não substitui médico ou nutricionista. Dor de cabeça frequente, sempre do mesmo lado, ou com ronco e boca seca ao acordar pede avaliação médica.</p>
   </div>
  </div>`;
}

/* ================= sheets ================= */
let sheetState = null;
function openSheet(mount) {
  closeSheet(true);
  const s = document.createElement("div"); s.className = "scrim"; s.id = "scrim";
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"></div>`;
  s.addEventListener("click", e => { if (e.target === s) closeSheet(); });
  document.body.appendChild(s); document.body.style.overflow = "hidden";
  mount(s, s.querySelector(".sheet"));
}
function closeSheet(keep) { const s = $("#scrim"); if (s) s.remove(); document.body.style.overflow = ""; sheetState = null; if (!keep && pendingRender) { pendingRender = false; render(); } }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

const QUAL = ["Péssima", "Ruim", "Ok", "Boa", "Ótima"];
const WHY = ["Banheiro", "Calor", "Pensamentos", "Fome", "Barulho", "Sem motivo"];
function sleepSheet(k) {
  k = k || curDay;
  const p = effP(), ex = sleepOf(k), d = parseKey(k);
  openSheet((s, box) => {
    sheetState = ex ? clone(ex) : { bed: p.bed, wake: p.wake, q: 4, wakes: 0, head: false, why: [], screen: "nao" };
    sheetState.why = sheetState.why || []; sheetState.screen = sheetState.screen || "nao";
    const draw = () => { const st = sheetState;
      box.innerHTML = `<div class="grab"></div>
      <div class="row between"><div><span class="eyebrow">${d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}</span><h2>Como foi a noite?</h2></div><span class="pill sleep num" id="s-dur">${durLong(sleepDur(st))}</span></div>
      <div class="grid2"><div class="field"><span class="lab">Dormi às</span>${tpick("", st.bed, { id: "s-bed", step: 5 })}</div><div class="field"><span class="lab">Acordei às</span>${tpick("", st.wake, { id: "s-wake", step: 5 })}</div></div>
      <div class="field"><span class="lab">Quanto tempo para pegar no sono</span><div class="seg">${[[5, "< 10 min"], [15, "10–20"], [30, "20–40"], [50, "40+"]].map(([v, l]) => `<button type="button" class="${st.lat === v ? "on" : ""}" data-lat="${v}">${l}</button>`).join("")}</div></div>
      <div class="field"><span class="lab">Qualidade</span><div class="faces">${QUAL.map((q, i) => `<button type="button" class="${st.q === i + 1 ? "on" : ""}" data-q="${i + 1}"><b>${i + 1}</b>${q}</button>`).join("")}</div></div>
      <div class="field"><span class="lab">Acordei no meio da noite</span><div class="seg">${[0, 1, 2, 3].map(n => `<button type="button" class="${Math.min(3, st.wakes) === n ? "on" : ""}" data-w="${n}">${n === 0 ? "Não" : n === 3 ? "3+" : n + "×"}</button>`).join("")}</div></div>
      ${st.wakes ? `<div class="field"><span class="lab">O que te acordou?</span><div class="chips">${WHY.map(w => `<button type="button" class="${st.why.includes(w) ? "on" : ""}" data-why="${w}">${w}</button>`).join("")}</div></div>` : ""}
      <div class="field"><span class="lab">Tela na cama ontem</span><div class="seg">${[["nao", "Não"], ["passiva", "Vídeo"], ["interativa", "Jogo ou chat"]].map(([v, l]) => `<button type="button" class="${st.screen === v ? "on" : ""}" data-screen="${v}">${l}</button>`).join("")}</div></div>
      <button type="button" class="toggle ${st.head ? "on" : ""}" data-head="1" aria-pressed="${!!st.head}"><span><b>Acordei com dor de cabeça</b><br><span class="small muted">Mostra se ela acompanha os despertares</span></span><span class="sw"></span></button>
      <button class="btn sleep block" data-save="1">Salvar noite</button>
      ${ex ? `<button class="link small" style="color:var(--danger);align-self:center" data-del="1">Apagar este registro</button>` : ""}`; };
    draw();
    s.addEventListener("input", e => { if (e.target.id === "s-bed") sheetState.bed = e.target.value || sheetState.bed; if (e.target.id === "s-wake") sheetState.wake = e.target.value || sheetState.wake; const el = s.querySelector("#s-dur"); if (el) el.textContent = durLong(sleepDur(sheetState)); });
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b || !sheetState) return; const st = sheetState;
      if (b.dataset.lat) { st.lat = st.lat === +b.dataset.lat ? null : +b.dataset.lat; draw(); }
      else if (b.dataset.q) { st.q = +b.dataset.q; draw(); }
      else if (b.dataset.w) { st.wakes = +b.dataset.w; if (!st.wakes) st.why = []; draw(); }
      else if (b.dataset.why) { const w = b.dataset.why; st.why = st.why.includes(w) ? st.why.filter(x => x !== w) : [...st.why, w]; draw(); }
      else if (b.dataset.screen) { st.screen = b.dataset.screen; draw(); }
      else if (b.dataset.head) { st.head = !st.head; draw(); }
      else if (b.dataset.del) { if (b.dataset.confirm) { S.sleep[k] = { del: true, u: Date.now() }; commit(); closeSheet(true); render(); toast("Registro apagado"); } else { b.dataset.confirm = "1"; b.textContent = "Toque de novo para apagar"; } }
      else if (b.dataset.save) {
        const before = dayScore(k);
        S.sleep[k] = { bed: st.bed, wake: st.wake, q: st.q, wakes: st.wakes, head: !!st.head, why: st.why, screen: st.screen, lat: st.lat != null ? st.lat : null, u: Date.now() };
        commit(); closeSheet(true); render(); _T = null;
        const sc = sleepScore(S.sleep[k]), gain = dayScore(k) - before; if (gain > 0) xpPop(gain);
        toast(sc >= 80 ? `Noite salva · nota ${sc}. Ótimo começo.` : sc >= 60 ? `Noite salva · nota ${sc}.` : `Noite salva · nota ${sc}. Hoje vale caprichar no modo noite.`);
      }
    });
  });
}
function fichaSheet(id) {
  openSheet((s, box) => {
    let free = { q: 1, save: false };
    const draw = () => {
      _T = null; const { plan } = ctx(), m = plan.find(x => x.id === id), en = entryOf(getDay(), id), r = resolve(m, en);
      const mine = m.options.filter(o => o.cid);
      box.innerHTML = `<div class="grab"></div><div class="row between"><div><span class="eyebrow num">${isToday() ? fromMin(m.min) : dayLabel(curDay)}</span><h2>${m.n}</h2></div>${en ? `<button class="link small" data-clear="1">Desmarcar</button>` : ""}</div>
      ${r ? `<div class="card flat" style="padding:14px;gap:10px"><div class="row between wrap"><b>${esc(r.t)}</b><span class="small muted num">${r.kcal} kcal · ${r.prot} g proteína</span></div>
        ${r.free ? "" : `<div class="field"><span class="lab">Quanto você comeu?</span><div class="seg">${[[0.5, "Metade"], [1, "Tudo"], [1.5, "Repeti"]].map(([q, l]) => `<button type="button" class="${r.q === q ? "on" : ""}" data-q="${q}">${l}</button>`).join("")}</div></div>`}</div>` : ""}
      <div class="opts">${m.options.map((o, i) => o.hidden ? "" : optCard(m, o, i, en)).join("")}</div>
      <div class="card flat" style="padding:14px"><h3>Comi outra coisa</h3>
        <div class="field"><label for="fr-t">O que você comeu</label><input id="fr-t" placeholder="Ex.: 2 tapiocas com queijo e café" maxlength="80" value="${esc(free.t || "")}"></div>
        <div class="field"><span class="lab">Quanto</span><div class="seg">${[[0.6, "Pouco"], [1, "Normal"], [1.4, "Bastante"]].map(([q, l]) => `<button type="button" class="${free.q === q ? "on" : ""}" data-fq="${q}">${l}</button>`).join("")}</div></div>
        <div class="grid2"><div class="field"><label for="fr-k">Calorias (se souber)</label><input id="fr-k" type="number" inputmode="numeric" placeholder="Vazio = ≈ ${Math.round(m.avg * free.q)}" value="${free.k || ""}"></div>
          <div class="field"><label for="fr-p">Proteína em g (se souber)</label><input id="fr-p" type="number" inputmode="numeric" placeholder="Vazio = ≈ ${Math.round(m.avgP * free.q)}" value="${free.p || ""}"></div></div>
        <button type="button" class="toggle ${free.save ? "on" : ""}" data-fsave="1" aria-pressed="${free.save}"><span><b>Guardar como minha ficha</b><br><span class="small muted">Aparece como opção nesta refeição nos próximos dias</span></span><span class="sw"></span></button>
        <button class="btn food block" data-freg="1">Registrar</button></div>
      ${mine.length ? `<div class="field"><span class="lab">Minhas fichas (toque para remover)</span><div class="chips">${mine.map(o => `<button type="button" data-rm="${o.cid}">${esc(o.t)} ×</button>`).join("")}</div></div>` : ""}
      <div class="note">${esc(m.why)}</div>`; };
    const keep = () => { const g = q => box.querySelector(q); if (g("#fr-t")) { free.t = g("#fr-t").value; free.k = g("#fr-k").value; free.p = g("#fr-p").value; } };
    draw();
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation(); keep();
      const before = dayScore(curDay);
      if (b.dataset.clear) { editDay(d => { delete d.meals[id]; }); closeSheet(true); render(); }
      else if (b.dataset.a === "pick") { pickMeal(id, +b.dataset.i); closeSheet(true); render(); }
      else if (b.dataset.q) { editDay(d => { const en = entryOf(d, id); if (en) d.meals[id] = { ...en, q: +b.dataset.q }; }); draw(); }
      else if (b.dataset.fq) { free.q = +b.dataset.fq; draw(); }
      else if (b.dataset.fsave) { free.save = !free.save; draw(); }
      else if (b.dataset.rm) { if (b.dataset.confirm) { S.custom[b.dataset.rm] = { del: true, u: Date.now() }; commit(); draw(); } else { b.dataset.confirm = "1"; b.textContent = "Remover? Toque de novo"; } }
      else if (b.dataset.freg) {
        const t = (free.t || "").trim(); if (!t) { box.querySelector("#fr-t").focus(); return; }
        const k = num(free.k, 1, 5000, null), p = num(free.p, 0, 400, null);
        if (free.save) { const cid = "c" + Date.now().toString(36); const { plan } = ctx(), m = plan.find(x => x.id === id);
          S.custom[cid] = { meal: id, t, k: k != null ? Math.round(k) : Math.round(m.avg * free.q), p: p != null ? Math.round(p) : Math.round(m.avgP * free.q), u: Date.now() };
          editDay(d => { d.meals[id] = { c: cid, q: 1 }; }); }
        else editDay(d => { const en = { t, q: free.q }; if (k != null) en.k = Math.round(k); if (p != null) en.p = Math.round(p); d.meals[id] = en; });
        closeSheet(true); render(); toast(free.save ? "Registrado e guardado nas suas fichas." : "Registrado."); afterScore(before);
      }
    });
  });
}
function pickMeal(id, i) {
  const before = dayScore(curDay);
  const { plan } = ctx(), m = plan.find(x => x.id === id), o = m && m.options[i]; if (!o) return;
  let on = false;
  editDay(d => { const en = entryOf(d, id); if (isChosen(en, o, i)) delete d.meals[id]; else { d.meals[id] = o.cid ? { c: o.cid, q: 1 } : { i, q: 1 }; on = true; } });
  _T = null;
  if (on) { const c = ctx(), n = eatenOn(curDay, c.plan).n;
    toast(n >= c.plan.length ? "Todas as refeições do dia. Fechou." : pickMsg(n, c.plan.length));
    afterScore(before); }
}
/* Editar as fichas e o horário de uma refeição */
function mealEditSheet(id) {
  openSheet((s, box) => {
    const draw = () => {
      _T = null; const { T } = ctx(), m = mealPlan(T, true).find(x => x.id === id), fi = FICHAS.find(x => x.id === id);
      box.innerHTML = `<div class="grab"></div><div><span class="eyebrow">Personalizar</span><h2>${m.n}</h2></div>
      <div class="grid2"><div class="field"><span class="lab">Horário</span>${tpick("", fromMin(m.min), { id: "me-time", step: 15 })}</div>
        <div class="field"><span class="lab">&nbsp;</span>${m.auto ? `<span class="small muted autohint" style="padding-top:12px">Automático, pelo seu horário de acordar e dormir. Use as setas para mudar.</span>` : `<button class="btn ghost" data-autotime="1">Voltar ao automático (${fromMin(autoMin(fi))})</button>`}</div></div>
      <div class="field"><span class="lab">Fichas desta refeição</span><div class="elist">${m.options.map((o, i) => `<div class="erow ${o.hidden ? "off" : ""}"><span class="et"><b>${esc(o.t)}</b><small class="num">${o.kcal} kcal · ${o.prot} g proteína${o.hidden ? " · escondida" : o.cid ? " · sua" : o.edited ? " · editada" : ""}</small></span>
        <button class="btn sm ghost" data-edit="${o.cid ? "c:" + o.cid : o.key}">Editar</button>${o.cid ? "" : `<button class="btn sm ghost" data-hide="${o.key}">${o.hidden ? "Mostrar" : "Esconder"}</button>`}</div>`).join("")}</div></div>
      <button class="btn food block" data-new="1">+ Nova ficha</button>
      <button type="button" class="toggle" data-off="1"><span><b>Não faço esta refeição</b><br><span class="small muted">Some do plano. Dá para religar em Ajustes.</span></span><span class="sw"></span></button>`;
    };
    draw();
    let tt = null;
    s.addEventListener("change", e => { if (e.target.id === "me-time" && e.target.value) { const v = e.target.value; clearTimeout(tt); tt = setTimeout(() => { S.profile.mealTimes = { ...(S.profile.mealTimes || {}), [id]: v }; S.profile.u = Date.now(); commit(); render(); const hint = box.querySelector(".autohint"); if (hint) hint.textContent = "Horário salvo"; }, 500); } });
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      if (b.dataset.autotime) { const mt = { ...(S.profile.mealTimes || {}) }; delete mt[id]; S.profile.mealTimes = mt; S.profile.u = Date.now(); commit(); draw(); render(); }
      else if (b.dataset.hide) { const k = b.dataset.hide, cur = S.fichas[k] && !S.fichas[k].del ? S.fichas[k] : {}; const { del, ...rest } = cur; S.fichas[k] = { ...rest, hidden: !cur.hidden, u: Date.now() }; commit(); draw(); render(); }
      else if (b.dataset.edit) { fichaEditSheet(id, b.dataset.edit); }
      else if (b.dataset.new) { fichaEditSheet(id, null); }
      else if (b.dataset.off) { S.profile.mealOff = { ...(S.profile.mealOff || {}), [id]: true }; S.profile.u = Date.now(); commit(); closeSheet(true); render(); toast("Refeição tirada do plano. Para religar, vá em Ajustes."); }
    });
  });
}
function fichaEditSheet(mealId, ref) {
  _T = null; const { T } = ctx(), m = mealPlan(T, true).find(x => x.id === mealId);
  const isCustom = ref && ref.startsWith("c:"), cid = isCustom ? ref.slice(2) : null;
  const o = ref ? m.options.find(x => (cid ? x.cid === cid : x.key === ref)) : null;
  const cur = o || { t: "", tag: "", items: [], kcal: m.avg, prot: m.avgP };
  openSheet((s, box) => {
    box.innerHTML = `<div class="grab"></div><div><span class="eyebrow">${esc(m.n)}</span><h2>${ref ? "Editar ficha" : "Nova ficha"}</h2></div>
      <div class="field"><label for="fe-t">Nome</label><input id="fe-t" maxlength="60" value="${esc(cur.t)}" placeholder="Ex.: Tapioca com frango"></div>
      <div class="field"><label for="fe-items">Ingredientes, um por linha</label><textarea id="fe-items" rows="5" placeholder="Tapioca · 2 un&#10;Frango desfiado · 80 g&#10;Queijo · 1 fatia">${esc((cur.items || []).join("\n"))}</textarea></div>
      <div class="grid3"><div class="field"><label for="fe-k">Calorias</label><input id="fe-k" type="number" inputmode="numeric" value="${cur.kcal || ""}"></div>
        <div class="field"><label for="fe-p">Proteína (g)</label><input id="fe-p" type="number" inputmode="numeric" value="${cur.prot != null ? cur.prot : ""}"></div>
        <div class="field"><label for="fe-tag">Etiqueta</label><input id="fe-tag" maxlength="18" value="${esc(cur.tag || "")}" placeholder="Opcional"></div></div>
      <p class="small muted">Não sabe as calorias? Deixe o valor sugerido; dá para ajustar depois.</p>
      <button class="btn food block" data-save="1">Salvar ficha</button>
      ${ref && !isCustom && o && o.edited ? `<button class="btn ghost block" data-restore="1">Restaurar a ficha original</button>` : ""}
      ${isCustom ? `<button class="link small" style="color:var(--danger);align-self:center" data-del="1">Apagar esta ficha</button>` : ""}`;
    setTimeout(() => box.querySelector("#fe-t").focus(), 60);
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; e.stopPropagation();
      const g = q => box.querySelector(q).value.trim();
      if (b.dataset.save) {
        const t = g("#fe-t"); if (!t) { box.querySelector("#fe-t").focus(); return; }
        const items = g("#fe-items").split("\n").map(x => x.trim()).filter(Boolean).slice(0, 12);
        const rec = { t, tag: g("#fe-tag"), items, k: Math.round(num(g("#fe-k"), 1, 5000, m.avg)), p: Math.round(num(g("#fe-p"), 0, 400, m.avgP)), u: Date.now() };
        if (isCustom) S.custom[cid] = { ...S.custom[cid], ...rec, meal: mealId };
        else if (ref) { const prev = S.fichas[ref] && !S.fichas[ref].del ? S.fichas[ref] : {}; S.fichas[ref] = { ...prev, ...rec }; }
        else S.custom["c" + Date.now().toString(36)] = { ...rec, meal: mealId };
        commit(); closeSheet(true); render(); mealEditSheet(mealId); toast("Ficha salva.");
      } else if (b.dataset.restore) { const hidden = S.fichas[ref] && S.fichas[ref].hidden; S.fichas[ref] = hidden ? { hidden: true, u: Date.now() } : { del: true, u: Date.now() }; commit(); closeSheet(true); render(); mealEditSheet(mealId); toast("Ficha original de volta."); }
      else if (b.dataset.del) { if (b.dataset.confirm) { S.custom[cid] = { del: true, u: Date.now() }; commit(); closeSheet(true); render(); mealEditSheet(mealId); toast("Ficha apagada."); } else { b.dataset.confirm = "1"; b.textContent = "Toque de novo para apagar"; } }
    });
  });
}
function pickMsg(n, t) { const a = [`${n} de ${t} refeições feitas`, `Boa. Faltam ${t - n} para fechar o dia`, `Registrado. ${n} de ${t}`]; return a[(n + new Date().getDate()) % a.length]; }
function afterScore(before) { _T = null; const now = dayScore(curDay); if (now > before) xpPop(now - before); }
function xpPop(n) {
  const el = document.createElement("div"); el.className = "xppop"; el.textContent = `+${n} XP`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 1400);
}

function weightSheet() {
  openSheet((s, box) => {
    box.innerHTML = `<div class="grab"></div><div><span class="eyebrow">Peso de hoje</span><h2>Quanto você pesa?</h2></div>
      <div class="field"><label for="w-kg">Peso em kg</label>${nstep(`id="w-kg"`, dec(currentWeight()), { step: 0.1, min: 30, max: 250, dec: 1 })}</div>
      <p class="small muted">De manhã, depois do banheiro e antes de comer.</p><button class="btn amber block" id="w-save">Salvar</button>`;
    const inp = box.querySelector("#w-kg");
    const saveW = () => { const kg = num(inp.value, 30, 250, null); if (kg == null) { inp.focus(); return; }
      const prev = currentWeight(); setWeight(kg); commit(); closeSheet(true); render();
      const diff = kg - prev; toast(Math.abs(diff) < 0.05 ? "Peso salvo." : `Peso salvo: ${sign(diff)} kg desde o último. Fichas reajustadas.`); };
    box.querySelector("#w-save").addEventListener("click", saveW);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") saveW(); });
  });
}
function goalFields(g, cur) {
  const kg = Math.abs(g.target - g.start) || 4, months = Math.max(1, Math.round(daysBetween(g.startDate, g.endDate) / 30.4));
  return `<div class="field"><span class="lab">O que você quer?</span><div class="seg" data-seg="gtype">${Object.entries(GOALS).map(([k, v]) => `<button type="button" class="${g.type === k ? "on" : ""}" data-v="${k}">${v.label}</button>`).join("")}</div></div>
    <div class="grid2" id="g-nums" ${g.type === "manter" ? "hidden" : ""}>
      <div class="field"><label for="g-kg">Quantos kg</label>${nstep(`id="g-kg" name="gkg"`, dec(kg), { step: 0.5, min: 0.5, max: 60, dec: 1 })}</div>
      <div class="field"><label for="g-mo">Em quantos meses</label>${nstep(`id="g-mo" name="gmo"`, months, { step: 1, min: 1, max: 36 })}</div>
    </div><div id="g-preview"></div>`;
}
function readGoal(root, weight) {
  const b = root.querySelector('[data-seg="gtype"] .on'), type = b ? b.dataset.v : "ganhar";
  const kg = num(root.querySelector("#g-kg").value, 0.5, 60, 4), mo = num(root.querySelector("#g-mo").value, 1, 36, 3);
  const t = todayKey();
  return { type, start: weight, startDate: t, target: type === "manter" ? weight : +(weight + (type === "perder" ? -kg : kg)).toFixed(1), endDate: keyOf(addDays(new Date(), Math.round(mo * 30.44))), u: Date.now() };
}
function goalPreview(root, weight) {
  const el = root.querySelector("#g-preview"); if (!el) return;
  const g = readGoal(root, weight); root.querySelector("#g-nums").hidden = g.type === "manter";
  if (g.type === "manter") { el.innerHTML = `<div class="alert good"><div>Calorias iguais ao seu gasto. O app acompanha o peso para ele ficar estável.</div></div>`; return; }
  const G = GOALS[g.type], weeks = daysBetween(g.startDate, g.endDate) / 7, perWeek = Math.abs(g.target - g.start) / weeks, pct = perWeek / weight * 100;
  const fast = pct > G.hi * 1.02, healthyMonths = Math.ceil(Math.abs(g.target - g.start) / (weight * G.hi / 100) / 4.345);
  el.innerHTML = `<div class="alert ${fast ? "" : "good"}"><div><b>${fmt(weight, 1)} → ${fmt(g.target, 1)} kg · ${fmt(perWeek, 2)} kg por semana</b>${fast ? `Acima da faixa dos estudos (${fmt(weight * G.lo / 100, 2)} a ${fmt(weight * G.hi / 100, 2)} kg/semana). Você pode manter, mas em ritmo saudável leva cerca de ${healthyMonths} meses.` : `Dentro ou abaixo da faixa saudável (até ${fmt(weight * G.hi / 100, 2)} kg/semana).`}</div></div>`;
}
function goalSheet() {
  openSheet((s, box) => {
    const w = currentWeight();
    box.innerHTML = `<div class="grab"></div><div><span class="eyebrow">Peso atual: ${fmt(w, 1)} kg</span><h2>Sua meta</h2></div>${goalFields(S.goal, w)}
      <p class="small muted">A meta recomeça a contar a partir de hoje, do seu peso atual.</p><button class="btn amber block" id="g-save">Salvar meta</button>`;
    goalPreview(box, w);
    s.addEventListener("input", () => goalPreview(box, w));
    s.addEventListener("click", e => { if (e.target.closest(".seg,.nstep")) setTimeout(() => goalPreview(box, w), 0);
      if (e.target.closest("#g-save")) { S.goal = readGoal(box, w); if (!S.weights[todayKey()]) setWeight(w); commit(); closeSheet(true); render(); toast("Meta salva. Calorias e fichas reajustadas."); } });
  });
}

/* ================= ações rápidas ================= */
function quickSheet() {
  const { T, plan } = ctx(), d = getDay(), next = plan.find(m => d.meals[m.id] == null);
  openSheet((s, box) => {
    box.innerHTML = `<div class="grab"></div><h2>O que você quer registrar?</h2>
      <div class="qgrid">
        <button class="qbtn" data-q="sleep"><span class="ric sleep">${IC.moon(22)}</span><b>Minha noite</b><small>${sleepOf(curDay) ? "Editar" : "Como dormi"}</small></button>
        <button class="qbtn" data-q="meal" ${next ? "" : "disabled"}><span class="ric food">${IC.bowl(22)}</span><b>Refeição</b><small>${next ? esc(next.n) : "Todas feitas"}</small></button>
        <button class="qbtn" data-q="water"><span class="ric sleep">${IC.drop(22)}</span><b>+1 copo de água</b><small class="num">${d.water || 0} de ${T.water}</small></button>
        <button class="qbtn" data-q="weight"><span class="ric amber">${IC.scale(22)}</span><b>Meu peso</b><small class="num">${dec(currentWeight())} kg</small></button>
        <button class="qbtn" data-q="shop"><span class="ric food">${IC.cart(22)}</span><b>Lista de compras</b><small>Adicionar item</small></button>
        <button class="qbtn" data-q="gut"><span class="ric amber">${IC.check(18)}</span><b>Fui ao banheiro</b><small class="num">${d.gut || 0} hoje</small></button>
      </div>`;
    s.addEventListener("click", e => {
      const b = e.target.closest("[data-q]"); if (!b) return; e.stopPropagation(); const q = b.dataset.q;
      closeSheet(true);
      if (q === "sleep") sleepSheet();
      else if (q === "meal" && next) fichaSheet(next.id);
      else if (q === "water") { const before = dayScore(curDay); editDay(x => { x.water = (x.water || 0) + 1; }); render(); toast(`Água: ${getDay().water} de ${T.water} copos`); afterScore(before); }
      else if (q === "weight") weightSheet();
      else if (q === "gut") { editDay(x => { x.gut = (x.gut || 0) + 1; }); render(); toast("Registrado."); }
      else if (q === "shop") { go("compras"); setTimeout(() => { const i = $("#shop-in"); if (i) i.focus(); }, 80); }
    });
  });
}
window.addEventListener("scroll", () => { const t = $("#totop"); if (t) t.hidden = window.scrollY < 500; }, { passive: true });

/* ================= feedback ================= */
function toast(msg) { const old = $(".toast"); if (old) old.remove(); const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "celebrate"; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  const g = c.getContext("2d"), cols = ["#9391F7", "#4FC79B", "#EDAA52", "#ffffff", "#5552D3"];
  const parts = Array.from({ length: 90 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.38, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4, s: 4 + Math.random() * 6, r: Math.random() * 6, c: cols[(Math.random() * cols.length) | 0] }));
  let f = 0; (function tick() { g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - f / 90); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); g.restore(); }
    if (++f < 90) requestAnimationFrame(tick); else c.remove(); })();
}

/* ================= entrada: login e boas-vindas ================= */
let userEmail = "", gateMode = "in", gateMsg = "", gateBusy = false, view = "app";
function renderGate() {
  return `<div class="gate"><div class="box">
    <div class="gate-scene">${mascot("happy", 130, null, true)}</div>
    <div class="stack" style="gap:6px"><h1>Sempre Saudáveis</h1><p class="muted">Sono, fichas de alimentação e meta de peso. Entre para sincronizar celular e computador.</p></div>
    <form class="card" id="auth">
      <div class="seg" data-seg="mode"><button type="button" class="${gateMode === "in" ? "on" : ""}" data-v="in">Entrar</button><button type="button" class="${gateMode === "up" ? "on" : ""}" data-v="up">Criar conta</button></div>
      ${gateMode === "up" ? `<div class="field"><label for="a-name">Seu nome</label><input id="a-name" name="name" autocomplete="given-name" maxlength="40" required placeholder="Como quer ser chamado"></div>` : ""}
      <div class="field"><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="a-pass">Senha</label><input id="a-pass" name="password" type="password" autocomplete="${gateMode === "in" ? "current-password" : "new-password"}" minlength="6" required></div>
      ${gateMsg ? `<p class="err" role="alert">${esc(gateMsg)}</p>` : ""}
      <button class="btn sleep block" type="submit" ${gateBusy ? "disabled" : ""}>${gateBusy ? "Aguarde" : gateMode === "in" ? "Entrar" : "Criar minha conta"}</button>
    </form>
    <button class="link" style="align-self:center" data-a="skip">Usar sem conta, só neste aparelho</button>
  </div></div>`;
}
function renderOnb() {
  const p = S.profile;
  return `<div class="onb">
    ${mascot("wow", 110, "#C4F26A", true)}
    <div class="stack" style="gap:6px"><h1>Vamos montar seu plano</h1><p class="muted">Um minuto. Com isso o app calcula calorias, fichas, rotina de sono e o ritmo da sua meta.</p></div>
    <form id="onb" class="stack" style="gap:16px" autocomplete="off">
      <div class="card"><h2>Você</h2>${profileFields(p, "o")}</div>
      <div class="card"><h2>Sua meta</h2>${goalFields(S.goal, currentWeight())}</div>
      <button class="btn sleep block" type="submit">Montar meu plano</button>
    </form></div>`;
}

/* ================= eventos ================= */
document.addEventListener("click", e => {
  const segBtn = e.target.closest(".seg[data-seg] button");
  if (segBtn) { segBtn.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === segBtn));
    if (segBtn.parentElement.dataset.seg === "mode") { gateMode = segBtn.dataset.v; gateMsg = ""; render(); }
    if (segBtn.parentElement.dataset.seg === "theme") { try { localStorage.setItem("ss.theme", segBtn.dataset.v); } catch (e) {} applyTheme(segBtn.dataset.v); if (view === "app" && S.profile.setup) render(); }
    if (segBtn.parentElement.dataset.seg === "foodview") { foodView = segBtn.dataset.v; render(); window.scrollTo(0, 0); }
    const onb = segBtn.closest("#onb"); if (onb) goalPreview(onb, num(onb.querySelector('[name="weight"]').value, 35, 200, currentWeight())); }
  const b = e.target.closest("[data-a]"); if (!b || b.closest(".sheet")) return;
  const a = b.dataset.a, before = dayScore(todayKey());
  if (a === "sleep") sleepSheet(b.dataset.k);
  else if (a === "weight") weightSheet();
  else if (a === "goal") goalSheet();
  else if (a === "ficha") fichaSheet(b.dataset.id);
  else if (a === "pick") { pickMeal(b.dataset.id, +b.dataset.i); render(); }
  else if (a === "go") go(b.dataset.t);
  else if (a === "water") { editDay(d => { d.water = Math.max(0, (d.water || 0) + +b.dataset.d); }); render(); afterScore(before); }
  else if (a === "gut") { editDay(d => { d.gut = Math.max(0, (d.gut || 0) + +b.dataset.d); }); render(); }
  else if (a === "habit") { editDay(d => { d.habits[b.dataset.id] = !d.habits[b.dataset.id]; }); render(); afterScore(before); }
  else if (a === "day") {
    const dd = +b.dataset.d, t = todayKey();
    if (dd === 0) { curDay = t; dayPinned = false; }
    else { let nk = keyOf(addDays(parseKey(curDay), dd)); if (nk > t) nk = t; if (daysBetween(nk, t) > 370) return; curDay = nk; dayPinned = nk !== t; }
    render();
  }
  else if (a === "mealedit") mealEditSheet(b.dataset.id);
  else if (a === "cal") calSheet();
  else if (a === "pet") { const i = PET_IDS.indexOf(petId()), n = PET_IDS[(i + +b.dataset.d + PET_IDS.length) % PET_IDS.length]; S.profile.pet = n; S.profile.u = Date.now(); commit(); render(); toast(`Agora seu mascote é ${PETS[n].n}, ${PETS[n].d}.`); }
  else if (a === "setpet") { S.profile.pet = b.dataset.id; S.profile.u = Date.now(); commit(); render(); }
  else if (a === "pickday") { if (b.dataset.k <= todayKey()) { curDay = b.dataset.k; dayPinned = curDay !== todayKey(); render(); } }
  else if (a === "quick") quickSheet();
  else if (a === "photo-rm") { delete S.profile.photo; S.profile.u = Date.now(); commit(); render(); toast("Foto removida."); }
  else if (a === "totop") window.scrollTo({ top: 0, behavior: "smooth" });
  else if (a === "autotimes") { S.profile.mealTimes = {}; S.profile.u = Date.now(); commit(); render(); toast("Horários automáticos de volta."); }
  else if (a === "shop-toggle") { const x = S.shop[b.dataset.id]; if (x) { x.done = x.done ? 0 : 1; x.u = Date.now(); commit(); render(); } }
  else if (a === "shop-del") { S.shop[b.dataset.id] = { del: true, u: Date.now() }; commit(); render(); }
  else if (a === "shop-clear") { for (const k in S.shop) if (S.shop[k].done && !S.shop[k].del) S.shop[k] = { del: true, u: Date.now() }; commit(); render(); toast("Comprados removidos da lista."); }
  else if (a === "shop-gen") { const n = shopFromFichas(); commit(); render(); toast(n ? `${n} ${n === 1 ? "item adicionado" : "itens adicionados"} à lista.` : "Esses itens já estão na lista."); }
  else if (a === "creatine") { S.profile.creatine = !S.profile.creatine; S.profile.u = Date.now(); commit(); render(); }
  else if (a === "skip") { flag("vigor.skipAuth", "1"); view = "app"; render(); }
  else if (a === "login") { flag("vigor.skipAuth", null); view = "gate"; render(); }
  else if (a === "syncnow") { syncNow().then(() => toast(syncState === "ok" ? "Sincronizado." : "Sem conexão agora.")); }
  else if (a === "signout") { if (b.dataset.confirm) signOut(); else { b.dataset.confirm = "1"; b.textContent = "Confirmar saída"; } }
});
document.addEventListener("input", e => { const onb = e.target.closest("#onb"); if (onb) goalPreview(onb, num(onb.querySelector('[name="weight"]').value, 35, 200, currentWeight())); });
document.addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === "shopf") { const added = shopAdd(f.item.value); if (added) commit(); render(); const inp = $("#shop-in"); if (inp) inp.focus(); if (!added && f.item.value.trim()) toast("Esse item já está na lista."); return; }
  if (f.id === "hf") {
    const mt = {}, off = {};
    for (const fi of FICHAS) { const on = f.querySelector(`[name="on-${fi.id}"]`).checked, tv = f.querySelector(`[name="t-${fi.id}"]`).value;
      if (!on) off[fi.id] = true; if (tv && tv !== fromMin(autoMin(fi))) mt[fi.id] = tv; }
    S.profile.mealTimes = mt; S.profile.mealOff = off; S.profile.u = Date.now(); commit(); render(); toast("Refeições e horários salvos."); return;
  }
  if (f.id === "pf") { const { p, w } = readProfile(f); const changed = w !== currentWeight(); S.profile = { ...p, u: Date.now() }; if (changed || !weightList().length) setWeight(w); commit(); render(); toast("Salvo. Plano e rotina atualizados."); }
  else if (f.id === "onb") { const { p, w } = readProfile(f); S.profile = { ...p, setup: true, u: Date.now() }; setWeight(w); S.goal = readGoal(f, w); commit(); view = "app"; location.hash = "hoje"; tab = "hoje"; render(); window.scrollTo(0, 0); toast("Plano montado. Comece registrando a noite."); }
  else if (f.id === "auth") {
    const email = f.email.value.trim(), password = f.password.value, name = f.name ? f.name.value.trim().slice(0, 40) : ""; gateBusy = true; gateMsg = ""; render();
    try {
      if (gateMode === "up") { const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name } } }); if (error) throw error;
        if (!data.session) { gateMsg = "Conta criada. Confirme pelo link que chegou no seu e-mail e depois entre."; gateMode = "in"; } }
      else { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
    } catch (err) { const m = String(err && err.message || "");
      gateMsg = /Invalid login/i.test(m) ? "E-mail ou senha incorretos." : /already registered/i.test(m) ? "Esse e-mail já tem conta. Use Entrar." : /confirm/i.test(m) ? "Confirme seu e-mail pelo link que enviamos e tente de novo." : /fetch|network/i.test(m) ? "Sem conexão. Tente de novo." : (m || "Não foi possível entrar."); }
    gateBusy = false; if (!uid) render();
  }
});
async function signOut() { try { clearTimeout(pushTimer); await syncNow(); if (channel) sb.removeChannel(channel); await sb.auth.signOut(); } catch (e) {} uid = null; userEmail = ""; S = normalize(lsRead("vigor.v2.local") || DEFAULT()); syncState = "local"; view = "gate"; render(); }

/* ================= render ================= */
function render() {
  _T = null;
  if (!dayPinned || curDay > todayKey()) { curDay = todayKey(); dayPinned = false; }
  const app = $("#app"), bar = $("#tabbar");
  if (HAS_CLOUD && !uid && view !== "app" && !flag("vigor.skipAuth")) view = "gate";
  if (view === "gate" && (!HAS_CLOUD || uid)) view = "app";
  const fabs = $(".fabs"); if (fabs) fabs.hidden = view === "gate" || !S.profile.setup;
  if (view === "gate") { bar.hidden = true; app.innerHTML = renderGate(); return; }
  if (!S.profile.setup) { bar.hidden = true; app.innerHTML = renderOnb(); goalPreview(app, currentWeight()); return; }
  bar.hidden = false;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIOS && !standalone && !flag("ss.iosHint") && !$("#ioshint")) {
    const h = document.createElement("div"); h.id = "ioshint"; h.className = "ioshint";
    h.innerHTML = `<div><b>Instale no iPhone</b><span>Toque em <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg> Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</span></div><button type="button" aria-label="Fechar aviso">×</button>`;
    h.querySelector("button").addEventListener("click", () => { flag("ss.iosHint", "1"); h.remove(); });
    document.body.appendChild(h);
  }
  if (!$("#fab")) { const f = document.createElement("div"); f.className = "fabs"; f.innerHTML = `<button id="totop" class="totop" data-a="totop" hidden aria-label="Voltar ao topo">${IC.arrowup(20)}</button><button id="fab" class="fab" data-a="quick" aria-label="Registrar">${IC.plus(26)}</button>`; document.body.appendChild(f); }
  const P = progress(); checkBadges(P, !rendered); rendered = true;
  app.innerHTML = tab === "sono" ? renderSono() : tab === "comida" ? renderComida() : tab === "compras" ? `${header("Lista de compras", "O que falta comprar")}${renderCompras()}` : tab === "meta" ? renderMeta() : tab === "perfil" ? renderPerfil() : renderHoje();
  renderTabs(); renderSync();
  if (scrollTo) { const el = document.getElementById(scrollTo); scrollTo = null; if (el) el.scrollIntoView({ block: "start" }); }
}
let rendered = false;

/* ================= início ================= */
async function boot() {
  S = normalize(lsRead("vigor.v2.local") || DEFAULT());
  if (HAS_CLOUD) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      const { data } = await sb.auth.getSession();
      sb.auth.onAuthStateChange((ev, session) => { if (session && session.user.id !== uid) { userEmail = session.user.email || ""; view = "app"; adoptSession(session); } });
      if (data && data.session) { userEmail = data.session.user.email || ""; uid = data.session.user.id; S = normalize(lsRead(lsKey()) || DEFAULT()); nameFromAccount(data.session); view = "app"; render(); syncNow().then(listen); return; }
      view = flag("vigor.skipAuth") ? "app" : "gate";
    } catch (e) { view = "app"; }
  }
  render();
}
boot();
setInterval(() => { if (view === "app" && tab === "hoje" && !$("#scrim") && document.visibilityState === "visible" && S.profile.setup) softRender(); }, 60000);
})();
