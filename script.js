/**
 * ZBOD Tool - Zero Based Organizational Design
 * Landing page simplified: only Overview card retained
 */

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const state = {
  currentPage: 'landing',
  selectedDivisionId: null,
  selectedWorkshopId: null,
  selectedHistoryWorkshopId: null,
  editingDivision: false,
  editingValues: {},
  phase3Values: {},
  p3ExpandedChildren: new Set(),
  asIsNewRows: [],
  asIsEditing: {},
  landingEditing: null,
  landingDrafts: {},
  // Which (CxO, area) pair the Strategic Overview block is showing: 'cxoId::area'.
  strategicOverviewKey: null,
  aaaEditCardIdx: null,
  aaaCards: {},
  metricsDraft: {},
  toastId: 0,
  _divEditForm: null,
  asIsSaved: false,
  metricsSaved: false,
  dashboardParentFilter: '',
  _userEditId: null,
  accountChangingPassword: false,
  // Phase 1's org-chart function editor modal: { mode: 'add'|'edit', fnId, parentId, draft }.
  // null when the modal is closed.
  fnModal: null,
  // Phase 1 org chart "Full Screen" mode. Kept in state (not just as a DOM class) so it survives
  // renderPhase1() re-rendering the chart after every add/edit/remove.
  ocFullscreen: false,
};

let orgZoomScale = 1.0;
let orgIsPanning = false;
let orgPanStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

// Global chart registry to prevent Chart.js canvas reuse errors
const _chartRegistry = {};
function destroyChart(canvasId) {
  if (_chartRegistry[canvasId]) {
    _chartRegistry[canvasId].destroy();
    delete _chartRegistry[canvasId];
  }
}
function registerChart(canvasId, chart) {
  destroyChart(canvasId);
  _chartRegistry[canvasId] = chart;
}
function destroyAllDashboardCharts() {
  ['decisionPieChart','hcPieChart','budgetPieChart','asIsHcPieChart','asIsBudgetPieChart',
   'hist_decisionPieChart','hist_hcPieChart','hist_budgetPieChart','hist_asIsHcPieChart','hist_asIsBudgetPieChart'].forEach(destroyChart);
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const STRUCTURE_NAMES = [
  'Azerconnect Group - Business Assurance, Risk Management and HSE Division',
  'Azerconnect Group - Business Development Division',
  'Azerconnect Group - CEO Office',
  'Azerconnect Group - Customer Operations Division',
  'Azerconnect Group - Finance',
  'Azerconnect Group - Governmental Relations and Legal Division',
  'Azerconnect Group - Human Resources',
  'Azerconnect Group - Information Security Division',
  'Azerconnect Group - Information Technologies and Core Network Division',
  'Azerconnect Group - Internal Audit.',
  'Azerconnect Group - Marketing (AZRC)',
  'Azerconnect Group - Network Technologies.',
  'Azerconnect Group - Procurement and Project Delivery Division',
  'Azerconnect Group - Sales (AZRC)',
  'Azedunet - Finance department',
  'Azedunet - HR & Administrative Services Department',
  'Azedunet - Contracts departament',
  'Azedunet - Network Support department',
  'Azedunet - Services Desk department',
  'Azedunet - System Integration department',
  'Azedunet - Technical Support department',
  'Azedunet - Technological Services & System Development department',
  'Azerfon - Sales',
  'Azerfon - Marketing',
  'Azerfon - General Management',
  'Bakcell - Sales',
  'Bakcell - Marketing',
  'Bakcell - General Marketing',
  'GoldenPay - Cash Business Division',
  'GoldenPay - Commercial Division',
  'GoldenPay - Finance Division',
  'GoldenPay - IT Division',
  'GoldenPay - Internal Control and Compliance Division',
  'GoldenPay - CEO Office',
  'GoldenPay - Operations Division',
  'Ultranet Telco Services',
  'Uninet',
  'MegaLink',
  'NYU MEDI?A.AZ',
  'Onlayn Od?m?',
  'Ravy Group',
  'Ravy Hospitality',
  'Ravy Property',
  'Texnolyuks M',
  'BBTV',
  'Azqtel',
  'Azerconnect DataSphere',
  'BTH',
  'Other'
];

const STRUCTURE_TYPES = ['Division', 'Department', 'Unit', 'Other'];

const LS = {
  divisions: 'zbod_divisions',
  workshops: 'zbod_workshops',
  functions: 'zbod_functions',
  asIs: 'zbod_as_is',
  landing: 'zbod_landing',
  metrics: 'zbod_metrics',
  keyFindings: 'zbod_key_findings',
  aaaCards: 'zbod_aaa_cards',
  aaaTitles: 'zbod_aaa_titles',
  strategicOverviews: 'zbod_strategic_overviews',
  signedInEmail: 'zbod_signed_in_email',
  users: 'zbod_users',
};

// ═══════════════════════════════════════════
// SESSION
// Authentication is Supabase Auth (see supabase.js). No password — not the admin's, not anyone
// else's — exists anywhere in this file or in the database: Supabase hashes and stores them, and
// the browser only ever holds a short-lived session token. That is what lets this repository be
// public.
//
// currentProfile is the signed-in account's row from `profiles`: { id, role, fullName, position,
// areaOfResponsibility, email }. Role checks read it instead of comparing against a hardcoded
// email. It is filled by resolveSession() on sign-in and on every page load, and the matching RLS
// policies enforce the same rules server-side — so a tampered client gains nothing.
// ═══════════════════════════════════════════
let currentProfile = null;

function setCurrentProfile(profile) {
  currentProfile = profile || null;
  if (profile && profile.email) localStorage.setItem(LS.signedInEmail, profile.email);
  else localStorage.removeItem(LS.signedInEmail);
}

function getCurrentEmail() {
  if (currentProfile && currentProfile.email) return currentProfile.email.toLowerCase();
  return (localStorage.getItem(LS.signedInEmail) || '').toLowerCase();
}

// Restores the session after a reload and looks up the account's profile. Returns null when there
// is no session, or when the account has no profile row — an auth account without a profile has no
// role, so it is refused rather than let in with unknown permissions.
async function resolveSession() {
  const sb = window.zbodSupabase;
  if (!sb || !sb.supabaseAvailable) return null;
  const user = await sb.sbAuthGetUser();
  if (!user) { setCurrentProfile(null); return null; }
  const profiles = await sb.sbLoadProfiles();
  const mine = (profiles || []).find(p => p.id === user.id);
  if (!mine) { setCurrentProfile(null); return null; }
  // A deactivated account keeps its Supabase Auth credentials, so it can still authenticate —
  // the profile flag is what actually decides whether it may in.
  if (mine.is_active === false) { setCurrentProfile(null); return null; }
  claimLocalCache(mine.id);
  if (profiles) lsSet(LS.users, profiles);
  setCurrentProfile(mine);
  return mine;
}

// ═══════════════════════════════════════════
// DATA REPAIR: parent cycles
// A chain of parents that loops back on itself (A's parent is B and B's parent is A) can come from
// an imported file, an old version of the app or a sync race. Nothing in the tree logic can render
// or total such a loop, so it is cut: the function at which the loop is detected goes to the top
// level. Returns the ids that were cut.
// ═══════════════════════════════════════════
function findParentCycleCuts(list, parentOf) {
  const byId = new Map(list.map(x => [x.id, x]));
  const cuts = new Set();
  const mark = new Map();           // 1 = on the current path, 2 = done
  list.forEach(start => {
    if (mark.get(start.id) === 2) return;
    const path = [];
    let cur = start;
    while (cur && mark.get(cur.id) !== 2) {
      if (mark.get(cur.id) === 1) { cuts.add(cur.id); break; }   // back on our own path: a loop
      mark.set(cur.id, 1);
      path.push(cur.id);
      const pid = parentOf(cur);
      cur = pid && !cuts.has(cur.id) ? byId.get(pid) : null;
    }
    path.forEach(id => mark.set(id, 2));
  });
  return [...cuts];
}
function repairParentCycles() {
  const ais = getAsIs();
  const aisCuts = findParentCycleCuts(ais, f => f.parent_id || null);
  if (aisCuts.length) {
    lsSet(LS.asIs, ais.map(f => aisCuts.includes(f.id) ? { ...f, parent_id: null } : f));
    aisCuts.forEach(id => { const f = getAsIs().find(x => x.id === id); const d = f && getDivs().find(x => x.id === f.division_id);
      if (f && d && canWriteDivision(d) && window.zbodSupabase) window.zbodSupabase.sbSaveAsIsFunction(f); });
  }
  const fns = getFns();
  const fnCuts = findParentCycleCuts(fns, f => f.parent_id || null);
  if (fnCuts.length) {
    lsSet(LS.functions, fns.map(f => fnCuts.includes(f.id) ? { ...f, parent_id: '' } : f));
    fnCuts.forEach(id => { const f = getFns().find(x => x.id === id); if (f && window.zbodSupabase && !isReadOnlyViewer()) window.zbodSupabase.sbSaveFunction(f); });
  }
  return aisCuts.length + fnCuts.length;
}
// Whether this account may change a structure's own data (AS-IS, metrics, findings): its owner or
// an admin. A CxO reads it only. (Workshops follow their own rule, see the RLS notes.)
function canWriteDivision(div) {
  if (!div) return false;
  if (isCurrentUserAdmin()) return true;
  if (isReadOnlyViewer()) return false;
  const me = getCurrentEmail();
  return !!me && (div.owner_email || '').toLowerCase() === me;
}

// ═══════════════════════════════════════════
// LOCAL CACHE OWNERSHIP
// Everything this app keeps in localStorage belongs to the account that loaded it. When a different
// account signs in on the same browser, or anyone signs out, that copy is wiped — salary costs and
// structures must never be readable by the next person at this computer.
// ═══════════════════════════════════════════
const CACHE_OWNER_KEY = 'zbod_cache_owner';
function clearLocalWorkspaceCache() {
  Object.keys(localStorage).filter(k => k.startsWith('zbod')).forEach(k => localStorage.removeItem(k));
}
function claimLocalCache(userId) {
  const owner = localStorage.getItem(CACHE_OWNER_KEY);
  if (owner && owner !== userId) clearLocalWorkspaceCache();
  localStorage.setItem(CACHE_OWNER_KEY, userId);
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function lsGet(key, fallback) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.error('ls write failed', e); } }
// Every id ends up in a Supabase UUID column, so the fallback has to be UUID-shaped too.
// crypto.randomUUID only exists in a secure context — served over plain http (a LAN IP, an
// intranet host) it is undefined, and the old fallback produced ids like "m1x9k2af3z" which
// Postgres rejects with 22P02. sbRun swallows that, so the whole device would silently never
// sync anything. crypto.getRandomValues has no secure-context requirement.
function genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// The single quote matters: every inline handler in this file is built as
// onclick="app.x('${escHtml(id)}')", so a value containing ' breaks out of the JS string literal even
// though it is inside a double-quoted attribute. Ids come from Supabase, which anon clients can
// write, so they are not trustworthy either.
function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// A read-only password value (Manage Users cards, My Account) — masked by default with a toggle
// button to reveal it, rather than shown in plain text. app.togglePasswordText swaps the
// adjacent span's content between the dots and its data-value.
function renderMaskedPassword(value) {
  const safe = escHtml(value || '');
  return `<span style="display:inline-flex;align-items:center;gap:6px;"><span class="pw-mask-text" data-value="${safe}" data-masked="true">••••••••</span><button type="button" onclick="app.togglePasswordText(this)" style="padding:2px;color:#9ca3af;display:inline-flex;background:none;border:none;cursor:pointer;" aria-label="Show/hide password" title="Show/hide password">${ICONS.eye}</button></span>`;
}

// A password <input> (Add/Edit User dialog, Change Password) — type="password" by default with a
// toggle button that flips it to type="text" and back. app.togglePasswordInput drives the toggle.
function renderPasswordInput(id, placeholder) {
  return `<div style="position:relative;"><input type="password" class="zbod-input" id="${id}" placeholder="${placeholder}" style="padding-right:40px;"><button type="button" onclick="app.togglePasswordInput('${escHtml(id)}', this)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:2px;color:#9ca3af;display:inline-flex;background:none;border:none;cursor:pointer;" aria-label="Show/hide password" title="Show/hide password">${ICONS.eye}</button></div>`;
}

function formatNumber(num) {
  if (num === null || num === undefined || num === '') return '';
  const n = typeof num === 'string' ? num.replace(/\s/g, '') : num;
  const val = parseFloat(n);
  if (isNaN(val)) return num;
  return val.toLocaleString('en-US').replace(/,/g, ' ');
}

function computeMedian(values) {
  const valid = values.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(v)).map(v => Number(v)).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[mid];
  return (valid[mid - 1] + valid[mid]) / 2;
}

// Largest Remainder (Hamilton) Method: distributes `total` across `weights` (percentages of
// `total`, not required to sum to 100) as integers with no independent-rounding drift. Floors
// each exact share, then hands out the leftover units one at a time to the largest fractional
// remainders, so the results always sum to Math.round(total * sum(weights) / 100) — exactly
// `total` whenever the weights sum to 100.
//
// `unit` is the smallest share the total may be split into: 1 for headcount, which has to land on
// whole people, and 0.01 for money, which must add back up to the imported target to the qapik
// (a 133 778.51 budget split into whole manats would overshoot it by up to a manat).
function largestRemainderAllocate(total, weights, unit = 1) {
  const steps = Math.round((total || 0) / unit);
  const exact = weights.map(w => (steps * (w || 0)) / 100);
  const floors = exact.map(v => Math.floor(v));
  const targetSum = Math.round(exact.reduce((a, b) => a + b, 0));
  let remainder = targetSum - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  const result = floors.slice();
  for (let k = 0; k < remainder && k < order.length; k++) result[order[k].i] += 1;
  return unit === 1 ? result : result.map(v => roundMoney(v * unit));
}

// Money is carried as a plain number, so every derived figure is snapped back to the qapik to keep
// float noise (0.1 + 0.2) out of the totals that get compared against a target.
function roundMoney(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

function unformatNumber(str) {
  if (!str) return '';
  return String(str).replace(/\s/g, '');
}

// ── Money inputs ──────────────────────────────────────────────────────────────────────────────
// Money fields are text inputs (data-money) that show thousands separators as the user types
// ("96003.5" -> "96,003.5"): commas group the integer part, the dot is the decimal point (up to
// 2 digits = qapik). The stored value is always a plain number — parseMoney() strips the commas.
function parseMoney(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Formats whatever the user has typed so far; keeps a trailing "." and trailing zeros so typing
// "96003.50" isn't snapped to "96,003.5" under the caret.
function formatMoneyTyping(raw) {
  let s = String(raw == null ? '' : raw).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  let int = dot < 0 ? s : s.slice(0, dot);
  let dec = dot < 0 ? null : s.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  int = int.replace(/^0+(?=\d)/, '');
  if (int === '' && dec !== null) int = '0';
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === null ? int : int + '.' + dec;
}

// For rendering a stored value into a money input ('' / 0 / null show as empty).
function formatMoneyValue(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = parseMoney(v);
  if (!n) return '';
  return formatMoneyTyping(String(roundMoney(n)));
}

// Headcount is whole people, 0 or more; empty is "missing", not 0.
function readWholeCount(text) {
  const t = String(text == null ? '' : text).trim();
  if (t === '') return { missing: true };
  const n = Number(t.replace(/\s/g, ''));
  if (!isFinite(n) || n < 0 || !Number.isInteger(n)) return { invalid: true };
  return { value: n };
}
// Money is 0 or more, to the qapik; empty is "missing", not 0.
function readMoney(text) {
  const t = String(text == null ? '' : text).trim();
  if (t === '') return { missing: true };
  if (!/^[\d\s,]*(\.\d*)?$/.test(t) || !/\d/.test(t)) return { invalid: true };
  return { value: roundMoney(parseMoney(t)) };
}
// AS-IS entry: people are whole and never negative; money is never negative.
function cleanCount(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : Math.max(0, n); }
function cleanMoney(v) { return Math.max(0, roundMoney(parseMoney(v))); }

function moneyInputAttrs() { return 'type="text" inputmode="decimal" autocomplete="off" data-money="1"'; }

document.addEventListener('input', function (e) {
  const el = e.target;
  if (!el || !el.matches || !el.matches('input[data-money]')) return;
  const before = el.value;
  const caret = el.selectionStart == null ? before.length : el.selectionStart;
  const sig = before.slice(0, caret).replace(/[^\d.]/g, '').length;   // digits + dot left of the caret
  const after = formatMoneyTyping(before);
  if (after === before) return;
  el.value = after;
  let pos = 0, seen = 0;
  while (pos < after.length && seen < sig) { if (/[\d.]/.test(after[pos])) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch (_) {}
}, true);

// On commit, drop a dangling "." ("96,003." -> "96,003") before the field's own handler reads it.
document.addEventListener('change', function (e) {
  const el = e.target;
  if (!el || !el.matches || !el.matches('input[data-money]')) return;
  const f = formatMoneyTyping(el.value).replace(/\.$/, '');
  if (f !== el.value) el.value = f;
}, true);

function getStructureTypeLabel(type) {
  if (!type || type === 'Division') return 'Division';
  if (type === 'Department') return 'Department';
  if (type === 'Unit') return 'Unit';
  return 'Custom';
}

function getWorkspaceTitle(type) {
  const label = getStructureTypeLabel(type);
  return label + ' Workspace';
}

function getDataBoxTitle(type) {
  const label = getStructureTypeLabel(type);
  return label + ' Data';
}

function getManageText(type) {
  const label = getStructureTypeLabel(type);
  return `Manage ${label} data, current functions, and workshops`;
}

document.addEventListener('wheel', function(e) {
  if (document.activeElement && document.activeElement.type === 'number') {
    e.preventDefault();
  }
}, { passive: false });

// ═══════════════════════════════════════════
// LOCALSTORAGE DATA LAYER
// ═══════════════════════════════════════════
function getDivs() { return lsGet(LS.divisions, []); }

// Per-account data isolation: each signed-in account only sees/enters the
// structures it created itself (stamped as `owner_email` at creation time,
// see submitAddDivision). Admin bypasses this and sees everything, including
// structures created before this feature existed (no `owner_email` at all --
// those are deliberately invisible to every regular account, not just
// whichever one happens to ask, since none of them actually created it).
function isCurrentUserAdmin() {
  return getCurrentUserRole() === 'admin';
}
// Role system: 'admin' / 'hrbp' (creates structures, assigns a CxO to each) /
// 'cxo' (read-only viewer of structures an HRBP assigned to them, see isReadOnlyViewer). A user
// record with no role set (shouldn't happen once Manage Users requires it, but legacy data may
// lack one) resolves to null -- treated as no special permissions anywhere this is checked.
function getCurrentUserRole() {
  if (currentProfile && currentProfile.role) return currentProfile.role;
  // After a reload the profile is restored asynchronously (resolveSession), so fall back to the
  // cached profile list for the signed-in email until it lands.
  const email = getCurrentEmail();
  if (!email) return null;
  const user = getUsers().find(u => (u.email || '').toLowerCase() === email);
  return (user && user.role) || null;
}
function isCurrentUserCxo() { return getCurrentUserRole() === 'cxo'; }
// CxO accounts never create or edit anything -- every structure they can see was assigned to them
// by an HRBP, so "is this account a CxO" and "is this view read-only" are the same question.
function isReadOnlyViewer() { return isCurrentUserCxo(); }
function canAccessDivision(div) {
  if (!div) return false;
  if (isCurrentUserAdmin()) return true;
  const email = getCurrentEmail();
  if (!email) return false;
  if ((div.owner_email || '').toLowerCase() === email) return true;
  return (div.cxo_email || '').toLowerCase() === email;
}
function getVisibleDivs() {
  if (isCurrentUserAdmin()) return getDivs();
  const email = getCurrentEmail();
  if (!email) return [];
  if (isCurrentUserCxo()) return getDivs().filter(d => (d.cxo_email || '').toLowerCase() === email);
  return getDivs().filter(d => (d.owner_email || '').toLowerCase() === email);
}

function addDiv(data) {
  const divs = getDivs(); const now = new Date().toISOString();
  const d = { id: genId(), ...data, created_at: now, updated_at: now };
  divs.push(d); lsSet(LS.divisions, divs);
  if (window.zbodSupabase) window.zbodSupabase.sbSaveDivision(d);
  return d;
}
function updDiv(id, updates) {
  const divs = getDivs().map(d => d.id === id ? {...d, ...updates, updated_at: new Date().toISOString()} : d);
  lsSet(LS.divisions, divs);
  const updated = divs.find(d => d.id === id);
  if (updated && window.zbodSupabase) window.zbodSupabase.sbSaveDivision(updated);
}
function delDiv(id) {
  lsSet(LS.divisions, getDivs().filter(d => d.id !== id));
  if (window.zbodSupabase) {
    window.zbodSupabase.sbDeleteDivision(id);
    window.zbodSupabase.sbDeleteLandingBox('aaa_cards_' + id);
    window.zbodSupabase.sbDeleteLandingBox('metrics_' + id);
  }
}

function getWs() { return lsGet(LS.workshops, []); }
function addWs(divisionId) {
  const ws = getWs(); const now = new Date().toISOString();
  const w = { id: genId(), division_id: divisionId, status: 'draft', phase: 1, completed_at: null, submitted_for_hr_review_at: null, created_at: now, updated_at: now };
  ws.push(w); lsSet(LS.workshops, ws);
  if (window.zbodSupabase) window.zbodSupabase.sbSaveWorkshop(w);
  return w;
}
function updWs(id, updates) {
  const workshops = getWs().map(w => w.id === id ? {...w, ...updates, updated_at: new Date().toISOString()} : w);
  lsSet(LS.workshops, workshops);
  const updated = workshops.find(w => w.id === id);
  if (updated && window.zbodSupabase) window.zbodSupabase.sbSaveWorkshop(updated);
}
async function delWs(id) {
  if (window.zbodSupabase) {
    const result = await window.zbodSupabase.sbDeleteWorkshopSafe(id);
    if (!result.ok) return false;
  }
  lsSet(LS.workshops, getWs().filter(w => w.id !== id));
  // The workshop row's ON DELETE CASCADE already took its functions with it on the server, but
  // localStorage has no such cascade — leaving orphaned rows here means the next sbSyncAll bulk
  // upsert (which sends the whole local functions array in one request) hits a foreign-key
  // violation on these dangling workshop_id references and silently fails the ENTIRE batch,
  // blocking sync for every other, legitimate function too.
  lsSet(LS.functions, getFns().filter(f => f.workshop_id !== id));
  return true;
}

function getFns() { return lsGet(LS.functions, []); }
function addFn(workshopId, num) {
  const fns = getFns(); const now = new Date().toISOString();
  const fn = { id: genId(), workshop_id: workshopId, function_number: num, proposed_function_name: '', career_level: '', function_structure_type: '', parent_id: '', strategic_justification: '', can_be_eliminated: '', can_be_automated: '', can_be_outsourced: '', justification_alert: null, question1_score: null, question2_score: null, total_score: null, zbod_decision: null, target_headcount: null, target_budget: null, total_hc: null, hc_allocation_percent: null, proposed_hc: null, total_budget: null, cost_allocation_percent: null, proposed_budget: null, proposed_budget_manual: false, manager_count: null, professional_count: null, span_of_control: null, span_alert: null, created_at: now, updated_at: now };
  fns.push(fn); lsSet(LS.functions, fns);
  if (window.zbodSupabase) window.zbodSupabase.sbSaveFunction(fn);
  return fn;
}
function updFn(id, updates) {
  const fns = getFns().map(f => f.id === id ? {...f, ...updates, updated_at: new Date().toISOString()} : f);
  lsSet(LS.functions, fns);
  const updated = fns.find(f => f.id === id);
  if (updated && window.zbodSupabase) window.zbodSupabase.sbSaveFunction(updated);
}
function delFn(id) {
  lsSet(LS.functions, getFns().filter(f => f.id !== id));
  if (window.zbodSupabase) window.zbodSupabase.sbDeleteFunction(id);
}

function getAsIs() { return lsGet(LS.asIs, []); }

// Stable id for a row coming from an Excel register: same division + same Function Title always
// gives the same id, in every browser, so re-importing overwrites rather than adds. Function Title
// is already the register's own key — Parent Function refers to rows by that name. Shaped as a v4
// UUID because the column's type demands one; four FNV-1a lanes give the 128 bits.
function asIsImportId(divisionId, name) {
  const seed = `${divisionId}|${String(name).trim().toLowerCase()}`;
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b];
  for (let i = 0; i < seed.length; i++) {
    for (let k = 0; k < 4; k++) {
      lanes[k] = Math.imul(lanes[k] ^ (seed.charCodeAt(i) + k), 0x01000193) >>> 0;
    }
  }
  const h = lanes.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('').split('');
  h[12] = '4';
  h[16] = '89ab'[parseInt(h[16], 16) & 3];
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
function addAsIsFn(divisionId, name, id) {
  const ais = getAsIs(); const now = new Date().toISOString();
  const fn = { id: id || genId(), division_id: divisionId, function_name: name, manager_count: 0, current_employee_count: 0, current_function_hc: 0, current_budget: 0, managers_cost: 0, professionals_cost: 0, target_headcount: null, target_budget: null, created_at: now, updated_at: now };
  // A caller-supplied id can already be present (a re-import of the same register) — overwrite that
  // row rather than sitting a second copy next to it.
  const existing = ais.findIndex(f => f.id === fn.id);
  // Keep the original created_at — the cloud copy must get the same one the local copy keeps, or
  // the two disagree on row order (sbLoadAsIsFunctions sorts by created_at).
  if (existing >= 0) fn.created_at = ais[existing].created_at;
  if (existing >= 0) ais[existing] = fn; else ais.push(fn);
  lsSet(LS.asIs, ais);
  if (window.zbodSupabase) window.zbodSupabase.sbSaveAsIsFunction(fn);
  return fn;
}
function updAsIsFn(id, updates) {
  const ais = getAsIs().map(f => f.id === id ? {...f, ...updates, updated_at: new Date().toISOString()} : f);
  lsSet(LS.asIs, ais);
  const updated = ais.find(f => f.id === id);
  if (updated && window.zbodSupabase) window.zbodSupabase.sbSaveAsIsFunction(updated);
}
function delAsIsFn(id) {
  lsSet(LS.asIs, getAsIs().filter(f => f.id !== id));
  if (window.zbodSupabase) window.zbodSupabase.sbDeleteAsIsFunction(id);
}

// ── AS-IS page: one rule set for every change to the tree ─────────────────────────────────────────
// A parent's figure includes everything nested under it, and may also hold an amount that has not
// been given to any sub-function yet ("unallocated" = parent − sum of its direct children; it comes
// straight from the imported/typed data). Every change to a function — new, edited, moved, deleted —
// is pushed up through its chain of parents by the same planner, so all the totals follow:
//   • a child's figure going UP (typed higher, or a new child) is first absorbed by the parent's
//     unallocated amount — that is what "assign the leftover to a sub-function" means — and only the
//     excess makes the parent grow. A function that is MOVED in brings its figures in full instead;
//   • a child's figure going DOWN (or leaving) makes the parent shrink by the same amount;
//   • a parent can never end up below the sum of its children: it is raised to cover them.
// Each component (managers, professionals, manager cost, professional cost) is handled on its own.
// Pure: returns what to write, writes nothing (see applyAsIsMutation).
const ASIS_KEYS = ['mgr', 'emp', 'mc', 'pc'];
function asIsTotals(f) {
  return { mgr: f.manager_count || 0, emp: f.current_employee_count || 0, mc: f.managers_cost || 0, pc: f.professionals_cost || 0 };
}
function asIsFieldsFromTotals(t) {
  const mc = roundMoney(t.mc), pc = roundMoney(t.pc);
  return { manager_count: t.mgr, current_employee_count: t.emp, current_function_hc: t.mgr + t.emp, managers_cost: mc, professionals_cost: pc, current_budget: roundMoney(mc + pc) };
}

// spec: { kind:'add', parentId, totals } | { kind:'edit', id, newTotals?, newParentId? (undefined = unchanged) } | { kind:'delete', id }
// Returns null when an edit would put a function inside itself; otherwise
// { updates:[{id,fields}] (ancestors only), targetTotals, orphans:[ids to attach to the root], raised:[{name}], changed:[{name,dHC,dCost}] }
function planAsIsMutation(fns, spec) {
  const W = {};
  fns.forEach(f => { W[f.id] = { id: f.id, name: f.function_name || 'Unnamed', parent_id: (f.parent_id && fns.some(x => x.id === f.parent_id)) ? f.parent_id : null, t: asIsTotals(f) }; });
  const kids = id => Object.values(W).filter(x => x.parent_id === id);
  const sumKids = id => { const s = { mgr: 0, emp: 0, mc: 0, pc: 0 }; kids(id).forEach(c => ASIS_KEYS.forEach(k => { s[k] += c.t[k]; })); return s; };
  const chainOf = start => { const out = [], seen = new Set(); let cur = start; while (cur && W[cur] && !seen.has(cur)) { out.push(cur); seen.add(cur); cur = W[cur].parent_id; } return out; };

  // unallocated amount of every node BEFORE anything changes (what a growing child may use up)
  const unalloc = {};
  Object.values(W).forEach(n => { const s = sumKids(n.id); unalloc[n.id] = {}; ASIS_KEYS.forEach(k => { unalloc[n.id][k] = Math.max(0, n.t[k] - s[k]); }); });
  const before = {};
  Object.values(W).forEach(n => { before[n.id] = { ...n.t }; });

  const raised = [];
  const floorOn = spec.floor !== false;      // the workshop turns this off: a typed value is kept, over-allocation is shown, not undone
  // Applies `delta` to the chain starting at `startId`, stopping before `stopId`.
  function propagate(startId, delta, stopId, absorb = true) {
    let cur = startId;
    const carry = { ...delta };
    const seen = new Set();
    while (cur && W[cur] && cur !== stopId && !seen.has(cur)) {
      seen.add(cur);
      const P = W[cur];
      ASIS_KEYS.forEach(k => {
        const d = carry[k];
        if (!d) return;
        if (d > 0) {
          const absorbed = absorb ? Math.min(d, unalloc[cur][k]) : 0;
          unalloc[cur][k] -= absorbed;
          P.t[k] = roundMoney(P.t[k] + (d - absorbed));
          carry[k] = roundMoney(d - absorbed);
        } else {
          const next = Math.max(0, roundMoney(P.t[k] + d));
          carry[k] = roundMoney(next - P.t[k]);
          P.t[k] = next;
        }
      });
      // People and cost each come in two kinds (managers/professionals, manager/professional cost). A
      // leftover of one kind can be taken by growth of the other — "1 person unallocated" is cleared by
      // giving 1 person to any sub-function — so the leftover is converted instead of the parent growing.
      if (absorb) {
        [['mgr', 'emp'], ['emp', 'mgr'], ['mc', 'pc'], ['pc', 'mc']].forEach(([k, other]) => {
          if (carry[k] > 0 && unalloc[cur][other] > 0) {
            const x = Math.min(carry[k], unalloc[cur][other]);
            unalloc[cur][other] = roundMoney(unalloc[cur][other] - x);
            P.t[other] = roundMoney(P.t[other] - x);
            carry[other] = roundMoney((carry[other] || 0) - x);
          }
        });
      }
      // never below what its own children add up to
      const s = sumKids(cur);
      let didRaise = false;
      if (floorOn) ASIS_KEYS.forEach(k => { if (P.t[k] < s[k]) { carry[k] = roundMoney(carry[k] + (s[k] - P.t[k])); P.t[k] = s[k]; didRaise = true; } });
      if (didRaise && !raised.some(r => r.id === cur)) raised.push({ id: cur, name: P.name });
      cur = P.parent_id;
    }
  }

  let targetTotals = null, orphans = [];
  if (spec.kind === 'add') {
    const parentId = spec.parentId && W[spec.parentId] ? spec.parentId : null;
    targetTotals = { ...spec.totals };
    propagate(parentId, targetTotals, null);
  } else {
    const T = W[spec.id];
    if (!T) return { updates: [], targetTotals: null, orphans: [], raised: [], changed: [] };
    if (spec.kind === 'delete') {
      orphans = kids(T.id).map(c => c.id);
      const oldParent = T.parent_id;
      const oldT = { ...T.t };
      kids(T.id).forEach(c => { c.parent_id = null; });
      delete W[T.id];
      propagate(oldParent, ASIS_KEYS.reduce((o, k) => { o[k] = -oldT[k]; return o; }, {}), null);
    } else {
      const oldParent = T.parent_id;
      const newParent = spec.newParentId === undefined ? oldParent : (spec.newParentId && W[spec.newParentId] ? spec.newParentId : null);
      if (newParent === T.id || chainOf(newParent).includes(T.id)) return null;
      const oldT = { ...T.t };
      const newT = { ...(spec.newTotals || T.t) };
      const s = sumKids(T.id);
      if (floorOn) ASIS_KEYS.forEach(k => { if (newT[k] < s[k]) { newT[k] = s[k]; if (!raised.some(r => r.id === T.id)) raised.push({ id: T.id, name: T.name }); } });
      T.parent_id = newParent;
      T.t = newT;
      targetTotals = newT;
      const d = ASIS_KEYS.reduce((o, k) => { o[k] = roundMoney(newT[k] - oldT[k]); return o; }, {});
      if (oldParent === newParent) {
        propagate(oldParent, d, null);
      } else {
        const oldChain = chainOf(oldParent), newChain = chainOf(newParent);
        const lca = oldChain.find(x => newChain.includes(x)) || null;     // lowest ancestor both chains share
        propagate(oldParent, ASIS_KEYS.reduce((o, k) => { o[k] = -oldT[k]; return o; }, {}), lca);
        // A moved function brings its people and cost with it: they are added to the new parents in
        // full, not taken out of a leftover that parent happened to have.
        propagate(newParent, ASIS_KEYS.reduce((o, k) => { o[k] = newT[k]; return o; }, {}), lca, false);
        if (lca && ASIS_KEYS.some(k => d[k])) propagate(lca, d, null);     // a net change still reaches the shared ancestors
      }
    }
  }

  const updates = [], changed = [];
  Object.values(W).forEach(n => {
    if (spec.kind === 'edit' && n.id === spec.id) return;
    const b = before[n.id];
    if (ASIS_KEYS.every(k => b[k] === n.t[k])) return;
    updates.push({ id: n.id, fields: asIsFieldsFromTotals(n.t) });
    changed.push({ name: n.name, dHC: (n.t.mgr + n.t.emp) - (b.mgr + b.emp), dCost: roundMoney((n.t.mc + n.t.pc) - (b.mc + b.pc)) });
  });
  return { updates, targetTotals, orphans, raised, changed };
}

// Persists a plan produced by planAsIsMutation for the ancestors (and the root-attachment of orphans),
// then reports what happened. `targetFields` is whatever the caller writes on the function itself.
function applyAsIsMutation(plan) {
  plan.updates.forEach(u => updAsIsFn(u.id, u.fields));
  plan.orphans.forEach(id => updAsIsFn(id, { parent_id: null }));
  if (plan.raised.length) {
    toast('Totals adjusted', { description: plan.raised.map(r => `${r.name} was raised to cover its sub-functions.`).join(' ') });
  }
}
// Parents whose own figure is larger than what their direct sub-functions add up to — typically
// data imported or typed that way. The system cannot know which sub-function the difference
// belongs to, so it is reported (never "fixed") and the user assigns it. Works on AS-IS records.
function asIsUnallocatedParents(fns) {
  const out = [];
  fns.forEach(p => {
    const ks = fns.filter(c => c.parent_id === p.id);
    if (!ks.length) return;
    const sum = { hc: 0, cost: 0 };
    ks.forEach(c => { const t = asIsTotals(c); sum.hc += t.mgr + t.emp; sum.cost += t.mc + t.pc; });
    const pt = asIsTotals(p);
    const hc = (pt.mgr + pt.emp) - sum.hc;
    const cost = roundMoney((pt.mc + pt.pc) - sum.cost);
    if (hc > 0 || cost > 0) out.push({ id: p.id, name: p.function_name || 'Unnamed', hc: Math.max(0, hc), cost: Math.max(0, cost) });
  });
  return out;
}
function describeUnallocated(list) {
  const part = u => `${u.name}: ${[u.hc > 0 ? `${formatNumber(u.hc)} HC` : '', u.cost > 0 ? `${formatNumber(u.cost)} AZN` : ''].filter(Boolean).join(' and ')}`;
  const shown = list.slice(0, 4).map(part).join('; ');
  return shown + (list.length > 4 ? `; and ${list.length - 4} more` : '');
}

// ── AS-IS Baseline workshop: figures follow every change ──────────────────────────────────────────
// The workshop is a one-time copy of the AS-IS data and lives on its own from then on. Its working
// figures are each function's Proposed Managers + Proposed Professionals (people) and Proposed Cost;
// the percentages are shown next to them. The "As-Is" columns are the frozen copy and are never
// touched by anything below. A function moved or deleted in Phase 1 goes through the same planner as
// the AS-IS page (planAsIsMutation), so its parents and all the percentages follow. A figure typed in
// Phase 2 changes only that function. A number that was never touched is never silently changed.
function wfIsBaseline(wsId) {
  const ws = getWs().find(w => w.id === wsId);
  return !!ws && ws.source === 'as_is_baseline';
}
function wfContext(wsId) {
  const ws = getWs().find(w => w.id === wsId);
  const div = ws && getDivs().find(d => d.id === ws.division_id);
  return div ? { ws, div } : null;
}
function wfShape(fns) {
  return fns.map(f => ({
    id: f.id, function_name: f.proposed_function_name || 'Unnamed', parent_id: f.parent_id || null,
    manager_count: parseInt(f.manager_count) || 0, current_employee_count: parseInt(f.professional_count) || 0,
    managers_cost: parseFloat(f.proposed_budget) || 0, professionals_cost: 0,
  }));
}
function wfSplitCounts(total, mgr, prof) {
  const sum = mgr + prof;
  if (sum > 0) { const m = Math.round((total * mgr) / sum); return [m, total - m]; }
  return [0, total];
}
// Makes the stored working figures equal to what the cascade currently shows. A function whose
// numbers came from a percentage the user typed is turned into plain numbers first, so that a change
// elsewhere (which changes the pool that percentage is a share of) can't move it.
function wfMaterialize(wsId) {
  const ctx = wfContext(wsId);
  if (!ctx) return;
  const fns = getFns().filter(f => f.workshop_id === wsId);
  const cascaded = buildCascadedAllocations(fns, ctx.div.headcount_target || 0, ctx.div.budget_target || 0, state.phase3Values || {}, true);
  fns.forEach(f => {
    const c = cascaded[f.id] || {};
    const fields = {};
    const mgr = parseInt(f.manager_count) || 0, prof = parseInt(f.professional_count) || 0;
    if (c.proposedHC !== null && c.proposedHC !== undefined && c.proposedHC !== mgr + prof) {
      const [m, p] = wfSplitCounts(c.proposedHC, mgr, prof);
      fields.manager_count = m || null; fields.professional_count = p || null;
    }
    if (c.proposedHC !== null && c.proposedHC !== undefined && f.hc_allocation_percent_manual) fields.hc_allocation_percent_manual = false;
    if (c.proposedBudget !== null && c.proposedBudget !== undefined) {
      if (roundMoney(parseFloat(f.proposed_budget) || 0) !== roundMoney(c.proposedBudget) || !f.proposed_budget_manual) {
        fields.proposed_budget = roundMoney(c.proposedBudget); fields.proposed_budget_manual = true;
      }
    }
    if (Object.keys(fields).length) updFn(f.id, fields);
    if (state.phase3Values && state.phase3Values[f.id]) {
      delete state.phase3Values[f.id].hc_allocation_percent;
      delete state.phase3Values[f.id].proposed_budget;
    }
  });
}
// The percentages next to the figures are derived from them (share of the parent's figure, or of the
// target at the top level); nothing here changes a figure. The one exception is a percentage the user
// just typed in this session: people are whole, so 8% of a pool of 15 is 1 person and the box must
// keep saying 8 instead of snapping back to 6.67 — for as long as it still stands for the same
// figure. Every other percentage (seeded from the copy, or left over from an earlier pool) is always
// recomputed, so a stale number can never stay on screen.
function wfTypedPct(fnId) {
  if (!state._wfTyped) state._wfTyped = {};
  if (!state._wfTyped[fnId]) state._wfTyped[fnId] = {};
  return state._wfTyped[fnId];
}
function wfRefreshPercents(wsId) {
  const ctx = wfContext(wsId);
  if (!ctx) return;
  const fns = getFns().filter(f => f.workshop_id === wsId);
  const byId = Object.fromEntries(fns.map(f => [f.id, f]));
  const pcts = computeAsIsBaselinePercents(fns, ctx.div.headcount_target || 0, ctx.div.budget_target || 0);
  const hcOf = f => (parseInt(f.manager_count) || 0) + (parseInt(f.professional_count) || 0);
  fns.forEach(f => {
    const p = pcts[f.id] || {};
    const typed = wfTypedPct(f.id);
    const parent = f.parent_id ? byId[f.parent_id] : null;
    const poolHC = parent ? hcOf(parent) : (ctx.div.headcount_target || 0);
    const poolCost = parent ? (parseFloat(parent.proposed_budget) || 0) : (ctx.div.budget_target || 0);
    const hc = hcOf(f);
    const hasCost = f.proposed_budget !== null && f.proposed_budget !== undefined && f.proposed_budget !== '';
    const cost = parseFloat(f.proposed_budget) || 0;
    const keepHC = typed.hc !== undefined && poolHC > 0 && Math.round((poolHC * typed.hc) / 100) === hc;
    const keepCost = typed.cost !== undefined && hasCost && poolCost > 0 && roundMoney((poolCost * typed.cost) / 100) === roundMoney(cost);
    if (!keepHC) delete typed.hc;
    if (!keepCost) delete typed.cost;
    const next = {
      hc_allocation_percent: keepHC ? typed.hc : (hc > 0 ? (p.hcPercent ?? null) : null),
      cost_allocation_percent: keepCost ? typed.cost : (hasCost ? (p.costPercent ?? null) : null),
      hc_allocation_percent_manual: false,
    };
    const changed = Object.keys(next).some(k => (f[k] ?? null) !== next[k]);
    if (changed) updFn(f.id, next);
    if (state.phase3Values && state.phase3Values[f.id]) {
      delete state.phase3Values[f.id].hc_allocation_percent;
      delete state.phase3Values[f.id].cost_allocation_percent;
    }
  });
}
// Writes what planAsIsMutation decided back onto the workshop functions.
function wfPersist(plan, targetId) {
  const asFields = t => ({ manager_count: t.mgr || null, professional_count: t.emp || null, proposed_budget: roundMoney(t.mc + t.pc), proposed_budget_manual: true });
  plan.updates.forEach(u => updFn(u.id, {
    manager_count: u.fields.manager_count || null, professional_count: u.fields.current_employee_count || null,
    proposed_budget: roundMoney(u.fields.managers_cost + u.fields.professionals_cost), proposed_budget_manual: true,
  }));
  plan.orphans.forEach(id => updFn(id, { parent_id: '' }));
  if (targetId && plan.targetTotals) updFn(targetId, asFields(plan.targetTotals));
}
function wfFinish(wsId, plan) {
  wfRefreshPercents(wsId);
  recomputeAndSaveAllCascaded(wsId, state.phase3Values || {});
  if (plan && plan.raised.length) {
    toast('Totals adjusted', { description: plan.raised.map(r => `${r.name} was raised to cover its sub-functions.`).join(' ') });
  }
}
// Phase 1: a function is moved under another parent (or to the top level). Its figures leave the old
// chain of parents and join the new one in full. Returns the list of changed parents, or null if the
// move would put a function inside itself.
// Normal (non AS-IS) workshop: numbers are shares of the parent's pool, so a function that changes
// parent would silently become a share of a different pool (5 of a 10-person unit turning into 100
// of a 200 target). It keeps its own Proposed HC and Cost instead: its percentages are re-expressed
// against the new pool. The parents keep their figures; their Children Allocation shows the change.
function wfKeepFiguresUnder(ws, ids, parentOf) {
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) return;
  const before = Object.fromEntries(freshWorkshopFns(ws).map(f => [f.id, f]));
  ids.forEach(id => {
    const f = before[id];
    if (!f) return;
    const pid = parentOf(id);
    const parent = pid ? before[pid] : null;
    const poolHC = parent ? (parent.proposed_hc || 0) : (div.headcount_target || 0);
    const poolCost = parent ? (parent.proposed_budget || 0) : (div.budget_target || 0);
    const fields = {};
    if (f.proposed_hc !== null && f.proposed_hc !== undefined && poolHC > 0) {
      let pct = Math.round((f.proposed_hc / poolHC) * 10000) / 100;
      if (Math.round((poolHC * pct) / 100) !== f.proposed_hc) pct = Math.round((f.proposed_hc / poolHC) * 1e6) / 1e4;
      fields.hc_allocation_percent = pct;
    }
    if (f.proposed_budget !== null && f.proposed_budget !== undefined) {
      fields.proposed_budget = roundMoney(f.proposed_budget);
      fields.proposed_budget_manual = true;
      if (poolCost > 0) fields.cost_allocation_percent = Math.round((f.proposed_budget / poolCost) * 10000) / 100;
    }
    if (state.phase3Values && state.phase3Values[id]) {
      delete state.phase3Values[id].hc_allocation_percent; delete state.phase3Values[id].proposed_budget; delete state.phase3Values[id].cost_allocation_percent;
    }
    if (Object.keys(fields).length) updFn(id, fields);
  });
}

function workshopMoveFunction(wsId, fnId, newParentId) {
  if (!wfIsBaseline(wsId)) {
    const ws = getWs().find(w => w.id === wsId);
    const all = getFns().filter(f => f.workshop_id === wsId);
    if (newParentId && (newParentId === fnId || getDescendantIds(fnId, all).has(newParentId))) return null;
    if (ws) wfKeepFiguresUnder(ws, [fnId], () => newParentId || null);
    updFn(fnId, { parent_id: newParentId || '' });
    recomputeAndSaveAllCascaded(wsId, state.phase3Values || {});
    return [];
  }
  wfMaterialize(wsId);
  const fns = getFns().filter(f => f.workshop_id === wsId);
  const plan = planAsIsMutation(wfShape(fns), { floor: false, kind: 'edit', id: fnId, newParentId: newParentId || null });
  if (plan === null) return null;
  wfPersist(plan, fnId);
  updFn(fnId, { parent_id: newParentId || '' });
  wfFinish(wsId, plan);
  return plan.changed;
}
// Phase 1: a function is removed. Its whole figure comes off every parent above it; its direct
// sub-functions are kept and attached straight to the top level with their own figures.
function workshopDeleteFunction(wsId, fnId) {
  const orphans = getFns().filter(f => f.workshop_id === wsId && f.parent_id === fnId).map(f => f.id);
  if (!wfIsBaseline(wsId)) {
    const ws = getWs().find(w => w.id === wsId);
    if (ws) wfKeepFiguresUnder(ws, orphans, () => null);   // they become top-level, keeping their numbers
    orphans.forEach(id => updFn(id, { parent_id: '' }));
    delFn(fnId);
    recomputeAndSaveAllCascaded(wsId, state.phase3Values || {});
    return { changed: [], orphans: orphans.length };
  }
  wfMaterialize(wsId);
  const fns = getFns().filter(f => f.workshop_id === wsId);
  const plan = planAsIsMutation(wfShape(fns), { floor: false, kind: 'delete', id: fnId });
  wfPersist(plan, null);
  delFn(fnId);
  wfFinish(wsId, plan);
  return { changed: plan.changed, orphans: plan.orphans.length };
}
// Phase 2: a figure is typed on a card — Proposed Managers / Professionals / Cost as numbers, or a
// percentage (which is turned into the number it stands for). Only that function changes. Its
// parent keeps the figure it was given: when the children together go past it, the "Children
// Allocation" scale on the parent shows it (and the user decides what to change).
function workshopEditFigure(wsId, fnId, field, rawValue) {
  const ctx = wfContext(wsId);
  if (!ctx) return;
  wfMaterialize(wsId);
  const fns = getFns().filter(f => f.workshop_id === wsId);
  const f = fns.find(x => x.id === fnId);
  if (!f) return;
  const parentFn = f.parent_id ? fns.find(x => x.id === f.parent_id) : null;
  const poolHC = parentFn ? (parseInt(parentFn.manager_count) || 0) + (parseInt(parentFn.professional_count) || 0) : (ctx.div.headcount_target || 0);
  const poolCost = parentFn ? (parseFloat(parentFn.proposed_budget) || 0) : (ctx.div.budget_target || 0);
  let mgr = parseInt(f.manager_count) || 0, prof = parseInt(f.professional_count) || 0, cost = parseFloat(f.proposed_budget) || 0;
  if (field === 'manager_count') mgr = Math.max(0, parseInt(rawValue) || 0);
  else if (field === 'professional_count') prof = Math.max(0, parseInt(rawValue) || 0);
  else if (field === 'proposed_budget') cost = Math.max(0, parseMoney(rawValue));
  else if (field === 'hc_allocation_percent' || field === 'cost_allocation_percent') {
    const pct = parseFloat(rawValue);
    if (!isFinite(pct) || pct < 0) { wfFinish(wsId, null); return; }
    if (field === 'hc_allocation_percent') { [mgr, prof] = wfSplitCounts(Math.round((poolHC * pct) / 100), mgr, prof); }
    else cost = roundMoney((poolCost * pct) / 100);
  } else return;
  const mem = wfTypedPct(fnId);
  if (field === 'hc_allocation_percent') mem.hc = parseFloat(rawValue);
  else if (field === 'cost_allocation_percent') mem.cost = parseFloat(rawValue);
  else if (field === 'manager_count' || field === 'professional_count') delete mem.hc;
  else if (field === 'proposed_budget') delete mem.cost;
  updFn(fnId, { manager_count: mgr || null, professional_count: prof || null, proposed_budget: roundMoney(cost), proposed_budget_manual: true });
  wfFinish(wsId, null);
}

// The AS-IS side of an AS-IS Baseline workshop's dashboard and charts is the original AS-IS data,
// whatever was moved or removed in the workshop since (the workshop's own "As-Is" copy is frozen).
function getWorkshopAsIs(ws) {
  return getAsIs().filter(f => f.division_id === ws.division_id);
}

function describeAsIsChanges(changed) {
  const shown = (changed || []).filter(c => c.dHC || c.dCost);
  if (!shown.length) return '';
  const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + formatNumber(Math.abs(n));
  return shown.map(c => `${c.name} ${sg(c.dHC)} people / ${sg(c.dCost)} AZN`).join('; ');
}

function announceAsIsMove(changed) {
  const text = describeAsIsChanges(changed);
  if (text) toast('Function moved. Totals updated: ' + text);
}

// Bulk-creates AS-IS functions from an uploaded "Function Register" workbook (see
// app.autofillAsIsFromExcel). Scans for the header row instead of assuming a fixed row number,
// since the standard template has it at row 6 but a user's copy could easily have an extra note
// row inserted above it.
function importAsIsFunctionsFromWorkbook(divisionId, arrayBuffer) {
  if (typeof XLSX === 'undefined') { toast('Excel import library not available', { type: 'error' }); return; }
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames.find(n => /function\s*register/i.test(n)) || wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : null;
  if (!sheet) { toast('No readable sheet found in the file', { type: 'error' }); return; }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  const norm = v => String(v == null ? '' : v).trim().toLowerCase();
  let headerRowIdx = -1;
  let cols = {};
  for (let r = 0; r < rows.length; r++) {
    const idx = {};
    (rows[r] || []).forEach((cell, c) => {
      const h = norm(cell);
      if (h === '#') idx.marker = c;
      else if (h === 'function title') idx.name = c;
      else if (h === 'parent function') idx.parent = c;
      else if (h === 'managers') idx.mgr = c;
      else if (h === 'professionals') idx.prof = c;
      else if (h === 'managers cost (azn)') idx.mgrCost = c;
      else if (h === 'professionals cost (azn)') idx.profCost = c;
    });
    if (idx.name !== undefined) { headerRowIdx = r; cols = idx; break; }
  }
  if (headerRowIdx === -1) {
    toast('Could not find a "Function Title" column in this file', { type: 'error' });
    return;
  }

  // Every number is checked: text, negatives, part-people and sub-qapik amounts are corrected and
  // reported instead of being stored silently.
  const notes = [];
  const note = (name, msg) => { notes.push(`${name}: ${msg}`); };
  const num = (v, name, label, whole) => {
    const raw = String(v == null ? '' : v).trim();
    if (raw === '') return 0;
    let n = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) { note(name, `${label} "${raw}" is not a number, set to 0`); return 0; }
    if (n < 0) { note(name, `${label} ${n} is negative, set to 0`); return 0; }
    if (whole && !Number.isInteger(n)) { const r = Math.round(n); note(name, `${label} ${n} rounded to ${r}`); n = r; }
    return whole ? n : roundMoney(n);
  };
  const parsedRows = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[cols.name] == null ? '' : row[cols.name]).trim();
    if (!name) continue;
    // The template's own TOTAL row (and any caption/notes below it, e.g. "Percentages show...")
    // is a footer, not a function -- stop at the first one instead of importing it as data.
    if (name.toLowerCase() === 'total') break;
    // The template's ROOT row (marked "ROOT" in the "#" column) is only a name for other rows
    // to report into -- it isn't a function with its own headcount/cost, and isn't created here.
    // Any row whose Parent Function names it simply won't match a sibling below and falls back
    // to "no parent" (reports directly to the division), which is exactly the intended result.
    if (cols.marker !== undefined && String(row[cols.marker] == null ? '' : row[cols.marker]).trim().toLowerCase() === 'root') continue;
    parsedRows.push({
      name,
      parent: cols.parent !== undefined ? String(row[cols.parent] == null ? '' : row[cols.parent]).trim() : '',
      mgr: cols.mgr !== undefined ? num(row[cols.mgr], name, 'Managers', true) : 0,
      prof: cols.prof !== undefined ? num(row[cols.prof], name, 'Professionals', true) : 0,
      mgrCost: cols.mgrCost !== undefined ? num(row[cols.mgrCost], name, 'Managers Cost') : 0,
      profCost: cols.profCost !== undefined ? num(row[cols.profCost], name, 'Professionals Cost') : 0,
    });
  }
  if (parsedRows.length === 0) {
    toast('No function rows found under the header in this file', { type: 'error' });
    return;
  }

  // The register is this division's AS-IS structure, not an addition to it. Importing used to
  // append unconditionally, so running the autofill twice left two full copies — each row with a
  // fresh id, so both copies also reached the cloud and came back on the next load. Parked here
  // for confirmation rather than replacing silently, since the existing rows may be hand-edited.
  parsedRows.notes = notes;
  const existing = getAsIs().filter(f => f.division_id === divisionId);
  if (existing.length > 0) {
    state._pendingAsIsImport = { divisionId, parsedRows };
    showConfirmDialog({
      title: 'Replace the current functions?',
      message: `This division already has ${existing.length} function${existing.length !== 1 ? 's' : ''}. `
        + `Importing replaces them with the ${parsedRows.length} row${parsedRows.length !== 1 ? 's' : ''} in this file. `
        + `Any edits made to the current functions will be lost.`,
      confirmLabel: 'Replace',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: 'app.applyPendingAsIsImport()',
    });
    return;
  }

  applyAsIsImportRows(divisionId, parsedRows);
}

// Creates the imported rows in two passes: every row first (so every name has an id to link to),
// then Parent Function resolved by matching its text against another imported row's Function
// Title. A Parent Function that doesn't match a sibling -- blank, or one of the template's
// division-name placeholders -- is treated as reporting directly to the division root, same as
// leaving Parent Function unset in the manual "Add Function" flow.
function applyAsIsImportRows(divisionId, parsedRows) {
  const notes = [...(parsedRows.notes || [])];
  const nameToId = {};
  const usedIds = new Set();
  const seenNames = new Set();
  parsedRows.forEach(r => {
    // A deterministic id makes the import idempotent: the same register imported again lands on
    // the same rows and overwrites them, instead of creating a second set the cloud then merges
    // back in as extras.
    let id = asIsImportId(divisionId, r.name);
    if (usedIds.has(id)) id = genId();   // same Function Title twice in one file
    usedIds.add(id);
    const key = r.name.toLowerCase();
    if (seenNames.has(key)) notes.push(`${r.name}: the title appears more than once; sub-functions are attached to the last one`);
    seenNames.add(key);
    const fn = addAsIsFn(divisionId, r.name, id);
    updAsIsFn(fn.id, {
      manager_count: r.mgr,
      current_employee_count: r.prof,
      current_function_hc: r.mgr + r.prof,
      managers_cost: roundMoney(r.mgrCost),
      professionals_cost: roundMoney(r.profCost),
      current_budget: roundMoney(r.mgrCost + r.profCost),
    });
    r._id = fn.id;
    nameToId[key] = fn.id;
  });
  // Parents are linked one by one; a link that would close a loop (A under B under A) is refused.
  const parentOf = {};
  const wouldLoop = (childId, parentId) => {
    let cur = parentId; const seen = new Set();
    while (cur && !seen.has(cur)) { if (cur === childId) return true; seen.add(cur); cur = parentOf[cur]; }
    return false;
  };
  const divName = ((getDivs().find(d => d.id === divisionId) || {}).structure_name || '').toLowerCase();
  parsedRows.forEach(r => {
    if (!r.parent) return;
    const selfId = r._id;
    const parentId = nameToId[r.parent.toLowerCase()];
    if (!parentId) {
      if (r.parent.toLowerCase() !== divName) notes.push(`${r.name}: parent "${r.parent}" was not found in the file, placed at the top level`);
      return;
    }
    if (parentId === selfId) { notes.push(`${r.name}: a function cannot be its own parent, placed at the top level`); return; }
    if (wouldLoop(selfId, parentId)) { notes.push(`${r.name}: putting it under "${r.parent}" would create a loop, placed at the top level`); return; }
    parentOf[selfId] = parentId;
    updAsIsFn(selfId, { parent_id: parentId });
  });

  renderWorkspace();
  toast(`Imported ${parsedRows.length} function${parsedRows.length !== 1 ? 's' : ''} from Excel`);
  if (notes.length) {
    toast(`${notes.length} correction${notes.length !== 1 ? 's' : ''} made while importing`, {
      type: 'error',
      description: notes.slice(0, 5).join('. ') + (notes.length > 5 ? `. And ${notes.length - 5} more.` : '.'),
    });
    console.warn('[import] corrections:', notes);
  }
}

// ═══════════════════════════════════════════
// ACCOUNTS (profiles: role + personal details)
// These rows carry NO password — Supabase Auth owns credentials. `id` is the auth account's id,
// not a locally generated one, which is what ties a profile to a login and to the RLS policies.
// The local copy is a cache of what the server returned; RLS decides what that contains (every
// profile for an admin, only their own for anyone else).
// ═══════════════════════════════════════════
function getUsers() { return lsGet(LS.users, []); }

// authUserId comes from sbCreateAccount — profiles.id must equal the auth user's id.
function addUser(authUserId, data) {
  const users = getUsers(); const now = new Date().toISOString();
  const u = { id: authUserId, ...data, created_at: now, updated_at: now };
  delete u.password;
  users.push(u); lsSet(LS.users, users);
  if (window.zbodSupabase) window.zbodSupabase.sbSaveProfile(u);
  return u;
}
function updUser(id, updates) {
  const clean = { ...updates };
  delete clean.password;
  const users = getUsers().map(u => u.id === id ? {...u, ...clean, updated_at: new Date().toISOString()} : u);
  lsSet(LS.users, users);
  const updated = users.find(u => u.id === id);
  if (updated && window.zbodSupabase) window.zbodSupabase.sbSaveProfile(updated);
}
// Deletes the account for real — profile and Supabase Auth entry both — so the email is released
// and the same person can be added again as though they had never been here. The Auth side is done
// by zbod_delete_user() inside the database (see supabase_delete_user.sql), because a browser has
// no rights over auth.users and must never carry a key that would grant them.
function delUser(id) {
  lsSet(LS.users, getUsers().filter(u => u.id !== id));
  if (window.zbodSupabase) window.zbodSupabase.sbDeleteProfile(id);
}

// Only accounts that may actually sign in. Deactivated ones stay in storage so they can be
// reactivated, but they must not appear as CxO options, strategic-overview entries, and so on.
function getActiveUsers() { return getUsers().filter(u => u.is_active !== false); }

// Resolves a signed-in email to the name shown at the top of the ZBOD tool / Admin Panel. The
// signed-in account's own name comes from its loaded profile; any other email is looked up in the
// cached profile list.
function getDisplayName(email) {
  if (!email) return '';
  if (currentProfile && (currentProfile.email || '').toLowerCase() === email.toLowerCase()) {
    return currentProfile.fullName || email;
  }
  const user = getUsers().find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  return (user && user.fullName) || email;
}

// One or two letters for the avatar button — first letters of up to the first two words of the
// display name (e.g. "Aygun Aliyeva" -> "AA", "Admin" -> "A", an email fallback -> its first
// letter).
function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

// m13/m14 were retired. Pruning here rather than at render keeps every consumer on the same
// indexes — updateMetric() addresses rows by position, so a stale row would shift the writes.
const RETIRED_METRIC_IDS = ['m13', 'm14'];
function getMetrics() {
  const all = lsGet(LS.metrics, {});
  Object.keys(all).forEach(k => {
    if (Array.isArray(all[k])) all[k] = all[k].filter(m => m && !RETIRED_METRIC_IDS.includes(m.id));
  });
  return all;
}

// AS-IS Metrics are per division, and were the last thing still living only in the browser that
// typed them: nothing ever pushed them to Supabase and nothing read them back, so a colleague
// opening the same structure saw every field empty. Synced the same way as the AAA cards — one
// landing_box_settings row per division, box_id = 'metrics_<divisionId>' — so no schema change.
// Only the structure that actually changed is pushed. Writing the whole map meant every keystroke
// re-uploaded every other structure's metrics from this browser's copy — which is as old as the
// tab — silently reverting a colleague's newer numbers, and firing a sync-failure warning for each
// structure this account is not allowed to write.
function setMetrics(metrics, changedDivId) {
  lsSet(LS.metrics, metrics);
  if (!changedDivId || !window.zbodSupabase || !window.zbodSupabase.supabaseAvailable) return;
  window.zbodSupabase.sbSaveLandingBox({
    box_id: 'metrics_' + changedDivId,
    title: 'AS-IS Metrics',
    content: JSON.stringify(metrics[changedDivId] || []),
    position_order: 9100,
  });
}
function getAAACards() { return lsGet(LS.aaaCards, {}); }
// Same rule as setMetrics: push only the structure that changed.
function setAAACards(cards, changedDivId) {
  lsSet(LS.aaaCards, cards);
  if (!changedDivId || !window.zbodSupabase || !window.zbodSupabase.supabaseAvailable) return;
  window.zbodSupabase.sbSaveLandingBox({
    box_id: 'aaa_cards_' + changedDivId,
    title: 'AAA Cards',
    content: JSON.stringify(cards[changedDivId] || []),
    position_order: 9000,
  });
}

// ═══════════════════════════════════════════
// STRATEGIC OVERVIEW (per CxO, per area of responsibility)
// Every other landing block is company-wide ZBOD methodology, shared by everyone. This one is not:
// the admin fills in a separate set of targets for each C-level, and separately again for each
// area that C-level is responsible for — one person can own two (a CHRO covering both Human
// Resources and, say, Legal), and those areas have different numbers.
//
// Storage: one landing_box_settings row per CxO, keyed by their profile id
// (box_id = 'strategic_overview_<cxoProfileId>'), whose content is a map of
// { [areaName]: overviewObject }. Keying the row by person rather than by person+area keeps the
// box_id free of the area text, so renaming an area cannot orphan a row, and no schema change is
// needed. Locally the same shape lives under LS.strategicOverviews.
//
// Who sees what (mirrored by RLS on landing_box_settings, see supabase_strategic_overview.sql):
//   admin — every CxO, every area, and the only one who may edit
//   HRBP  — only the CxOs assigned to structures they own, read-only
//   CxO   — their own areas, read-only
// ═══════════════════════════════════════════
const STRATEGIC_OVERVIEW_METRICS = [
  '# of emp',
  'People Budget',
  'Company Revenue',
  'Revenue per Emp',
  'Cost per HC',
  'People Budget / Revenue',
  'EBITDA per Employee',
  'Procurement opt. target',
];
const STRATEGIC_OVERVIEW_COLUMNS = ['STRATEGIC METRICS', '2025', '2026', 'TARGET', '2027'];
const STRATEGIC_OVERVIEW_SUBTITLE = 'When designing the structure, these points must be taken into consideration.';

// A CxO may hold more than one area of responsibility. They are typed into the single "Area of
// Responsibility" field on Manage Users, separated by commas or slashes, and split back out here —
// each becomes its own option in the Strategic Overview picker with its own set of numbers.
function parseAreas(areaField) {
  if (!areaField || typeof areaField !== 'string') return [];
  return areaField.split(/[,;/]/).map(a => a.trim()).filter(Boolean);
}

// An area with nothing saved yet starts from the standard metric names with EMPTY values — never
// another area's (or the old company-wide) numbers, which would read as if they belonged here.
// Metric names carry over from the previously saved company-wide table when one exists, so an
// admin's customised metric list isn't lost.
function blankStrategicOverview() {
  const legacy = lsGet('zbod_strategic_overview', null);
  const metrics = (legacy && Array.isArray(legacy.rows) && legacy.rows.length > 0)
    ? legacy.rows.map(r => ({ metric: r.metric || '', highlight: !!r.highlight }))
    : STRATEGIC_OVERVIEW_METRICS.map(m => ({ metric: m, highlight: false }));
  return {
    title: 'STRATEGIC OVERVIEW',
    subtitle: (legacy && legacy.subtitle) || STRATEGIC_OVERVIEW_SUBTITLE,
    columns: (legacy && Array.isArray(legacy.columns) && legacy.columns.length === 5)
      ? [...legacy.columns] : [...STRATEGIC_OVERVIEW_COLUMNS],
    rows: metrics.map(m => ({ metric: m.metric, c2025: '', c2026: '', target: '', c2027: '', highlight: m.highlight })),
  };
}

// { [cxoProfileId]: { [areaName]: overviewObject } }
function getStrategicOverviews() { return lsGet(LS.strategicOverviews, {}); }

function getStrategicOverview(cxoId, area) {
  if (!cxoId || !area) return null;
  const byArea = getStrategicOverviews()[cxoId];
  if (!byArea || typeof byArea !== 'object') return null;
  const so = byArea[area];
  return so && typeof so === 'object' ? so : null;
}

function setStrategicOverview(cxoId, area, so) {
  if (!cxoId || !area) return;
  const all = getStrategicOverviews();
  if (!all[cxoId] || typeof all[cxoId] !== 'object') all[cxoId] = {};
  all[cxoId][area] = so;
  lsSet(LS.strategicOverviews, all);
  if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
    try {
      // The whole per-CxO map goes up as one row, so saving one area never drops the others.
      window.zbodSupabase.sbSaveLandingBox({
        box_id: 'strategic_overview_' + cxoId,
        title: 'STRATEGIC OVERVIEW',
        content: JSON.stringify(all[cxoId]),
        position_order: 810,
      });
    } catch (e) { console.warn('Supabase strategic overview sync failed:', e); }
  }
}

// The (CxO, area) pairs this account may look at, in picker order.
//   admin — all of them
//   CxO   — their own areas
//   HRBP  — the CxOs they assigned to structures they own
// Returns [{ cxoId, cxoName, area, label }].
function getStrategicOverviewOptions() {
  const cxos = getActiveUsers().filter(u => u.role === 'cxo');
  let allowed = cxos;
  if (!isCurrentUserAdmin()) {
    const email = getCurrentEmail();
    if (isCurrentUserCxo()) {
      allowed = cxos.filter(c => (c.email || '').toLowerCase() === email);
    } else {
      // An HRBP sees a C-level's targets because they assigned that C-level to a structure of
      // their own — the assignment is what grants the view.
      const assigned = new Set(
        getDivs()
          .filter(d => (d.owner_email || '').toLowerCase() === email)
          .map(d => (d.cxo_email || '').toLowerCase())
          .filter(Boolean)
      );
      allowed = cxos.filter(c => assigned.has((c.email || '').toLowerCase()));
    }
  }
  const options = [];
  allowed.forEach(c => {
    parseAreas(c.areaOfResponsibility).forEach(area => {
      options.push({
        cxoId: c.id,
        cxoName: c.fullName || c.email || 'CxO',
        area,
        label: `${c.fullName || c.email || 'CxO'} — ${area}`,
      });
    });
  });
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

// Admin only. These are company strategy targets rather than workshop working data, so HRBPs and
// CxOs read the numbers relevant to them but never set them — the single place the values come
// from is the Admin Panel.
function canEditStrategicOverview(option) {
  return !!option && isCurrentUserAdmin();
}

// ═══════════════════════════════════════════
// SUPABASE INTEGRATION
// ═══════════════════════════════════════════
let sb = window.zbodSupabase;

function mergeCloudTable(key, table, cloudRows, loadStartedAt) {
  if (!Array.isArray(cloudRows)) return;           // the read failed: keep the local copy as it is
  const z = window.zbodSupabase || {};
  const lastLoads = lsGet('zbod_last_cloud_load', {});
  const lastLoad = lastLoads[table] ? new Date(lastLoads[table]) : null;
  const local = lsGet(key, []);
  const localById = new Map(local.map(r => [r.id, r]));
  const cloudIds = new Set(cloudRows.map(r => r.id));
  const merged = [];
  cloudRows.forEach(c => {
    if (z.sbIsTombstoned && z.sbIsTombstoned(table, c.id)) return;      // deleted here; the delete is on its way
    const l = localById.get(c.id);
    merged.push(l && new Date(l.updated_at || 0) > new Date(c.updated_at || 0) ? l : c);
  });
  local.forEach(l => {
    if (cloudIds.has(l.id)) return;
    const pending = z.sbOutboxHas && z.sbOutboxHas(table, l.id);
    const touched = new Date(l.updated_at || l.created_at || 0);
    // Kept only if it is new on this device and simply not uploaded yet. Otherwise it was deleted
    // elsewhere (or access to it was taken away) and the local copy goes too.
    if (pending || !lastLoad || touched > lastLoad) merged.push(l);
  });
  if (z.sbForgetTombstones) z.sbForgetTombstones(table, cloudIds);
  lsSet(key, merged);
  lastLoads[table] = loadStartedAt;
  lsSet('zbod_last_cloud_load', lastLoads);
}

async function loadFromSupabase() {
  sb = window.zbodSupabase;
  if (!sb || !sb.supabaseAvailable) {
    console.log('Supabase not available, using localStorage data');
    return;
  }
  try {
    console.log('Loading data from Supabase...');
    const data = await sb.sbLoadAll();
    if (!data) return;

    // Each table is merged the same way (mergeCloudTable): the newer copy of a row wins; a row deleted
    // on this device is not merged back in; and a local row the cloud no longer has — deleted on another
    // device, or this account lost access to it — is removed, unless it is new here and not uploaded yet.
    const loadStartedAt = data.startedAt || new Date().toISOString();
    mergeCloudTable(LS.users, 'profiles', data.users, loadStartedAt);
    mergeCloudTable(LS.divisions, 'divisions', data.divisions, loadStartedAt);
    mergeCloudTable(LS.workshops, 'workshops', data.workshops, loadStartedAt);
    mergeCloudTable(LS.functions, 'workshop_functions', data.functions, loadStartedAt);
    mergeCloudTable(LS.asIs, 'as_is_functions', data.asIsFns, loadStartedAt);

    // Restore landing page content blocks from Supabase to localStorage
    if (data.landingBoxes && data.landingBoxes.length > 0) {
      const glItems = [];
      const mqItems = [];
      const sqItems = [];
      const bfItems = [];

      data.landingBoxes.forEach(box => {
        try {
          const { box_id, title, content } = box;

          // AAA cards per division (box_id = 'aaa_cards_<divisionId>')
          if (box_id && box_id.startsWith('aaa_cards_')) {
            const divId = box_id.slice('aaa_cards_'.length);
            try {
              const parsed = JSON.parse(content || '[]');
              const allCards = lsGet(LS.aaaCards, {});
              allCards[divId] = parsed;
              lsSet(LS.aaaCards, allCards);
            } catch(e) {}
            return;
          }

          // AS-IS Metrics per division (box_id = 'metrics_<divisionId>')
          if (box_id && box_id.startsWith('metrics_')) {
            const divId = box_id.slice('metrics_'.length);
            try {
              const parsed = JSON.parse(content || '[]');
              if (Array.isArray(parsed)) {
                const allMetrics = lsGet(LS.metrics, {});
                allMetrics[divId] = parsed;
                lsSet(LS.metrics, allMetrics);
              }
            } catch(e) {}
            return;
          }

          // Strategic overview per CxO (box_id = 'strategic_overview_<cxoProfileId>'), whose
          // content is a { [area]: overview } map. Checked before the switch below, which still
          // handles the legacy company-wide 'strategic_overview' row (no trailing underscore, so
          // the two never collide).
          if (box_id && box_id.startsWith('strategic_overview_')) {
            const cxoId = box_id.slice('strategic_overview_'.length);
            try {
              const parsed = JSON.parse(content || '{}');
              if (parsed && typeof parsed === 'object') {
                const allSo = lsGet(LS.strategicOverviews, {});
                allSo[cxoId] = parsed;
                lsSet(LS.strategicOverviews, allSo);
              }
            } catch(e) {}
            return;
          }

          switch (box_id) {
            case 'overview': {
              const curr = lsGet(LS.landing, {});
              lsSet(LS.landing, { ...curr, overviewTitle: title || curr.overviewTitle, overviewText: content || curr.overviewText });
              break;
            }
            case 'guideline_title':
              lsSet('zbod_guideline_title', title);
              break;
            case 'gl1': case 'gl2': case 'gl3': case 'gl4': case 'gl5': case 'gl6': case 'gl7':
              glItems.push({ id: box_id, title, text: content, order: box.position_order });
              break;
            case 'problems':
              try { lsSet('zbod_problems', JSON.parse(content || '[]')); } catch(e) {}
              if (title) lsSet('zbod_problems_title', title);
              break;
            case 'questions_title':
              if (title) lsSet('zbod_questions_title', title);
              break;
            case 'mq1': case 'mq2': case 'mq3': case 'mq4': case 'mq5':
              mqItems.push({ id: box_id, label: title, text: content, order: box.position_order });
              break;
            case 'quote':
              if (content !== undefined) lsSet('zbod_quote', content);
              break;
            case 'strategic_title':
              if (title) lsSet('zbod_strategic_title', title);
              break;
            case 'sq1': case 'sq2': case 'sq3': case 'sq4':
              sqItems.push({ id: box_id, label: title, text: content, order: box.position_order });
              break;
            case 'benefits_title':
              if (title) lsSet('zbod_benefits_title', title);
              break;
            case 'bf1': case 'bf2': case 'bf3': case 'bf4': case 'bf5':
              bfItems.push({ id: box_id, title, text: content });
              break;
            case 'fcmatrix':
              try { lsSet('zbod_fcmatrix', JSON.parse(content || '[]')); } catch(e) {}
              if (title) lsSet('zbod_fcmatrix_title', title);
              break;
            case 'support':
              try { lsSet('zbod_support', JSON.parse(content || '[]')); } catch(e) {}
              if (title) lsSet('zbod_support_title', title);
              break;
            case 'principles':
              try { lsSet('zbod_principles', JSON.parse(content || '[]')); } catch(e) {}
              if (title) lsSet('zbod_principles_title', title);
              break;
            // Legacy company-wide record from before Strategic Overview became per-division. No
            // longer rendered anywhere, but kept intact so nothing the admin entered is destroyed —
            // blankStrategicOverview() still reads its metric names when seeding a new structure.
            case 'strategic_overview':
              try { lsSet('zbod_strategic_overview', JSON.parse(content || '{}')); } catch(e) {}
              break;
          }
        } catch (e) {
          console.warn('Failed to restore landing box:', box.box_id, e);
        }
      });

      // Rebuild guideline array from individual rows
      if (glItems.length > 0) {
        const iconKeys = ['compass', 'target', 'userCog', 'users', 'userCheck', 'layers', 'dollar'];
        const existing = lsGet('zbod_guidelines', null);
        glItems.sort((a, b) => a.order - b.order);
        const merged = glItems.map((g, i) => ({
          id: g.id,
          iconKey: (existing && existing[i] && existing[i].iconKey) || iconKeys[i] || 'target',
          title: g.title,
          text: g.text,
        }));
        lsSet('zbod_guidelines', merged);
      }

      // Rebuild main questions array
      if (mqItems.length > 0) {
        mqItems.sort((a, b) => a.order - b.order);
        lsSet('zbod_questions', mqItems.map(q => ({ id: q.id, label: q.label, text: q.text })));
      }

      // Rebuild the Key Benefits cards (by id, so a partial set still lands in the right slots)
      if (bfItems.length > 0) {
        const merged = getBenefits();
        bfItems.forEach(b => {
          const i = merged.findIndex(x => x.id === b.id);
          if (i >= 0) merged[i] = { ...merged[i], title: b.title || merged[i].title, text: b.text !== undefined && b.text !== null ? b.text : merged[i].text };
        });
        lsSet('zbod_benefits', merged);
      }

      // Rebuild strategic questions array
      if (sqItems.length > 0) {
        sqItems.sort((a, b) => a.order - b.order);
        lsSet('zbod_strategic', sqItems.map(s => ({ id: s.id, label: s.label, text: s.text })));
      }
    }

    console.log('Supabase data loaded and merged');
  } catch (e) {
    console.warn('Failed to load from Supabase:', e);
  }
}

// ═══════════════════════════════════════════
// MIGRATION: localStorage → Supabase (one-time)
// ═══════════════════════════════════════════
function buildLandingBoxesFromLocalStorage() {
  const boxes = [];
  const cards = getAAACards();

  const landing = lsGet(LS.landing, null);
  if (landing && (landing.overviewTitle || landing.overviewText)) {
    boxes.push({ box_id: 'overview', title: landing.overviewTitle || '', content: landing.overviewText || '', position_order: 0 });
  }

  const guidelineTitle = lsGet('zbod_guideline_title', null);
  if (guidelineTitle) boxes.push({ box_id: 'guideline_title', title: guidelineTitle, content: '', position_order: 0 });

  const guidelines = lsGet('zbod_guidelines', null);
  if (guidelines && Array.isArray(guidelines)) {
    guidelines.forEach((g, i) => boxes.push({ box_id: g.id || `gl${i+1}`, title: g.title || '', content: g.text || '', position_order: i + 1 }));
  }

  const problems = lsGet('zbod_problems', null);
  if (problems && Array.isArray(problems)) {
    boxes.push({ box_id: 'problems', title: lsGet('zbod_problems_title', 'PROBLEM STATEMENT'), content: JSON.stringify(problems), position_order: 99 });
  }

  const questionsTitle = lsGet('zbod_questions_title', null);
  if (questionsTitle) boxes.push({ box_id: 'questions_title', title: questionsTitle, content: '', position_order: 195 });

  const questions = lsGet('zbod_questions', null);
  if (questions && Array.isArray(questions)) {
    questions.forEach((q, i) => boxes.push({ box_id: q.id || `mq${i+1}`, title: q.label || '', content: q.text || '', position_order: 200 + i }));
  }

  const quote = lsGet('zbod_quote', null);
  if (quote !== null) boxes.push({ box_id: 'quote', title: 'Strategic Quote', content: quote, position_order: 300 });

  const strategicTitle = lsGet('zbod_strategic_title', null);
  if (strategicTitle) boxes.push({ box_id: 'strategic_title', title: strategicTitle, content: '', position_order: 395 });

  const strategic = lsGet('zbod_strategic', null);
  if (strategic && Array.isArray(strategic)) {
    strategic.forEach((s, i) => boxes.push({ box_id: s.id || `sq${i+1}`, title: s.label || '', content: s.text || '', position_order: 400 + i }));
  }

  const fcmatrix = lsGet('zbod_fcmatrix', null);
  if (fcmatrix && Array.isArray(fcmatrix)) {
    boxes.push({ box_id: 'fcmatrix', title: lsGet('zbod_fcmatrix_title', 'FUNCTION CATEGORIZATION MATRIX'), content: JSON.stringify(fcmatrix), position_order: 600 });
  }

  const support = lsGet('zbod_support', null);
  if (support && Array.isArray(support)) {
    boxes.push({ box_id: 'support', title: lsGet('zbod_support_title', 'SUPPORT FUNCTIONS'), content: JSON.stringify(support), position_order: 700 });
  }

  const benefitsSaved = lsGet('zbod_benefits', null);
  if (benefitsSaved && Array.isArray(benefitsSaved)) {
    boxes.push({ box_id: 'benefits_title', title: getBenefitsTitle(), content: '', position_order: 649 });
    getBenefits().forEach((b, i) => boxes.push({ box_id: b.id, title: b.title, content: b.text, position_order: 650 + i }));
  }

  const principles = lsGet('zbod_principles', null);
  if (principles && Array.isArray(principles)) {
    boxes.push({ box_id: 'principles', title: lsGet('zbod_principles_title', 'CORE PRINCIPLES'), content: JSON.stringify(principles), position_order: 500 });
  }

  // Legacy company-wide record (see the 'strategic_overview' case in loadFromSupabase): preserved
  // on migration so it is never lost, but the live per-division rows are emitted further below.
  const strategicOverview = lsGet('zbod_strategic_overview', null);
  if (strategicOverview && typeof strategicOverview === 'object') {
    boxes.push({ box_id: 'strategic_overview', title: strategicOverview.title || 'STRATEGIC OVERVIEW', content: JSON.stringify(strategicOverview), position_order: 800 });
  }

  if (cards && typeof cards === 'object') {
    Object.keys(cards).forEach(divId => {
      if (cards[divId] && Array.isArray(cards[divId])) {
        boxes.push({ box_id: 'aaa_cards_' + divId, title: 'AAA Cards', content: JSON.stringify(cards[divId]), position_order: 9000 });
      }
    });
  }

  const allMetrics = getMetrics();
  Object.keys(allMetrics).forEach(divId => {
    if (Array.isArray(allMetrics[divId])) {
      boxes.push({ box_id: 'metrics_' + divId, title: 'AS-IS Metrics', content: JSON.stringify(allMetrics[divId]), position_order: 9100 });
    }
  });

  const strategicOverviews = getStrategicOverviews();
  Object.keys(strategicOverviews).forEach(cxoId => {
    const byArea = strategicOverviews[cxoId];
    if (byArea && typeof byArea === 'object' && Object.keys(byArea).length > 0) {
      boxes.push({
        box_id: 'strategic_overview_' + cxoId,
        title: 'STRATEGIC OVERVIEW',
        content: JSON.stringify(byArea),
        position_order: 810,
      });
    }
  });

  return boxes;
}

async function migrateLocalStorageToSupabase() {
  const sb = window.zbodSupabase;
  if (!sb || !sb.supabaseAvailable) return { ok: false, error: 'Supabase not connected' };

  // Only what this account is actually allowed to write. The migration used to push every row in
  // localStorage, including structures belonging to someone else who had used the browser and
  // local-only leftovers with no owner at all. The database refuses those, the whole batch fails,
  // the "did not sync" warning fires, and because the done-flag is only set on success the same
  // rejection repeats on every single sign-in — which is exactly what a user sees as a warning
  // that appears the moment they log in and never goes away.
  const mine = d => isCurrentUserAdmin() || (d.owner_email || '').toLowerCase() === (getCurrentEmail() || '').toLowerCase();
  const divs = getDivs().filter(mine);
  const myDivIds = new Set(divs.map(d => d.id));
  const ws   = getWs().filter(w => myDivIds.has(w.division_id));
  const myWsIds = new Set(ws.map(w => w.id));
  const fns  = getFns().filter(f => myWsIds.has(f.workshop_id));
  const ais  = getAsIs().filter(f => myDivIds.has(f.division_id));
  const skipped = getDivs().length - divs.length;
  if (skipped > 0) console.log(`Migration: skipping ${skipped} structure(s) this account does not own.`);
  const results = { divisions: 0, workshops: 0, functions: 0, asIs: 0, landingBoxes: 0, users: 0 };

  // Accounts are deliberately NOT migrated: they now live in Supabase Auth, and the local cache
  // is password-free profile data belonging to whoever was signed in. Pushing it would be both
  // useless (no credentials to carry) and wrong (profiles.id must be an auth account's id).

  // Filter out orphaned records whose parent no longer exists in localStorage.
  // This can happen when divisions/workshops were deleted but their child
  // records were not cleaned up (pre-existing localStorage leak).
  const wsIds  = new Set(ws.map(w => w.id));
  const divIds = new Set(divs.map(d => d.id));
  const validFns = fns.filter(f => wsIds.has(f.workshop_id));
  const validAis = ais.filter(f => divIds.has(f.division_id));
  if (fns.length !== validFns.length)
    console.log(`Migration: skipping ${fns.length - validFns.length} orphaned function(s) referencing deleted workshops.`);
  if (ais.length !== validAis.length)
    console.log(`Migration: skipping ${ais.length - validAis.length} orphaned as-is function(s) referencing deleted divisions.`);

  // Only rows the cloud does not already hold. This is a one-time catch-up for data created before
  // this browser ever reached Supabase — it must never re-upload a row that already exists there.
  // It used to upsert every local row on every sign-in (the done-flag is only set on full success,
  // and a single rejected structure kept it unset forever), so a colleague's freshly saved
  // workshop was silently overwritten by this browser's older copy each time its owner logged in.
  const [cloudDivRows, cloudWsRows, cloudFnRows, cloudAisRows] = await Promise.all([
    sb.sbLoadDivisions(), sb.sbLoadWorkshops(), sb.sbLoadFunctions(), sb.sbLoadAsIsFunctions(),
  ]);
  if (!cloudDivRows || !cloudWsRows || !cloudFnRows || !cloudAisRows) {
    // Could not establish what the cloud already has — pushing now risks clobbering it.
    return { ok: false, error: 'Could not read current cloud state; skipping migration this time.' };
  }
  const cloudIds = rows => new Set((rows || []).map(r => r.id));
  const haveDivs = cloudIds(cloudDivRows), haveWs = cloudIds(cloudWsRows), haveFns = cloudIds(cloudFnRows), haveAis = cloudIds(cloudAisRows);
  // Divisions too: re-sending a structure the cloud no longer has would bring back one that was
  // deleted on another device.
  const newDivs = divs.filter(d => !haveDivs.has(d.id));
  const newWs  = ws.filter(w => !haveWs.has(w.id));
  const newFns = validFns.filter(f => !haveFns.has(f.id));
  const newAis = validAis.filter(f => !haveAis.has(f.id));

  if (newDivs.length > 0 || newWs.length > 0 || newFns.length > 0 || newAis.length > 0) {
    const ok = await sb.sbSyncAll(newDivs, newWs, newFns, newAis);
    if (ok) {
      results.divisions = newDivs.length;
      results.workshops = newWs.length;
      results.functions = newFns.length;
      results.asIs      = newAis.length;
    } else {
      return { ok: false, error: 'Core data upload failed. Check the browser console.' };
    }
  }

  // Same rule for the content blocks. The methodology text (overview, guidelines, questions…) is
  // admin-only, but every account loads it into localStorage at boot — so pushing it back used to
  // produce a rejected write per block for every HRBP and CxO on the planet.
  const cloudBoxes = await sb.sbLoadLandingBoxes();
  const haveBoxes = new Set((cloudBoxes || []).map(b => b.box_id));
  const boxes = buildLandingBoxesFromLocalStorage().filter(box => {
    if (haveBoxes.has(box.box_id)) return false;
    const divId = /^(?:metrics|aaa_cards)_(.+)$/.exec(box.box_id || '');
    if (divId) return myDivIds.has(divId[1]);
    return isCurrentUserAdmin();
  });
  for (const box of boxes) {
    const res = await sb.sbSaveLandingBox(box);
    if (res !== null) results.landingBoxes++;
  }

  return { ok: true, results };
}

// Runs the same migration the old modal used to ask permission for, but silently and
// automatically — regular HRBP/CxO accounts have no business being asked to make cloud-sync
// decisions, so this now just happens in the background on boot instead of blocking the UI with
// a dialog. lsSet('zbod_sb_migrated', true) is still set on success so this is a one-time-per-
// browser operation, same as before; a failure is only logged, not surfaced, and simply retries
// on the next load since the flag is only set once it actually succeeds.
async function autoMigrateToSupabase() {
  try {
    const { ok, error } = await migrateLocalStorageToSupabase();
    if (ok) {
      lsSet('zbod_sb_migrated', true);
    } else {
      console.warn('Background Supabase migration failed:', error);
    }
  } catch (err) {
    console.warn('Background Supabase migration failed:', err);
  }
}

// ═══════════════════════════════════════════
// BUSINESS LOGIC
// ═══════════════════════════════════════════
function computePhase1Alert(elim, auto, out) {
  if (!elim || !auto || !out) return null;
  if (elim === 'No' && auto === 'No' && out === 'No') return 'PASSED FILTER';
  if (elim === 'Yes' && auto === 'No' && out === 'No') return 'REVIEW FOR ELIMINATION OPPORTUNITY';
  if (elim === 'No' && auto === 'Yes' && out === 'No') return 'REVIEW FOR AUTOMATION OPPORTUNITY';
  if (elim === 'No' && auto === 'No' && out === 'Yes') return 'REVIEW FOR OUTSOURCING OPPORTUNITY';
  const r = []; if (elim === 'Yes') r.push('ELIMINATION'); if (auto === 'Yes') r.push('AUTOMATION'); if (out === 'Yes') r.push('OUTSOURCING');
  return `REVIEW FOR ${r.length > 2 ? r.slice(0, -1).join(', ') + ' AND ' + r[r.length - 1] : r.join(' AND ')} OPPORTUNITIES`;
}
// Alerts saved before the wording gained "OPPORTUNITY" are still stored as e.g. "REVIEW FOR
// ELIMINATION"; shown with the current wording so old and new functions read the same.
function phase1AlertLabel(a) {
  if (!a || !/^REVIEW FOR /.test(a) || /OPPORTUNIT/.test(a)) return a;
  return a + (/ AND /.test(a) ? ' OPPORTUNITIES' : ' OPPORTUNITY');
}

function computePhase2Decision(q1, q2) {
  const total = q1 + q2;
  if (total >= 9) return 'INVEST';
  if (total >= 7) return 'KEEP';
  if (total >= 5) return 'OPTIMIZE';
  return 'ELIMINATE';
}

// A function with no Phase 2 scores at all must not be silently classified as ELIMINATE
// (computePhase2Decision(0,0) would fall through to that branch). Only compute a real
// decision once both questions have actually been scored; otherwise report it as pending.
function decisionOf(f) {
  if (f.zbod_decision) return f.zbod_decision;
  if (f.question1_score === undefined || f.question1_score === null
    || f.question2_score === undefined || f.question2_score === null) return null;
  return computePhase2Decision(f.question1_score, f.question2_score);
}

// Returns all descendant IDs of a given function within a flat parent_id-linked list, so a
// Parent dropdown can exclude them and prevent a cycle (e.g. A -> B -> A, which would make both
// functions silently vanish from Phase 3 / org chart / totals since neither resolves to a root).
function getDescendantIds(fnId, allFns) {
  const result = new Set();
  const q = [fnId];
  while (q.length) {
    const cur = q.shift();
    allFns.filter(f => f.parent_id === cur).forEach(c => { if (!result.has(c.id)) { result.add(c.id); q.push(c.id); } });
  }
  return result;
}

// Shared decision badge markup so a still-unscored function reads as "PENDING" (gray)
// rather than silently looking like a real ELIMINATE decision. size 'lg' matches the
// Phase 3 card badge padding, 'sm' matches the zbod-table row badge padding.
function decisionBadge(dec, size) {
  const pad = size === 'lg' ? '4px 10px' : '2px 8px';
  const color = dec === 'INVEST' ? 'background:rgba(22,163,74,0.12);color:#16A34A;'
    : dec === 'KEEP' ? 'background:rgba(234,88,12,0.12);color:#EA580C;'
    : dec === 'OPTIMIZE' ? 'background:rgba(8,145,178,0.12);color:#0891B2;'
    : dec === 'ELIMINATE' ? 'background:rgba(220,38,38,0.12);color:#DC2626;'
    : 'background:rgba(156,163,175,0.15);color:#6b7280;';
  return `<span style="padding:${pad};border-radius:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;${color}">${dec || 'PENDING'}</span>`;
}

const P3_LBL ='font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;display:block;';

// "If the target is 100%, what is this figure?" — one decimal, trailing .0 dropped.
function fmtPctOfTarget(value, base) {
  if (!base || !value) return '-';
  return (Math.round((value / base) * 1000) / 10) + '%';
}

// Every allocation bar answers one question: how much of the target do the actual figures take up.
// Not "do the typed percentages add up to 100" — a figure driven by its own numbers (Proposed
// Managers + Professionals, a hand-typed Proposed Cost) moves without its percentage moving, and
// the bar would then contradict the total printed directly beneath it.
function pctOfTarget(value, base) {
  return base > 0 ? (value / base) * 100 : 0;
}

// A function's proposed headcount when it isn't the HC Allocation % that decides it — the same
// precedence the cost side uses (see proposedFnBudget). On an AS-IS workshop the uploaded baseline
// headcount is the starting proposal, so the summary opens on what the structure actually has
// rather than on a percentage seeded against whatever the target happened to be at copy time.
// The moment the user drives the number themselves — typing a percentage, or editing Proposed
// Managers / Professionals, which writes the percentage back — that percentage takes over.
function proposedFnHC(f, phase3Values, isAsIs) {
  if (!isAsIs) return undefined;
  const raw = (phase3Values && phase3Values[f.id]) || {};
  // A cleared percentage (null) hands the function back to its own figure, same as a cleared cost.
  const live = raw.hc_allocation_percent;
  if (live !== undefined && live !== null) return undefined;
  if (live === undefined && f.hc_allocation_percent_manual && f.hc_allocation_percent != null) return undefined;
  // The function's own figure is its Proposed Managers + Professionals. They start out equal to the
  // As-Is copy, but they are the ones that move when functions are added, moved or removed — the
  // frozen As-Is copy is for comparison only.
  const own = (parseInt(f.manager_count) || 0) + (parseInt(f.professional_count) || 0);
  return own || undefined;
}

// A function's real proposed cost, or undefined when there isn't one and the cost should fall back
// to its Cost Allocation % share. In order: the Proposed Cost typed on the card, then — on an
// AS-IS workshop — the cost uploaded with the baseline, which is a real figure rather than a share
// of the target. The AS-IS fallback also covers workshops copied before Proposed Cost became
// editable, which carry no manual flag. Cleared fields arrive as null, hence the repeated checks.
function proposedFnBudget(f, phase3Values, isAsIs) {
  const num = v => (v === null || v === undefined || v === '' ? undefined : roundMoney(parseFloat(v) || 0));
  const raw = (phase3Values && phase3Values[f.id]) || {};
  if (raw.proposed_budget !== undefined) return num(raw.proposed_budget);
  if (f.proposed_budget_manual) {
    const stored = num(f.proposed_budget);
    if (stored !== undefined) return stored;
  }
  if (isAsIs) {
    const asIs = (parseFloat(f.as_is_managers_cost) || 0) + (parseFloat(f.as_is_professionals_cost) || 0);
    if (asIs) return roundMoney(asIs);
  }
  return undefined;
}

function computePhase3(f, data) {
  const totalHC = data.total_hc !== undefined ? data.total_hc : (f.total_hc || 0);
  const hcAlloc = data.hc_allocation_percent !== undefined ? data.hc_allocation_percent : f.hc_allocation_percent;
  const totalBudget = data.total_budget !== undefined ? data.total_budget : (f.total_budget || 0);
  const costAlloc = data.cost_allocation_percent !== undefined ? data.cost_allocation_percent : f.cost_allocation_percent;
  const mgrCount = data.manager_count !== undefined ? data.manager_count : f.manager_count;
  const profCount = data.professional_count !== undefined ? data.professional_count : f.professional_count;
  const careerLevel = data.career_level || f.career_level;

  const proposedHC = totalHC && hcAlloc ? Math.round((totalHC * hcAlloc) / 100) : null;
  const proposedBudget = totalBudget && costAlloc ? roundMoney((totalBudget * costAlloc) / 100) : null;
  const span = profCount && mgrCount && mgrCount > 0 ? profCount / mgrCount : null;

  const spanAlert = getSpanAlert(span, careerLevel, mgrCount, profCount) ?? f.span_alert;
  return { proposed_hc: proposedHC, proposed_budget: proposedBudget, span_of_control: span, span_alert: spanAlert };
}

function getSpanAlert(span, careerLevel, mgrCount, profCount) {
  if (!careerLevel) return null;
  if (!mgrCount && profCount > 0) return 'No Manager Assigned';
  if (mgrCount > 0 && !profCount) return 'Manager Without Team';
  if (!mgrCount && !profCount) return 'No Team Data';
  if (!span) return null;
  const b = {
    'Senior Management': { min: 4, max: 6 },
    'Middle Management': { min: 5, max: 7 },
    'Lower Management': { min: 10, max: 15 },
  }[careerLevel];
  if (!b) return null;
  if (span < b.min) return 'Below Recommended Span';
  if (span > b.max) return 'Above Recommended Span';
  return 'Healthy Span';
}

// Shared "proposed vs target" bar used by both Phase 3 and the Workshop Review page — reuses
// the same p3-tracker__bar-fill--over/--ok danger/success pattern already used for percentage
// validation, applied here to the absolute allocated total vs the division's target.
function renderTargetVsProposedRow(label, proposed, target, overMessage) {
  // Compared at qapik precision — the same precision the targets are imported with — so summing
  // the allocated shares can't trip the warning on float noise alone.
  const over = roundMoney(proposed) > roundMoney(target || 0);
  const pct = target > 0 ? Math.min((proposed / target) * 100, 100) : (proposed > 0 ? 100 : 0);
  const barClass = over ? 'p3-tracker__bar-fill--over' : 'p3-tracker__bar-fill--ok';
  return `<div>
    <p style="font-size:12px;color:#6b7280;margin-bottom:8px;">${label}</p>
    <div class="flex items-center gap-4">
      <div class="flex-1"><div style="height:8px;border-radius:4px;background:#f3f4f6;overflow:hidden;"><div class="p3-tracker__bar-fill ${barClass}" style="height:100%;border-radius:4px;width:${pct}%;"></div></div></div>
      <span style="font-size:12px;font-weight:${over ? 700 : 400};color:${over ? '#991b1b' : '#6b7280'};">${formatNumber(proposed)} / ${formatNumber(target)}</span>
    </div>
    ${over && overMessage ? `<p class="zbod-alert-danger" style="margin-top:8px;display:inline-block;">${overMessage}</p>` : ''}
  </div>`;
}

// The percentage-driven pool model (Largest Remainder / Hamilton Method), used identically for
// every workshop: HC Allocation % / Cost Allocation % are directly editable per function;
// Proposed HC / Proposed Cost are each sibling group's share of the parent's own pool, split so
// rounded shares always sum back to the parent's value. Proposed Managers / Proposed
// Professionals stay independent manual inputs (not reconciled against Proposed HC — a mismatch
// is possible and flagged, never prevented).
//
// A normal workshop starts every percentage blank. An "Analyze AS-IS Baseline" workshop is
// seeded at copy-time (see computeAsIsBaselinePercents / copyAsIsBaselineToWorkshop) with the
// percentage each function actually represented in the AS-IS structure, and keeps that original
// number visible as a fixed "As-Is: X%" reference next to the now-editable input (renderP3Card)
// — but from that point on both workshop types behave exactly the same way here.
function buildCascadedAllocations(fns, divHC, divBudget, phase3Values, isAsIs) {
  const fnIds = new Set(fns.map(f => f.id));
  const parentMap = {};
  fns.forEach(f => {
    const pid = (f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'root';
    if (!parentMap[pid]) parentMap[pid] = [];
    parentMap[pid].push(f);
  });
  const result = {};

  function processLevelPct(parentId, parentHC, parentBudget) {
    const children = parentMap[parentId] || [];
    if (children.length === 0) return;
    const inputs = children.map(f => {
      const raw = (phase3Values && phase3Values[f.id]) || {};
      const hcAlloc = raw.hc_allocation_percent !== undefined ? raw.hc_allocation_percent : f.hc_allocation_percent;
      const costAlloc = raw.cost_allocation_percent !== undefined ? raw.cost_allocation_percent : f.cost_allocation_percent;
      return { f, hcAlloc, costAlloc };
    });

    // Allocate the whole sibling group at once (Largest Remainder Method) so rounded shares
    // always sum back to parentHC / parentBudget instead of drifting from independent rounding.
    const proposedHCs = new Array(inputs.length).fill(null);
    if (parentHC) {
      const hcIdx = [], hcWeights = [];
      // 0% is a real allocation (0 people); only an empty percentage means "not allocated".
      const set = v => v !== null && v !== undefined && v !== '' && isFinite(v);
      inputs.forEach((c, i) => { if (set(c.hcAlloc)) { hcIdx.push(i); hcWeights.push(Number(c.hcAlloc)); } });
      largestRemainderAllocate(parentHC, hcWeights).forEach((v, k) => { proposedHCs[hcIdx[k]] = v; });
    }
    const proposedBudgets = new Array(inputs.length).fill(null);
    if (parentBudget) {
      const budgetIdx = [], budgetWeights = [];
      const setC = v => v !== null && v !== undefined && v !== '' && isFinite(v);
      inputs.forEach((c, i) => { if (setC(c.costAlloc)) { budgetIdx.push(i); budgetWeights.push(Number(c.costAlloc)); } });
      largestRemainderAllocate(parentBudget, budgetWeights, 0.01).forEach((v, k) => { proposedBudgets[budgetIdx[k]] = v; });
    }

    // A figure the function owns outright — a Proposed Cost typed by hand, or an AS-IS baseline
    // not yet overridden — wins over its percentage share, and becomes the pool its own children
    // are carved out of. The percentage stays as the starting suggestion it was.
    inputs.forEach((c, i) => {
      const ownHC = proposedFnHC(c.f, phase3Values, isAsIs);
      if (ownHC !== undefined) proposedHCs[i] = ownHC;
      const ownBudget = proposedFnBudget(c.f, phase3Values, isAsIs);
      if (ownBudget !== undefined) proposedBudgets[i] = ownBudget;
    });

    inputs.forEach((c, i) => {
      const proposedHC = proposedHCs[i];
      const proposedBudget = proposedBudgets[i];
      result[c.f.id] = {
        parentHC, parentBudget, proposedHC, proposedBudget,
        hcAllocationPercent: c.hcAlloc, costAllocationPercent: c.costAlloc,
      };
      processLevelPct(c.f.id, proposedHC, proposedBudget);
    });
  }

  processLevelPct('root', divHC, divBudget);
  return result;
}

function recomputeAndSaveAllCascaded(workshopId, phase3Values) {
  const ws = getWs().find(w => w.id === workshopId);
  if (!ws) return;
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) return;
  const fns = getFns().filter(f => f.workshop_id === workshopId);
  const cascaded = buildCascadedAllocations(fns, div.headcount_target || 0, div.budget_target || 0, phase3Values, ws.source === 'as_is_baseline');
  fns.forEach(f => {
    const vals = cascaded[f.id];
    if (!vals) return;
    const raw = (phase3Values && phase3Values[f.id]) || {};
    const mgrCount = raw.manager_count !== undefined ? raw.manager_count : f.manager_count;
    const profCount = raw.professional_count !== undefined ? raw.professional_count : f.professional_count;
    const span = profCount && mgrCount && parseInt(mgrCount) > 0 ? parseInt(profCount) / parseInt(mgrCount) : null;
    const spanAlert = getSpanAlert(span, f.career_level, parseInt(mgrCount) || 0, parseInt(profCount) || 0) ?? f.span_alert;
    const next = {
      proposed_hc: vals.proposedHC,
      proposed_budget: vals.proposedBudget,
      total_hc: vals.parentHC,
      total_budget: vals.parentBudget,
      hc_allocation_percent: vals.hcAllocationPercent,
      cost_allocation_percent: vals.costAllocationPercent,
      span_of_control: span,
      span_alert: spanAlert,
    };
    // Only rows whose cached figures actually changed are saved (and sent to the cloud). Writing every
    // function on every keystroke sent ~2 requests per function per edit.
    const same = (a, b) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);
    if (Object.keys(next).some(k => !same(f[k], next[k]))) updFn(f.id, next);
  });
}

// One-time (copy-time only) snapshot of each just-copied function's AS-IS baseline percentage —
// its own verbatim manager_count+professional_count / proposed_budget (copied straight from
// AS-IS) as a percentage of its immediate parent's own verbatim value (or the division target
// for root-level functions). Used only by copyAsIsBaselineToWorkshop below, to both seed the
// now-editable HC Allocation % / Cost Allocation % inputs with a sensible starting point and to
// back the fixed "As-Is: X%" hint shown next to them in Phase 3 (renderP3Card) — this snapshot is
// never recomputed afterwards, so editing the percentage later never moves the reference number.
function computeAsIsBaselinePercents(fns, divHC, divBudget) {
  const fnIds = new Set(fns.map(f => f.id));
  const parentMap = {};
  fns.forEach(f => {
    const pid = (f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'root';
    if (!parentMap[pid]) parentMap[pid] = [];
    parentMap[pid].push(f);
  });
  // Two decimals: the percentage is shown in an input the user reads and edits, and 93.044858 is
  // not a number anyone can work with. Safe for headcount, which is whole and reconciled by
  // largestRemainderAllocate; safe for money because an AS-IS or hand-typed Proposed Cost takes
  // precedence over the percentage anyway (see proposedFnBudget).
  const pctOf = (value, base) => (base > 0 && value !== null ? Math.round((value / base) * 10000) / 100 : null);
  const result = {};
  function walk(parentId, parentHC, parentBudget) {
    (parentMap[parentId] || []).forEach(f => {
      const hc = (parseInt(f.manager_count) || 0) + (parseInt(f.professional_count) || 0);
      const budget = f.proposed_budget !== null && f.proposed_budget !== undefined ? (parseFloat(f.proposed_budget) || 0) : null;
      result[f.id] = { hcPercent: pctOf(hc, parentHC), costPercent: pctOf(budget, parentBudget) };
      walk(f.id, hc, budget || 0);
    });
  }
  walk('root', divHC, divBudget);
  return result;
}

// Creates a brand-new draft workshop pre-populated from the division's current AS-IS baseline
// (never overwrites the AS-IS data, and never touches any other workshop). Reuses the same
// addWs/addFn/updFn/recomputeAndSaveAllCascaded services used everywhere else, so nothing about
// how a workshop or function is created, persisted, or synced is duplicated here.
//
// What's copied vs. left for the user to decide:
// - proposed_function_name  <- AS-IS function_name (a reasonable starting point; per the
//   Function Name help text already shown in Phase 1, keeping the current name is valid when it
//   stays relevant to the future structure)
// - parent_id               <- AS-IS parent, remapped to the newly-generated function ids so the
//   exact same hierarchy shape is preserved without reusing any AS-IS id
// - manager_count / professional_count <- AS-IS manager_count / current_employee_count, verbatim
// - proposed_budget         <- AS-IS managers_cost + professionals_cost, verbatim
// - hc_allocation_percent / cost_allocation_percent <- seeded from the AS-IS baseline share each
//   function represented (computeAsIsBaselinePercents), same as the immutable
//   as_is_hc_percent / as_is_cost_percent reference — but these two stay editable from here on,
//   exactly like a manually-built workshop (see buildCascadedAllocations).
// Everything else (career level, structure type, screening answers, Phase 2 scores/decision,
// proposed_hc, span of control, function_number, ids, timestamps, status) is left at addFn's
// normal defaults or recomputed fresh via recomputeAndSaveAllCascaded — never copied from AS-IS,
// exactly like a manually-built workshop.
function copyAsIsBaselineToWorkshop(divisionId) {
  const div = getDivs().find(d => d.id === divisionId);
  if (!div) return null;
  const ws = addWs(divisionId);
  // Marks this workshop as an AS-IS Baseline analysis rather than a TO-BE redesign — read by the
  // Compare Dashboard (buildDashboardHTML/renderDashboardCharts) and the Excel export to show
  // AS-IS vs Target instead of AS-IS vs TO-BE/Proposed.
  updWs(ws.id, { source: 'as_is_baseline' });
  ws.source = 'as_is_baseline';

  const asIsFns = getAsIs().filter(f => f.division_id === divisionId);
  if (asIsFns.length === 0) return ws;

  const asIsIds = new Set(asIsFns.map(f => f.id));
  const resolveParent = (f) => (f.parent_id && asIsIds.has(f.parent_id)) ? f.parent_id : null;

  // Parent-before-child order (mirrors the AS-IS tree's own topological display order) so a
  // child's remapped parent_id is always already known by the time the child is created.
  const childrenOf = {};
  asIsFns.forEach(f => {
    const pid = resolveParent(f);
    if (!childrenOf[pid]) childrenOf[pid] = [];
    childrenOf[pid].push(f);
  });
  const ordered = [];
  const orderedVisited = new Set();
  (function visit(parentId) {
    (childrenOf[parentId] || []).forEach(f => {
      if (!orderedVisited.has(f.id)) {
        orderedVisited.add(f.id);
        ordered.push(f);
        visit(f.id);
      }
    });
  })(null);
  // Fallback: any function not reached by the walk above (e.g. its parent chain never resolves
  // back to a root) is still included, treated as root-level — mirrors the same safety net
  // renderWorkspace's own AS-IS list uses (asIsOrdered/asIsVisitFn), so a function visible in the
  // AS-IS Baseline section can never be silently dropped when copied into a new workshop.
  asIsFns.forEach(f => { if (!orderedVisited.has(f.id)) { orderedVisited.add(f.id); ordered.push(f); } });

  const idMap = {};
  ordered.forEach((asIsFn, i) => {
    const pid = resolveParent(asIsFn);
    const newFn = addFn(ws.id, i + 1);
    idMap[asIsFn.id] = newFn.id;
    updFn(newFn.id, {
      proposed_function_name: asIsFn.function_name || '',
      parent_id: pid ? (idMap[pid] || '') : '',
      manager_count: asIsFn.manager_count || null,
      professional_count: asIsFn.current_employee_count || null,
      proposed_budget: (asIsFn.managers_cost || 0) + (asIsFn.professionals_cost || 0),
      // Kept as a manual value so the cascade treats the uploaded AS-IS cost as the real
      // proposed cost instead of overwriting it with a share of the division target.
      proposed_budget_manual: true,
      // Proposed Managers / Proposed Professionals start out equal to these and are directly
      // editable from here on (unlike HC/Cost Allocation %, there's no cascade recomputing them),
      // so the starting AS-IS number would otherwise be silently lost the moment it's edited.
      // Snapshotted immutably here, same idea as as_is_hc_percent/as_is_cost_percent below, so
      // Phase 3 can still show "(As-Is: X)" next to the input after it's been changed.
      as_is_manager_count: asIsFn.manager_count || null,
      as_is_professional_count: asIsFn.current_employee_count || null,
      // Same idea, for the Dashboard's per-function AS-IS vs Proposed comparison table.
      as_is_managers_cost: asIsFn.managers_cost || null,
      as_is_professionals_cost: asIsFn.professionals_cost || null,
    });
  });

  // Seed HC Allocation % / Cost Allocation % with each function's AS-IS baseline share, and
  // record the same numbers immutably as as_is_hc_percent / as_is_cost_percent — the reference
  // shown next to the now-editable inputs in Phase 3. Must run before recomputeAndSaveAllCascaded
  // below, since the percentage-driven cascade (buildCascadedAllocations) needs a starting
  // percentage on every function to derive Proposed HC / Proposed Cost from.
  const newFns = getFns().filter(f => f.workshop_id === ws.id);
  // Frozen at copy time, like the As-Is columns: how much of each parent the AS-IS data did not give
  // to any sub-function. The red "Unallocated from AS-IS data" note on that parent is measured
  // against this, so moving functions in or out later cannot make the note appear or vanish wrongly.
  // (Stored in target_headcount / target_budget, columns the workshop never used for anything else.)
  asIsUnallocatedParents(asIsFns).forEach(u => {
    const wid = idMap[u.id];
    if (wid) updFn(wid, { target_headcount: u.hc || null, target_budget: u.cost || null });
  });
  const baselinePercents = computeAsIsBaselinePercents(newFns, div.headcount_target || 0, div.budget_target || 0);
  newFns.forEach(f => {
    const p = baselinePercents[f.id] || {};
    updFn(f.id, {
      hc_allocation_percent: p.hcPercent,
      cost_allocation_percent: p.costPercent,
      as_is_hc_percent: p.hcPercent,
      as_is_cost_percent: p.costPercent,
    });
  });

  // Derive proposed_hc/proposed_budget/span fresh from the percentages seeded above — never
  // computed here directly, so there is exactly one place (buildCascadedAllocations) that turns
  // percentages into proposed values, for both the initial copy and every later edit.
  recomputeAndSaveAllCascaded(ws.id, {});
  return ws;
}

// Recursively computes the true total represented by a parent's subtree from a freshly-built
// cascade map (see buildCascadedAllocations) — never from persisted proposed_hc/proposed_budget
// fields, which are only a display cache and can go stale (e.g. the division's target changed
// since the last save, or an existing workshop was never re-saved after an algorithm fix).
// Every parent's contribution is its children's own (recursed) totals plus whatever share of the
// parent's own value its children didn't claim ("Remaining") — so every parent satisfies
// Children + Remaining = Parent Total, and real over-allocation at any depth still bubbles up
// instead of being silently dropped or double-counted against its own children.
function calculateEffectiveAllocationTotal(fns, fnIds, parentId, ownValue, cascaded, valueKey) {
  const children = fns.filter(f => ((f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'root') === parentId);
  if (children.length === 0) return ownValue || 0;
  let childrenContribution = 0;
  let directChildrenSum = 0;
  children.forEach(c => {
    const cVal = (cascaded[c.id] || {})[valueKey] || 0;
    directChildrenSum += cVal;
    childrenContribution += calculateEffectiveAllocationTotal(fns, fnIds, c.id, cVal, cascaded, valueKey);
  });
  const remaining = Math.max(0, (ownValue || 0) - directChildrenSum);
  return childrenContribution + remaining;
}

// Single source of truth for "what does this workshop's current allocation actually add up to" —
// always recomputed fresh (via buildCascadedAllocations, live-edit-aware through phase3Values),
// never by re-summing cached proposed_hc/proposed_budget fields. Every workshop now uses the same
// percentage-driven pool model: a child's Proposed HC/Cost is a share carved out of its parent's
// own value (Largest Remainder Method), so it's already counted within that parent — the
// workshop-wide total is the sum of root-level functions only, exactly like Phase 3's own
// "Allocation Summary" tracker.
// A completed workshop is reported against the targets it was finished with. Editing the
// structure's targets later must not rewrite an old result (target_*_snapshot are stamped by
// finishWorkshop / submitForHRReview; a workshop finished before that keeps using the live targets).
function divForWorkshop(ws, div) {
  if (!ws || !div || ws.status !== 'completed') return div;
  const hc = ws.target_headcount_snapshot, bud = ws.target_budget_snapshot;
  if (hc === null || hc === undefined || bud === null || bud === undefined) return div;
  return { ...div, headcount_target: Number(hc) || 0, budget_target: Number(bud) || 0 };
}
// The workshop's functions with every derived figure (Proposed HC / Cost, the parent pool, the
// percentages) computed fresh from the cascade. Every read-only view — Review, dashboards, history,
// the org chart totals, the Excel export — reads these, never the cached copies on the rows, so all
// screens agree with Phase 2 at all times. Nothing is written.
function freshWorkshopFns(ws) {
  const fns = getFns().filter(f => f.workshop_id === ws.id);
  const div = divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
  if (!div) return fns;
  const live = ws.id === state.selectedWorkshopId ? (state.phase3Values || {}) : {};
  const c = buildCascadedAllocations(fns, div.headcount_target || 0, div.budget_target || 0, live, ws.source === 'as_is_baseline');
  return fns.map(f => {
    const v = c[f.id];
    if (!v) return f;
    return { ...f,
      proposed_hc: v.proposedHC ?? null, proposed_budget: v.proposedBudget ?? null,
      total_hc: v.parentHC ?? f.total_hc, total_budget: v.parentBudget ?? f.total_budget,
      hc_allocation_percent: v.hcAllocationPercent ?? f.hc_allocation_percent, cost_allocation_percent: v.costAllocationPercent ?? f.cost_allocation_percent };
  });
}

function calculateWorkshopAllocationTotals(workshopId, phase3Values) {
  const ws = getWs().find(w => w.id === workshopId);
  const div = ws && divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
  if (!div) return { totalHC: 0, totalBudget: 0, cascaded: {}, fns: [] };
  const fns = getFns().filter(f => f.workshop_id === workshopId);
  const isAsIs = ws.source === 'as_is_baseline';
  const cascaded = buildCascadedAllocations(fns, div.headcount_target || 0, div.budget_target || 0, phase3Values || {}, isAsIs);
  const fnIds = new Set(fns.map(f => f.id));
  const totalFns = fns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
  const totalHC = totalFns.reduce((sum, f) => sum + ((cascaded[f.id] || {}).proposedHC || 0), 0);
  const totalBudget = totalFns.reduce((sum, f) => sum + ((cascaded[f.id] || {}).proposedBudget || 0), 0);
  return { totalHC, totalBudget, cascaded, fns };
}

function calculateProposedHeadcount(workshopId, phase3Values) {
  return calculateWorkshopAllocationTotals(workshopId, phase3Values).totalHC;
}

function calculateProposedBudget(workshopId, phase3Values) {
  return calculateWorkshopAllocationTotals(workshopId, phase3Values).totalBudget;
}

function calculateDashboardMetrics(workshopId) {
  const ws = getWs().find(w => w.id === workshopId);
  if (!ws) return null;
  const div = divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
  if (!div) return null;
  const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
  const asIsFns = getWorkshopAsIs(ws);
  // Root-level only: a sub-function's HC/budget is nested inside the parent it's grouped under,
  // not additive to it, so summing every AS-IS function (parents + children) would double-count —
  // same rule as the TO-BE workshop functions.
  const asIsFnIds = new Set(asIsFns.map(f => f.id));
  const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && asIsFnIds.has(f.parent_id)));

  const totalAsIsHC = rootAsIsFns.reduce((s, f) => s + (f.current_function_hc || 0), 0);
  const totalAsIsBudget = rootAsIsFns.reduce((s, f) => s + (f.current_budget || 0), 0);
  const totalToBeHC = calculateProposedHeadcount(workshopId);
  const totalToBeBudget = calculateProposedBudget(workshopId);

  const inc = fns.filter(f => (decisionOf(f)) === 'INVEST');
  const kp = fns.filter(f => (decisionOf(f)) === 'KEEP');
  const opt = fns.filter(f => (decisionOf(f)) === 'OPTIMIZE');
  const elm = fns.filter(f => (decisionOf(f)) === 'ELIMINATE');

  return {
    workshop: ws,
    division: div,
    functions: fns,
    asIsFunctions: asIsFns,
    totalAsIsHC,
    totalAsIsBudget,
    totalToBeHC,
    totalToBeBudget,
    targetHC: div.headcount_target || 0,
    targetBudget: div.budget_target || 0,
    investCount: inc.length,
    keepCount: kp.length,
    optimizeCount: opt.length,
    eliminateCount: elm.length,
    invest: inc,
    keep: kp,
    optimize: opt,
    eliminate: elm,
  };
}

function finalizeWorkshopCalculations(workshopId) {
  recomputeAndSaveAllCascaded(workshopId, state.phase3Values);
}

function saveCompletedWorkshop(workshopId) {
  // finalizeWorkshopCalculations already pushed every changed function to Supabase individually
  // (via updFn), and updWs below does the same for the workshop record itself — a bulk sbSyncAll
  // of the ENTIRE local fleet was redundant for those, and dangerous besides: it would re-upload
  // (resurrect) any OTHER division/workshop/function this browser still has cached locally but
  // that was deleted from another device in the meantime, since loadFromSupabase only ever merges
  // additively and never removes local records absent from the server.
  finalizeWorkshopCalculations(workshopId);
  const now = new Date().toISOString();
  const wsNow = getWs().find(w => w.id === workshopId);
  const divNow = wsNow && getDivs().find(d => d.id === wsNow.division_id);
  updWs(workshopId, { status: 'completed', completed_at: now, phase: 3,
    target_headcount_snapshot: divNow ? (divNow.headcount_target || 0) : null,
    target_budget_snapshot: divNow ? (divNow.budget_target || 0) : null });
}

function loadDashboardData(workshopId) {
  return calculateDashboardMetrics(workshopId);
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
// Places the shared avatar button into the active page's nav row, and keeps it there.
//
// The avatar is ONE node (see #user-session-bar in index.html) that gets moved between pages
// rather than duplicated per page. The catch: most pages build their nav row by assigning
// innerHTML to the very element the avatar was appended into (renderWorkspace ->
// #workspace-header, renderTransition -> #transition-header, ...). That assignment deletes the
// avatar along with the old markup, and because there is only one of them it then stays missing
// on EVERY page until a reload rebuilds it from the HTML — which is exactly the "the icon
// vanishes, refreshing brings it back" behaviour.
//
// Re-appending is enough to recover: innerHTML detaches the node but does not destroy the object,
// so the same element (initials, name and email already filled in) can simply be put back. A
// MutationObserver on the active nav does that automatically, so a render can rebuild its header
// whenever it likes without every call site having to remember to re-place the avatar afterwards.
let userSessionBarEl = null;
let userSessionBarObserver = null;

function mountUserSessionBar() {
  if (!userSessionBarEl || !userSessionBarEl.isConnected) {
    userSessionBarEl = userSessionBarEl || document.getElementById('user-session-bar');
  }
  if (!userSessionBarEl) return;
  const page = state.currentPage;
  const pageEl = document.getElementById('page-' + page);
  const navRow = pageEl ? pageEl.querySelector('nav.sticky-header > div') : null;

  // WHERE inside the nav matters: a plain absolutely-positioned offset collides with whatever
  // page-specific content already sits at that spot (this landed on top of Divisions' "Add
  // Structure" button once). The avatar is a genuine flex participant instead — appended into the
  // row's own right-side button group when there is one, or into the row itself otherwise.
  // sessionBar is excluded from the count so a repeat call can't resolve the target to itself.
  let target = null;
  if (navRow) {
    const otherChildren = Array.from(navRow.children).filter(c => c !== userSessionBarEl);
    target = otherChildren.length > 1 ? otherChildren[otherChildren.length - 1] : navRow;
  }
  if (target && target !== userSessionBarEl.parentElement) target.appendChild(userSessionBarEl);

  const showSessionBar = !!target && !(page === 'signin' || page === 'admin' || page === 'manage-users');
  userSessionBarEl.classList.toggle('hidden', !showSessionBar);

  // Watch this page's nav so a later re-render cannot leave the avatar detached. The callback only
  // acts when the node is actually orphaned, so re-appending here cannot loop.
  if (userSessionBarObserver) userSessionBarObserver.disconnect();
  const navEl = navRow ? navRow.closest('nav.sticky-header') : null;
  if (navEl) {
    userSessionBarObserver = new MutationObserver(() => {
      if (userSessionBarEl && !userSessionBarEl.isConnected) mountUserSessionBar();
    });
    userSessionBarObserver.observe(navEl, { childList: true, subtree: true });
  }
}

function showPage(page) {
  state.currentPage = page;
  window._ocIntroKey = null; // replay the org chart's entrance cascade on the next page's first render
  if (page === 'landing') window._lpRevealed = false;
  window._ocHl = null;
  if (page !== 'phase1' && state.ocFullscreen) {
    state.ocFullscreen = false;
    document.body.classList.remove('oc-fullscreen-lock');
  }
  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.remove('hidden');
  // Signed-in user menu (avatar button) — see mountUserSessionBar for placement and why it
  // has to survive nav re-renders.
  mountUserSessionBar();
  const dropdown = document.getElementById('user-session-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function toast(message, opts) {
  const container = document.getElementById('toast-container');
  const id = ++state.toastId;
  const type = (opts && opts.type) || 'success';
  const desc = (opts && opts.description) || '';
  const div = document.createElement('div');
  div.className = `zbod-toast zbod-toast-${type}`;
  // Escaped because a couple of call sites interpolate an exception message, and those come from
  // parsing a user-supplied .xlsx (import/export error paths).
  div.innerHTML = `<div class="zbod-toast-title">${escHtml(message)}</div>${desc ? `<div class="zbod-toast-desc">${escHtml(desc)}</div>` : ''}`;
  container.appendChild(div);
  setTimeout(() => { div.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => div.remove(), 300); }, type === 'error' && desc ? 9000 : 3000);
}

// ═══════════════════════════════════════════
// SVG ICONS HELPER
// ═══════════════════════════════════════════
const ICONS = {
  arrowLeft: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  save: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  maximize: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  minimize: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>',
  home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  arrowRight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  layers: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  userCog: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><circle cx="19" cy="11" r="2"/><path d="M19 8v1M19 13v1M16.5 9.5l.8.8M20.7 11.7l.8.8M16.5 12.5l.8-.8M20.7 10.3l.8-.8"/></svg>',
  dollar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  hash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  fileText: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  history: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  userCheck: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
  calendar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  alertTriangle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  barChart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  activity: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  gitCompare: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>',
  chevronRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  building: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><line x1="9" y1="12" x2="9.01" y2="12"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="9" y1="16" x2="9.01" y2="16"/><line x1="15" y1="16" x2="15.01" y2="16"/></svg>',
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  compass: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  xCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  quote: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/></svg>',
  checkCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  grid: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  heart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  settings: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  helpCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  award: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  sliders: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  trendingUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  sparkles: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  move: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
  max2: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  min2: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
};


// ═══════════════════════════════════════════
// LANDING PAGE EFFECTS (decorative only — no content or logic)
// ═══════════════════════════════════════════
// A faint org-chart that draws itself on each side of the hero: the "build it from zero" idea.
function lpTreeSvg(cls) {
  // [x, y, parent index] — node centres in a 300x360 box
  const N = [[136, 36, -1], [76, 130, 0], [196, 130, 0], [36, 224, 1], [116, 224, 1], [166, 224, 2], [246, 224, 2], [216, 318, 6], [276, 318, 6]];
  const W = 46, H = 20;
  const depth = i => { let d = 0; for (let k = i; N[k][2] >= 0; k = N[k][2]) d++; return d; };
  const paths = N.map(([x, y, pi], i) => {
    if (pi < 0) return '';
    const [px, py] = N[pi], my = (py + y) / 2;
    return `<path pathLength="1" style="--d:${depth(i)}" d="M${px} ${py + H / 2} C${px} ${my} ${x} ${my} ${x} ${y - H / 2}"/>`;
  }).join('');
  const nodes = N.map(([x, y], i) => `<rect class="${i === 0 ? 'lp-root' : ''}" style="--d:${depth(i)}" x="${x - W / 2}" y="${y - H / 2}" width="${W}" height="${H}" rx="6"/>`).join('');
  return `<svg class="lp-tree ${cls}" viewBox="0 0 310 360" preserveAspectRatio="xMinYMin meet"><g class="lp-tree__l">${paths}</g><g class="lp-tree__n">${nodes}</g></svg>`;
}

// Scroll reveal (once, on first render of a visit) + cursor spotlight on the cards.
const LP_SPOT = '.guideline-item, .principle-item, .fcmatrix-item, .support-item, .problem-item, .question-item, .strategic-item';
function lpInitFx(root, enter) {
  const page = document.getElementById('page-landing');
  if (page && !page._lpPtr) {
    page._lpPtr = true;
    let raf = 0, last = null;
    page.addEventListener('pointermove', e => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const t = last.target.closest ? last.target : null;
        if (!t) return;
        const item = t.closest(LP_SPOT);
        if (item) { const r = item.getBoundingClientRect(); item.style.setProperty('--mx', (last.clientX - r.left) + 'px'); item.style.setProperty('--my', (last.clientY - r.top) + 'px'); }
        const hero = t.closest('.lp-hero');
        if (hero) { const r = hero.getBoundingClientRect(); hero.style.setProperty('--hx', (last.clientX - r.left) + 'px'); hero.style.setProperty('--hy', (last.clientY - r.top) + 'px'); }
      });
    }, { passive: true });
  }
  window._lpRevealed = true;
  if (!enter || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = root.querySelectorAll(':scope > div:nth-child(2) > .zbod-card');
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting || en.boundingClientRect.bottom < 0) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  cards.forEach(c => {
    c.querySelectorAll(LP_SPOT).forEach(it => { it.classList.add('lp-item'); it.style.setProperty('--i', [...it.parentElement.children].indexOf(it)); });
    c.classList.add('lp-rv');
    io.observe(c);
  });
  // A jump past several cards in one frame (End key, scroll restore) fires no IO event for them.
  let pend = [...cards], tick = 0;
  const sweep = () => {
    tick = 0;
    pend = pend.filter(c => {
      if (!c.isConnected || c.classList.contains('is-in')) return false;
      if (c.getBoundingClientRect().bottom < 0) { c.classList.add('is-in'); io.unobserve(c); return false; }
      return true;
    });
    if (!pend.length) window.removeEventListener('scroll', onScroll);
  };
  const onScroll = () => { if (!tick) tick = setTimeout(sweep, 60); };
  window.addEventListener('scroll', onScroll, { passive: true });
}

// ═══════════════════════════════════════════
// KEY BENEFITS container (landing page + Admin Panel)
// Five numbered benefit cards between "Function Categorization Matrix" and "Strategic Overview".
// Same storage model as the ZBOD Guideline block: one localStorage array + title, mirrored to
// landing_box_settings as 'benefits_title' + 'bf1'..'bf5' (admin-only write, everyone reads).
// ═══════════════════════════════════════════
const BENEFITS_TITLE_DEFAULT = 'KEY BENEFITS';
const BENEFITS_DEFAULTS = [
  { id: 'bf1', title: 'Workforce Value & Efficiency', text: 'Enables the organization to create greater value through effective workforce deployment and capacity utilization.' },
  { id: 'bf2', title: 'Fit-for-Purpose Organization', text: 'Ensures that the organization is designed around current and future business requirements.' },
  { id: 'bf3', title: 'Strategic Workforce Alignment', text: 'Aligns workforce and organizational structure with the business strategy.' },
  { id: 'bf4', title: 'Organizational Agility', text: 'Enables the organization to adapt workforce and organizational capabilities to changing business needs.' },
  { id: 'bf5', title: 'Organizational Effectiveness', text: 'Identifies opportunities to simplify activities, clarify roles and responsibilities, and improve organizational effectiveness.' },
];
function getBenefits() {
  const saved = lsGet('zbod_benefits', null);
  // Saved copy wins, but a fresh browser (or a half-synced one) always shows all five cards.
  return BENEFITS_DEFAULTS.map((d, i) => (saved && Array.isArray(saved) && saved[i]) ? { ...d, ...saved[i], id: d.id } : { ...d });
}
function getBenefitsTitle() { return lsGet('zbod_benefits_title', null) || BENEFITS_TITLE_DEFAULT; }

// ═══════════════════════════════════════════
// RENDER: LANDING PAGE (SIMPLIFIED - OVERVIEW ONLY)
// ═══════════════════════════════════════════
function renderLanding() {
  // The landing content blocks below (Overview, Guidelines, Strategic Overview, Problem
  // Statement, Questions, FC Matrix, Support, Quote, Principles, Strategic Questions) are shared
  // between the normal ZBOD landing page and the Admin Panel (see the final innerHTML assignment
  // at the bottom of this function) — only the Edit affordance differs: editable in Admin Panel,
  // read-only for every other signed-in user.
  const isAdmin = isCurrentUserAdmin();

  const defaultContent = {
    overviewTitle: 'What is Zero-Based Organizational Design?',
    overviewText: 'Zero-Based Organizational Design (ZBOD) is a comprehensive methodology for building organizational structures from the ground up. Rather than making incremental changes to existing structures, ZBOD enables organizations to strategically rethink and redesign their entire operating model to align with business priorities.',
  };

  let content = {...defaultContent, ...lsGet(LS.landing, {})};

  function editBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'overview') {
      return `<button onclick="app.saveLanding()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelLandingEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editLanding()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function field(key, type) {
    if (state.landingEditing === 'overview') {
      const val = state.landingDrafts[key] !== undefined ? state.landingDrafts[key] : content[key];
      if (type === 'textarea') return `<textarea class="zbod-textarea" id="landing-${key}" rows="3">${escHtml(val)}</textarea>`;
      return `<input class="zbod-input" id="landing-${key}" value="${escHtml(val)}">`;
    }
    if (type === 'textarea') return `<p class="text-sm leading-relaxed" style="color:#4b5563;">${escHtml(content[key])}</p>`;
    return `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(content[key])}</h2>`;
  }

  // ZBOD Guideline data — structured for future Supabase integration
  const guidelineDefaults = [
    { id: 'gl1', iconKey: 'compass',  title: 'STARTING POINT',  text: 'Set the current organizational structure completely aside; redesign from zero. Primary focus: revisit and redesign the organization based on strategy and business priorities.' },
    { id: 'gl2', iconKey: 'target',   title: 'VALUE FOCUS',     text: 'Identify only functions that create measurable value. The argument "it existed before" is not valid. Remove low-value activities.' },
    { id: 'gl3', iconKey: 'userCog',  title: 'FUNCTIONS',       text: 'Design functions that add value to the business. Ask yourself: Can this function be eliminated? Can it be automated? Can it be outsourced? Only create the function if the answer to all three questions is "no" (business justification needed). Shadow support activities should be automated, outsourced, or eliminated.' },
    { id: 'gl4', iconKey: 'users',    title: 'MANAGEMENT',      text: 'Minimize the number of management layers. Do not create deputy / deputy-of-deputy structures. Target 8\u201312 direct reports per manager to ensure an effective span of control. Deploy human resources in the functions that deliver the highest business value.' },
    { id: 'gl5', iconKey: 'userCheck',title: 'PEOPLE QUALITY',  text: 'Aim to work with a small but highly talented team. Automate or outsource low-grade work. Always consider optimization targets and size the team accordingly.' },
    { id: 'gl6', iconKey: 'layers',   title: 'PROCESSES',       text: 'Eliminate or simplify manual and complex processes. Job = end-to-end accountability. Redesign processes based on newly created functions. For every process, automation, AI, and RPA should be top priorities.' },
    { id: 'gl7', iconKey: 'dollar',   title: 'COST & CAPITAL',  text: 'Every function must have a clear cost vs. value justification.' },
  ];
  const savedGuidelines = lsGet('zbod_guidelines', null);
  const guidelineData = savedGuidelines && Array.isArray(savedGuidelines) ? savedGuidelines : guidelineDefaults;

  const guidelineTitleDefault = 'ZBOD GUIDELINE';
  const guidelineTitle = lsGet('zbod_guideline_title', guidelineTitleDefault);

  function guidelineEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'guideline') {
      return `<button onclick="app.saveGuideline()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelGuidelineEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editGuideline()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderGuidelineItem(g, idx) {
    const iconSvg = ICONS[g.iconKey] || ICONS.target;
    if (state.landingEditing === 'guideline') {
      const draftText = state.landingDrafts[`gl_text_${idx}`] !== undefined ? state.landingDrafts[`gl_text_${idx}`] : g.text;
      const draftTitle = state.landingDrafts[`gl_title_${idx}`] !== undefined ? state.landingDrafts[`gl_title_${idx}`] : g.title;
      return `<div class="guideline-item">
        <div class="guideline-item-header">
          <div class="guideline-item-icon">${iconSvg}</div>
          <input class="zbod-input" id="gl-title-${idx}" value="${escHtml(draftTitle)}" oninput="state.landingDrafts['gl_title_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#0F3C76;padding:6px 10px;flex:1;">
        </div>
        <textarea class="zbod-textarea" id="gl-text-${idx}" rows="4" oninput="state.landingDrafts['gl_text_${idx}']=this.value">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="guideline-item">
      <div class="guideline-item-header">
        <div class="guideline-item-icon">${iconSvg}</div>
        <div class="guideline-item-title">${escHtml(g.title)}</div>
      </div>
      <div class="guideline-item-text">${escHtml(g.text)}</div>
    </div>`;
  }

  const benefitsData = getBenefits();
  const benefitsTitle = getBenefitsTitle();

  function benefitsEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'benefits') {
      return `<button onclick="app.saveBenefits()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelBenefitsEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editBenefits()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  // One soft tone + icon per pillar (tone classes live in style.css: .bf-tone-0 … .bf-tone-4).
  const BENEFIT_ICONS = ['trendingUp', 'target', 'gitCompare', 'refresh', 'sliders'];
  function renderBenefitItem(b, idx) {
    const icon = ICONS[BENEFIT_ICONS[idx]] || ICONS.target;
    if (state.landingEditing === 'benefits') {
      const draftTitle = state.landingDrafts[`bf_title_${idx}`] !== undefined ? state.landingDrafts[`bf_title_${idx}`] : b.title;
      const draftText = state.landingDrafts[`bf_text_${idx}`] !== undefined ? state.landingDrafts[`bf_text_${idx}`] : b.text;
      return `<div class="benefit-item bf-tone-${idx}">
        <div class="benefit-head">
          <div class="benefit-icon">${icon}</div>
          <input class="zbod-input" id="bf-title-${idx}" value="${escHtml(draftTitle)}" oninput="state.landingDrafts['bf_title_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:13px;color:#24456f;padding:6px 10px;background:#fff;">
        </div>
        <div class="benefit-body"><textarea class="zbod-textarea" id="bf-text-${idx}" rows="3" oninput="state.landingDrafts['bf_text_${idx}']=this.value">${escHtml(draftText)}</textarea></div>
      </div>`;
    }
    return `<div class="benefit-item bf-tone-${idx}">
      <div class="benefit-head">
        <div class="benefit-icon">${icon}</div>
        <div class="benefit-item-title">${escHtml(b.title)}</div>
      </div>
      <div class="benefit-body"><div class="benefit-item-text">${escHtml(b.text)}</div></div>
    </div>`;
  }

  // Strategic Overview — the one block on this page that is NOT company-wide. The admin keeps a
  // separate set of targets for each C-level and, within that, for each area they are responsible
  // for; getStrategicOverviewOptions() decides which of those pairs this account may look at.
  const soOptions = getStrategicOverviewOptions();
  const soKeyOf = (o) => o.cxoId + '::' + o.area;
  const soOption = soOptions.find(o => soKeyOf(o) === state.strategicOverviewKey) || soOptions[0] || null;
  const strategicOverview = soOption ? getStrategicOverview(soOption.cxoId, soOption.area) : null;
  const soCanEdit = canEditStrategicOverview(soOption);
  const soTitle = (strategicOverview && strategicOverview.title) || 'STRATEGIC OVERVIEW';
  const soSubtitle = (strategicOverview && strategicOverview.subtitle) || STRATEGIC_OVERVIEW_SUBTITLE;

  function strategicOverviewEditBtn() {
    if (!soCanEdit || !soOption) return '';
    if (state.landingEditing === 'strategicOverview') {
      return `<button onclick="app.saveStrategicOverview()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelStrategicOverviewEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editStrategicOverview()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  // Every (C-level, area) pair this account may see gets its own option, so a C-level holding two
  // areas appears twice and each set of numbers is filled in and read separately. Hidden while
  // editing, so switching mid-edit can't silently discard the draft.
  function strategicOverviewPicker() {
    if (!soOption || soOptions.length <= 1 || state.landingEditing === 'strategicOverview') return '';
    return `<select class="zbod-select" onchange="app.selectStrategicOverviewOption(this.value)" style="padding:6px 10px;font-size:12px;max-width:300px;">
      ${soOptions.map(o => `<option value="${escHtml(soKeyOf(o))}" ${soKeyOf(o) === soKeyOf(soOption) ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}
    </select>`;
  }

  function renderStrategicOverviewTable() {
    const so = strategicOverview;
    let html = '';
    const soNote = (text) => `<p style="font-size:13px;color:#6b7280;padding:16px 0;">${text}</p>`;

    if (!soOption) {
      return soNote(isCurrentUserAdmin()
        ? 'No C-level accounts with an area of responsibility yet. Add one from Manage Users to start entering strategic targets.'
        : 'No strategic targets are available to your account yet. Please contact the administrator.');
    }

    if (state.landingEditing === 'strategicOverview') {
      const blank = blankStrategicOverview();
      const draftCols = state.landingDrafts['so_cols'] !== undefined ? state.landingDrafts['so_cols'] : (so ? so.columns : blank.columns);
      const draftRows = state.landingDrafts['so_rows'] !== undefined ? state.landingDrafts['so_rows'] : (so ? so.rows : blank.rows);

      html += `<div class="strategic-table-wrap"><table class="strategic-table"><thead><tr>`;
      draftCols.forEach((col, ci) => {
        html += `<th class="${col === 'TARGET' ? 'target-col' : ''}"><input class="zbod-input" id="so-col-${ci}" value="${escHtml(col)}" oninput="state.landingDrafts['so_cols'][${ci}]=this.value" style="font-family:'Montserrat',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;text-align:center;padding:4px 8px;background:transparent;border:none;color:inherit;min-width:60px;"></th>`;
      });
      html += `</tr></thead><tbody>`;
      draftRows.forEach((row, ri) => {
        html += `<tr class="${row.highlight ? 'highlight-row' : ''}">`;
        html += `<td><input class="zbod-input" id="so-row-${ri}-m" value="${escHtml(row.metric)}" oninput="state.landingDrafts['so_rows'][${ri}].metric=this.value" style="text-align:left;font-weight:600;"></td>`;
        html += `<td><input class="zbod-input" id="so-row-${ri}-25" value="${escHtml(row.c2025)}" oninput="state.landingDrafts['so_rows'][${ri}].c2025=this.value"></td>`;
        html += `<td><input class="zbod-input" id="so-row-${ri}-26" value="${escHtml(row.c2026)}" oninput="state.landingDrafts['so_rows'][${ri}].c2026=this.value"></td>`;
        html += `<td class="target-col"><input class="zbod-input" id="so-row-${ri}-t" value="${escHtml(row.target)}" oninput="state.landingDrafts['so_rows'][${ri}].target=this.value" style="font-weight:700;color:#2E642C;"></td>`;
        html += `<td><input class="zbod-input" id="so-row-${ri}-27" value="${escHtml(row.c2027)}" oninput="state.landingDrafts['so_rows'][${ri}].c2027=this.value"></td>`;
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
      return html;
    }

    // Deliberately blank rather than falling back to another structure's (or the old company-wide)
    // figures — showing numbers that were never entered for THIS structure would be misread as its
    // own targets.
    if (!so) {
      return soNote(`No strategic targets have been entered for <strong>${escHtml(soOption.cxoName)}</strong> &mdash; <strong>${escHtml(soOption.area)}</strong> yet.`
        + (soCanEdit ? ' Use Edit to add them.' : ''));
    }

    html += `<div class="strategic-table-wrap"><table class="strategic-table"><thead><tr>`;
    so.columns.forEach(col => {
      html += `<th class="${col === 'TARGET' ? 'target-col' : ''}">${escHtml(col)}</th>`;
    });
    html += `</tr></thead><tbody>`;
    so.rows.forEach(row => {
      html += `<tr class="${row.highlight ? 'highlight-row' : ''}">`;
      html += `<td>${escHtml(row.metric)}</td>`;
      html += `<td>${escHtml(row.c2025)}</td>`;
      html += `<td>${escHtml(row.c2026)}</td>`;
      html += `<td class="target-col">${escHtml(row.target)}</td>`;
      html += `<td>${escHtml(row.c2027)}</td>`;
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  // Problem Statement data — structured for future Supabase integration
  const problemsDefaults = [
    'Too many management layers',
    'Decentralized and duplicated functions',
    'Low span of control',
    'Low-grade employees',
    'Shadow Support Functions',
    'Complex, manual-based processes and jobs',
    'Multi-layered deputy hierarchy',
  ];
  const savedProblems = lsGet('zbod_problems', null);
  const problemsData = savedProblems && Array.isArray(savedProblems) ? savedProblems : problemsDefaults;
  const problemsTitleDefault = 'PROBLEM STATEMENT';
  const savedProblemsTitle = lsGet('zbod_problems_title', null);
  const problemsTitle = savedProblemsTitle !== null ? savedProblemsTitle : problemsTitleDefault;

  // Main Questions data — structured for future Supabase integration
  const questionsDefaults = [
    { id: 'mq1', label: 'MQ1', text: "Let's assume we are building the structure from scratch. According to your vision, which business functions must be created in order to add value to the business?" },
    { id: 'mq2', label: 'MQ2', text: 'To what degree is it possible to automate or outsource the proposed function?' },
    { id: 'mq3', label: 'MQ3', text: 'Is there any function that is currently being overlooked or ignored?' },
  ];
  const savedQuestions = lsGet('zbod_questions', null);
  const questionsData = savedQuestions && Array.isArray(savedQuestions) ? savedQuestions : questionsDefaults;
  const questionsTitleDefault = 'MAIN QUESTIONS';
  const savedQuestionsTitle = lsGet('zbod_questions_title', null);
  const questionsTitle = savedQuestionsTitle !== null ? savedQuestionsTitle : questionsTitleDefault;

  function questionsEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'questions') {
      return `<button onclick="app.saveQuestions()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelQuestionsEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editQuestions()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderQuestionItem(q, idx) {
    if (state.landingEditing === 'questions') {
      const draftText = state.landingDrafts[`mq_text_${idx}`] !== undefined ? state.landingDrafts[`mq_text_${idx}`] : q.text;
      const draftLabel = state.landingDrafts[`mq_label_${idx}`] !== undefined ? state.landingDrafts[`mq_label_${idx}`] : q.label;
      return `<div class="question-item">
        <div class="question-header">
          <input class="zbod-input" id="mq-label-${idx}" value="${escHtml(draftLabel)}" oninput="state.landingDrafts['mq_label_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:13px;color:#ffffff;background:#2E642C;padding:6px 14px;border:none;border-radius:8px;letter-spacing:0.04em;width:auto;max-width:100px;text-align:center;">
        </div>
        <textarea class="zbod-textarea" id="mq-text-${idx}" rows="3" oninput="state.landingDrafts['mq_text_${idx}']=this.value">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="question-item">
      <div class="question-header">
        <span class="question-badge">${escHtml(q.label)}</span>
      </div>
      <div class="question-text">${escHtml(q.text)}</div>
    </div>`;
  }

  // Function Categorization Matrix data — structured for future Supabase integration
  const fcmatrixDefaults = [
    { id: 'fca', letter: 'A', score: '9\u201310', title: 'Strategic', action: 'Invest', variant: 'a' },
    { id: 'fcb', letter: 'B', score: '7\u20138', title: 'Core Operations', action: 'Keep', variant: 'b' },
    { id: 'fcc', letter: 'C', score: '5\u20136', title: 'Efficiency', action: 'Optimize / Automate', variant: 'c' },
    { id: 'fcd', letter: 'D', score: '2\u20134', title: 'Non-Core', action: 'Eliminate / Outsource', variant: 'd' },
  ];
  const savedFcmatrix = lsGet('zbod_fcmatrix', null);
  const fcmatrixData = savedFcmatrix && Array.isArray(savedFcmatrix) ? savedFcmatrix : fcmatrixDefaults;
  const fcmatrixTitleDefault = 'FUNCTION CATEGORIZATION MATRIX';
  const savedFcmatrixTitle = lsGet('zbod_fcmatrix_title', null);
  const fcmatrixTitle = savedFcmatrixTitle !== null ? savedFcmatrixTitle : fcmatrixTitleDefault;

  function fcmatrixEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'fcmatrix') {
      return `<button onclick="app.saveFcmatrix()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelFcmatrixEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editFcmatrix()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderFcmatrixItem(item, idx) {
    const v = item.variant || 'a';
    if (state.landingEditing === 'fcmatrix') {
      const draftScore = state.landingDrafts[`fc_score_${idx}`] !== undefined ? state.landingDrafts[`fc_score_${idx}`] : item.score;
      const draftTitle = state.landingDrafts[`fc_title_${idx}`] !== undefined ? state.landingDrafts[`fc_title_${idx}`] : item.title;
      const draftAction = state.landingDrafts[`fc_action_${idx}`] !== undefined ? state.landingDrafts[`fc_action_${idx}`] : item.action;
      return `<div class="fcmatrix-item fcmatrix-${v}">
        <input class="zbod-input" id="fc-letter-${idx}" value="${escHtml(item.letter)}" readonly style="font-family:'Montserrat',sans-serif;font-size:32px;font-weight:900;text-align:center;width:60px;padding:0;background:transparent;border:none;color:inherit;">
        <input class="zbod-input" id="fc-score-${idx}" value="${escHtml(draftScore)}" oninput="state.landingDrafts['fc_score_${idx}']=this.value" style="font-size:12px;font-weight:600;text-align:center;padding:4px 10px;width:auto;">
        <input class="zbod-input" id="fc-title-${idx}" value="${escHtml(draftTitle)}" oninput="state.landingDrafts['fc_title_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;text-align:center;padding:6px 10px;">
        <input class="zbod-input" id="fc-action-${idx}" value="${escHtml(draftAction)}" oninput="state.landingDrafts['fc_action_${idx}']=this.value" style="font-size:12px;font-weight:600;text-align:center;padding:4px 10px;letter-spacing:0.06em;text-transform:uppercase;width:auto;">
      </div>`;
    }
    return `<div class="fcmatrix-item fcmatrix-${v}">
      <div class="fcmatrix-letter">${escHtml(item.letter)}</div>
      <div class="fcmatrix-title">${escHtml(item.title)}</div>
      <div class="fcmatrix-action">${escHtml(item.action)}</div>
    </div>`;
  }

  // Support Functions data — structured for future Supabase integration
  const supportDefaults = [
    { id: 'sf1', iconKey: 'settings', title: 'IT Support', text: 'Manage and maintain technology infrastructure, provide technical assistance, and ensure system reliability across the organization.' },
    { id: 'sf2', iconKey: 'shield', title: 'Security & Compliance', text: 'Oversee data protection, enforce security policies, and ensure regulatory compliance to minimize risk and safeguard organizational assets.' },
    { id: 'sf3', iconKey: 'barChart', title: 'Finance & Accounting', text: 'Handle budgeting, financial reporting, payroll processing, and fiscal planning to maintain organizational financial health.' },
    { id: 'sf4', iconKey: 'users', title: 'HR Administration', text: 'Manage recruitment, employee onboarding, benefits administration, and workplace policies to support workforce needs.' },
  ];
  const savedSupport = lsGet('zbod_support', null);
  const supportData = savedSupport && Array.isArray(savedSupport) ? savedSupport : supportDefaults;
  const supportTitleDefault = 'SUPPORT FUNCTIONS';
  const savedSupportTitle = lsGet('zbod_support_title', null);
  const supportTitle = savedSupportTitle !== null ? savedSupportTitle : supportTitleDefault;

  function supportEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'support') {
      return `<button onclick="app.saveSupport()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelSupportEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editSupport()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderSupportItem(item, idx) {
    const iconSvg = ICONS[item.iconKey] || ICONS.settings;
    if (state.landingEditing === 'support') {
      const draftTitle = state.landingDrafts[`sf_title_${idx}`] !== undefined ? state.landingDrafts[`sf_title_${idx}`] : item.title;
      const draftText = state.landingDrafts[`sf_text_${idx}`] !== undefined ? state.landingDrafts[`sf_text_${idx}`] : item.text;
      return `<div class="support-item">
        <div class="support-icon">${iconSvg}</div>
        <input class="zbod-input" id="sf-title-${idx}" value="${escHtml(draftTitle)}" oninput="state.landingDrafts['sf_title_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#0F3C76;padding:6px 10px;margin-bottom:8px;">
        <textarea class="zbod-textarea" id="sf-text-${idx}" rows="3" oninput="state.landingDrafts['sf_text_${idx}']=this.value">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="support-item">
      <div class="support-icon">${iconSvg}</div>
      <div class="support-title">${escHtml(item.title)}</div>
      <div class="support-text">${escHtml(item.text)}</div>
    </div>`;
  }

  // Quote data — structured for future Supabase integration
  const quoteDefault = "Let's put the current organizational structure aside and focus purely on the strategy. Let's think about where the business is going over the next three years and how the organization should add value to that direction. If we were designing the organization from scratch, which capabilities would be most critical for delivering the strategy? Let's work together to shape a structure that will genuinely enable the business and maximize value over the next three years.";
  const savedQuote = lsGet('zbod_quote', null);
  const quoteText = savedQuote !== null ? savedQuote : quoteDefault;

  function quoteEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'quote') {
      return `<button onclick="app.saveQuote()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelQuoteEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editQuote()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderQuoteText() {
    if (state.landingEditing === 'quote') {
      const draft = state.landingDrafts['quote_text'] !== undefined ? state.landingDrafts['quote_text'] : quoteText;
      return `<textarea class="zbod-textarea" id="quote-text" rows="4" oninput="state.landingDrafts['quote_text']=this.value">${escHtml(draft)}</textarea>`;
    }
    return `<p class="quote-text">"${escHtml(quoteText)}"</p>`;
  }

  // Core Principles data — structured for future Supabase integration
  const principlesDefaults = [
    'Key strategic directions for cost and process optimization',
    'Ignore the current org chart and design it from zero',
    'Automate or outsource before creation',
    'Focus on value creation',
  ];
  const savedPrinciples = lsGet('zbod_principles', null);
  const principlesData = savedPrinciples && Array.isArray(savedPrinciples) ? savedPrinciples : principlesDefaults;
  const principlesTitleDefault = 'CORE PRINCIPLES';
  const savedPrinciplesTitle = lsGet('zbod_principles_title', null);
  const principlesTitle = savedPrinciplesTitle !== null ? savedPrinciplesTitle : principlesTitleDefault;

  function principlesEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'principles') {
      return `<button onclick="app.savePrinciples()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelPrinciplesEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editPrinciples()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderPrincipleItem(text, idx) {
    if (state.landingEditing === 'principles') {
      const draftText = state.landingDrafts[`pr_text_${idx}`] !== undefined ? state.landingDrafts[`pr_text_${idx}`] : text;
      return `<div class="principle-item">
        <div class="principle-check">${ICONS.check}</div>
        <textarea class="zbod-textarea" id="pr-text-${idx}" rows="2" oninput="state.landingDrafts['pr_text_${idx}']=this.value" style="font-size:14px;color:#4b5563;flex:1;">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="principle-item">
      <div class="principle-check">${ICONS.check}</div>
      <div class="principle-text">${escHtml(text)}</div>
    </div>`;
  }

  // Strategic Questions data — structured for future Supabase integration
  const strategicDefaults = [
    { id: 'sq1', label: 'SQ1', text: 'Does this function materially contribute to business strategy and outcomes, and enable scalable, efficient value creation (e.g. revenue, productivity, customer experience, automation)?' },
    { id: 'sq2', label: 'SQ2', text: 'How critical is this function to business continuity and risk management, and what would be the impact if it were stopped today (legal, financial, regulatory, reputational, operational)?' },
  ];
  const savedStrategic = lsGet('zbod_strategic', null);
  const strategicData = savedStrategic && Array.isArray(savedStrategic) ? savedStrategic : strategicDefaults;
  const strategicTitleDefault = 'STRATEGIC QUESTIONS';
  const savedStrategicTitle = lsGet('zbod_strategic_title', null);
  const strategicTitle = savedStrategicTitle !== null ? savedStrategicTitle : strategicTitleDefault;

  function strategicEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'strategic') {
      return `<button onclick="app.saveStrategic()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelStrategicEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editStrategic()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderStrategicItem(s, idx) {
    if (state.landingEditing === 'strategic') {
      const draftText = state.landingDrafts[`sq_text_${idx}`] !== undefined ? state.landingDrafts[`sq_text_${idx}`] : s.text;
      const draftLabel = state.landingDrafts[`sq_label_${idx}`] !== undefined ? state.landingDrafts[`sq_label_${idx}`] : s.label;
      return `<div class="strategic-item">
        <div class="strategic-header">
          <input class="zbod-input" id="sq-label-${idx}" value="${escHtml(draftLabel)}" oninput="state.landingDrafts['sq_label_${idx}']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:13px;color:#ffffff;background:#2E642C;padding:6px 14px;border:none;border-radius:8px;letter-spacing:0.04em;width:auto;max-width:100px;text-align:center;">
        </div>
        <textarea class="zbod-textarea" id="sq-text-${idx}" rows="3" oninput="state.landingDrafts['sq_text_${idx}']=this.value">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="strategic-item">
      <div class="strategic-header">
        <span class="strategic-badge">${escHtml(s.label)}</span>
      </div>
      <div class="strategic-text">${escHtml(s.text)}</div>
    </div>`;
  }

  function problemsEditBtn() {
    if (!isAdmin) return '';
    if (state.landingEditing === 'problems') {
      return `<button onclick="app.saveProblems()" class="zbod-btn-primary" style="padding:6px 12px;font-size:11px;">${ICONS.save} Save</button>
              <button onclick="app.cancelProblemsEdit()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.x} Cancel</button>`;
    }
    return `<button onclick="app.editProblems()" class="zbod-btn-secondary" style="padding:6px 12px;font-size:11px;">${ICONS.edit} Edit</button>`;
  }

  function renderProblemItem(text, idx) {
    if (state.landingEditing === 'problems') {
      const draftText = state.landingDrafts[`pr_text_${idx}`] !== undefined ? state.landingDrafts[`pr_text_${idx}`] : text;
      return `<div class="problem-item">
        <div class="problem-bullet"></div>
        <textarea class="zbod-textarea" id="pr-text-${idx}" rows="2" oninput="state.landingDrafts['pr_text_${idx}']=this.value" style="font-size:14px;color:#374151;flex:1;">${escHtml(draftText)}</textarea>
      </div>`;
    }
    return `<div class="problem-item">
      <div class="problem-bullet"></div>
      <div class="problem-text">${escHtml(text)}</div>
    </div>`;
  }

  // The animated hero + scroll reveals belong to the ZBOD landing page only (the Admin Panel reuses
  // this markup and stays as it was), and play once per visit, not on every edit re-render.
  const lpOn = state.currentPage !== 'admin';
  const lpEnter = lpOn && !window._lpRevealed;

  const html = `
    <div class="${lpOn ? 'lp-hero' + (lpEnter ? ' lp-enter' : '') : ''}" style="background:#fff;border-bottom:1px solid var(--border);padding:64px 0 48px;">
      ${lpOn ? `<div class="lp-hero__bg" aria-hidden="true"><i class="lp-blob lp-blob--a"></i><i class="lp-blob lp-blob--b"></i><i class="lp-blob lp-blob--c"></i><span class="lp-grid"></span>${lpTreeSvg('lp-tree--l')}${lpTreeSvg('lp-tree--r')}</div>` : ''}
      <div class="max-w-5xl mx-auto px-8 text-center lp-hero__in">
        <div class="zbod-chip lp-chip" style="margin-bottom:24px;">Azerconnect Group</div>
        <h1 class="lp-title" style="font-family:'Montserrat',sans-serif;font-size:48px;font-weight:800;color:#111827;margin-bottom:16px;line-height:1.1;">Zero-Based<br>Organizational Design</h1>
        <p class="lp-lead" style="font-size:18px;color:#4b5563;max-width:600px;margin:0 auto 32px;">Build organizational structures from the ground up with strategic alignment, optimized resource allocation, and efficient value creation.</p>
        <button onclick="app.goToDivisions()" class="zbod-btn-primary lp-cta" style="font-size:16px;padding:16px 40px;">${ICONS.sparkles} Start Workshop</button>
      </div>
    </div>
    <div class="max-w-5xl mx-auto px-8 py-12">
      <div class="zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          ${ICONS.target}
          <div class="flex-1">${field('overviewTitle', 'h2')}</div>
          <div>${editBtn()}</div>
        </div>
        ${field('overviewText', 'textarea')}
      </div>
      <div class="quote-wrapper zbod-card">
        <div class="quote-card-inner">
          <div style="display:flex;align-items:flex-start;gap:16px;">
            <div style="color:#2E642C;flex-shrink:0;margin-top:2px;">${ICONS.quote}</div>
            <div class="flex-1" style="display:flex;align-items:center;gap:12px;">
              <div class="flex-1">${renderQuoteText()}</div>
              <div>${quoteEditBtn()}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="guideline-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          ${ICONS.book}
          <div class="flex-1">${state.landingEditing === 'guideline' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['guidelineTitle'] || guidelineTitle)}" oninput="state.landingDrafts['guidelineTitle']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(guidelineTitle)}</h2>`}</div>
          <div>${guidelineEditBtn()}</div>
        </div>
        <div class="guideline-boxes-grid">
          ${guidelineData.map((g, i) => renderGuidelineItem(g, i)).join('')}
        </div>
      </div>
      <div class="principles-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          ${ICONS.checkCircle}
          <div class="flex-1">${state.landingEditing === 'principles' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['principles_title'] || principlesTitle)}" oninput="state.landingDrafts['principles_title']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(principlesTitle)}</h2>`}</div>
          <div>${principlesEditBtn()}</div>
        </div>
        <div class="principles-grid">
          ${principlesData.map((p, i) => renderPrincipleItem(p, i)).join('')}
        </div>
      </div>
      <div class="fcmatrix-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          ${ICONS.grid}
          <div class="flex-1">${state.landingEditing === 'fcmatrix' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['fcmatrix_title'] || fcmatrixTitle)}" oninput="state.landingDrafts['fcmatrix_title']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(fcmatrixTitle)}</h2>`}</div>
          <div>${fcmatrixEditBtn()}</div>
        </div>
        <div class="fcmatrix-grid">
          ${fcmatrixData.map((item, i) => renderFcmatrixItem(item, i)).join('')}
        </div>
      </div>
      <div class="benefits-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          ${ICONS.award}
          <div class="flex-1">${state.landingEditing === 'benefits' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['benefits_title'] !== undefined ? state.landingDrafts['benefits_title'] : benefitsTitle)}" oninput="state.landingDrafts['benefits_title']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(benefitsTitle)}</h2>`}</div>
          <div>${benefitsEditBtn()}</div>
        </div>
        <div class="benefits-grid${state.landingEditing === 'benefits' ? ' is-editing' : ''}">
          ${benefitsData.map((b, i) => renderBenefitItem(b, i)).join('')}
        </div>
      </div>
      <div class="strategic-overview-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          ${ICONS.trendingUp}
          <div class="flex-1">
            ${state.landingEditing === 'strategicOverview' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['so_title'] !== undefined ? state.landingDrafts['so_title'] : soTitle)}" oninput="state.landingDrafts['so_title']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;margin-bottom:4px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(soTitle)}</h2>`}
            <p class="strategic-overview-subtitle">${escHtml(soSubtitle)}</p>
          </div>
          <div class="flex items-center gap-2">${strategicOverviewPicker()}${strategicOverviewEditBtn()}</div>
        </div>
        ${renderStrategicOverviewTable()}
      </div>
      <div class="problems-wrapper zbod-card p-6">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          ${ICONS.alertTriangle}
          <div class="flex-1">${state.landingEditing === 'problems' ? `<input class="zbod-input" value="${escHtml(state.landingDrafts['problems_title'] || problemsTitle)}" oninput="state.landingDrafts['problems_title']=this.value" style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;padding:6px 10px;">` : `<h2 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#0F3C76;">${escHtml(problemsTitle)}</h2>`}</div>
          <div>${problemsEditBtn()}</div>
        </div>
        <div class="problems-grid">
          <div class="problems-col">
            ${problemsData.slice(0, 4).map((t, i) => renderProblemItem(t, i)).join('')}
          </div>
          <div class="problems-col">
            ${problemsData.slice(4, 7).map((t, i) => renderProblemItem(t, i + 4)).join('')}
          </div>
        </div>
      </div>
    </div>`;

  // Rendered into whichever container is actually visible right now — the normal ZBOD landing
  // page, or the same content reused inside the Admin Panel (read-only vs editable is decided by
  // isAdmin above, not by which container this is).
  const targetId = state.currentPage === 'admin' ? 'admin-landing-content' : 'landing-content';
  const targetEl = document.getElementById(targetId);
  if (targetEl) targetEl.innerHTML = html;
  if (targetEl && lpOn) lpInitFx(targetEl, lpEnter);
}

// ═══════════════════════════════════════════
// RENDER: MANAGE USERS PAGE (Admin only)
// ═══════════════════════════════════════════
function renderManageUsers() {
  // Every account card shows a password, so this must never paint for a non-admin even if the
  // page is reached some other way than goToManageUsers().
  if (!isCurrentUserAdmin()) { showPage('landing'); return; }
  const users = getUsers();
  const container = document.getElementById('manage-users-content');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `<div class="text-center py-12"><div style="width:64px;height:64px;border-radius:16px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${ICONS.users}</div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:20px;color:#111827;margin-bottom:8px;">No Users Yet</h3><p style="color:#6b7280;margin-bottom:24px;">Add a user so they can sign in to the ZBOD tool.</p><button onclick="app.showAddUser()" class="zbod-btn-primary">${ICONS.plus} Add User</button></div>`;
    return;
  }

  const renderUserCard = u => `<div class="zbod-card p-6">
      <div style="display:flex;align-items:start;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, rgba(46,100,44,0.1) 0%, rgba(15,52,76,0.1) 100%);display:flex;align-items:center;justify-content:center;">${ICONS.users}</div>
          <div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#111827;">${escHtml(u.fullName || '')}</h3><p style="font-size:13px;color:#6b7280;">${escHtml(u.position || '')}</p></div>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="app.editUser('${escHtml(u.id)}')" style="padding:8px;border-radius:8px;color:#9ca3af;" aria-label="Edit" title="Edit">${ICONS.edit}</button>
          <button onclick="app.confirmDeleteUser('${escHtml(u.id)}')" style="padding:8px;border-radius:8px;color:#9ca3af;" aria-label="Sil" title="Sil">${ICONS.trash}</button>
        </div>
      </div>
      <div style="margin:16px 0;border-top:1px solid rgba(46,100,44,0.1);"></div>
      <div class="space-y-2" style="font-size:13px;color:#4b5563;">
        ${u.areaOfResponsibility ? `<p><strong style="color:#374151;">${parseAreas(u.areaOfResponsibility).length > 1 ? 'Areas' : 'Area'}:</strong> ${parseAreas(u.areaOfResponsibility).map(a => escHtml(a)).join(' &bull; ')}</p>` : ''}
        <p><strong style="color:#374151;">Email:</strong> ${escHtml(u.email || '')}</p>
        <p><strong style="color:#374151;">Password:</strong> <span style="color:#9ca3af;">Supabase Auth tərəfindən idarə olunur</span></p>
      </div>
    </div>`;

  const renderGroup = (title, groupUsers) => {
    if (groupUsers.length === 0) return '';
    return `<div class="mb-8">
      <h2 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px;color:#111827;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${title} <span style="color:#9ca3af;font-weight:600;">(${groupUsers.length})</span></h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${groupUsers.map(renderUserCard).join('')}</div>
    </div>`;
  };

  // Separate categories per role, kept visually apart -- HRBP (structure creators) and CxO
  // (read-only assignees) are functionally distinct account types, not just a label difference.
  const active = getActiveUsers();
  const hrbpUsers = active.filter(u => u.role === 'hrbp');
  const cxoUsers = active.filter(u => u.role === 'cxo');
  const unsetUsers = active.filter(u => u.role !== 'hrbp' && u.role !== 'cxo');

  container.innerHTML =
    renderGroup('HRBP', hrbpUsers) +
    renderGroup('CxO', cxoUsers) +
    renderGroup('Role Not Set', unsetUsers);
}

// ═══════════════════════════════════════════
// RENDER: MY ACCOUNT PAGE (User side) — read-only view of the data the Admin entered for the
// currently signed-in user (see Manage Users); the user has no way to edit any of it themselves.
// ═══════════════════════════════════════════
function renderAccount() {
  const container = document.getElementById('account-content');
  if (!container) return;
  // The signed-in account's own profile, straight from the session rather than looked up by email.
  const user = currentProfile || getUsers().find(u => (u.email || '').toLowerCase() === getCurrentEmail());
  if (!user) {
    container.innerHTML = `<p style="color:#6b7280;">Account information not found.</p>`;
    return;
  }
  const field = (label, value) => `<div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:4px;">${label}</label><p style="font-size:15px;color:#111827;">${escHtml(value || '-')}</p></div>`;
  container.innerHTML = `<div class="zbod-card p-8">
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
      <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg, rgba(46,100,44,0.1) 0%, rgba(15,52,76,0.1) 100%);display:flex;align-items:center;justify-content:center;">${ICONS.users}</div>
      <div><h2 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:22px;color:#111827;">${escHtml(user.fullName || '')}</h2><p style="font-size:14px;color:#6b7280;">${escHtml(user.position || '')}</p></div>
    </div>
    <div style="margin:16px 0;border-top:1px solid rgba(46,100,44,0.1);"></div>
    <div class="space-y-4">
      ${field('Full Name', user.fullName)}
      ${field('Position', user.position)}
      ${field('Area of Responsibility', user.areaOfResponsibility)}
      ${field('Email', user.email)}
      <div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:4px;">Password</label><p style="font-size:15px;color:#9ca3af;">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</p></div>
    </div>
    <div style="margin:24px 0 16px;border-top:1px solid rgba(46,100,44,0.1);"></div>
    ${state.accountChangingPassword ? `
    <h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:15px;color:#111827;margin-bottom:12px;">Change Password</h3>
    <p id="account-password-error" style="color:#991b1b;font-size:13px;min-height:18px;margin-bottom:8px;"></p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4" style="margin-bottom:16px;">
      <div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">New Password</label>${renderPasswordInput('account-new-password', 'New password')}</div>
      <div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">Confirm New Password</label>${renderPasswordInput('account-confirm-password', 'Confirm new password')}</div>
    </div>
    <div class="flex gap-3">
      <button class="zbod-btn-primary" onclick="app.changeOwnPassword()">Update Password</button>
      <button class="zbod-btn-secondary" onclick="app.cancelChangePassword()">Cancel</button>
    </div>` : `
    <button class="zbod-btn-secondary" onclick="app.showChangePassword()">Change Password</button>`}
  </div>`;
}

// ═══════════════════════════════════════════
// RENDER: DIVISIONS/STRUCTURES PAGE
// ═══════════════════════════════════════════
function renderDivisions(searchQuery) {
  const divs = getVisibleDivs();
  const container = document.getElementById('divisions-content');
  const readOnly = isReadOnlyViewer();
  const addBtn = document.getElementById('add-structure-btn');
  if (addBtn) addBtn.classList.toggle('hidden', readOnly);
  if (divs.length === 0) {
    const emptyAddBtn = readOnly ? '' : `<button onclick="app.showAddDivision()" class="zbod-btn-primary">${ICONS.plus} Add Structure</button>`;
    container.innerHTML = `<div class="text-center py-12"><div style="width:64px;height:64px;border-radius:16px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${ICONS.building}</div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:20px;color:#111827;margin-bottom:8px;">No Structures Yet</h3><p style="color:#6b7280;margin-bottom:24px;">${readOnly ? 'No structures have been assigned to you yet.' : 'Add your first organizational structure to begin.'}</p>${emptyAddBtn}</div>`;
    return;
  }

  const q = (searchQuery || '').toLowerCase().trim();
  const filtered = q ? divs.filter(d => {
    const nameMatch = (d.structure_name || '').toLowerCase().includes(q);
    const creatorMatch = (d.created_by_name || '').toLowerCase().includes(q);
    const cLevelMatch = (d.c_level_name || '').toLowerCase().includes(q);
    return nameMatch || creatorMatch || cLevelMatch;
  }) : divs;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center py-12"><div style="width:64px;height:64px;border-radius:16px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${ICONS.search}</div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:20px;color:#111827;margin-bottom:8px;">No matching structures found.</h3><p style="color:#6b7280;">Try a different search term.</p></div>`;
    return;
  }

  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
  filtered.forEach(d => {
    const typeLabel = escHtml(d.structure_type || 'Division');
    const creatorLine = d.created_by_name ? `<p style="font-size:12px;color:#9ca3af;margin-top:2px;">Created by: ${escHtml(d.created_by_name)}</p>` : '';
    const deleteBtn = readOnly ? '' : `<button onclick="event.stopPropagation();app.verifyAndDeleteDivision('${escHtml(d.id)}')" style="padding:8px;border-radius:8px;color:#9ca3af;transition:all 0.2s;" onmouseover="this.style.color='#991b1b';this.style.background='rgba(180,60,60,0.1)'" onmouseout="this.style.color='#9ca3af';this.style.background='transparent'">${ICONS.trash}</button>`;
    html += `<div class="zbod-card p-6 zbod-card-hover" style="cursor:pointer;" onclick="app.verifyAndSelectDivision('${escHtml(d.id)}')">
      <div style="display:flex;align-items:start;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, rgba(46,100,44,0.1) 0%, rgba(15,52,76,0.1) 100%);display:flex;align-items:center;justify-content:center;">${ICONS.building}</div>
          <div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;color:#111827;">${escHtml(d.structure_name)}</h3><p style="font-size:13px;color:#6b7280;">${typeLabel} &mdash; ${escHtml(d.c_level_name)}</p>${creatorLine}</div>
        </div>
        ${deleteBtn}
      </div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function getDivisionFormFields() {
  return [
    { key: 'structure_name', label: 'Structure Name *', placeholder: 'Select structure name', type: 'select', options: STRUCTURE_NAMES, other: true },
    { key: 'structure_type', label: 'Structure Type *', placeholder: 'Select structure type', type: 'select', options: STRUCTURE_TYPES, other: true },
    { key: 'c_level_name', label: 'C-Level Full Name *', placeholder: '', type: 'text' },
    { key: 'current_total_hc', label: 'Current Total Headcount *', placeholder: '', type: 'number' },
    { key: 'headcount_target', label: 'Headcount Target *', placeholder: '', type: 'number' },
    { key: 'current_total_budget', label: 'Current Total Budget (AZN) *', placeholder: '', type: 'money' },
    { key: 'budget_target', label: 'Budget Target (AZN) *', placeholder: '', type: 'money' },
  ];
}

function renderDivisionForm() {
  const fields = getDivisionFormFields();
  const showCxoPicker = !isCurrentUserAdmin();
  const cxoUsers = showCxoPicker ? getActiveUsers().filter(u => u.role === 'cxo') : [];
  document.getElementById('division-form-fields').innerHTML = fields.map((f, idx) => {
    // HRBP picks the C-Level name from the admin-managed CxO list (also stamps cxo_email on
    // submit, see submitAddDivision) instead of typing it freely -- Admin's own flow is
    // untouched and keeps the plain text input.
    if (f.key === 'c_level_name' && showCxoPicker) {
      return `<div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">${f.label}</label>
        <select class="zbod-select" id="div-${f.key}" style="max-width:100%;"><option value="">Select CxO</option>${cxoUsers.map(u => `<option value="${escHtml(u.email)}">${escHtml(u.fullName || u.email)}</option>`).join('')}</select></div>`;
    }
    if (f.type === 'select') {
      let html = `<div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">${f.label}</label>`;
      html += `<select class="zbod-select" id="div-${f.key}" style="max-width:100%;" onchange="app.handleDivisionSelectChange('${f.key}', this.value)"><option value="">${f.placeholder}</option>`;
      f.options.forEach(opt => html += `<option value="${opt}">${opt}</option>`);
      html += `</select>`;
      html += `<input type="text" class="zbod-input mt-2 hidden" id="div-${f.key}-other" placeholder="">`;
      html += `</div>`;
      return html;
    }
    if (f.type === 'money') {
      return `<div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">${f.label}</label><input ${moneyInputAttrs()} class="zbod-input" id="div-${f.key}" placeholder="${f.placeholder}"></div>`;
    }
    return `<div><label style="display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;">${f.label}</label><input type="${f.type}" class="zbod-input" id="div-${f.key}" placeholder="${f.placeholder}" oninput="if(this.type==='number'){this.dataset.rawValue=this.value;}"></div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// RENDER: KEY FINDINGS (AAA Section)
// ═══════════════════════════════════════════
function renderAAA(div) {
  const cards = getAAACards()[div.id] || [];
  const editCardIdx = state.aaaEditCardIdx;
  const readOnly = isReadOnlyViewer();

  const headerHtml = `<div class="aaa-header">
    <div class="aaa-title-wrap">
      <div class="aaa-badge">${ICONS.activity}</div>
      <span class="aaa-title">Key Findings</span>
    </div>
    ${readOnly ? '' : `<button onclick="app.addAAACard()" class="zbod-btn-primary" style="padding:6px 16px;font-size:12px;">${ICONS.plus} Add Findings</button>`}
  </div>`;

  let cardsHtml = '';
  if (cards.length === 0 && editCardIdx === null) {
    cardsHtml = `<p class="aaa-empty">No findings added yet.</p>`;
  } else {
    cardsHtml = `<div class="aaa-grid">${cards.map((card, idx) => {
      if (!readOnly && editCardIdx === idx) {
        return `<div class="aaa-insight-card aaa-insight-editing">
          <textarea class="aaa-textarea" id="aaa-card-${idx}" rows="3" placeholder="">${escHtml(state.aaaCards[div.id]?.[idx] !== undefined ? state.aaaCards[div.id][idx] : card)}</textarea>
          <div class="flex gap-2 mt-2">
            <button onclick="app.saveAAACard(${idx})" class="zbod-btn-primary" style="padding:6px 14px;font-size:12px;">${ICONS.save} Save</button>
            <button onclick="app.cancelAAACardEdit()" class="zbod-btn-secondary" style="padding:6px 14px;font-size:12px;">${ICONS.x} Cancel</button>
          </div>
        </div>`;
      }
      return `<div class="aaa-insight-card" style="position:relative;">
        ${readOnly ? '' : `<button onclick="app.confirmDeleteAAACard(${idx})" class="aaa-close-btn" aria-label="Remove" title="Remove">&times;</button>`}
        <div class="aaa-card-body">${escHtml(card)}</div>
      </div>`;
    }).join('')}</div>`;
  }

  return `<div class="zbod-card p-6">
    <div class="aaa-section">
      ${headerHtml}
      ${cardsHtml}
    </div>
  </div>`;
}


// ═══════════════════════════════════════════
// RENDER: WORKSPACE PAGE
// ═══════════════════════════════════════════
async function renderWorkspace() {
  const div = getDivs().find(d => d.id === state.selectedDivisionId);
  if (!div) return;
  // This page fully rebuilds its content (including any help icon) on every edit — close any
  // open popover now, before its anchor becomes a detached, stale-positioned node.
  closeAllFieldHelpPopovers();
  const ws = getWs().filter(w => w.division_id === div.id);
  const draftWs = ws.filter(w => w.status === 'draft');
  const completedWs = ws.filter(w => w.status === 'completed');
  const asIsFns = getAsIs().filter(f => f.division_id === div.id);
  // Root-level only: a sub-function's HC/budget is nested inside the parent it's grouped under,
  // not additive to it, so summing every AS-IS function (parents + children) would double-count.
  const rootAsIsFnIds = new Set(asIsFns.map(f => f.id));
  const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && rootAsIsFnIds.has(f.parent_id)));
  const structureType = div.structure_type || 'Division';
  const workspaceTitle = getWorkspaceTitle(structureType);
  const dataBoxTitle = getDataBoxTitle(structureType);
  const manageText = getManageText(structureType);
  const readOnly = isReadOnlyViewer();

  document.getElementById('workspace-header').innerHTML = `
    <div class="flex items-center gap-4">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.goToDivisions()">${ICONS.arrowLeft}</button>
      <div class="flex items-center gap-3">
        <div>
          <h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${escHtml(div.structure_name)}</h1>
          <p style="font-size:12px;color:#6b7280;">${escHtml(structureType)} &mdash; ${escHtml(div.c_level_name)}</p>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <button class="zbod-btn-export" onclick="app.exportToExcel()">${ICONS.download} Export Report</button>
      <button class="zbod-btn-secondary" onclick="app.goToHistory()">${ICONS.history} Previous Workshops</button>
    </div>`;

  let divDataHtml = '';
  if (state.editingDivision) {
    const ef = state._divEditForm || {};
    const editLabels = { current_total_hc: 'Current Total Headcount', headcount_target: 'Headcount Target', current_total_budget: 'Current Total Budget (AZN)', budget_target: 'Budget Target (AZN)' };
    const editFields = ['current_total_hc','headcount_target','current_total_budget','budget_target'];
    divDataHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${editFields.map(k => { const cur = ef[k] !== undefined ? ef[k] : (div[k] || 0); const isMoney = k.endsWith('budget') || k === 'budget_target'; return `<div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;display:block;">${editLabels[k]}</label>${isMoney ? `<input ${moneyInputAttrs()} class="zbod-input" id="wdiv-${k}" value="${formatMoneyValue(cur)}">` : `<input type="number" class="zbod-input" id="wdiv-${k}" value="${cur}" onwheel="return false;">`}</div>`; }).join('')}</div>`;
  } else {
    const asIsMgrs = rootAsIsFns.reduce((s, f) => s + (f.manager_count || 0), 0);
    const asIsProfs = rootAsIsFns.reduce((s, f) => s + (f.current_employee_count || 0), 0);
    const card = (icon, label, value, color) => `<div style="padding:16px;border-radius:12px;background:${color === 'blue' ? 'rgba(15,60,118,0.04)' : 'rgba(46,100,44,0.04)'};border:1px solid ${color === 'blue' ? 'rgba(15,60,118,0.1)' : 'rgba(46,100,44,0.1)'}"><div class="flex items-center gap-2 mb-1">${icon}<span style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${label}</span></div><p style="font-size:20px;font-weight:700;color:${color === 'blue' ? '#0F3C76' : '#111827'};">${formatNumber(value)}</p></div>`;
    divDataHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${card(ICONS.users, 'Current Total Headcount', div.current_total_hc || 0, 'green')}
      ${card(ICONS.target, 'Headcount Target', div.headcount_target || 0, 'blue')}
      ${card(ICONS.userCog, 'Managers', asIsMgrs, 'green')}
      ${card(ICONS.dollar, 'Current Total Budget (AZN)', div.current_total_budget || 0, 'green')}
      ${card(ICONS.dollar, 'Budget Target (AZN)', div.budget_target || 0, 'blue')}
      ${card(ICONS.users, 'Professionals', asIsProfs, 'green')}
    </div>`;
  }

  let asIsHtml = '';
  const totalAsIsHC = rootAsIsFns.reduce((s, f) => s + (f.current_function_hc || 0), 0);
  const totalAsIsBudget = rootAsIsFns.reduce((s, f) => s + ((f.managers_cost || 0) + (f.professionals_cost || 0)), 0);

  const asIsCardStyle = 'background:#ffffff;border:1.5px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02);transition:box-shadow 0.3s ease;';
  const asIsSectionTitle = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f3f4f6;';
  const asIsInputLabel = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:6px;display:block;';
  const asIsAllocStyle = 'font-size:13px;font-weight:700;color:#0F3C76;';
  const asIsSummaryBox = 'background:linear-gradient(135deg,rgba(15,60,118,0.06) 0%,rgba(46,100,44,0.04) 100%);border:1.5px solid rgba(15,60,118,0.15);border-radius:12px;padding:16px 20px;margin-top:16px;';

  const renderAsIsInput = (label, value, onchange, placeholder) => `<div><span style="${asIsInputLabel}">${label}</span><input type="number" min="0" step="1" class="zbod-input w-full" style="padding:8px 10px;font-size:14px;" value="${value}" onchange="${onchange}" placeholder="${placeholder || '0'}" onwheel="return false;"></div>`;
  const renderAsIsMoney = (label, value, onchange, placeholder) => `<div><span style="${asIsInputLabel}">${label}</span><input ${moneyInputAttrs()} class="zbod-input w-full" style="padding:8px 10px;font-size:14px;" value="${formatMoneyValue(value)}" onchange="${onchange}" placeholder="${placeholder || '0'}"></div>`;
  const renderAsIsPct = (label, value) => `<div><span style="${asIsInputLabel}">${label}</span><span style="${asIsAllocStyle}">${value}</span></div>`;

  // Returns all descendant IDs of a given AS-IS function (to prevent circular parents)
  const asIsDescendants = (fnId, allFns) => {
    const result = new Set();
    const q = [fnId];
    while (q.length) {
      const cur = q.shift();
      allFns.filter(f => f.parent_id === cur).forEach(c => { if (!result.has(c.id)) { result.add(c.id); q.push(c.id); } });
    }
    return result;
  };

  // Given a parentId, return the HC and Budget denominator for allocation %
  const asIsParentBase = (parentId) => {
    if (!parentId) return { hc: div.current_total_hc || 0, budget: div.current_total_budget || 0, label: div.structure_name || 'Division' };
    const p = asIsFns.find(f => f.id === parentId);
    if (!p) return { hc: div.current_total_hc || 0, budget: div.current_total_budget || 0, label: div.structure_name || 'Division' };
    return { hc: p.current_function_hc || 0, budget: (p.managers_cost || 0) + (p.professionals_cost || 0), label: p.function_name || 'Parent' };
  };

  // Parent dropdown for new rows (fnId='' means self-exclusion irrelevant; exclude descendants of nothing)
  const renderParentDropdownNew = (currentParentId, rowIdx) => {
    const opts = asIsFns.map(f =>
      `<option value="${f.id}" ${currentParentId === f.id ? 'selected' : ''}>${escHtml(f.function_name || 'Unnamed')}</option>`
    ).join('');
    return `<div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Parent Function</span><select class="zbod-select w-full" style="padding:8px 10px;font-size:14px;" onchange="app.updateAsIsNewRow('${state.asIsNewRows[rowIdx]?.id}','parentId',this.value);renderWorkspace()"><option value="" ${!currentParentId ? 'selected' : ''}>${escHtml(div.structure_name || 'Main Division / Structure')}</option>${opts}</select></div>`;
  };

  // Parent dropdown for saved functions
  const renderParentDropdown = (fn, currentParentId, onchange) => {
    const descendants = asIsDescendants(fn.id, asIsFns);
    const opts = asIsFns.filter(f => f.id !== fn.id && !descendants.has(f.id)).map(f =>
      `<option value="${f.id}" ${currentParentId === f.id ? 'selected' : ''}>${escHtml(f.function_name || 'Unnamed')}</option>`
    ).join('');
    return `<div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Parent Function</span><select class="zbod-select w-full" style="padding:8px 10px;font-size:14px;" onchange="${onchange}"><option value="" ${!currentParentId ? 'selected' : ''}>${escHtml(div.structure_name || 'Main Division / Structure')}</option>${opts}</select></div>`;
  };

  // Build topological order: parents before children, with depth for indentation and a
  // hierarchical number (1, 1.1, 1.2, 2, 2.1 ...) reflecting each function's position under its
  // parent, instead of one flat count across the whole list.
  const asIsFnIds = new Set(asIsFns.map(f => f.id));
  const asIsOrdered = [];
  const asIsVisited = new Set();
  const asIsVisitFn = (parentId, depth, prefix) => {
    asIsFns.filter(f => {
      const pid = (f.parent_id && asIsFnIds.has(f.parent_id)) ? f.parent_id : null;
      return pid === parentId;
    }).forEach((f, i) => {
      if (!asIsVisited.has(f.id)) {
        asIsVisited.add(f.id);
        const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        asIsOrdered.push({ fn: f, depth, num });
        asIsVisitFn(f.id, depth + 1, num);
      }
    });
  };
  asIsVisitFn(null, 0, '');
  // Fallback: any functions not yet visited (orphaned by deleted parents) at depth 0
  asIsFns.forEach(f => { if (!asIsVisited.has(f.id)) asIsOrdered.push({ fn: f, depth: 0, num: String(asIsOrdered.length + 1) }); });

  // Hierarchical expand/collapse: a card with sub-functions gets a toggle; collapsing it hides its
  // whole branch (checked via the ancestor chain, so a grandchild disappears when either its
  // parent or grandparent is collapsed). window-level, like the org chart's own collapse state.
  if (!window.asIsCardCollapsed) window.asIsCardCollapsed = new Set();
  const asIsCollapsedSet = window.asIsCardCollapsed;
  const asIsKidsOf = {};
  asIsFns.forEach(f => { const pid = (f.parent_id && asIsFnIds.has(f.parent_id)) ? f.parent_id : null; if (pid) (asIsKidsOf[pid] = asIsKidsOf[pid] || []).push(f); });
  const asIsHasCollapsedAncestor = (fn) => {
    let pid = (fn.parent_id && asIsFnIds.has(fn.parent_id)) ? fn.parent_id : null;
    const seen = new Set([fn.id]);
    // `seen` stops the walk on a parent cycle (A -> B -> A): without it the page froze for good.
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      if (asIsCollapsedSet.has(pid)) return true;
      const p = asIsFns.find(f => f.id === pid);
      pid = (p && p.parent_id && asIsFnIds.has(p.parent_id)) ? p.parent_id : null;
    }
    return false;
  };
  const asIsOrderedVisible = asIsOrdered.filter(({ fn }) => !asIsHasCollapsedAncestor(fn));
  // One color per depth level, reused for the border, the indent guide and the "Level N" badge —
  // so how deep a card sits is legible from color and label, not just indent width.
  const asIsLevelColors = ['#2E642C', '#0F3C76', '#b45309', '#6d28d9', '#993556'];
  const asIsLevelColor = depth => asIsLevelColors[Math.min(depth, asIsLevelColors.length - 1)];
  const asIsLevelBadge = (depth) => {
    const c = asIsLevelColor(depth);
    return `<span style="font-size:10px;font-weight:700;color:${c};background:${c}14;border:1px solid ${c}33;padding:4px 10px;border-radius:6px;margin-left:8px;white-space:nowrap;">Level ${depth + 1}</span>`;
  };
  const asIsCollapseToggle = (fn) => {
    const kids = asIsKidsOf[fn.id] || [];
    if (!kids.length) return '';
    const isCollapsed = asIsCollapsedSet.has(fn.id);
    return `<button onclick="app.toggleAsIsCardCollapse('${escHtml(fn.id)}')" title="${isCollapsed ? 'Expand' : 'Collapse'} ${kids.length} sub-function${kids.length > 1 ? 's' : ''}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} sub-functions" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#2E642C;background:rgba(46,100,44,0.08);border:1px solid rgba(46,100,44,0.18);padding:4px 10px;border-radius:6px;margin-left:8px;">${isCollapsed ? '▸' : '▾'} ${kids.length}</button>`;
  };

  // NEW FUNCTION CARDS (always shown at root level, depth 0)
  asIsHtml += state.asIsNewRows.map((row, idx) => {
    const mgr = parseInt(row.mgr) || 0;
    const emp = parseInt(row.emp) || 0;
    const mgrCost = parseMoney(row.mgrcost);
    const profCost = parseMoney(row.profcost);
    const totalCost = mgrCost + profCost;
    const totalHC = mgr + emp;
    const base = asIsParentBase(row.parentId || null);
    const mgrHcPct = base.hc > 0 ? ((mgr / base.hc) * 100).toFixed(1) + '%' : '-';
    const profHcPct = base.hc > 0 ? ((emp / base.hc) * 100).toFixed(1) + '%' : '-';
    const mgrCostPct = base.budget > 0 ? ((mgrCost / base.budget) * 100).toFixed(1) + '%' : '-';
    const profCostPct = base.budget > 0 ? ((profCost / base.budget) * 100).toFixed(1) + '%' : '-';
    return `<div style="${asIsCardStyle}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#2E642C;background:rgba(46,100,44,0.08);padding:4px 12px;border-radius:6px;">#${asIsFns.length + idx + 1} &mdash; New Function</div>
        <div class="flex items-center gap-2"><button onclick="app.saveAsIsNewRow('${escHtml(row.id)}')" class="zbod-btn-primary" style="padding:6px 16px;font-size:12px;">${ICONS.save} Save</button><button onclick="app.cancelAsIsNewRow('${escHtml(row.id)}')" class="zbod-btn-secondary" style="padding:6px 16px;font-size:12px;">${ICONS.x} Cancel</button></div>
      </div>
      <div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Function Title</span><input class="zbod-input w-full" style="padding:10px 12px;font-size:15px;font-weight:600;" value="${escHtml(row.name)}" onchange="app.updateAsIsNewRow('${escHtml(row.id)}','name',this.value)" placeholder="Enter function name"></div>
      ${renderParentDropdownNew(row.parentId || '', idx)}
      <div style="${asIsSectionTitle}">People Allocation</div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        ${renderAsIsInput('Managers', row.mgr, `app.updateAsIsNewRow('${escHtml(row.id)}','mgr',this.value);renderWorkspace()`, '0')}
        ${renderAsIsPct('HC Allocation %', mgrHcPct)}
        ${renderAsIsInput('Professionals', row.emp, `app.updateAsIsNewRow('${escHtml(row.id)}','emp',this.value);renderWorkspace()`, '0')}
        ${renderAsIsPct('HC Allocation %', profHcPct)}
      </div>
      <div style="${asIsSummaryBox}">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual HC Summary</span>
        <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalHC)} <span style="font-size:14px;font-weight:600;color:#6b7280;">people</span></span>
      </div>
      <div style="${asIsSectionTitle}margin-top:16px;">Cost Allocation</div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        ${renderAsIsMoney('Managers Cost (AZN)', row.mgrcost || '', `app.updateAsIsNewRow('${escHtml(row.id)}','mgrcost',this.value);renderWorkspace()`, '0')}
        ${renderAsIsPct('Cost Allocation %', mgrCostPct)}
        ${renderAsIsMoney('Professionals Cost (AZN)', row.profcost || '', `app.updateAsIsNewRow('${escHtml(row.id)}','profcost',this.value);renderWorkspace()`, '0')}
        ${renderAsIsPct('Cost Allocation %', profCostPct)}
      </div>
      <div style="${asIsSummaryBox}">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual Cost Summary</span>
        <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalCost)} <span style="font-size:14px;font-weight:600;color:#6b7280;">AZN</span></span>
      </div>
    </div>`;
  }).join('');

  if (asIsFns.length === 0 && state.asIsNewRows.length === 0) {
    asIsHtml += `<div class="text-center py-8"><div style="margin-bottom:12px;">${ICONS.fileText}</div><p style="color:#6b7280;font-size:14px;">No current functions added yet</p><p style="color:#6b7280;font-size:12px;">Add your current organizational functions here.</p></div>`;
  } else {
    asIsHtml += asIsOrderedVisible.map(({ fn, depth, num }) => {
      const indentStyle = depth > 0 ? `margin-left:${Math.min(depth, 4) * 40}px;border-left:5px solid ${asIsLevelColor(depth)}55;` : '';
      const cardStyle = asIsCardStyle + indentStyle;
      const parentId = (fn.parent_id && asIsFnIds.has(fn.parent_id)) ? fn.parent_id : null;
      const base = asIsParentBase(parentId);

      const edit = state.asIsEditing[fn.id];
      if (edit) {
        const mgr = parseInt(edit.mgr) || 0;
        const emp = parseInt(edit.emp) || 0;
        const mgrCost = parseMoney(edit.mgrcost);
        const profCost = parseMoney(edit.profcost);
        const totalCost = mgrCost + profCost;
        const totalHC = mgr + emp;
        const editParentId = edit.parentId !== undefined ? edit.parentId : parentId;
        const editBase = asIsParentBase(editParentId);
        const mgrHcPct = editBase.hc > 0 ? ((mgr / editBase.hc) * 100).toFixed(1) + '%' : '-';
        const profHcPct = editBase.hc > 0 ? ((emp / editBase.hc) * 100).toFixed(1) + '%' : '-';
        const mgrCostPct = editBase.budget > 0 ? ((mgrCost / editBase.budget) * 100).toFixed(1) + '%' : '-';
        const profCostPct = editBase.budget > 0 ? ((profCost / editBase.budget) * 100).toFixed(1) + '%' : '-';
        return `<div style="${cardStyle}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <div style="display:flex;align-items:center;"><div style="font-size:12px;font-weight:700;color:#2E642C;background:rgba(46,100,44,0.08);padding:4px 12px;border-radius:6px;">#${num}</div>${asIsLevelBadge(depth)}${asIsCollapseToggle(fn)}</div>
            <div class="flex items-center gap-2"><button onclick="app.saveAsIsEdit('${escHtml(fn.id)}')" class="zbod-btn-primary" style="padding:6px 16px;font-size:12px;">${ICONS.save} Save</button><button onclick="app.cancelAsIsEdit('${escHtml(fn.id)}')" class="zbod-btn-secondary" style="padding:6px 16px;font-size:12px;">${ICONS.x} Cancel</button></div>
          </div>
          <div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Function Title</span><input class="zbod-input w-full" style="padding:10px 12px;font-size:15px;font-weight:600;" value="${escHtml(edit.name)}" onchange="app.updateAsIsEdit('${escHtml(fn.id)}','name',this.value)" placeholder="Enter function name"></div>
          ${renderParentDropdown(fn, editParentId, `app.updateAsIsEdit('${escHtml(fn.id)}','parentId',this.value);renderWorkspace()`)}
          <div style="${asIsSectionTitle}">People Allocation</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            ${renderAsIsInput('Managers', edit.mgr, `app.updateAsIsEdit('${escHtml(fn.id)}','mgr',this.value);renderWorkspace()`, '0')}
            ${renderAsIsPct('HC Allocation %', mgrHcPct)}
            ${renderAsIsInput('Professionals', edit.emp, `app.updateAsIsEdit('${escHtml(fn.id)}','emp',this.value);renderWorkspace()`, '0')}
            ${renderAsIsPct('HC Allocation %', profHcPct)}
          </div>
          <div style="${asIsSummaryBox}">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual HC Summary</span>
            <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalHC)} <span style="font-size:14px;font-weight:600;color:#6b7280;">people</span></span>
          </div>
          <div style="${asIsSectionTitle}margin-top:16px;">Cost Allocation</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            ${renderAsIsMoney('Managers Cost (AZN)', edit.mgrcost || '', `app.updateAsIsEdit('${escHtml(fn.id)}','mgrcost',this.value);renderWorkspace()`, '0')}
            ${renderAsIsPct('Cost Allocation %', mgrCostPct)}
            ${renderAsIsMoney('Professionals Cost (AZN)', edit.profcost || '', `app.updateAsIsEdit('${escHtml(fn.id)}','profcost',this.value);renderWorkspace()`, '0')}
            ${renderAsIsPct('Cost Allocation %', profCostPct)}
          </div>
          <div style="${asIsSummaryBox}">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual Cost Summary</span>
            <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalCost)} <span style="font-size:14px;font-weight:600;color:#6b7280;">AZN</span></span>
          </div>
        </div>`;
      }
      const mgr = fn.manager_count || 0;
      const emp = fn.current_employee_count || 0;
      const mgrCost = fn.managers_cost || 0;
      const profCost = fn.professionals_cost || 0;
      const totalCost = mgrCost + profCost;
      const totalHC = mgr + emp;
      const mgrHcPct = base.hc > 0 ? ((mgr / base.hc) * 100).toFixed(1) + '%' : '-';
      const profHcPct = base.hc > 0 ? ((emp / base.hc) * 100).toFixed(1) + '%' : '-';
      const mgrCostPct = base.budget > 0 ? ((mgrCost / base.budget) * 100).toFixed(1) + '%' : '-';
      const profCostPct = base.budget > 0 ? ((profCost / base.budget) * 100).toFixed(1) + '%' : '-';
      const parentLabel = parentId ? (asIsFns.find(f => f.id === parentId)?.function_name || 'Parent') : (div.structure_name || 'Main Division / Structure');
      if (state.asIsSaved || readOnly) {
        // READONLY mode (also forced for CxO viewers regardless of asIsSaved)
        return `<div style="${cardStyle}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <div style="display:flex;align-items:center;"><div style="font-size:12px;font-weight:700;color:#2E642C;background:rgba(46,100,44,0.08);padding:4px 12px;border-radius:6px;">#${num}</div>${asIsLevelBadge(depth)}${asIsCollapseToggle(fn)}</div>
            ${readOnly ? '' : `<button onclick="app.confirmDeleteAsIs('${escHtml(fn.id)}')" aria-label="Delete function" style="color:#6b7280;padding:6px;">${ICONS.trash}</button>`}
          </div>
          <div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Function Title</span><p style="font-size:16px;font-weight:700;color:#111827;padding:10px 0;">${escHtml(fn.function_name)}</p></div>
          <div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Parent Function</span><p style="font-size:14px;font-weight:600;color:#374151;padding:6px 0;">${escHtml(parentLabel)}</p></div>
          <div style="${asIsSectionTitle}">People Allocation</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><span style="${asIsInputLabel}">Managers</span><span style="font-size:15px;font-weight:700;color:#111827;">${formatNumber(mgr)}</span></div>
            <div><span style="${asIsInputLabel}">HC Allocation %</span><span style="${asIsAllocStyle}">${mgrHcPct}</span></div>
            <div><span style="${asIsInputLabel}">Professionals</span><span style="font-size:15px;font-weight:700;color:#111827;">${formatNumber(emp)}</span></div>
            <div><span style="${asIsInputLabel}">HC Allocation %</span><span style="${asIsAllocStyle}">${profHcPct}</span></div>
          </div>
          <div style="${asIsSummaryBox}">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual HC Summary</span>
            <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalHC)} <span style="font-size:14px;font-weight:600;color:#6b7280;">people</span></span>
          </div>
          <div style="${asIsSectionTitle}margin-top:16px;">Cost Allocation</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><span style="${asIsInputLabel}">Managers Cost</span><span style="font-size:15px;font-weight:700;color:#111827;">${formatNumber(mgrCost)} <span style="font-size:12px;color:#6b7280;">AZN</span></span></div>
            <div><span style="${asIsInputLabel}">Cost Allocation %</span><span style="${asIsAllocStyle}">${mgrCostPct}</span></div>
            <div><span style="${asIsInputLabel}">Professionals Cost</span><span style="font-size:15px;font-weight:700;color:#111827;">${formatNumber(profCost)} <span style="font-size:12px;color:#6b7280;">AZN</span></span></div>
            <div><span style="${asIsInputLabel}">Cost Allocation %</span><span style="${asIsAllocStyle}">${profCostPct}</span></div>
          </div>
          <div style="${asIsSummaryBox}">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual Cost Summary</span>
            <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalCost)} <span style="font-size:14px;font-weight:600;color:#6b7280;">AZN</span></span>
          </div>
        </div>`;
      }
      // EDITABLE mode (inline inputs, no per-card buttons)
      return `<div style="${cardStyle}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div style="display:flex;align-items:center;"><div style="font-size:12px;font-weight:700;color:#2E642C;background:rgba(46,100,44,0.08);padding:4px 12px;border-radius:6px;">#${num}</div>${asIsLevelBadge(depth)}${asIsCollapseToggle(fn)}</div>
          <button onclick="app.confirmDeleteAsIs('${escHtml(fn.id)}')" aria-label="Delete function" style="color:#6b7280;padding:6px;">${ICONS.trash}</button>
        </div>
        <div style="margin-bottom:20px;"><span style="${asIsInputLabel}">Function Title</span><input class="zbod-input w-full" style="padding:10px 12px;font-size:15px;font-weight:600;" value="${escHtml(fn.function_name)}" onchange="app.updateAsIsInline('${escHtml(fn.id)}','function_name',this.value)" placeholder="Enter function name"></div>
        ${renderParentDropdown(fn, parentId, `app.updateAsIsInline('${escHtml(fn.id)}','parent_id',this.value);renderWorkspace()`)}
        <div style="${asIsSectionTitle}">People Allocation</div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          ${renderAsIsInput('Managers', fn.manager_count || '', `app.updateAsIsInline('${escHtml(fn.id)}','manager_count',this.value);renderWorkspace()`, '0')}
          ${renderAsIsPct('HC Allocation %', mgrHcPct)}
          ${renderAsIsInput('Professionals', fn.current_employee_count || '', `app.updateAsIsInline('${escHtml(fn.id)}','current_employee_count',this.value);renderWorkspace()`, '0')}
          ${renderAsIsPct('HC Allocation %', profHcPct)}
        </div>
        <div style="${asIsSummaryBox}">
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual HC Summary</span>
          <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalHC)} <span style="font-size:14px;font-weight:600;color:#6b7280;">people</span></span>
        </div>
        <div style="${asIsSectionTitle}margin-top:16px;">Cost Allocation</div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          ${renderAsIsMoney('Managers Cost (AZN)', fn.managers_cost || '', `app.updateAsIsInline('${escHtml(fn.id)}','managers_cost',this.value);renderWorkspace()`, '0')}
          ${renderAsIsPct('Cost Allocation %', mgrCostPct)}
          ${renderAsIsMoney('Professionals Cost (AZN)', fn.professionals_cost || '', `app.updateAsIsInline('${escHtml(fn.id)}','professionals_cost',this.value);renderWorkspace()`, '0')}
          ${renderAsIsPct('Cost Allocation %', profCostPct)}
        </div>
        <div style="${asIsSummaryBox}">
          <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">Actual Cost Summary</span>
          <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${formatNumber(totalCost)} <span style="font-size:14px;font-weight:600;color:#6b7280;">AZN</span></span>
        </div>
      </div>`;
    }).join('');
  }

  let workshopHtml = '';
  if (draftWs.length > 0) {
    workshopHtml = `<p style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#92400e;margin-bottom:8px;">${ICONS.alertTriangle} Draft Workshops &mdash; Click to Continue</p><div class="space-y-3">`;
    draftWs.forEach(w => {
      const dispPhase = w.phase === 3 ? 2 : 1; // stored 1/2 (legacy Business Impact) = Phase 1; stored 3 = Phase 2
      const color = dispPhase === 1 ? 'rgba(146,64,14,0.1);color:#92400e' : 'rgba(46,100,44,0.1);color:#2E642C';
      // The trash button is always visible: on a tablet there is no right-click for the context menu.
      const delBtn = readOnly ? '' : `<button class="ws-del-btn" onclick="event.stopPropagation();app.confirmDeleteWorkshop('${escHtml(w.id)}')" title="Delete workshop" aria-label="Delete workshop">${ICONS.trash}</button>`;
      workshopHtml += `<div class="zbod-card p-4 flex items-center justify-between" style="cursor:pointer;" onclick="app.resumeWorkshop('${escHtml(w.id)}',${w.phase})" oncontextmenu="app.openWorkshopContextMenu(event,'${escHtml(w.id)}')"><div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:${color};">${dispPhase}</div><div><p style="font-size:14px;font-weight:600;color:#111827;">Workshop in Progress</p><p style="font-size:12px;color:#6b7280;">Phase ${dispPhase} of 2</p></div></div><div class="flex items-center">${delBtn}${ICONS.chevronRight}</div></div>`;
    });
    workshopHtml += '</div>';
  } else {
    workshopHtml = `<div class="text-center py-8"><p style="color:#6b7280;font-size:14px;">No active workshops</p><p style="color:#6b7280;font-size:12px;">Click "New Workshop" to start.</p></div>`;
  }

  let historyHtml = '';
  if (completedWs.length === 0) {
    historyHtml = `<div class="text-center py-8"><p style="color:#6b7280;font-size:14px;">No completed workshops yet</p></div>`;
  } else {
    // Same delete affordance as the draft workshops (right-click → Delete Workshop), plus a visible
    // trash button. The row's main button and the trash button are siblings: nesting a button in a
    // button isn't valid HTML.
    historyHtml = `<div class="space-y-3" style="max-height:256px;overflow-y:auto;">${completedWs.map(w => `<div class="zbod-card zbod-card-hover flex items-center" style="width:100%;" oncontextmenu="app.openWorkshopContextMenu(event,'${escHtml(w.id)}')">
      <button onclick="app.goToHistory()" class="flex items-center gap-3 text-left flex-1 p-3" style="min-width:0;">${ICONS.calendar}<div class="flex-1"><p style="font-size:14px;color:#111827;">${new Date(w.created_at).toLocaleDateString()} ${new Date(w.created_at).toLocaleTimeString()}</p></div>${ICONS.chevronRight}</button>
      ${readOnly ? '' : `<button class="ws-del-btn" onclick="app.confirmDeleteWorkshop('${escHtml(w.id)}')" title="Delete workshop" aria-label="Delete workshop">${ICONS.trash}</button>`}
    </div>`).join('')}</div>`;
  }

  const defaultMetrics = [
    { id: 'm1', label: 'Management Layers', value: '', type: 'number' },
    { id: 'm2', label: 'Average Span of Control', value: '', type: 'number' },
    { id: 'm3', label: 'High Grade Employees', value: '', type: 'number' },
    { id: 'm4', label: 'Low Grade Employees', value: '', type: 'number' },
    { id: 'm5', label: 'Multi-layered Hierarchy', value: '', type: 'select', options: ['Exist', 'Do not exist', '-'] },
    { id: 'm6', label: 'Decentralized and Centralized', value: '', type: 'select', options: ['Decentralized', 'Centralized', '-'] },
    { id: 'm7', label: 'Duplicated Functions', value: '', type: 'select', options: ['Exist', 'Do not exist', '-'] },
    { id: 'm8', label: 'Shadow Support Functions', value: '', type: 'select', options: ['Exist', 'Do not exist', 'Other'], customValue: '' },
    { id: 'm9', label: 'Complex Manual Based Process and Job', value: '', type: 'text' },
    { id: 'm10', label: 'Shared Services Opportunities', value: '', type: 'text' },
    { id: 'm11', label: 'Automation & AI Opportunities (RPA)', value: '', type: 'text' },
    { id: 'm12', label: 'Outsourcing Opportunity', value: '', type: 'text' },
    { id: 'm15', label: 'Cost Median for Managers', value: '', type: 'number' },
    { id: 'm16', label: 'Cost Median for Professionals', value: '', type: 'number' },
  ];
  const savedMetrics = getMetrics()[div.id] || defaultMetrics;
  savedMetrics.forEach((m, i) => { if (!m.type && defaultMetrics[i]) m.type = defaultMetrics[i].type; if (!m.type) m.type = 'text'; });
  // Labels live in the saved rows, so a renamed default would otherwise only reach empty divisions.
  savedMetrics.forEach(m => { const d = defaultMetrics.find(x => x.id === m.id); if (d) m.label = d.label; });
  // Backward compat: m8 was free-text; if saved value isn't a dropdown option, treat as "Other" + custom text
  const m8 = savedMetrics.find(m => m.id === 'm8');
  if (m8 && m8.type === 'select' && m8.value && !m8.options.includes(m8.value)) {
    m8.customValue = m8.value;
    m8.value = 'Other';
  }

  const draft = state.metricsDraft[div.id] || {};
  savedMetrics.forEach((m, idx) => { if (draft[idx] !== undefined) m.value = draft[idx]; });

  // Ensure m15/m16 exist in savedMetrics (backward compat for old saves without them)
  if (!savedMetrics.find(m => m.id === 'm15')) savedMetrics.push({...defaultMetrics.find(m => m.id === 'm15')});
  if (!savedMetrics.find(m => m.id === 'm16')) savedMetrics.push({...defaultMetrics.find(m => m.id === 'm16')});

  const metricIcons = {
    m1: { icon: ICONS.layers, cls: 'metric-badge' },
    m2: { icon: ICONS.users, cls: 'metric-badge' },
    m3: { icon: ICONS.user, cls: 'metric-badge-green' },
    m4: { icon: ICONS.user, cls: 'metric-badge-green' },
    m5: { icon: ICONS.gitCompare, cls: 'metric-badge' },
    m6: { icon: ICONS.building, cls: 'metric-badge-amber' },
    m7: { icon: ICONS.barChart, cls: 'metric-badge' },
    m8: { icon: ICONS.activity, cls: 'metric-badge-green' },
    m9: { icon: ICONS.fileText, cls: 'metric-badge' },
    m10: { icon: ICONS.users, cls: 'metric-badge-green' },
    m11: { icon: ICONS.userCog, cls: 'metric-badge' },
    m12: { icon: ICONS.dollar, cls: 'metric-badge-green' },
    m15: { icon: ICONS.dollar, cls: 'metric-badge-green' },
    m16: { icon: ICONS.dollar, cls: 'metric-badge-green' },
  };

  let metricsHtml = `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
  savedMetrics.forEach((m, idx) => {
    const mi = metricIcons[m.id] || { icon: ICONS.activity, cls: 'metric-badge' };
    let inputEl = '';
    let extraEl = '';
    const ro = (readOnly || state.metricsSaved) ? ' disabled' : '';
    if (m.type === 'select') {
      inputEl = `<select class="metric-input-field" onchange="app.updateMetric(${idx}, this.value)${m.id === 'm8' ? ';renderWorkspace()' : ''}"${ro}><option value="">Select...</option>${(m.options || []).map(opt => `<option value="${escHtml(opt)}" ${m.value === opt ? 'selected' : ''}>${escHtml(opt)}</option>`).join('')}</select>`;
      if (m.id === 'm8' && m.value === 'Other') {
        extraEl = `<input class="metric-input-field mt-2" value="${escHtml(m.customValue || '')}" oninput="app.updateMetricCustom(${idx}, this.value)" placeholder=""${ro}>`;
      }
    } else if (m.id === 'm15' || m.id === 'm16') {
      inputEl = `<input ${moneyInputAttrs()} class="metric-input-field" value="${escHtml(formatMoneyValue(m.value))}" oninput="app.updateMetric(${idx}, this.value === '' ? '' : String(parseMoney(this.value)))" placeholder="0"${ro}>`;
    } else if (m.type === 'number') {
      inputEl = `<input type="number" class="metric-input-field" value="${escHtml(m.value)}" oninput="app.updateMetric(${idx}, this.value)" onwheel="return false;" placeholder="0" min="0"${ro}>`;
    } else {
      inputEl = `<input class="metric-input-field" value="${escHtml(m.value)}" oninput="app.updateMetric(${idx}, this.value)" placeholder=""${ro}>`;
    }
    metricsHtml += `<div class="metric-card">
      <div class="metric-card-header">
        <div class="${mi.cls}">${mi.icon}</div>
        <span class="metric-label">${escHtml(m.label)}</span>
      </div>
      ${inputEl}${extraEl}
    </div>`;
  });
  metricsHtml += `</div>${readOnly ? '' : `<div class="mt-4">${state.metricsSaved
    ? `<button onclick="app.editMetricsSection()" class="zbod-btn-secondary" style="padding:8px 20px;font-size:13px;">${ICONS.edit} Edit</button>`
    : `<button onclick="app.saveMetrics()" class="zbod-btn-primary" style="padding:8px 20px;font-size:13px;">${ICONS.save} Save Metrics</button>`}</div>`}`;

  document.getElementById('workspace-content').innerHTML = `
    <div><h2 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:30px;color:#111827;margin-bottom:8px;">${workspaceTitle}</h2><p style="color:#6b7280;">${manageText}</p></div>
    <div class="zbod-card p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.target}</div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${dataBoxTitle}</h3></div>
        ${readOnly ? '' : (state.editingDivision
          ? `<div class="flex items-center gap-2"><button onclick="app.saveDivisionData()" class="zbod-btn-primary" style="padding:8px 16px;font-size:13px;">${ICONS.save} Save</button><button onclick="app.cancelDivisionEdit()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.x} Cancel</button></div>`
          : `<button onclick="app.editDivisionData()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.edit} Edit</button>`)}
      </div>
      ${divDataHtml}
    </div>
    <div class="zbod-card p-6">
      <div class="flex items-center justify-between mb-4 card-head">
        <div class="flex items-center gap-3 card-head__title"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.fileText}</div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">Current Functions (AS-IS Baseline)</h3>${renderFieldHelp('asis-baseline-help', AS_IS_BASELINE_HELP_QA)}</div>
        <div class="flex items-center gap-3 card-head__tools"><span class="card-head__stats" style="font-size:12px;color:#6b7280;">${asIsFns.length} functions | Total HC: ${formatNumber(totalAsIsHC)} | Budget: ${formatNumber(totalAsIsBudget)} AZN</span>${readOnly ? '' : `${state.asIsSaved ? `<button onclick="app.editAsIsSection()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.edit} Edit</button>` : ''}${asIsFns.length > 0 ? `<button onclick="app.confirmDeleteAllAsIs()" class="zbod-btn-danger" style="padding:8px 16px;font-size:13px;">${ICONS.trash} Delete All</button>` : ''}<button onclick="app.autofillAsIsFromExcel()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.upload} Autofill</button><button onclick="app.addAsIsRow()" class="zbod-btn-primary" style="padding:8px 16px;font-size:13px;">${ICONS.plus} Add Function</button>`}</div>
      </div>
      ${asIsHtml}
      ${!readOnly && !state.asIsSaved && (asIsFns.length > 0 || state.asIsNewRows.length > 0) ? `<div class="mt-4"><button onclick="app.saveAllAsIs()" class="zbod-btn-primary" style="padding:10px 24px;font-size:14px;">${ICONS.save} Save All Functions</button></div>` : ''}
    </div>
    <div class="zbod-card p-6">
      <div class="flex items-center gap-3 mb-4"><img src="logo.png" alt="Azerconnect" style="height:28px;width:auto;object-fit:contain;"><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#0F3C76;">AS-IS Metrics</h3></div>
      ${metricsHtml}
    </div>
    ${renderAAA(div)}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="zbod-card p-6">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3"><div style="width:40px;height:40px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.userCheck}</div><div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">Workshop</h3><p style="font-size:12px;color:#6b7280;">TO-BE Organizational Design</p></div></div>
          <button onclick="app.showWorkshopDialog()" class="zbod-btn-primary" style="padding:8px 16px;font-size:13px;">${ICONS.plus} New Workshop</button>
        </div>
        ${workshopHtml}
      </div>
      <div class="zbod-card p-6">
        <div class="flex items-center gap-3 mb-6"><div style="width:40px;height:40px;border-radius:8px;background:rgba(15,60,118,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.history}</div><div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">Previous Workshops</h3><p style="font-size:12px;color:#6b7280;">${completedWs.length} completed workshops</p></div></div>
        ${historyHtml}
      </div>
    </div>`;
}


// ═══════════════════════════════════════════
// RENDER: WORKSHOP PHASE 1
// ═══════════════════════════════════════════
function renderPhase1() {
  const ws = getWs().find(w => w.id === state.selectedWorkshopId);
  if (!ws) return;
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) return;
  // Every function card (and its help icon) is about to be destroyed and rebuilt from scratch —
  // close any open help popover now, before its anchor becomes a detached, stale-positioned node.
  closeAllFieldHelpPopovers();
  const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);

  document.getElementById('phase1-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-7xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.confirmQuitPhase()">${ICONS.arrowLeft}</button>
      <div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.target}</div><h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${escHtml(div.structure_name)}</h1></div>
    </div>
    <div class="flex items-center gap-3"><span style="font-size:13px;color:#6b7280;">Phase 1 of 2</span><button onclick="app.confirmQuitPhase()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.x} Cancel</button></div>`;

  const isFnComplete = (f) => {
    return f.proposed_function_name && f.career_level && f.can_be_eliminated && f.can_be_automated && f.can_be_outsourced
      && f.question1_score && f.question2_score;
  };

  // Borderless canvas: the dotted chart surface runs edge to edge (no card / inner frame); the
  // title, targets and buttons float on top of it, and Save / Next sit in a bar below.
  const doneCount = fns.filter(isFnComplete).length;
  let html = `<div class="p1-canvas${state.ocFullscreen ? ' oc-fullscreen' : ''}" id="p1-orgchart-card">
    <div class="p1-ov">
      <div class="p1-ov__title">
        <h2>Function Identification &amp; Business Impact</h2>
        <p>Target HC <strong>${formatNumber(div.headcount_target || 0)}</strong> &middot; Budget <strong>${formatNumber(div.budget_target || 0)} AZN</strong> &middot; ${doneCount} of ${fns.length} completed</p>
      </div>
      <div class="p1-ov__actions">
        <button class="oc-fs-toggle" id="oc-fs-toggle-btn" onclick="app.toggleOrgFullscreen()" title="${state.ocFullscreen ? 'Exit full screen' : 'Expand to full screen'}">${state.ocFullscreen ? `${ICONS.minimize} Exit Full Screen` : `${ICONS.maximize} Full Screen`}</button>
      </div>
      <div class="p1-hl" id="p1-hl">
        <span class="p1-hl__lbl">Highlight:</span>
        ${[['invest', 'Invest', '#16A34A'], ['keep', 'Keep', '#EA580C'], ['optimize', 'Optimize', '#0891B2'], ['eliminate', 'Eliminate', '#DC2626']]
          .map(([k, l, c]) => `<button class="oc-hl-chip" data-k="${k}" onclick="app.setOrgHighlight('${k}')">${l}</button>`).join('')}
        <button class="oc-hl-chip oc-hl-chip--clear hidden" id="p1-hl-clear" onclick="app.setOrgHighlight(null)">Clear</button>
      </div>
    </div>
    <div class="org-chart-container" style="padding:0;height:100%;">
      ${renderOrgChart(fns, div.structure_name, div, true)}
    </div>
    <div class="p1-hint" id="p1-hint">${ICONS.move} Drag to pan &middot; scroll to zoom</div>
  </div>
  <div class="p1-foot">
    <button onclick="app.savePhase1()" class="zbod-btn-secondary">${ICONS.save} Save</button>
    <button onclick="app.goToPhase3()" class="zbod-btn-primary">Next: HC &amp; Cost ${ICONS.arrowRight}</button>
  </div>`;

  // A re-render (after every add/edit/remove) must not throw away where the user was looking:
  // carry the chart's pan position and zoom over to the rebuilt canvas. (A fresh page open plays
  // the entrance intro instead, which re-centres on the root after this.)
  const prevVp = document.querySelector('#phase1-content .oc-viewport');
  const prevScroll = prevVp ? { left: prevVp.scrollLeft, top: prevVp.scrollTop } : null;

  document.getElementById('phase1-content').innerHTML = html;

  // renderOrgChart already inlines the current zoom (canvas transform + sizer), so only the pan
  // position needs carrying over.
  if (prevScroll) {
    const vp = document.querySelector('#phase1-content .oc-viewport');
    if (vp) { vp.scrollLeft = prevScroll.left; vp.scrollTop = prevScroll.top; }
  }
  // The "drag to pan" hint is a one-time nudge: gone once the user has moved the chart.
  if (window._ocHintSeen) { const h = document.getElementById('p1-hint'); if (h) h.remove(); }
  ocApplyHighlight();
}

// ═══════════════════════════════════════════
// ORG CHART RENDERER
// ═══════════════════════════════════════════
// Dim every box whose decision isn't the highlighted one (the "Highlight:" chips). Re-applied after
// each render because the chart DOM is rebuilt.
function ocApplyHighlight() {
  const k = window._ocHl || null;
  document.querySelectorAll('.oc-nc2[data-oc-dec], .oc-deck[data-oc-dec]').forEach(el => {
    el.classList.toggle('oc-dim', !!k && el.dataset.ocDec !== k);
  });
  document.querySelectorAll('.oc-hl-chip[data-k]').forEach(b => {
    const on = b.dataset.k === k;
    b.classList.toggle('is-on', on);
    b.classList.toggle('is-off', !!k && !on);
  });
  const clr = document.getElementById('p1-hl-clear');
  if (clr) clr.classList.toggle('hidden', !k);
}

// ── Org chart zoom helpers ────────────────────────────────────────────────
// The TO-BE chart keeps a "sizer" element around its canvas at the SCALED size (a CSS transform
// doesn't change layout size), so scrolling and centring match what is drawn. The AS-IS chart has
// no sizer, so everything here also works on a bare canvas.
function ocApplyZoom(canvas, s) {
  orgZoomScale = s;
  canvas.style.transform = `scale(${s})`;
  const sz = canvas.parentElement;
  if (sz && sz.classList.contains('oc-sizer')) {
    sz.style.width = Math.round((+canvas.dataset.w) * s) + 'px';
    sz.style.height = Math.round((+canvas.dataset.h) * s) + 'px';
  }
}
// Scale the whole chart to fill the viewport (up or down, capped) and centre it.
function ocFit(canvas, max = 1.5, min = 0.3) {
  const vp = canvas && canvas.closest('.oc-viewport');
  if (!vp) return;
  const cs = getComputedStyle(vp);
  const availW = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = vp.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const W = +canvas.dataset.w, H = +canvas.dataset.h;
  if (!(availW > 0 && availH > 0 && W > 0 && H > 0)) return;
  ocApplyZoom(canvas, Math.max(min, Math.min(max, availW / W, availH / H)));
  vp.scrollLeft = Math.max(0, (vp.scrollWidth - vp.clientWidth) / 2);
  vp.scrollTop = 0;
}

function renderOrgChart(fns, workplaceName, divData, editable = false) {
  // In read-only contexts (Review, History), an empty chart is just a placeholder message. In
  // editable Phase 1, the root (division) card must still render even with zero functions yet —
  // its "+" button is the only way to create the very first one.
  if (!editable && (!fns || fns.length === 0)) {
    return `<div class="oc-viewport"><p style="color:#9ca3af;font-size:13px;text-align:center;padding:40px 0;">Add functions to see org chart</p></div>`;
  }
  fns = fns || [];

  // ── Layout constants ──────────────────────────────────────────────────────
  // "Soft tinted" design: larger, roomier boxes. The root is wider/shorter than a function box.
  const NW  = 200;   // function box width
  const NH  = 124;   // function box height
  const RW  = 232;   // root box width
  const RH  = 108;   // root box height
  const HG  = 30;    // horizontal gap between sibling subtree bounding boxes
  const VG  = 68;    // vertical gap between a box's bottom and its children's top
  const PAD = 32;    // canvas padding on all sides
  const baseW = id => (id === 'workplace' ? RW : NW);

  // ── Build parent map (validated: only ids that exist in fns are parents) ─
  const fnIds = new Set(fns.map(f => f.id));
  const parentMap = {};          // parentId -> child[]
  const childOf   = {};          // childId  -> parentId

  // Pre-populate with all known ids so children lookup never returns undefined
  fnIds.forEach(id => { parentMap[id] = []; });
  parentMap['workplace'] = [];

  fns.forEach(f => {
    const pid = (f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'workplace';
    parentMap[pid].push(f);
    childOf[f.id] = pid;
  });

  const collapsed = window.orgCollapsedNodes || new Set();
  const countDesc = id => (parentMap[id] || []).reduce((s, c) => s + 1 + countDesc(c.id), 0);

  // ── Subtree width calculator (memoised) ──────────────────────────────────
  const _swCache = {};
  function subtreeW(nodeId) {
    if (_swCache[nodeId] !== undefined) return _swCache[nodeId];
    const base = baseW(nodeId);
    if (collapsed.has(nodeId)) return (_swCache[nodeId] = base);
    const children = parentMap[nodeId] || [];
    if (children.length === 0) return (_swCache[nodeId] = base);
    const total = children.reduce((s, c) => s + subtreeW(c.id), 0);
    return (_swCache[nodeId] = Math.max(base, total + HG * (children.length - 1)));
  }

  // ── Tree placement (DFS, accumulates nodes[] and edges[]) ────────────────
  // depth drives the entrance-animation stagger; from/to tag each connector with the parent it
  // leaves / the child it reaches, for the hover "reporting line" highlight.
  const nodes = [];   // { id, x, y, w, isRoot, cardH, depth }
  const edges = [];   // { x1, y1, x2, y2, depth, from, to }

  function placeNode(nodeId, leftX, topY, isRoot, depth = 0) {
    const sw     = subtreeW(nodeId);
    const w      = baseW(nodeId);
    const centerX = leftX + sw / 2;
    const cardH   = isRoot ? RH : NH;

    nodes.push({ id: nodeId, x: centerX - w / 2, y: topY, w, isRoot, cardH, depth });

    if (collapsed.has(nodeId)) return;
    const children = parentMap[nodeId] || [];
    if (children.length === 0) return;

    const parentBottomY = topY + cardH;
    const childTopY     = parentBottomY + VG;

    let cursor = leftX;
    children.forEach(child => {
      const csw = subtreeW(child.id);
      const childCenter = cursor + csw / 2;
      edges.push({ x1: centerX, y1: parentBottomY, x2: childCenter, y2: childTopY, depth, from: nodeId, to: child.id });
      placeNode(child.id, cursor, childTopY, false, depth + 1);
      cursor += csw + HG;
    });
  }

  placeNode('workplace', PAD, PAD, true);

  // ── Canvas size ───────────────────────────────────────────────────────────
  const maxRight  = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0) + PAD;
  const maxBottom = nodes.reduce((m, n) => Math.max(m, n.y + n.cardH), 0) + PAD + 14;

  // ── Entrance animation: play it once per chart view, not on every re-render ───────────
  // renderOrgChart re-runs after every add/edit/collapse; replaying the cascade each time would
  // be noise. showPage() clears window._ocIntroKey, so the cascade plays when a page (re)opens
  // and later re-renders of the same chart skip it.
  const introKey = String((divData && divData.id) || workplaceName || '');
  const playIntro = window._ocIntroKey !== introKey;
  window._ocIntroKey = introKey;
  // A freshly opened chart auto-fits: scaled (up or down) so the whole tree fills the space it
  // has, centred. Later re-renders keep whatever pan/zoom the user has set.
  if (playIntro) {
    const autoFit = () => {
      const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
      if (canvas && canvas.dataset.w) ocFit(canvas, 1.5, 0.5); // never below a readable size
    };
    requestAnimationFrame(autoFit);
    setTimeout(autoFit, 80);
  }
  const justAdded = window._ocJustAdded;
  window._ocJustAdded = null;
  const STEP = 110;
  const nodeDelay = (depth, i) => Math.min(depth, 6) * STEP + Math.min(i * 35, 280);

  // ── Status of a function box, from its three opportunity answers ─────────
  // Mirrors the Phase 1 filter banner: all "No" = pass (green), a mix = review (yellow), all
  // "Yes" = critical (red). Unanswered boxes stay neutral.
  const statusOf = f => {
    const a = [f.can_be_eliminated, f.can_be_automated, f.can_be_outsourced];
    if (!a.every(v => v === 'Yes' || v === 'No')) return '';
    const y = a.filter(v => v === 'Yes').length;
    return y === 3 ? 'critical' : y === 0 ? 'pass' : 'review';
  };
  const nodeMap = Object.fromEntries(fns.map(f => [f.id, f]));
  const EDGE = { pass: '#86d9a8', review: '#f2cf6b', critical: '#f5a3a3', '': '#cbd5e1' };
  // Two separate signals on a box: the opportunity FILTER (colour, glow and the pill: Passed /
  // Review / Critical) and the Q1 + Q2 DECISION, which hangs off the top edge as a violet tab —
  // a different colour family, shape and position, so the two can't be read as one thing.
  const PILL = { pass: 'Passed', review: 'Review', critical: 'Critical', '': 'Not answered' };
  const DECISION_LABEL = { INVEST: 'Invest', KEEP: 'Keep', OPTIMIZE: 'Optimize', ELIMINATE: 'Eliminate' };
  const dSvg = p => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const DECISION_ICON = {
    INVEST: dSvg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
    KEEP: dSvg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    OPTIMIZE: dSvg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
    ELIMINATE: dSvg('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  };

  // ── Connector curves: one smooth cubic per parent→child, tinted by the child's status ───
  // pathLength="1" normalises every path's length so the draw-in animation (stroke-dashoffset
  // 1 → 0) takes the same time regardless of how long the path actually is.
  const svgLines = edges.map(e => {
    const child = nodeMap[e.to];
    const col = EDGE[child ? statusOf(child) : ''];
    const x1 = Math.round(e.x1), y1 = Math.round(e.y1), x2 = Math.round(e.x2), y2 = Math.round(e.y2);
    const dy = Math.round((y2 - y1) * 0.55);
    const d = x1 === x2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
    return `<path class="oc-line" pathLength="1" style="--d:${Math.min(e.depth, 6) * STEP + 70}ms" data-from="${escHtml(e.from)}" data-to="${escHtml(e.to)}" d="${d}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/>`;
  }).join('');

  // ── Icons by structure type (inline SVG, same stroke style as ICONS) ──────
  const svgI = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const OC_ICON = {
    Department: svgI('<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>'),
    Unit: svgI('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    Division: svgI('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    Other: svgI('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>'),
  };
  const ROOT_ICON = svgI('<rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M6 15v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M12 9v2"/>');

  // ── Card rendering ────────────────────────────────────────────────────────
  // Root-level only: a child's proposed_hc/manager_count/professional_count is carved OUT of its
  // parent's allocation, not additive to it, so summing every function (parents + children) would
  // double-count everything below the top level.
  const rootFns = fns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
  let cardsHtml = '';
  const depthIdx = {};

  nodes.forEach(n => {
    const i = depthIdx[n.depth] = (depthIdx[n.depth] ?? -1) + 1;
    const pos = `position:absolute;left:${Math.round(n.x)}px;top:${Math.round(n.y)}px;width:${n.w}px;min-width:${n.w}px;max-width:${n.w}px;height:${n.cardH}px;--d:${nodeDelay(n.depth, i)}ms;`;
    if (n.isRoot) {
      const totalToBeHC    = rootFns.reduce((s, fn) => s + (fn.proposed_hc    || 0), 0);
      const totalToBeMgrs  = rootFns.reduce((s, fn) => s + (fn.manager_count  || 0), 0);
      const totalToBeProfs = rootFns.reduce((s, fn) => s + (fn.professional_count || 0), 0);
      const rootStyle = editable ? `${pos}cursor:default;` : pos;
      cardsHtml += `<div class="oc-root-card oc-rc2" data-oc-id="workplace" style="${rootStyle}">
        <div class="oc-rc2__top">
          <span class="oc-nc2__ico oc-nc2__ico--root">${ROOT_ICON}</span>
          <div class="oc-rc2__id"><div class="oc-rc2__name">${escHtml(workplaceName || 'Workplace')}</div><div class="oc-rc2__sub">Root / Workplace</div></div>
        </div>
        <div class="oc-rc2__stats">${divData && divData.headcount_target ? `Target HC ${formatNumber(divData.headcount_target)} &middot; ` : ''}Total HC ${formatNumber(totalToBeHC)}<br>Managers ${formatNumber(totalToBeMgrs)} &middot; Professionals ${formatNumber(totalToBeProfs)}</div>
        ${editable ? `<div class="oc-add-btn${fns.length === 0 ? ' oc-add-btn--invite' : ''}" onclick="event.stopPropagation();app.openAddFunctionModal('')" title="Add function">+</div>` : ''}
      </div>`;
    } else {
      const f = nodeMap[n.id];
      if (!f) return;
      const name        = f.proposed_function_name || 'Unnamed';
      const level       = f.career_level || '';
      const mgr         = f.manager_count || 0;
      const prof        = f.professional_count || 0;
      const stype       = f.function_structure_type || '';
      const hasChildren = (parentMap[f.id] || []).length > 0;
      const isCollapsed = hasChildren && collapsed.has(f.id);
      const nodeStyle = editable ? `${pos}cursor:pointer;` : pos;
      const flow = statusOf(f);
      // The filter result is also the tooltip, so the meaning isn't carried by colour alone.
      const flowTitle = flow ? computePhase1Alert(f.can_be_eliminated, f.can_be_automated, f.can_be_outsourced) : '';
      const decRaw = decisionOf(f);                       // 'INVEST' | 'KEEP' | 'OPTIMIZE' | 'ELIMINATE' | null
      const decKey = DECISION_LABEL[decRaw] ? decRaw.toLowerCase() : 'none';
      const decTab = DECISION_LABEL[decRaw]
        ? `<div class="oc-dtab">${DECISION_ICON[decRaw]}${DECISION_LABEL[decRaw]}</div>`
        : `<div class="oc-dtab oc-dtab--none">Not scored</div>`;
      const boxTitle = `${name}\nScreening: ${flowTitle || 'not answered'}\nDecision: ${DECISION_LABEL[decRaw] || 'not scored'}`;
      const sm = [stype, level].filter(Boolean).map(escHtml).join(' &middot; ');
      const tone = `oc-node--${flow || 'none'}`;
      // Collapsed = a small "deck" of cards behind this one, with a hidden-count badge.
      const deck = isCollapsed
        ? `<div class="oc-deck oc-deck--2 ${tone}" data-oc-dec="${decKey}" style="left:${Math.round(n.x) + 10}px;top:${Math.round(n.y) + 10}px;width:${n.w}px;height:${n.cardH}px;"></div><div class="oc-deck oc-deck--1 ${tone}" data-oc-dec="${decKey}" style="left:${Math.round(n.x) + 5}px;top:${Math.round(n.y) + 5}px;width:${n.w}px;height:${n.cardH}px;"></div>`
        : '';
      cardsHtml += deck + `<div class="oc-node-card oc-nc2 ${tone}${n.id === justAdded ? ' oc-node--new' : ''}${flow ? ` oc-node--flow oc-node--${flow}` : ''}" data-oc-id="${escHtml(f.id)}" data-oc-dec="${decKey}" data-oc-parent="${escHtml(childOf[f.id] || '')}" style="${nodeStyle}" title="${escHtml(boxTitle)}" ${editable ? `onclick="app.openEditFunctionModal('${escHtml(f.id)}')"` : ''}>
        ${decTab}
        <div class="oc-nc2__top"><span class="oc-nc2__ico">${OC_ICON[stype] || OC_ICON.Other}</span><span class="oc-nc2__pill">${PILL[flow]}</span></div>
        <div class="oc-node-name">${escHtml(name)}</div>
        <div class="oc-nc2__sub">${sm}</div>
        <div class="oc-nc2__cnt">Mgr ${formatNumber(mgr)} &middot; Prof ${formatNumber(prof)}</div>
        ${hasChildren ? `<div class="oc-toggle${isCollapsed ? ' oc-toggle--count' : ''}" title="${isCollapsed ? 'Show ' + countDesc(f.id) + ' hidden' : 'Hide sub-structure'}" onclick="event.stopPropagation();app.toggleOrgNode('${escHtml(f.id)}')">${isCollapsed ? '+' + countDesc(f.id) : '&minus;'}</div>` : ''}
        ${editable ? `<div class="oc-add-btn" onclick="event.stopPropagation();app.openAddFunctionModal('${escHtml(f.id)}')" title="Add child function">+</div>` : ''}
      </div>`;
    }
  });

  // ── Assemble viewport ─────────────────────────────────────────────────────
  // The viewport is a scrollable window. Inside it, a "sizer" is kept at the SCALED size of the
  // canvas (a CSS transform doesn't change layout size), so the scroll area matches what's drawn
  // and the chart can be centred with plain margin:auto at any zoom.
  const z = orgZoomScale;
  let html = `<div class="oc-wrap">`;
  html += `<div class="oc-viewport" onmousedown="app.startOrgPan(event)" onmousemove="app.doOrgPan(event)" onmouseup="app.endOrgPan(event)" onmouseleave="app.endOrgPan(event)"${editable ? ' onwheel="app.orgWheel(event)"' : ''}>`;
  html += `<div class="oc-sizer" style="width:${Math.round(maxRight * z)}px;height:${Math.round(maxBottom * z)}px;">`;
  html += `<div class="oc-canvas${playIntro ? ' oc-intro' : ''}" id="org-canvas" data-w="${maxRight}" data-h="${maxBottom}" style="position:relative;width:${maxRight}px;height:${maxBottom}px;transform:scale(${z});">`;
  html += `<svg style="position:absolute;top:0;left:0;width:${maxRight}px;height:${maxBottom}px;overflow:visible;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;
  html += cardsHtml;
  html += `</div>`;
  html += `</div>`;
  html += `</div>`;
  html += `<div class="oc-controls">`;
  html += `<button onclick="app.orgZoom(0.1)" aria-label="Zoom In" title="Zoom In">+</button>`;
  html += `<button onclick="app.orgZoom(-0.1)" aria-label="Zoom Out" title="Zoom Out">&minus;</button>`;
  html += `<button onclick="app.orgZoomFit()" aria-label="Fit to View" title="Fit to View" style="font-size:12px;">&#8634;</button>`;
  html += `<button onclick="app.orgZoomReset()" aria-label="Reset" title="Reset">1:1</button>`;
  html += `</div>`;
  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════
// FUNCTION EDITOR MODAL (Phase 1 org-chart add/edit)
// Same fields the old inline function-list form used to collect, now surfaced as a modal opened
// from the "+" / click affordances on renderOrgChart's nodes (editable=true). Fields are kept in
// state.fnModal.draft until "Done" — nothing is persisted to the function record until then.
// ═══════════════════════════════════════════
function renderFunctionModal() {
  const modal = document.getElementById('fn-editor-modal');
  const m = state.fnModal;
  closeAllFieldHelpPopovers();
  if (!m) { if (modal) modal.classList.add('hidden'); return; }

  const ws = getWs().find(w => w.id === state.selectedWorkshopId);
  const div = ws ? getDivs().find(x => x.id === ws.division_id) : null;
  const fns = ws ? getFns().filter(f => f.workshop_id === ws.id) : [];
  const d = m.draft;
  const isEdit = m.mode === 'edit';
  const label = 'font-size:13px;font-weight:600;color:#344054;margin-bottom:6px;display:block;';

  const parentName = (() => {
    if (!m.parentId) return div ? (div.structure_name || 'Workplace') : 'Workplace';
    const p = fns.find(x => x.id === m.parentId);
    return p ? (p.proposed_function_name || 'Unnamed') : (div ? (div.structure_name || 'Workplace') : 'Workplace');
  })();

  let alertHtml = '';
  if (d.can_be_eliminated && d.can_be_automated && d.can_be_outsourced) {
    const alertText = computePhase1Alert(d.can_be_eliminated, d.can_be_automated, d.can_be_outsourced);
    const yesCount = (d.can_be_eliminated === 'Yes' ? 1 : 0) + (d.can_be_automated === 'Yes' ? 1 : 0) + (d.can_be_outsourced === 'Yes' ? 1 : 0);
    if (alertText) {
      if (alertText.includes('PASSED')) {
        alertHtml = `<div class="p1-alert p1-alert--pass"><div class="p1-alert__icon">${ICONS.checkCircle}</div><span class="p1-alert__text">${alertText}</span></div>`;
      } else if (yesCount === 3) {
        alertHtml = `<div class="p1-alert p1-alert--critical"><div class="p1-alert__icon">${ICONS.xCircle}</div><span class="p1-alert__text">${alertText}</span></div>`;
      } else {
        alertHtml = `<div class="p1-alert p1-alert--warn"><div class="p1-alert__icon">${ICONS.alertTriangle}</div><span class="p1-alert__text">${alertText}</span></div>`;
      }
    }
  }

  const parentField = isEdit
    ? `<select class="zbod-select w-full" onchange="app.updateFnModalDraft('parent_id',this.value)">
        <option value="">${escHtml(div ? (div.structure_name || 'Workplace') : 'Workplace')}</option>
        ${fns.filter(x => x.id !== m.fnId && !getDescendantIds(m.fnId, fns).has(x.id) && x.proposed_function_name)
             .map(x => `<option value="${x.id}" ${m.parentId === x.id ? 'selected' : ''}>${escHtml(x.proposed_function_name)}</option>`).join('')}
       </select>`
    : `<input class="zbod-input w-full" value="${escHtml(parentName)}" readonly style="background:#f3f4f6;color:#6b7280;">`;

  const html = `
    <div class="flex items-center justify-between mb-6">
      <h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:20px;color:#111827;">${isEdit ? 'Edit Function' : 'Add Function'}</h3>
      <button onclick="app.closeFunctionModal()" style="color:#9ca3af;padding:4px;">${ICONS.x}</button>
    </div>
    <div class="space-y-4">
      <div><label style="${label}">Parent *</label>${parentField}</div>
      <div><label style="${label}">Function Name *</label><div class="zbod-field-help-wrap"><input class="zbod-input zbod-input--with-help w-full" value="${escHtml(d.proposed_function_name)}" onchange="app.updateFnModalDraft('proposed_function_name', this.value)" placeholder="" style="font-weight:600;">${renderFieldHelp('fn-modal-name', FUNCTION_NAME_HELP_QA)}</div></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><div class="flex items-center gap-2" style="margin-bottom:6px;"><label style="${label}margin:0;">Management Layer *</label>${renderFieldHelp('fn-modal-layer', LAYER_GUIDE_QA)}</div><select class="zbod-select w-full" onchange="app.updateFnModalDraft('career_level', this.value)"><option value="">Select layer</option><option value="Senior Management" ${d.career_level==='Senior Management'?'selected':''}>Senior Management</option><option value="Middle Management" ${d.career_level==='Middle Management'?'selected':''}>Middle Management</option><option value="Lower Management" ${d.career_level==='Lower Management'?'selected':''}>Lower Management</option></select></div>
        <div><label style="${label}">Structure Type *</label><select class="zbod-select w-full" onchange="app.updateFnModalDraft('function_structure_type', this.value)"><option value="">Select type</option><option value="Division" ${d.function_structure_type==='Division'?'selected':''}>Division</option><option value="Department" ${d.function_structure_type==='Department'?'selected':''}>Department</option><option value="Unit" ${d.function_structure_type==='Unit'?'selected':''}>Unit</option><option value="Other" ${d.function_structure_type==='Other'?'selected':''}>Other</option></select></div>
        <div><label style="${label}">Elimination Opportunity? *</label><select class="zbod-select w-full" onchange="app.updateFnModalDraft('can_be_eliminated', this.value)"><option value="">Select</option><option value="Yes" ${d.can_be_eliminated==='Yes'?'selected':''}>Yes</option><option value="No" ${d.can_be_eliminated==='No'?'selected':''}>No</option></select></div>
        <div><label style="${label}">Automation Opportunity? *</label><select class="zbod-select w-full" onchange="app.updateFnModalDraft('can_be_automated', this.value)"><option value="">Select</option><option value="Yes" ${d.can_be_automated==='Yes'?'selected':''}>Yes</option><option value="No" ${d.can_be_automated==='No'?'selected':''}>No</option></select></div>
        <div><label style="${label}">Outsourcing Opportunity? *</label><select class="zbod-select w-full" onchange="app.updateFnModalDraft('can_be_outsourced', this.value)"><option value="">Select</option><option value="Yes" ${d.can_be_outsourced==='Yes'?'selected':''}>Yes</option><option value="No" ${d.can_be_outsourced==='No'?'selected':''}>No</option></select></div>
        ${alertHtml}
      </div>
      <div><label style="${label}">Notes <span style="font-weight:500;text-transform:none;letter-spacing:0;color:#9ca3af;">(optional)</span></label><textarea class="zbod-textarea w-full" rows="3" onchange="app.updateFnModalDraft('strategic_justification', this.value)" placeholder="">${escHtml(d.strategic_justification)}</textarea></div>
      <div style="border-top:1px solid #eef0f3;margin-top:28px;padding-top:24px;">
        <div class="flex items-center gap-2" style="margin-bottom:22px;"><h4 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:15px;color:#0F3C76;margin:0;">Business impact</h4>${renderFieldHelp('fn-modal-score-guide', PHASE2_SCORE_GUIDE_QA)}</div>
        <div class="impact-block">
          ${IMPACT_QUESTIONS.map(q => `<div class="impact-q"><span class="impact-q-label">${q.label} *</span><p class="impact-q-text">${q.text}</p><div class="impact-chips" role="radiogroup" aria-label="${q.label}">${q.scale.map(([sc, t]) => `<button type="button" role="radio" aria-checked="${String(d[q.key]) === String(sc)}" class="impact-chip${String(d[q.key]) === String(sc) ? ' is-on' : ''}" onclick="app.updateFnModalDraft('${q.key}', '${sc}')">${t}</button>`).join('')}</div><div class="impact-desc${d[q.key] ? '' : ' is-empty'}">${d[q.key] ? escHtml((q.scale.find(([sc]) => String(sc) === String(d[q.key])) || [0, '', ''])[2]) : 'Pick a level to see what it means.'}</div></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="flex items-center justify-between" style="border-top:1px solid rgba(46,100,44,0.1);margin-top:32px;padding-top:22px;">
      ${isEdit ? `<button onclick="app.confirmRemoveFunctionFromModal('${escHtml(m.fnId)}')" class="zbod-btn-secondary" style="color:#991b1b;">${ICONS.trash} Remove</button>` : `<span></span>`}
      <div class="flex gap-3">
        <button onclick="app.closeFunctionModal()" class="zbod-btn-secondary" style="padding:10px 20px;">Cancel</button>
        <button onclick="app.saveFunctionModal()" class="zbod-btn-primary" style="padding:10px 24px;">${ICONS.check} Done</button>
      </div>
    </div>`;

  const body = document.getElementById('fn-editor-modal-body');
  const opening = modal.classList.contains('hidden');
  body.innerHTML = html;
  modal.classList.remove('hidden');
  // The scrollable card keeps whatever offset it had when the previous function was closed (or the
  // browser restores one), so a freshly opened editor could land on Q1/Q2 instead of the top. Only
  // on opening: re-renders while answering must keep the user's place.
  if (opening) {
    const scroller = body.parentElement;
    if (scroller) scroller.scrollTop = 0;
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = 0; });
  }
}

// ═══════════════════════════════════════════
// RENDER: WORKSHOP PHASE 3
// ═══════════════════════════════════════════
function renderPhase3() {
  const ws = getWs().find(w => w.id === state.selectedWorkshopId);
  if (!ws) return;
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) return;
  const isAsIs = ws.source === 'as_is_baseline';
  // First time this workshop is shown in this session: the percentages next to the figures are
  // brought in line with the figures (an old percentage can be left over from an earlier pool, e.g.
  // the one seeded at copy time before a parent changed). No figure is touched.
  if (isAsIs) {
    if (!state._wfFresh) state._wfFresh = {};
    if (!state._wfFresh[ws.id]) { state._wfFresh[ws.id] = true; wfMaterialize(ws.id); wfRefreshPercents(ws.id); }
  }
  // The Allocation Summary card (and its help icon) is about to be destroyed and rebuilt — close
  // any open popover now, before its anchor becomes a detached, stale-positioned node.
  closeAllFieldHelpPopovers();
  const fns = getFns().filter(f => f.workshop_id === ws.id).sort((a, b) => a.function_number - b.function_number);

  document.getElementById('phase3-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-7xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.backToPhase1()">${ICONS.arrowLeft}</button>
      <div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.target}</div><h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${escHtml(div.structure_name)}</h1></div>
    </div>
    <div class="flex items-center gap-3"><span style="font-size:13px;color:#6b7280;">Phase 2 of 2</span><button onclick="app.confirmQuitPhase()" class="zbod-btn-secondary" style="padding:8px 16px;font-size:13px;">${ICONS.x} Cancel</button></div>`;

  let html = `<div class="mb-6"><div class="flex items-center gap-2"><h2 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:24px;color:#111827;margin:0;">Headcount & People Cost Allocation</h2>${renderFieldHelp('p3-title-help', HC_COST_ALLOCATION_TITLE_HELP_QA)}</div><p style="font-size:14px;color:#6b7280;">Allocate headcount and budget targets.</p></div>`;

  // ── Build parent map ──────────────────────────────────────────────────────
  const fnIds = new Set(fns.map(f => f.id));
  const p3ParentMap = {};
  fns.forEach(f => {
    const pid = (f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'root';
    if (!p3ParentMap[pid]) p3ParentMap[pid] = [];
    p3ParentMap[pid].push(f);
  });
  const rootFns = p3ParentMap['root'] || [];

  // ── Single source of truth for this render pass: every proposed HC/Budget figure shown
  // below (per-function cards, per-parent mini-trackers, and the overall tracker) is derived
  // from this one cascade, computed fresh from current percentages (live-edit-aware via
  // state.phase3Values) — never from a possibly-stale persisted proposed_hc/proposed_budget.
  const cascadedAllocations = buildCascadedAllocations(fns, div.headcount_target || 0, div.budget_target || 0, state.phase3Values, isAsIs);

  // ── Division-level allocation tracker (root functions only) ───────────────
  if (fns.length > 0 && rootFns.length > 0) {
    // HR Division is itself just a parent — validated the exact same way as every other parent
    // in the tree (renderP3MiniTracker below): sum of its OWN direct children's cascaded values
    // against its OWN target. Never a recursive/global total — a nested parent's over-allocation
    // (e.g. CoE's children exceeding CoE's own share) must stay localized to that parent's own
    // section and must never inflate or invalidate an unrelated ancestor's summary.
    const totalProposedHC = rootFns.reduce((sum, f) => sum + ((cascadedAllocations[f.id] || {}).proposedHC || 0), 0);
    const totalProposedBudget = rootFns.reduce((sum, f) => sum + ((cascadedAllocations[f.id] || {}).proposedBudget || 0), 0);
    const hcTotal = pctOfTarget(totalProposedHC, div.headcount_target || 0);
    const costTotal = pctOfTarget(totalProposedBudget, div.budget_target || 0);
    const hcBarClass = hcTotal > 100 ? 'p3-tracker__bar-fill--over' : (hcTotal === 100 ? 'p3-tracker__bar-fill--full' : 'p3-tracker__bar-fill--ok');
    const costBarClass = costTotal > 100 ? 'p3-tracker__bar-fill--over' : (costTotal === 100 ? 'p3-tracker__bar-fill--full' : 'p3-tracker__bar-fill--ok');
    const hcUsedClass = hcTotal > 100 ? 'p3-tracker__stat-value--over' : 'p3-tracker__stat-value--ok';
    const costUsedClass = costTotal > 100 ? 'p3-tracker__stat-value--over' : 'p3-tracker__stat-value--ok';
    html += `<div class="p3-tracker" id="p3-tracker-main" ${p3ScopeData(div.structure_name, hcTotal, costTotal, totalProposedHC, div.headcount_target || 0, totalProposedBudget, div.budget_target || 0)}>
      <div class="p3-tracker__title">${ICONS.activity} Allocation Summary &mdash; ${escHtml(div.structure_name)}</div>
      <div class="p3-tracker__grid">
        <div>
          <div class="flex items-center gap-2" style="margin-bottom:10px;"><div class="p3-tracker__item-label" style="margin-bottom:0;">HC Allocation</div>${renderFieldHelp('p3-hc-allocation', HC_ALLOCATION_HELP_QA)}</div>
          <div class="p3-tracker__bar-track"><div class="p3-tracker__bar-fill ${hcBarClass}" style="width:${Math.min(hcTotal, 100)}%;"></div></div>
          <div class="p3-tracker__stats">
            <div class="p3-tracker__stat"><span class="p3-tracker__stat-value ${hcUsedClass}">${hcTotal.toFixed(0)}%</span><span class="p3-tracker__stat-label">Used</span></div>
            <div class="p3-tracker__stat"><span class="p3-tracker__stat-value">${Math.max(0, 100 - hcTotal).toFixed(0)}%</span><span class="p3-tracker__stat-label">Remaining</span></div>
          </div>
        </div>
        <div>
          <div class="flex items-center gap-2" style="margin-bottom:10px;"><div class="p3-tracker__item-label" style="margin-bottom:0;">Cost Allocation</div>${renderFieldHelp('p3-cost-allocation', COST_ALLOCATION_HELP_QA)}</div>
          <div class="p3-tracker__bar-track"><div class="p3-tracker__bar-fill ${costBarClass}" style="width:${Math.min(costTotal, 100)}%;"></div></div>
          <div class="p3-tracker__stats">
            <div class="p3-tracker__stat"><span class="p3-tracker__stat-value ${costUsedClass}">${costTotal.toFixed(0)}%</span><span class="p3-tracker__stat-label">Used</span></div>
            <div class="p3-tracker__stat"><span class="p3-tracker__stat-value">${Math.max(0, 100 - costTotal).toFixed(0)}%</span><span class="p3-tracker__stat-label">Remaining</span></div>
          </div>
        </div>
      </div>
      <div class="p3-tracker__grid" style="margin-top:16px;">
        ${renderTargetVsProposedRow('Allocated Headcount', totalProposedHC, div.headcount_target || 0, 'Allocated headcount exceeds the parent target.')}
        ${renderTargetVsProposedRow('Allocated Budget', totalProposedBudget, div.budget_target || 0, 'Allocated budget exceeds the parent target.')}
      </div>
    </div>`;
  }

  if (fns.length === 0) {
    html += `<div class="text-center py-12"><p style="color:#6b7280;">No functions to allocate</p></div>`;
  } else {
    // ── Helper: render a full editable Phase 3 card for any function ─────────
    const renderP3Card = (f, wrapperClass) => {
      const raw = state.phase3Values[f.id] || {};
      const cascaded = cascadedAllocations[f.id] || {};
      const workplaceHC = cascaded.parentHC !== undefined ? cascaded.parentHC : (div.headcount_target || 0);
      const workplaceBudget = cascaded.parentBudget !== undefined ? cascaded.parentBudget : (div.budget_target || 0);
      const mgrCount = raw.manager_count !== undefined ? raw.manager_count : f.manager_count;
      const profCount = raw.professional_count !== undefined ? raw.professional_count : f.professional_count;
      const proposedHC = cascaded.proposedHC !== undefined ? cascaded.proposedHC : (f.proposed_hc || null);
      const proposedBudget = cascaded.proposedBudget !== undefined ? cascaded.proposedBudget : (f.proposed_budget || null);
      // HC Allocation % / Cost Allocation % are directly editable for every workshop (see
      // buildCascadedAllocations) and drive Proposed HC / Proposed Cost via the parent-pool
      // cascade. For an AS-IS Baseline workshop they start out seeded with the percentage the
      // function represented in the AS-IS structure (as_is_hc_percent / as_is_cost_percent, set
      // once at copy time) — shown alongside the input as a fixed reference so the user can see
      // what they're changing it from.
      const hcAlloc = cascaded.hcAllocationPercent !== undefined ? cascaded.hcAllocationPercent : f.hc_allocation_percent;
      const costAlloc = cascaded.costAllocationPercent !== undefined ? cascaded.costAllocationPercent : f.cost_allocation_percent;
      // The AS-IS card shows the uploaded baseline as its own columns instead of an inline hint:
      // the real figure, and what it is as a share of the target now. Computed live rather than
      // read from as_is_hc_percent/as_is_cost_percent, which were frozen at copy time against
      // whatever the target was then and go stale the moment the target is edited.
      const asIsHC = isAsIs ? (parseInt(f.as_is_manager_count) || 0) + (parseInt(f.as_is_professional_count) || 0) : 0;
      const asIsBudget = isAsIs ? (parseFloat(f.as_is_managers_cost) || 0) + (parseFloat(f.as_is_professionals_cost) || 0) : 0;
      // Proposed Managers / Proposed Professionals keep their inline reference — they have no
      // column of their own (see as_is_manager_count/as_is_professional_count, set at copy time).
      const asIsMgrHint = isAsIs && f.as_is_manager_count !== null && f.as_is_manager_count !== undefined
        ? ` <span style="text-transform:none;letter-spacing:normal;font-weight:500;color:#9ca3af;">(As-Is: ${f.as_is_manager_count})</span>` : '';
      const asIsProfHint = isAsIs && f.as_is_professional_count !== null && f.as_is_professional_count !== undefined
        ? ` <span style="text-transform:none;letter-spacing:normal;font-weight:500;color:#9ca3af;">(As-Is: ${f.as_is_professional_count})</span>` : '';
      const actualHC = (parseInt(mgrCount) || 0) + (parseInt(profCount) || 0);
      const span = profCount && mgrCount && parseInt(mgrCount) > 0 ? (parseInt(profCount) / parseInt(mgrCount)).toFixed(1) : (f.span_of_control || null);
      const spanAlert = getSpanAlert(span !== null ? parseFloat(span) : null, f.career_level, parseInt(mgrCount) || 0, parseInt(profCount) || 0) ?? f.span_alert;
      const hcValidationAlert = (proposedHC !== null && actualHC !== 0 && actualHC !== proposedHC)
        ? `<div class="p1-alert p1-alert--critical" style="margin-top:8px;"><div class="p1-alert__icon">${ICONS.xCircle}</div><span class="p1-alert__text">Manager + Professional count (${actualHC}) does not match Proposed HC (${proposedHC})</span></div>`
        : '';
      const reviewFlags = [];
      if (f.can_be_eliminated === 'Yes') reviewFlags.push('Elimination');
      if (f.can_be_automated === 'Yes') reviewFlags.push('Automation');
      if (f.can_be_outsourced === 'Yes') reviewFlags.push('Outsourcing');
      const phase1Review = reviewFlags.length > 0
        ? 'Review for ' + (reviewFlags.length === 3 ? reviewFlags.slice(0, 2).join(', ') + ' and ' + reviewFlags[2] : reviewFlags.join(' and '))
        : '';
      const phase2Decision = decisionOf(f);
      return `<div class="${wrapperClass || 'zbod-card p-5'}">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#2E642C;color:#FFF;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${f.function_number}</div>
          <div class="flex-1">
            <p style="font-weight:600;color:#111827;">${escHtml(f.proposed_function_name)}</p>
            <p style="font-size:12px;color:#6b7280;">${escHtml(f.career_level || 'No level')}</p>
          </div>
          ${decisionBadge(phase2Decision, 'lg')}
          ${wrapperClass === 'p3-child-card' ? `<button type="button" class="p3-collapse-btn" onclick="app.toggleP3Child('${escHtml(f.id)}')" title="Collapse" aria-label="Collapse ${escHtml(f.proposed_function_name)}">${ICONS.chevronRight}</button>` : ''}
        </div>
        ${phase1Review ? `<div class="p1-alert p1-alert--warn" style="margin-bottom:12px;"><div class="p1-alert__icon">${ICONS.alertTriangle}</div><span class="p1-alert__text">${phase1Review}</span></div>` : ''}
        ${isAsIs ? `
        <div class="p3-metric">
          <div class="p3-metric__title">Headcount</div>
          <div class="p3-metric__row">
            <div class="p3-stat"><span class="p3-stat__label">Target</span><span class="p3-stat__value">${formatNumber(workplaceHC)}</span></div>
            <div class="p3-stat"><span class="p3-stat__label">As-Is</span><span class="p3-stat__value">${formatNumber(asIsHC)}</span><span class="p3-stat__sub${asIsHC > workplaceHC ? ' p3-stat__sub--over' : ''}">${fmtPctOfTarget(asIsHC, workplaceHC)} of target</span></div>
            <div class="p3-stat p3-stat--proposed"><label class="p3-stat__label" for="p3-hcpct-${escHtml(f.id)}">Proposed %</label><input id="p3-hcpct-${escHtml(f.id)}" type="number" class="zbod-input w-full" value="${hcAlloc !== null && hcAlloc !== undefined ? hcAlloc : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','hc_allocation_percent',this.value)" placeholder="%" onwheel="return false;"></div>
            <div class="p3-stat p3-stat--proposed"><span class="p3-stat__label">Proposed HC</span><span class="p3-stat__value p3-stat__value--accent">${proposedHC !== null ? formatNumber(proposedHC) : '-'}</span></div>
          </div>
        </div>
        <div class="p3-metric">
          <div class="p3-metric__title">Cost (AZN)</div>
          <div class="p3-metric__row">
            <div class="p3-stat"><span class="p3-stat__label">Target</span><span class="p3-stat__value">${formatNumber(workplaceBudget)}</span></div>
            <div class="p3-stat"><span class="p3-stat__label">As-Is</span><span class="p3-stat__value">${formatNumber(asIsBudget)}</span><span class="p3-stat__sub${asIsBudget > workplaceBudget ? ' p3-stat__sub--over' : ''}">${fmtPctOfTarget(asIsBudget, workplaceBudget)} of target</span></div>
            <div class="p3-stat p3-stat--proposed"><label class="p3-stat__label" for="p3-costpct-${escHtml(f.id)}">Proposed %</label><input id="p3-costpct-${escHtml(f.id)}" type="number" class="zbod-input w-full" value="${costAlloc !== null && costAlloc !== undefined ? costAlloc : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','cost_allocation_percent',this.value)" placeholder="%" onwheel="return false;"></div>
            <div class="p3-stat p3-stat--proposed"><label class="p3-stat__label" for="p3-cost-${escHtml(f.id)}">Proposed Cost</label><input id="p3-cost-${escHtml(f.id)}" ${moneyInputAttrs()} class="zbod-input w-full" style="font-weight:700;" value="${proposedBudget !== null ? formatMoneyValue(proposedBudget) : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','proposed_budget',this.value)" placeholder="0"></div>
          </div>
        </div>` : `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label style="${P3_LBL}">Total Target HC</label><input type="number" class="zbod-input w-full" style="background:#f3f4f6;" value="${workplaceHC}" readonly tabindex="-1"></div>
          <div><label style="${P3_LBL}">HC Allocation %</label><input type="number" class="zbod-input w-full" value="${hcAlloc !== null && hcAlloc !== undefined ? hcAlloc : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','hc_allocation_percent',this.value)" placeholder="%" onwheel="return false;"></div>
          <div style="display:flex;flex-direction:column;justify-content:center;"><label style="${P3_LBL}">Proposed HC</label><span style="font-size:20px;font-weight:800;color:#111827;">${proposedHC !== null ? formatNumber(proposedHC) : '-'}</span></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div><label style="${P3_LBL}">Total Target Cost</label><input type="text" class="zbod-input w-full" style="background:#f3f4f6;" value="${formatMoneyValue(workplaceBudget)}" readonly tabindex="-1"></div>
          <div><label style="${P3_LBL}">Cost Allocation %</label><input type="number" class="zbod-input w-full" value="${costAlloc !== null && costAlloc !== undefined ? costAlloc : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','cost_allocation_percent',this.value)" placeholder="%" onwheel="return false;"></div>
          <div><label style="${P3_LBL}">Proposed Cost</label><input ${moneyInputAttrs()} class="zbod-input w-full" style="font-weight:700;" value="${proposedBudget !== null ? formatMoneyValue(proposedBudget) : ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','proposed_budget',this.value)" placeholder="${costAlloc ? 'Cost Allocation %' : '0'}"></div>
        </div>`}
        <div class="flex items-center gap-2" style="margin-top:16px;"><span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;">People Allocation</span>${renderFieldHelp('p3-people-allocation-' + f.id, PEOPLE_ALLOCATION_HELP_QA)}</div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;display:block;">Proposed Managers${asIsMgrHint}</label><input type="number" class="zbod-input w-full" value="${mgrCount || ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','manager_count',this.value)" placeholder="0" onwheel="return false;"></div>
          <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:6px;display:block;">Proposed Professionals${asIsProfHint}</label><input type="number" class="zbod-input w-full" value="${profCount || ''}" onchange="app.updatePhase3Value('${escHtml(f.id)}','professional_count',this.value)" placeholder="0" onwheel="return false;"></div>
          <div style="padding:12px;border-radius:10px;background:rgba(15,60,118,0.04);border:1px solid rgba(15,60,118,0.1);">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;">HC Allocation Check</span>
            <span style="font-size:18px;font-weight:700;color:#111827;display:block;margin-top:4px;">${actualHC} / ${proposedHC !== null ? proposedHC : '-'}</span>
            ${actualHC !== 0 && proposedHC !== null && actualHC === proposedHC ? `<span style="font-size:11px;color:#16A34A;font-weight:600;">${ICONS.checkCircle} Matches</span>` : `<span style="font-size:11px;color:#EA580C;font-weight:600;">${ICONS.alertTriangle} Does not match</span>`}
          </div>
          <div style="padding:12px;border-radius:10px;background:rgba(46,100,44,0.04);border:1px solid rgba(46,100,44,0.1);">
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;">Span of Control</span>
            <span style="font-size:24px;font-weight:800;color:#111827;display:block;margin-top:4px;">${span !== null ? span : '-'}</span>
            ${spanAlert ? `<span style="font-size:11px;font-weight:700;${spanAlert==='Healthy Span'?'color:#16A34A;':spanAlert==='Above Recommended Span'?'color:#EA580C;':'color:#DC2626;'}">${spanAlert}</span>` : ''}
          </div>
        </div>
        ${hcValidationAlert}
      </div>`;
    };

    // ── Helper: render mini allocation tracker inside a parent card ───────────
    // Validates this specific parent independently: Parent Total = Sum(children's allocated
    // HC/Budget) + Remaining (whatever the parent's own target that its children haven't
    // claimed). Flags this parent in red the moment its children alone exceed its own target —
    // not just when the top-level/root allocation looks fine.
    const renderP3MiniTracker = (children, parentHC, parentBudget, parentName, parentFn) => {
      const childrenHC = children.reduce((sum, c) => sum + ((cascadedAllocations[c.id] || {}).proposedHC || 0), 0);
      const childrenBudget = children.reduce((sum, c) => sum + ((cascadedAllocations[c.id] || {}).proposedBudget || 0), 0);
      const parentOver = childrenHC > (parentHC || 0) || roundMoney(childrenBudget) > roundMoney(parentBudget || 0);

      const hcTotal = pctOfTarget(childrenHC, parentHC || 0);
      const costTotal = pctOfTarget(childrenBudget, parentBudget || 0);
      const hcCls = hcTotal > 100 ? 'p3-tracker__bar-fill--over' : (hcTotal === 100 ? 'p3-tracker__bar-fill--full' : 'p3-tracker__bar-fill--ok');
      const costCls = costTotal > 100 ? 'p3-tracker__bar-fill--over' : (costTotal === 100 ? 'p3-tracker__bar-fill--full' : 'p3-tracker__bar-fill--ok');
      const hcValCls = hcTotal > 100 ? 'p3-tracker__stat-value--over' : 'p3-tracker__stat-value--ok';
      const costValCls = costTotal > 100 ? 'p3-tracker__stat-value--over' : 'p3-tracker__stat-value--ok';

      // AS-IS Baseline workshops only: a parent that came in with more than its sub-functions add up
      // to keeps a red note until that difference has been handed to a sub-function (the figures
      // are the frozen As-Is copy, so the note appears only while there is still a gap right now).
      let unallocatedHtml = '';
      if (isAsIs && parentFn) {
        const snap = f => ({ hc: (parseInt(f.as_is_manager_count) || 0) + (parseInt(f.as_is_professional_count) || 0), cost: (parseFloat(f.as_is_managers_cost) || 0) + (parseFloat(f.as_is_professionals_cost) || 0) });
        // The amount frozen at copy time; workshops copied before it existed fall back to the As-Is
        // copies of the parent and its current children.
        const frozen = parentFn.target_headcount != null || parentFn.target_budget != null;
        const ps = snap(parentFn);
        const cs = children.reduce((a, c) => { const t = snap(c); return { hc: a.hc + t.hc, cost: a.cost + t.cost }; }, { hc: 0, cost: 0 });
        const fromAsIsHC = frozen ? (Number(parentFn.target_headcount) || 0) : ps.hc - cs.hc;
        const fromAsIsCost = frozen ? (Number(parentFn.target_budget) || 0) : ps.cost - cs.cost;
        const gapHC = Math.min(fromAsIsHC, (parentHC || 0) - childrenHC);
        const gapCost = roundMoney(Math.min(fromAsIsCost, (parentBudget || 0) - childrenBudget));
        const bits = [gapHC > 0 ? `${formatNumber(gapHC)} HC` : '', gapCost > 0 ? `${formatNumber(gapCost)} AZN` : ''].filter(Boolean);
        if (bits.length) {
          unallocatedHtml = `<div class="p1-alert p1-alert--critical" style="margin-top:12px;"><div class="p1-alert__icon">${ICONS.alertTriangle}</div><span class="p1-alert__text" style="text-transform:none;letter-spacing:0;">Unallocated from AS-IS data: ${bits.join(' and ')}. Assign it to one of the sub-functions below.</span></div>`;
        }
      }

      return `<div class="p3-child-tracker${parentOver ? ' p3-child-tracker--over' : ''}" ${p3ScopeData(parentName, hcTotal, costTotal, childrenHC, parentHC || 0, childrenBudget, parentBudget || 0)}>
        <div class="p3-child-tracker__label">${ICONS.activity} Children Allocation &mdash; ${escHtml(parentName || '')}</div>
        <div class="p3-tracker__grid">
          <div>
            <div class="p3-tracker__item-label">HC</div>
            <div class="p3-tracker__bar-track"><div class="p3-tracker__bar-fill ${hcCls}" style="width:${Math.min(hcTotal,100)}%;"></div></div>
            <div class="p3-tracker__stats">
              <div class="p3-tracker__stat"><span class="p3-tracker__stat-value ${hcValCls}">${hcTotal.toFixed(0)}%</span><span class="p3-tracker__stat-label">Used</span></div>
              <div class="p3-tracker__stat"><span class="p3-tracker__stat-value">${Math.max(0,100-hcTotal).toFixed(0)}%</span><span class="p3-tracker__stat-label">Remaining</span></div>
            </div>
          </div>
          <div>
            <div class="p3-tracker__item-label">Budget</div>
            <div class="p3-tracker__bar-track"><div class="p3-tracker__bar-fill ${costCls}" style="width:${Math.min(costTotal,100)}%;"></div></div>
            <div class="p3-tracker__stats">
              <div class="p3-tracker__stat"><span class="p3-tracker__stat-value ${costValCls}">${costTotal.toFixed(0)}%</span><span class="p3-tracker__stat-label">Used</span></div>
              <div class="p3-tracker__stat"><span class="p3-tracker__stat-value">${Math.max(0,100-costTotal).toFixed(0)}%</span><span class="p3-tracker__stat-label">Remaining</span></div>
            </div>
          </div>
        </div>
        <div class="p3-tracker__grid" style="margin-top:16px;">
          ${renderTargetVsProposedRow('Allocated Headcount', childrenHC, parentHC || 0, 'Allocated headcount exceeds the parent target.')}
          ${renderTargetVsProposedRow('Allocated Budget', childrenBudget, parentBudget || 0, 'Allocated budget exceeds the parent target.')}
        </div>
        ${unallocatedHtml}
      </div>`;
    };

    // ── Helper: render child section (mini tracker + rows/cards) recursively ─
    const renderP3Children = (children, parentHC, parentBudget, parentName, parentFn) => {
      if (!children || children.length === 0) return '';
      let out = renderP3MiniTracker(children, parentHC, parentBudget, parentName, parentFn);
      out += `<div class="p3-children-list">`;
      children.forEach(child => {
        const grandchildren = p3ParentMap[child.id] || [];
        const isExpanded = state.p3ExpandedChildren.has(child.id);
        const childCascaded = cascadedAllocations[child.id] || {};
        const childProposedHC = childCascaded.proposedHC !== null && childCascaded.proposedHC !== undefined ? formatNumber(childCascaded.proposedHC) : '-';
        const childProposedBudget = childCascaded.proposedBudget !== null && childCascaded.proposedBudget !== undefined ? formatNumber(childCascaded.proposedBudget) : '-';
        const childDecision = child.zbod_decision || computePhase2Decision(child.question1_score || 0, child.question2_score || 0);
        const decisionColor = childDecision==='INVEST'?'#16A34A':childDecision==='KEEP'?'#EA580C':childDecision==='OPTIMIZE'?'#0891B2':'#DC2626';
        if (isExpanded) {
          out += `<div class="p3-child-item p3-child-item--expanded">`;
          out += renderP3Card(child, 'p3-child-card');
          if (grandchildren.length > 0) {
            out += `<div class="p3-children-nested">`;
            out += renderP3Children(grandchildren, childCascaded.proposedHC, childCascaded.proposedBudget, child.proposed_function_name, child);
            out += `</div>`;
          }
          out += `</div>`;
        } else {
          out += `<div class="p3-child-item p3-child-row" onclick="app.toggleP3Child('${escHtml(child.id)}')">
            <div class="p3-child-row__num">${child.function_number}</div>
            <div class="p3-child-row__info">
              <span class="p3-child-row__name">${escHtml(child.proposed_function_name)}</span>
              <span class="p3-child-row__level">${escHtml(child.career_level || '')}</span>
            </div>
            <div class="p3-child-row__meta">
              <span class="p3-child-row__proposed">HC: ${childProposedHC} &nbsp;|&nbsp; Cost: ${childProposedBudget} AZN</span>
              <span class="p3-child-row__decision" style="color:${decisionColor};">${childDecision}</span>
              ${grandchildren.length > 0 ? `<span class="p3-child-row__sub">${grandchildren.length} sub-function${grandchildren.length>1?'s':''}</span>` : ''}
            </div>
            <div class="p3-child-row__chevron">${ICONS.chevronRight}</div>
          </div>`;
        }
      });
      out += `</div>`;
      return out;
    };

    // ── Main render: root functions + nested children ─────────────────────────
    html += `<div class="space-y-4">`;
    rootFns.forEach(f => {
      const children = p3ParentMap[f.id] || [];
      html += `<div class="p3-tree-group">`;
      html += renderP3Card(f, 'zbod-card p-5');
      if (children.length > 0) {
        const fCascaded = cascadedAllocations[f.id] || {};
        html += `<div class="p3-children-section">`;
        html += renderP3Children(children, fCascaded.proposedHC, fCascaded.proposedBudget, f.proposed_function_name, f);
        html += `</div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `<div class="flex justify-between mt-8 pt-6" style="border-top:1px solid rgba(46,100,44,0.1);">
    <button onclick="app.savePhase3()" class="zbod-btn-secondary" style="padding:10px 24px;">${ICONS.save} Save</button>
    <div class="flex gap-3">
      <button onclick="app.backToPhase1()" class="zbod-btn-secondary" style="padding:10px 24px;">Back</button>
      <button onclick="app.goToReview()" class="zbod-btn-primary" style="padding:10px 24px;">Review & Finish ${ICONS.check}</button>
    </div>
  </div>`;

  document.getElementById('phase3-content').innerHTML = html;
  setupPhase3StickyCompact();
}


// Every allocation tracker on the Phase 3 page publishes its own figures here, so the sticky bar
// can mirror whichever scope the reader is inside without recomputing anything. The rendered
// tracker stays the single source of truth — the bar only reads it back.
function p3ScopeData(name, hcPct, costPct, hcUsed, hcTarget, costUsed, costTarget) {
  return [
    `data-scope-name="${escHtml(name || '')}"`,
    `data-scope-hc-pct="${hcPct || 0}"`,
    `data-scope-cost-pct="${costPct || 0}"`,
    `data-scope-hc-used="${hcUsed || 0}"`,
    `data-scope-hc-target="${hcTarget || 0}"`,
    `data-scope-cost-used="${costUsed || 0}"`,
    `data-scope-cost-target="${costTarget || 0}"`,
  ].join(' ');
}

// The sticky bar carries the scale of the function group the reader is currently scrolling
// through, named so it can't be mistaken for another. The division-level summary is deliberately
// NOT mirrored here — it is read in place at the top of the page, so scrolling past it leaves the
// bar hidden until the first function group begins.
function setupPhase3StickyCompact() {
  // Phase 3 re-renders on every keystroke; keeping the visible state avoids the bar flickering
  // away and back while the reader is mid-scroll.
  const wasVisible = !!document.querySelector('#p3-compact-sticky.p3-compact-sticky--visible');
  cleanupPhase3Sticky();

  const groups = [...document.querySelectorAll('#phase3-content .p3-child-tracker[data-scope-name]')]
    .map(el => ({ el, section: el.closest('.p3-children-section, .p3-children-nested') || el }));
  if (!groups.length) return;

  let bar = document.getElementById('p3-compact-sticky');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'p3-compact-sticky';
    bar.setAttribute('aria-hidden', 'true');
    const phase3Page = document.getElementById('page-phase3');
    const phase3Content = document.getElementById('phase3-content');
    if (!phase3Page || !phase3Content) return;
    phase3Page.insertBefore(bar, phase3Content);
  }
  if (wasVisible) bar.classList.add('p3-compact-sticky--visible');

  const nav = document.querySelector('#page-phase3 .sticky-header');
  const navH = nav ? (nav.getBoundingClientRect().height || nav.offsetHeight || 73) : 73;
  bar.style.top = `${navH}px`;

  const kpi = (label, pct, used, target) => {
    const over = pct > 100;
    const overCount = (used || 0) > (target || 0);
    return `<div class="p3-compact__kpi">
      <span class="p3-compact__kpi-label">${label}</span>
      <div class="p3-compact__bar-wrap">
        <div class="p3-compact__bar-track">
          <div class="p3-compact__bar-fill ${over ? 'p3-compact__bar-fill--over' : 'p3-compact__bar-fill--ok'}" style="width:${Math.min(pct, 100)}%;"></div>
        </div>
        <span class="p3-compact__pct ${over ? 'p3-compact__pct--over' : ''}">${pct.toFixed(0)}%</span>
      </div>
      <span class="p3-compact__sub ${overCount ? 'p3-compact__sub--over' : ''}">${formatNumber(used)} / ${formatNumber(target)}</span>
    </div>`;
  };

  let painted = null;
  const paint = el => {
    if (el === painted) return;
    painted = el;
    const d = el.dataset;
    bar.innerHTML = `<div class="p3-compact__inner">
      <div class="p3-compact__scope" title="${escHtml(d.scopeName || '')}">
        <span class="p3-compact__scope-eyebrow">Allocating within</span>
        <span class="p3-compact__scope-name">${escHtml(d.scopeName || '')}</span>
      </div>
      ${kpi('HC', parseFloat(d.scopeHcPct) || 0, parseFloat(d.scopeHcUsed) || 0, parseFloat(d.scopeHcTarget) || 0)}
      <div class="p3-compact__divider"></div>
      ${kpi('Budget', parseFloat(d.scopeCostPct) || 0, parseFloat(d.scopeCostUsed) || 0, parseFloat(d.scopeCostTarget) || 0)}
    </div>`;
  };

  // Document order puts nested groups last, so the innermost group the reader is inside wins.
  // Outside every group — the division level — there is nothing to show and the bar retracts.
  const pick = () => {
    const pageEl = document.getElementById('page-phase3');
    if (!pageEl || pageEl.classList.contains('hidden')) return;
    const line = navH + (bar.offsetHeight || 56) + 8;
    let active = null;
    groups.forEach(g => {
      const r = g.section.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) active = g.el;
    });
    if (!active) { bar.classList.remove('p3-compact-sticky--visible'); return; }
    paint(active);
    bar.classList.add('p3-compact-sticky--visible');
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; pick(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window._p3ScopeScroll = onScroll;
  pick();
}

function cleanupPhase3Sticky() {
  const bar = document.getElementById('p3-compact-sticky');
  if (bar) bar.classList.remove('p3-compact-sticky--visible');
  if (window._p3ScopeScroll) {
    window.removeEventListener('scroll', window._p3ScopeScroll);
    window._p3ScopeScroll = null;
  }
}

// ═══════════════════════════════════════════
// RENDER: REVIEW PAGE
// ═══════════════════════════════════════════
function renderReview() {
  const ws = getWs().find(w => w.id === state.selectedWorkshopId);
  if (!ws) return;
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) return;
  const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);

  document.getElementById('review-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-7xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.backToPhase3()">${ICONS.arrowLeft}</button>
      <div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.target}</div><h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${escHtml(div.structure_name)} &mdash; Workshop Review</h1></div>
    </div>`;

  let html = `<div class="mb-6"><h2 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:30px;color:#111827;">Workshop Summary</h2><p style="font-size:14px;color:#6b7280;">Review all data before finalizing.</p></div>`;

  const inc = fns.filter(f => (decisionOf(f)) === 'INVEST');
  const kp = fns.filter(f => (decisionOf(f)) === 'KEEP');
  const opt = fns.filter(f => (decisionOf(f)) === 'OPTIMIZE');
  const elm = fns.filter(f => (decisionOf(f)) === 'ELIMINATE');

  html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="zbod-card p-4" style="border-left:3px solid #16A34A;"><p style="font-size:12px;color:#6b7280;">INVEST</p><p style="font-size:28px;font-weight:800;color:#16A34A;">${inc.length}</p></div>
    <div class="zbod-card p-4" style="border-left:3px solid #EA580C;"><p style="font-size:12px;color:#6b7280;">KEEP</p><p style="font-size:28px;font-weight:800;color:#EA580C;">${kp.length}</p></div>
    <div class="zbod-card p-4" style="border-left:3px solid #0891B2;"><p style="font-size:12px;color:#6b7280;">OPTIMIZE</p><p style="font-size:28px;font-weight:800;color:#0891B2;">${opt.length}</p></div>
    <div class="zbod-card p-4" style="border-left:3px solid #DC2626;"><p style="font-size:12px;color:#6b7280;">ELIMINATE</p><p style="font-size:28px;font-weight:800;color:#DC2626;">${elm.length}</p></div>
  </div>`;

  const totalProposedHC = calculateProposedHeadcount(ws.id);
  const totalProposedBudget = calculateProposedBudget(ws.id);

  html += `<div class="zbod-card p-6 mb-8"><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin-bottom:16px;">Targets vs Proposed</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${renderTargetVsProposedRow('Headcount', totalProposedHC, div.headcount_target || 0, 'Proposed headcount exceeds the target headcount.')}
      ${renderTargetVsProposedRow('Budget', totalProposedBudget, div.budget_target || 0, 'Proposed budget exceeds the target budget.')}
    </div>
  </div>`;

  html += `<div class="zbod-card p-6 mb-8"><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin-bottom:16px;">Function Details</h3>
    <div class="overflow-x-auto"><table class="zbod-table">
      <thead><tr><th>#</th><th>Function</th><th>Level</th><th>Q1</th><th>Q2</th><th>Decision</th><th>REVIEW STATUS</th><th>HC Alloc%</th><th>Proposed HC</th><th>Budget Alloc%</th><th>Proposed Budget</th></tr></thead>
      <tbody>
        ${fns.map(f => {
          const dec = decisionOf(f);
          const elim = f.can_be_eliminated || '';
          const auto = f.can_be_automated || '';
          const out = f.can_be_outsourced || '';
          const reviewAlert = phase1AlertLabel(f.justification_alert) || (elim && auto && out ? computePhase1Alert(elim, auto, out) : '');
          const yesCount = (elim === 'Yes' ? 1 : 0) + (auto === 'Yes' ? 1 : 0) + (out === 'Yes' ? 1 : 0);
          let reviewBadge = '';
          if (reviewAlert && reviewAlert.includes('PASSED')) {
            reviewBadge = `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:rgba(46,100,44,0.1);color:#2E642C;">${reviewAlert}</span>`;
          } else if (yesCount === 3) {
            reviewBadge = `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:rgba(180,60,60,0.1);color:#991b1b;">${reviewAlert || 'Critical Review'}</span>`;
          } else if (yesCount > 0) {
            reviewBadge = `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:rgba(200,160,60,0.1);color:#92400e;">${reviewAlert || 'Review Required'}</span>`;
          } else {
            reviewBadge = `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:rgba(156,163,175,0.1);color:#6b7280;">-</span>`;
          }
          return `<tr><td style="font-weight:700;color:#16A34A;">${f.function_number}</td><td style="font-weight:500;">${escHtml(f.proposed_function_name)}</td><td>${escHtml(f.career_level)}</td><td style="font-size:12px;min-width:170px;">${escHtml(impactAnswer('question1_score', f.question1_score)) || '-'}</td><td style="font-size:12px;min-width:170px;">${escHtml(impactAnswer('question2_score', f.question2_score)) || '-'}</td><td>${decisionBadge(dec, 'sm')}</td><td>${reviewBadge}</td><td>${f.hc_allocation_percent || '-'}${f.hc_allocation_percent ? '%' : ''}</td><td>${formatNumber(f.proposed_hc || 0)}</td><td>${f.cost_allocation_percent || '-'}${f.cost_allocation_percent ? '%' : ''}</td><td>${formatNumber(f.proposed_budget || 0)}</td></tr>`;
        }).join('')}
      </tbody>
    </table></div>
  </div>`;

  html += `<div class="flex justify-between">
    <button onclick="app.backToPhase3()" class="zbod-btn-secondary" style="padding:14px 32px;">Back to Phase 2</button>
    <button onclick="app.finishWorkshop()" class="zbod-btn-primary" style="padding:14px 32px;">${ICONS.check} Complete Workshop</button>
  </div>`;

  document.getElementById('review-content').innerHTML = html;
}


// ═══════════════════════════════════════════
// RENDER: TRANSITION / EXECUTIVE DASHBOARD
// ═══════════════════════════════════════════
function renderTransition() {
  const ws = getWs().find(w => w.id === state.selectedWorkshopId);
  if (!ws) return;
  const div = divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
  if (!div) return;
  const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
  const asIsFns = getWorkshopAsIs(ws);

  document.getElementById('transition-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-screen-2xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.goToWorkspace()">${ICONS.arrowLeft}</button>
      <div class="flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.checkCircle}</div><h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">Workshop Complete</h1></div>
    </div>`;

  const isAlreadySubmitted = !!ws.submitted_for_hr_review_at;
  let html = `<div class="text-center mb-8">
    <div style="display:inline-flex;width:80px;height:80px;border-radius:50%;background:#2E642C;align-items:center;justify-content:center;margin-bottom:16px;">${ICONS.checkCircle}</div>
    <h2 style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:36px;color:#111827;margin-bottom:8px;">Workshop Complete!</h2>
    <p style="font-size:16px;color:#6b7280;">Results saved. You can view the workshop anytime in the structure workspace.</p>
    <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mt-4">
      <button onclick="app.goToWorkspace()" class="zbod-btn-secondary" style="padding:12px 32px;">${ICONS.home} Back to Workspace</button>
      ${!isAlreadySubmitted ? `<button onclick="app.submitForHRReview()" class="zbod-btn-primary" style="padding:12px 32px;background:#0F3C76;">${ICONS.send} Submit for HR Review</button>` : `<button onclick="app.goToHRReview()" class="zbod-btn-primary" style="padding:12px 32px;">${ICONS.checkCircle} View HR Submission</button>`}
    </div>
  </div>`;

  state.dashboardParentFilter = '';
  const dash = buildDashboardHTML(ws, div, fns, asIsFns);
  html += dash.html;
  document.getElementById('transition-content').innerHTML = html;
  setTimeout(() => renderDashboardCharts(dash.inc, dash.kp, dash.opt, dash.elm, dash.fns, asIsFns, div, '', state.dashboardParentFilter, ws), 100);
}

// Names of functions that have at least one direct child in either the TO-BE or AS-IS
// function tree — these are the "parent structures" the Distribution Analysis filter can scope to.
function getDashboardParentOptions(fns, asIsFns) {
  const names = new Set();
  fns.forEach(f => { if (f.proposed_function_name && fns.some(c => c.parent_id === f.id)) names.add(f.proposed_function_name); });
  asIsFns.forEach(f => { if (f.function_name && asIsFns.some(c => c.parent_id === f.id)) names.add(f.function_name); });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

// ═══════════════════════════════════════════
// SHARED DASHBOARD BUILDER
// ═══════════════════════════════════════════
function buildDashboardHTML(ws, div, fns, asIsFns, chartPrefix = '') {
  const metrics = calculateDashboardMetrics(ws.id);
  // Root-level only, to avoid double-counting a child's manager/professional count on top of the
  // parent it was carved out of — see calculateWorkshopAllocationTotals for the same rule applied
  // to HC/budget.
  const fnIds = new Set(fns.map(f => f.id));
  const rootFns = fns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
  const asIsFnIds = new Set(asIsFns.map(f => f.id));
  const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && asIsFnIds.has(f.parent_id)));

  const inc = metrics.invest;
  const kp = metrics.keep;
  const opt = metrics.optimize;
  const elm = metrics.eliminate;

  const totalAsIsHC = metrics.totalAsIsHC;
  const totalAsIsBudget = metrics.totalAsIsBudget;
  const totalToBeHC = metrics.totalToBeHC;
  const totalToBeBudget = metrics.totalToBeBudget;

  // Workshops created via "Analyze AS-IS Baseline" still go through the same Phase 1-3 flow as a
  // normal workshop (see copyAsIsBaselineToWorkshop), so they now get the same three-way AS-IS /
  // Proposed / Target comparison — just labeled "Proposed" instead of "TO-BE" to match the rest
  // of an AS-IS Baseline workshop's terminology (Proposed HC, Proposed Cost). This never touches
  // the Decision Summary / Decision Distribution above (Invest/Keep/Optimize/Eliminate) or
  // Phase 1-3 data — those stay exactly as they are.
  const isAsIs = ws.source === 'as_is_baseline';

  // This is a brand-new view of the org chart (not a collapse/expand toggle re-render, which
  // explicitly re-applies the current zoom itself) — start zoom and collapse state clean rather
  // than carrying over a stale scale/collapsed-set from whichever org chart instance was last
  // interacted with elsewhere. Without this, the very next zoom click here would jump by however
  // much the previous chart's scale had drifted, since the fresh canvas always starts unscaled.
  orgZoomScale = 1.0;
  window.asIsOrgCollapsedNodes = new Set();

  const maxHC = Math.max(totalAsIsHC, totalToBeHC, div.headcount_target || 0, 1);
  const maxBudget = Math.max(totalAsIsBudget, totalToBeBudget, div.budget_target || 0, 1);

  let html = '';

  html += `<div class="zbod-card p-6 mb-8"><div class="flex items-center justify-between mb-6">
    <div><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:24px;color:#111827;">${isAsIs ? 'AS-IS vs Target Dashboard' : 'AS-IS vs TO-BE Dashboard'}</h3><p style="font-size:14px;color:#6b7280;">Completed: ${new Date(ws.completed_at || ws.created_at).toLocaleDateString()} ${new Date(ws.completed_at || ws.created_at).toLocaleTimeString()}</p></div>
    <button onclick="app.exportToExcel()" class="zbod-btn-export">${ICONS.download} Export Report</button>
  </div>`;

  html += `<div class="zbod-card p-6 mb-8"><div class="decision-summary-layout">
    <div class="decision-summary-layout__left">
      <h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:16px;">Decision Summary</h4>
      <div class="space-y-3">
        <div style="padding:12px 16px;border-radius:8px;background:rgba(22,163,74,0.06);border-left:3px solid #16A34A;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#16A34A;margin-bottom:6px;">INVEST (${inc.length})</div>
          <div class="space-y-1">${inc.length > 0 ? inc.map(f => `<p style="font-size:13px;color:#111827;">${f.function_number}. ${escHtml(f.proposed_function_name)} <span style="color:#6b7280;">(HC: ${formatNumber(f.proposed_hc || 0)}, Budget: ${formatNumber(f.proposed_budget || 0)})</span></p>`).join('') : '<p style="font-size:12px;color:#9ca3af;">None</p>'}</div>
        </div>
        <div style="padding:12px 16px;border-radius:8px;background:rgba(234,88,12,0.06);border-left:3px solid #EA580C;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#EA580C;margin-bottom:6px;">KEEP (${kp.length})</div>
          <div class="space-y-1">${kp.length > 0 ? kp.map(f => `<p style="font-size:13px;color:#111827;">${f.function_number}. ${escHtml(f.proposed_function_name)} <span style="color:#6b7280;">(HC: ${formatNumber(f.proposed_hc || 0)}, Budget: ${formatNumber(f.proposed_budget || 0)})</span></p>`).join('') : '<p style="font-size:12px;color:#9ca3af;">None</p>'}</div>
        </div>
        <div style="padding:12px 16px;border-radius:8px;background:rgba(8,145,178,0.06);border-left:3px solid #0891B2;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0891B2;margin-bottom:6px;">OPTIMIZE (${opt.length})</div>
          <div class="space-y-1">${opt.length > 0 ? opt.map(f => `<p style="font-size:13px;color:#111827;">${f.function_number}. ${escHtml(f.proposed_function_name)} <span style="color:#6b7280;">(HC: ${formatNumber(f.proposed_hc || 0)}, Budget: ${formatNumber(f.proposed_budget || 0)})</span></p>`).join('') : '<p style="font-size:12px;color:#9ca3af;">None</p>'}</div>
        </div>
        <div style="padding:12px 16px;border-radius:8px;background:rgba(220,38,38,0.06);border-left:3px solid #DC2626;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#DC2626;margin-bottom:6px;">ELIMINATE (${elm.length})</div>
          <div class="space-y-1">${elm.length > 0 ? elm.map(f => `<p style="font-size:13px;color:#111827;">${f.function_number}. ${escHtml(f.proposed_function_name)} <span style="color:#6b7280;">(HC: ${formatNumber(f.proposed_hc || 0)}, Budget: ${formatNumber(f.proposed_budget || 0)})</span></p>`).join('') : '<p style="font-size:12px;color:#9ca3af;">None</p>'}</div>
        </div>
      </div>
    </div>
    <div class="decision-summary-layout__right">
      <div class="dashboard-pie-card" style="width:100%;max-width:420px;">
        <h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:16px;text-align:center;">Decision Distribution</h4>
        <div style="max-width:340px;margin:0 auto;"><canvas id="${chartPrefix}decisionPieChart"></canvas></div>
      </div>
    </div>
  </div></div>`;

  // Distribution Analysis section — filterable by parent (defaults to the Division itself). Every
  // workshop now shows both the AS-IS Headcount/Cost Distribution charts and the forward-looking
  // ones (labeled "Proposed" for an AS-IS Baseline analysis, "TO-BE" for a normal workshop) — the
  // section and its "Select Parent" filter otherwise stay exactly as they are for every workshop.
  {
    const parentOptions = getDashboardParentOptions(fns, asIsFns);
    const currentParentFilter = state.dashboardParentFilter || '';
    const divisionParentLabel = div.structure_name || 'Division';
    const distPieCard = (title, canvasId, extraStyle = '') => `<div class="zbod-card p-5 dashboard-pie-card" style="${extraStyle}"><h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#6b7280;margin-bottom:16px;text-align:center;">${title}</h4><div style="width:100%;"><canvas id="${canvasId}"></canvas><p id="${canvasId}-empty" class="hidden" style="color:#9ca3af;font-size:13px;text-align:center;padding:40px 0;"></p></div></div>`;
    html += `<div class="zbod-card p-6 mb-8">
      <div class="flex items-center justify-between mb-4" style="flex-wrap:wrap;gap:12px;">
        <h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin:0;">Distribution Analysis</h3>
        <div class="flex items-center gap-2">
          <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Select Parent</label>
          <select class="zbod-select" style="padding:8px 12px;font-size:13px;min-width:200px;" onchange="app.filterDashboardDistribution(this.selectedIndex,'${chartPrefix}')">
            <option ${!currentParentFilter ? 'selected' : ''}>${escHtml(divisionParentLabel)}</option>
            ${parentOptions.map(name => `<option ${currentParentFilter === name ? 'selected' : ''}>${escHtml(name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 dist-grid">
        ${distPieCard('AS-IS Headcount Distribution', chartPrefix + 'asIsHcPieChart', 'border:1px solid #e5e7eb;')}
        ${distPieCard(isAsIs ? 'Proposed Headcount Distribution' : 'TO-BE Headcount Distribution', chartPrefix + 'hcPieChart')}
        ${distPieCard('AS-IS Cost Distribution', chartPrefix + 'asIsBudgetPieChart', 'border:1px solid #e5e7eb;')}
        ${distPieCard(isAsIs ? 'Proposed Cost Distribution' : 'TO-BE Cost Distribution', chartPrefix + 'budgetPieChart')}
      </div>
    </div>`;
  }

  html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
    <div class="zbod-card p-6 chart-card">
      <h4 class="chart-title">Headcount Comparison</h4>
      <div class="chart-area">
        <div class="chart-bars">
          <div class="chart-bar-col"><div class="chart-bar" style="background:#2563EB;height:${(totalAsIsHC / maxHC) * 160}px;"></div></div>
          <div class="chart-bar-col"><div class="chart-bar" style="background:#16A34A;height:${(totalToBeHC / maxHC) * 160}px;"></div></div>
          <div class="chart-bar-col"><div class="chart-bar" style="background:#CA8A04;height:${((div.headcount_target || 0) / maxHC) * 160}px;"></div></div>
        </div>
      </div>
      <div class="chart-labels">
        <div class="chart-label-col"><span class="chart-label-text" style="color:#2563EB;">AS-IS</span><span class="chart-label-value">${formatNumber(totalAsIsHC)}</span></div>
        <div class="chart-label-col"><span class="chart-label-text" style="color:#16A34A;">${isAsIs ? 'Proposed' : 'TO-BE'}</span><span class="chart-label-value">${formatNumber(totalToBeHC)}</span></div>
        <div class="chart-label-col"><span class="chart-label-target" style="color:#CA8A04;">Target</span><span class="chart-label-value">${formatNumber(div.headcount_target || 0)}</span></div>
      </div>
    </div>
    <div class="zbod-card p-6 chart-card">
      <h4 class="chart-title">Budget Comparison</h4>
      <div class="chart-area">
        <div class="chart-bars">
          <div class="chart-bar-col"><div class="chart-bar" style="background:#2563EB;height:${(totalAsIsBudget / maxBudget) * 160}px;"></div></div>
          <div class="chart-bar-col"><div class="chart-bar" style="background:#16A34A;height:${(totalToBeBudget / maxBudget) * 160}px;"></div></div>
          <div class="chart-bar-col"><div class="chart-bar" style="background:#CA8A04;height:${((div.budget_target || 0) / maxBudget) * 160}px;"></div></div>
        </div>
      </div>
      <div class="chart-labels">
        <div class="chart-label-col"><span class="chart-label-text" style="color:#2563EB;">AS-IS</span><span class="chart-label-value">${formatNumber(totalAsIsBudget)}</span></div>
        <div class="chart-label-col"><span class="chart-label-text" style="color:#16A34A;">${isAsIs ? 'Proposed' : 'TO-BE'}</span><span class="chart-label-value">${formatNumber(totalToBeBudget)}</span></div>
        <div class="chart-label-col"><span class="chart-label-target" style="color:#CA8A04;">Target</span><span class="chart-label-value">${formatNumber(div.budget_target || 0)}</span></div>
      </div>
    </div>
  </div>`;

  html += `<div class="zbod-card p-6 mb-8"><h4 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px;color:#2E642C;margin-bottom:16px;">${isAsIs ? 'Redesigned As-Is Org Chart' : 'TO-BE Org Chart'}</h4><div class="org-chart-container">${isAsIs ? renderAsIsOrgChart(asIsFns, chartPrefix) : renderOrgChart(fns, div.structure_name, div)}</div></div>`;

  html += `<div class="zbod-card p-6 mb-8">
    <h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin-bottom:16px;">${isAsIs ? 'Division Targets vs AS-IS' : 'Division Targets vs Proposed'}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${renderTargetVsProposedRow('Headcount', isAsIs ? totalAsIsHC : totalToBeHC, div.headcount_target || 0)}
      ${renderTargetVsProposedRow('Budget', isAsIs ? totalAsIsBudget : totalToBeBudget, div.budget_target || 0)}
    </div>
  </div>`;

  // Function Comparison — same zbod-table look as the Review page's Function Details table, but
  // (unlike that one, which only shows Proposed) puts each function's AS-IS numbers side by side
  // with its Proposed ones. Only populated for an AS-IS Baseline workshop, since that's the only
  // case where a function has a real 1:1 AS-IS counterpart snapshotted on it (as_is_manager_count
  // etc., set once at copy time in copyAsIsBaselineToWorkshop) — a normal workshop's functions can
  // be entirely new, zero-based inventions with no AS-IS equivalent to compare against, so those
  // columns honestly show "–" rather than a fabricated comparison.
  {
    const proposedLabel = isAsIs ? 'Proposed' : 'TO-BE';
    const dash = '<span style="color:#9ca3af;">–</span>';
    const hasAsIsSnapshot = f => f.as_is_manager_count !== null && f.as_is_manager_count !== undefined
      || f.as_is_professional_count !== null && f.as_is_professional_count !== undefined;
    const rows = fns.map(f => {
      const dec = decisionOf(f);
      const decBadge = decisionBadge(dec, 'sm');
      const asIsMgr = f.as_is_manager_count, asIsProf = f.as_is_professional_count;
      const asIsHC = (asIsMgr || 0) + (asIsProf || 0);
      const asIsCost = (f.as_is_managers_cost || 0) + (f.as_is_professionals_cost || 0);
      const snapshot = hasAsIsSnapshot(f);
      return `<tr>
        <td style="font-weight:700;color:#16A34A;">${f.function_number}</td>
        <td style="font-weight:500;">${escHtml(f.proposed_function_name)}</td>
        <td>${snapshot ? formatNumber(asIsMgr || 0) : dash}</td>
        <td>${snapshot ? formatNumber(asIsProf || 0) : dash}</td>
        <td>${snapshot ? formatNumber(asIsHC) : dash}</td>
        <td>${snapshot ? formatNumber(asIsCost) : dash}</td>
        <td>${formatNumber(f.manager_count || 0)}</td>
        <td>${formatNumber(f.professional_count || 0)}</td>
        <td>${formatNumber(f.proposed_hc || 0)}</td>
        <td>${formatNumber(f.proposed_budget || 0)}</td>
        <td>${decBadge}</td>
      </tr>`;
    }).join('');
    html += `<div class="zbod-card p-6 mb-8"><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin-bottom:16px;">Function Comparison</h3>
      <div class="overflow-x-auto"><table class="zbod-table">
        <thead><tr><th>#</th><th>Function</th><th>AS-IS Managers</th><th>AS-IS Professionals</th><th>AS-IS HC</th><th>AS-IS Cost</th><th>${proposedLabel} Managers</th><th>${proposedLabel} Professionals</th><th>${proposedLabel} HC</th><th>${proposedLabel} Cost</th><th>Decision</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="11" style="text-align:center;color:#9ca3af;">No functions in this workshop.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  }

  // Executive Summary — a single at-a-glance comparison table (standard closing element of an
  // org-design workshop readout), condensing everything charted above (AS-IS vs Target vs
  // Proposed/TO-BE, People composition, Decision breakdown) into one scannable table instead of
  // making the reader piece it together from the charts. Status (Within/Over Target) is only
  // shown for Headcount/Budget, the only two rows with a real division target to check against —
  // every other row honestly shows "–" rather than implying a target that doesn't exist.
  {
    const proposedLabel = isAsIs ? 'Proposed' : 'TO-BE';
    const relevantHC = isAsIs ? totalAsIsHC : totalToBeHC;
    const relevantBudget = isAsIs ? totalAsIsBudget : totalToBeBudget;
    const asIsMgrs = rootAsIsFns.reduce((s, f) => s + (f.manager_count || 0), 0);
    const asIsProfs = rootAsIsFns.reduce((s, f) => s + (f.current_employee_count || 0), 0);
    const toBeMgrs = rootFns.reduce((s, f) => s + (f.manager_count || 0), 0);
    const toBeProfs = rootFns.reduce((s, f) => s + (f.professional_count || 0), 0);
    const asIsSpan = asIsMgrs > 0 ? (asIsProfs / asIsMgrs).toFixed(1) : '–';
    const toBeSpan = toBeMgrs > 0 ? (toBeProfs / toBeMgrs).toFixed(1) : '–';

    const dash = '<span style="color:#9ca3af;">–</span>';
    const statusBadge = (value, target) => {
      if (!target) return dash;
      const over = roundMoney(value) > roundMoney(target);
      return `<span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;${over ? 'background:rgba(180,60,60,0.1);color:#991b1b;' : 'background:rgba(46,100,44,0.1);color:#2E642C;'}">${over ? 'Over Target' : 'Within Target'}</span>`;
    };
    const summaryRow = (label, asIsVal, proposedVal, targetVal, status) => `<tr>
      <td style="font-weight:500;">${label}</td>
      <td>${asIsVal}</td>
      <td>${proposedVal}</td>
      <td>${targetVal !== null ? formatNumber(targetVal) : dash}</td>
      <td>${status !== undefined ? status : dash}</td>
    </tr>`;

    // Same zbod-table look as the Review page's Function Details table, rather than a
    // one-off custom style for this summary.
    html += `<div class="zbod-card p-6 mb-8"><h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;margin-bottom:16px;">Executive Summary</h3>
      <div class="overflow-x-auto"><table class="zbod-table">
        <thead><tr><th>Metric</th><th>AS-IS</th><th>${proposedLabel}</th><th>Target</th><th>Status</th></tr></thead>
        <tbody>
          ${summaryRow('Headcount', formatNumber(totalAsIsHC), formatNumber(totalToBeHC), div.headcount_target || 0, statusBadge(relevantHC, div.headcount_target || 0))}
          ${summaryRow('Budget (AZN)', formatNumber(totalAsIsBudget), formatNumber(totalToBeBudget), div.budget_target || 0, statusBadge(relevantBudget, div.budget_target || 0))}
          ${summaryRow('Number of Functions', formatNumber(asIsFns.length), formatNumber(fns.length), null)}
          ${summaryRow('Total Managers', formatNumber(asIsMgrs), formatNumber(toBeMgrs), null)}
          ${summaryRow('Total Professionals', formatNumber(asIsProfs), formatNumber(toBeProfs), null)}
          ${summaryRow('Avg Span of Control', asIsSpan, toBeSpan, null)}
          ${summaryRow('Decision Breakdown', dash, `Invest: ${inc.length} &middot; Keep: ${kp.length} &middot; Optimize: ${opt.length} &middot; Eliminate: ${elm.length}`, null)}
        </tbody>
      </table></div>
    </div>`;
  }

  return { html, inc, kp, opt, elm, fns };
}

function renderDashboardCharts(inc, kp, opt, elm, fns, asIsFns, div, chartPrefix = '', parentFilter = '', ws = null) {
  // Destroy any existing chart instances before creating new ones
  // This prevents Chart.js "canvas already in use" errors when navigating between pages
  ['decisionPieChart','hcPieChart','budgetPieChart','asIsHcPieChart','asIsBudgetPieChart'].forEach(id => destroyChart(chartPrefix + id));

  const totalF = fns.length || 1;
  const pieLabelPlugin = {
    id: 'pieLabels',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        const total = ds.data.reduce((a, b) => a + b, 0);
        meta.data.forEach((arc, i) => {
          if (ds.data[i] === 0) return;
          const pct = ((ds.data[i] / total) * 100).toFixed(1) + '%';
          const mid = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
          const x = arc.x + Math.cos(mid) * (arc.outerRadius * 0.55);
          const y = arc.y + Math.sin(mid) * (arc.outerRadius * 0.55);
          ctx.fillStyle = '#FFFFFF';
          const labelFontSize = chart.width > 400 ? 16 : 13;
          ctx.font = `bold ${labelFontSize}px Inter`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 4;
          ctx.fillText(pct, x, y);
          ctx.shadowBlur = 0;
        });
      });
    }
  };

  const execPalette = ['#2563EB','#16A34A','#CA8A04','#0891B2','#EA580C','#65A30D','#DC2626','#7C3AED','#DB2777','#0F766E','#4338CA','#92400E','#C026D3','#475569'];
  // The n-th distinct slice colour: the hand-picked palette first, then evenly spread hues (golden
  // angle), so no two functions ever share a colour however many there are. "Remaining" is grey and
  // none of these is.
  const sliceColorAt = (i) => i < execPalette.length ? execPalette[i] : `hsl(${Math.round((i * 137.508) % 360)}, 62%, ${44 + (i % 3) * 6}%)`;

  // A function keeps the same colour in every Distribution Analysis pie on this page. Colours used
  // to be handed out by slice position, so the same function drifted between charts: a function
  // with headcount but no budget is skipped in the cost pie and shifts every colour after it, and
  // the AS-IS and Proposed lists rarely hold the same functions in the same order. Mapping colour
  // to the function's NAME instead means "Payroll" is the same colour in all four pies, which is
  // what makes them readable side by side.
  //
  // The map is built from every name on this page (AS-IS and proposed together) and sorted, so it
  // does not depend on which chart is drawn first or on how many slices each one ends up with.
  const distColorByName = (() => {
    const names = [];
    const add = (n) => { const t = (n || '').trim(); if (t && names.indexOf(t) === -1) names.push(t); };
    (asIsFns || []).forEach(f => add(f.function_name));
    (fns || []).forEach(f => add(f.proposed_function_name));
    names.sort((a, b) => a.localeCompare(b));
    const map = {};
    names.forEach((n, i) => { map[n] = sliceColorAt(i); });
    map.__count = names.length;
    return map;
  })();
  const distColorFor = (name) => distColorByName[(name || '').trim()] || sliceColorAt(distColorByName.__count || 0);
  const pieOptions = {
    responsive: true,
    animation: { animateRotate: true, duration: 800 },
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11, family: 'Inter' }, boxWidth: 12, padding: 12, usePointStyle: true } },
      tooltip: { backgroundColor: 'rgba(17,24,39,0.9)', titleFont: { size: 12 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8 }
    },
    hover: { animationDuration: 300 }
  };

  const distPieOptions = {
    responsive: true,
    animation: { animateRotate: true, duration: 800 },
    plugins: {
      legend: { position: 'right', labels: { font: { size: 14, family: 'Inter' }, boxWidth: 18, padding: 16, usePointStyle: true } },
      tooltip: { backgroundColor: 'rgba(17,24,39,0.9)', titleFont: { size: 14 }, bodyFont: { size: 14 }, padding: 12, cornerRadius: 8 }
    },
    hover: { animationDuration: 300 }
  };

  const emptyMsgDefault = 'No data available for this workshop.';
  const emptyMsgFiltered = 'No child units found under the selected parent structure.';

  // Decision Distribution (TO-BE) — not part of the Parent Structure filter (separate section)
  const decisionCanvas = document.getElementById(chartPrefix + 'decisionPieChart');
  if (decisionCanvas) {
    registerChart(chartPrefix + 'decisionPieChart', new Chart(decisionCanvas, {
      type: 'pie',
      plugins: [pieLabelPlugin],
      data: { labels: ['INVEST','KEEP','OPTIMIZE','ELIMINATE'], datasets: [{ data: [inc.length, kp.length, opt.length, elm.length], backgroundColor: ['#16A34A','#EA580C','#0891B2','#DC2626'], hoverOffset: 8 }] },
      options: { ...pieOptions, plugins: { ...pieOptions.plugins, tooltip: { ...pieOptions.plugins.tooltip, callbacks: { label: (c) => `${c.label}: ${c.raw} (${((c.raw/totalF)*100).toFixed(1)}%)` } } } }
    }));
  }

  // Builds {labels, data, colors} for a Distribution Analysis pie, scoped to the immediate
  // children of the selected parent, plus a "Remaining" slice for whatever portion of the
  // parent's own total isn't accounted for by its children. When parentFilter is empty, the
  // parent is the Division itself (root-level items with no valid parent in this tree; the
  // baseline is the Division's own field passed as rootBaseline).
  const buildDistribution = (allItems, valueFn, labelFn, nameKey, rootBaseline) => {
    let children, baseline;
    if (parentFilter) {
      const parent = allItems.find(f => (f[nameKey] || '') === parentFilter);
      if (!parent) return { labels: [], data: [], colors: [] };
      children = allItems.filter(f => f.parent_id === parent.id);
      baseline = valueFn(parent) || 0;
    } else {
      const ids = new Set(allItems.map(f => f.id));
      children = allItems.filter(f => !f.parent_id || !ids.has(f.parent_id));
      baseline = rootBaseline || 0;
    }
    if (children.length === 0) return { labels: [], data: [], colors: [] };
    const labels = [], data = [], colors = [];
    let sum = 0;
    children.forEach(c => {
      const v = valueFn(c) || 0;
      if (v > 0) {
        const nm = labelFn(c);
        let col = distColorFor(nm);
        // Two slices of one pie never share a colour (e.g. two functions with the same name).
        let spare = (distColorByName.__count || 0) + 1;
        while (colors.includes(col)) col = sliceColorAt(spare++);
        labels.push(nm); data.push(v); colors.push(col); sum += v;
      }
    });
    const remaining = baseline - sum;
    if (remaining > 0.001) { labels.push('Remaining'); data.push(remaining); colors.push('#9ca3af'); }
    return { labels, data, colors };
  };

  const makeDistChart = (canvasId, dist) => {
    const canvas = document.getElementById(canvasId);
    const emptyEl = document.getElementById(canvasId + '-empty');
    if (!canvas) return;
    if (dist.data.length > 0) {
      canvas.classList.remove('hidden');
      if (emptyEl) emptyEl.classList.add('hidden');
      registerChart(canvasId, new Chart(canvas, {
        type: 'pie',
        plugins: [pieLabelPlugin],
        data: { labels: dist.labels, datasets: [{ data: dist.data, backgroundColor: dist.colors, hoverOffset: 8 }] },
        options: distPieOptions
      }));
    } else {
      canvas.classList.add('hidden');
      if (emptyEl) { emptyEl.textContent = parentFilter ? emptyMsgFiltered : emptyMsgDefault; emptyEl.classList.remove('hidden'); }
    }
  };

  // Top row: the workshop's own Proposed breakdown against Target — same for every workshop type
  // (an AS-IS Baseline workshop's functions carry real Proposed HC/Cost too, via the same Phase 3
  // cascade as a normal workshop). The AS-IS breakdown below (asIsHcPieChart/asIsBudgetPieChart)
  // covers the AS-IS side unconditionally, for every workshop type.
  makeDistChart(chartPrefix + 'hcPieChart',
    buildDistribution(fns, f => f.proposed_hc, f => f.proposed_function_name, 'proposed_function_name', div.headcount_target || 0));
  makeDistChart(chartPrefix + 'budgetPieChart',
    buildDistribution(fns, f => f.proposed_budget, f => f.proposed_function_name, 'proposed_function_name', div.budget_target || 0));
  makeDistChart(chartPrefix + 'asIsHcPieChart', buildDistribution(asIsFns, f => f.current_function_hc, f => f.function_name, 'function_name', div.current_total_hc || 0));
  makeDistChart(chartPrefix + 'asIsBudgetPieChart', buildDistribution(asIsFns, f => (f.managers_cost || 0) + (f.professionals_cost || 0), f => f.function_name, 'function_name', div.current_total_budget || 0));
}

// Builds a genuine parent-child tree diagram for the AS-IS function hierarchy. Reuses the same
// proven tree-layout engine renderOrgChart already uses for the TO-BE org chart (subtree-width
// DFS placement + SVG elbow connectors) instead of the previous rendering, which put every
// AS-IS function in one flat row under a synthetic root regardless of parent_id — silently
// discarding any real multi-level hierarchy. Kept as a fully separate function (not a shared
// refactor of renderOrgChart) so this fix can never affect the already-correct TO-BE chart.
function renderAsIsOrgChart(asIsFns, chartPrefix = '') {
  if (!asIsFns || asIsFns.length === 0) {
    return `<div class="oc-viewport"><p style="color:#9ca3af;font-size:13px;text-align:center;padding:40px 0;">No AS-IS functions to display</p></div>`;
  }

  // ── Layout constants (mirrors renderOrgChart's card sizing) ───────────────
  const NW  = 210;   // node card width
  const NH  = 100;   // node card height
  const RH  = 130;   // root card height
  const HG  = 48;    // horizontal gap between sibling subtree bounding boxes
  const VG  = 72;    // vertical gap between card bottom and next card top
  const PAD = 40;    // canvas padding on all sides

  // ── Build parent map from the real parent_id data (never from record order) ─
  const fnIds = new Set(asIsFns.map(f => f.id));
  const parentMap = {};
  fnIds.forEach(id => { parentMap[id] = []; });
  parentMap['asis-root'] = [];
  asIsFns.forEach(f => {
    const pid = (f.parent_id && fnIds.has(f.parent_id)) ? f.parent_id : 'asis-root';
    parentMap[pid].push(f);
  });

  // Own collapse-state set (never shared with the TO-BE org chart's window.orgCollapsedNodes) —
  // 'asis-root' is a valid key here too, so the root is collapsible like any other parent.
  if (!window.asIsOrgCollapsedNodes) window.asIsOrgCollapsedNodes = new Set();
  const collapsed = window.asIsOrgCollapsedNodes;

  // ── Subtree width calculator (memoised) ──────────────────────────────────
  const _swCache = {};
  function subtreeW(nodeId) {
    if (_swCache[nodeId] !== undefined) return _swCache[nodeId];
    if (collapsed.has(nodeId)) return (_swCache[nodeId] = NW);
    const children = parentMap[nodeId] || [];
    if (children.length === 0) return (_swCache[nodeId] = NW);
    const total = children.reduce((s, c) => s + subtreeW(c.id), 0);
    return (_swCache[nodeId] = Math.max(NW, total + HG * (children.length - 1)));
  }

  // ── Tree placement (DFS, accumulates nodes[] and lines[]) ────────────────
  const nodes = [];
  const lines = [];

  function placeNode(nodeId, leftX, topY, isRoot) {
    const sw      = subtreeW(nodeId);
    const centerX = leftX + sw / 2;
    const cardX   = centerX - NW / 2;
    const cardH   = isRoot ? RH : NH;

    nodes.push({ id: nodeId, x: cardX, y: topY, isRoot, cardH });

    // A collapsed node still renders itself (root always stays visible) — only its descendants
    // are hidden, and this branch alone shrinks back to a single card's width, never disturbing
    // any sibling branch's own layout.
    if (collapsed.has(nodeId)) return;
    const children = parentMap[nodeId] || [];
    if (children.length === 0) return;

    const parentBottomY = topY + cardH;
    const elbowY         = parentBottomY + VG / 2;
    const childTopY      = parentBottomY + VG;

    let cursor = leftX;
    const childCenters = children.map(child => {
      const csw = subtreeW(child.id);
      const cc  = cursor + csw / 2;
      cursor   += csw + HG;
      return cc;
    });

    lines.push({ x1: centerX, y1: parentBottomY, x2: centerX, y2: elbowY });
    if (children.length > 1) {
      lines.push({ x1: childCenters[0], y1: elbowY, x2: childCenters[childCenters.length - 1], y2: elbowY });
    }

    cursor = leftX;
    children.forEach((child, i) => {
      const csw = subtreeW(child.id);
      lines.push({ x1: childCenters[i], y1: elbowY, x2: childCenters[i], y2: childTopY });
      placeNode(child.id, cursor, childTopY, false);
      cursor += csw + HG;
    });
  }

  placeNode('asis-root', PAD, PAD, true);

  const maxRight  = nodes.reduce((m, n) => Math.max(m, n.x + NW), 0) + PAD;
  const maxBottom = nodes.reduce((m, n) => Math.max(m, n.y + n.cardH), 0) + PAD;

  const svgLines = lines.map(l =>
    `<line x1="${Math.round(l.x1)}" y1="${Math.round(l.y1)}" x2="${Math.round(l.x2)}" y2="${Math.round(l.y2)}" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>`
  ).join('');

  // Root-level only: a sub-function's HC is nested inside the parent it's grouped under, not
  // additive to it, so summing every function (parents + children) would double-count.
  const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
  const totalHC = rootAsIsFns.reduce((s, f) => s + (f.current_function_hc || 0), 0);
  const totalMgrs = rootAsIsFns.reduce((s, f) => s + (f.manager_count || 0), 0);
  const totalProfs = rootAsIsFns.reduce((s, f) => s + (f.current_employee_count || 0), 0);

  const nodeMap = Object.fromEntries(asIsFns.map(f => [f.id, f]));
  let cardsHtml = '';
  nodes.forEach(n => {
    const style = `position:absolute;left:${Math.round(n.x)}px;top:${Math.round(n.y)}px;width:${NW}px;min-width:${NW}px;max-width:${NW}px;`;
    if (n.isRoot) {
      const rootHasChildren = (parentMap['asis-root'] || []).length > 0;
      const rootCollapsed = collapsed.has('asis-root');
      cardsHtml += `<div class="oc-root-card" style="${style}">
        <div style="font-size:15px;font-weight:700;line-height:1.4;word-break:break-word;">Redesigned As-Is Org Chart</div>
        <div class="oc-root-badge">Root / Current Structure</div>
        <div class="oc-root-detail">
          <div>Total HC: ${formatNumber(totalHC)}</div>
          <div>Managers: ${formatNumber(totalMgrs)} | Professionals: ${formatNumber(totalProfs)}</div>
        </div>
        ${rootHasChildren ? `<div class="oc-toggle" onclick="app.toggleAsIsOrgNode('asis-root','${chartPrefix}')">${rootCollapsed ? '+' : '&minus;'}</div>` : ''}
      </div>`;
    } else {
      const f = nodeMap[n.id];
      if (!f) return;
      const mgr = f.manager_count || 0;
      const prof = f.current_employee_count || 0;
      const hasChildren = (parentMap[f.id] || []).length > 0;
      const isCollapsed = collapsed.has(f.id);
      cardsHtml += `<div class="oc-node-card" style="${style}">
        <div class="oc-node-name">${escHtml(f.function_name || 'Unnamed')}</div>
        <div class="oc-node-detail">Mgr: ${formatNumber(mgr)} | Prof: ${formatNumber(prof)}</div>
        ${hasChildren ? `<div class="oc-toggle" onclick="app.toggleAsIsOrgNode('${escHtml(f.id)}','${chartPrefix}')">${isCollapsed ? '+' : '&minus;'}</div>` : ''}
      </div>`;
    }
  });

  let html = `<div class="oc-wrap">`;
  html += `<div class="oc-viewport" onmousedown="app.startOrgPan(event)" onmousemove="app.doOrgPan(event)" onmouseup="app.endOrgPan(event)" onmouseleave="app.endOrgPan(event)">`;
  html += `<div class="oc-canvas" id="org-canvas" style="position:relative;width:${maxRight}px;height:${maxBottom}px;">`;
  html += `<svg style="position:absolute;top:0;left:0;width:${maxRight}px;height:${maxBottom}px;overflow:visible;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">${svgLines}</svg>`;
  html += cardsHtml;
  html += `</div>`;
  html += `</div>`;
  html += `<div class="oc-controls">`;
  html += `<button onclick="app.orgZoom(0.1)" aria-label="Zoom In" title="Zoom In">+</button>`;
  html += `<button onclick="app.orgZoom(-0.1)" aria-label="Zoom Out" title="Zoom Out">&minus;</button>`;
  html += `<button onclick="app.orgZoomResetCenter()" aria-label="Reset &amp; Center" title="Reset &amp; Center" style="font-size:12px;">&#8634;</button>`;
  html += `<button onclick="app.orgZoomReset()" aria-label="Actual Size (100%)" title="Actual Size (100%)">1:1</button>`;
  html += `</div>`;
  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════
// RENDER: HISTORY PAGE
// ═══════════════════════════════════════════
function renderHistory() {
  const div = getDivs().find(d => d.id === state.selectedDivisionId);
  if (!div) return;
  const ws = getWs().filter(w => w.division_id === div.id && w.status === 'completed').sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  document.getElementById('history-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-5xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.goToWorkspace()">${ICONS.arrowLeft}</button>
      <h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">${escHtml(div.structure_name)} &mdash; Previous Workshops</h1>
    </div>`;

  if (ws.length === 0) {
    document.getElementById('history-content').innerHTML = `<div class="text-center py-12"><div style="margin-bottom:12px;">${ICONS.history}</div><p style="color:#6b7280;">No completed workshops yet</p></div>`;
    return;
  }

  let html = `<div class="space-y-4">`;
  ws.forEach(w => {
    const dt = new Date(w.completed_at || w.created_at);
    const fns = getFns().filter(f => f.workshop_id === w.id);
    // Root-level totals only (calculateProposedHeadcount/Budget already filter out children,
    // whose proposed_hc/proposed_budget is carved out of the parent's, not additive to it) —
    // summing every function here would double-count.
    const totalHC = calculateProposedHeadcount(w.id);
    const totalBudget = calculateProposedBudget(w.id);
    const isSubmitted = !!w.submitted_for_hr_review_at;

    html += `<div class="zbod-card p-5 flex items-center justify-between zbod-card-hover" style="cursor:pointer;" onclick="app.viewHistoryWorkshop('${escHtml(w.id)}')">
      <div class="flex items-center gap-4">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, rgba(46,100,44,0.1) 0%, rgba(15,52,76,0.1) 100%);display:flex;align-items:center;justify-content:center;">${ICONS.calendar}</div>
        <div>
          <div class="flex items-center gap-2">
            <h3 style="font-family:'Montserrat',sans-serif;font-weight:600;color:#111827;">Workshop #${w.id.slice(0,8)}</h3>
            ${isSubmitted ? `<span class="hr-status-badge hr-status-badge--submitted" style="font-size:10px;padding:3px 10px;">${ICONS.checkCircle} Submitted for HR Review</span>` : ''}
          </div>
          <p style="font-size:13px;color:#6b7280;">${dt.toLocaleDateString()} &mdash; ${dt.toLocaleTimeString()}</p>
          <p style="font-size:11px;color:#16A34A;margin-top:4px;">${fns.length} functions | HC: ${formatNumber(totalHC)} | Budget: ${formatNumber(totalBudget)} AZN</p>
        </div>
      </div>
      ${ICONS.chevronRight}
    </div>`;
  });
  html += `</div>`;
  document.getElementById('history-content').innerHTML = html;
}

// ═══════════════════════════════════════════
// RENDER: HISTORY REVIEW PAGE
// ═══════════════════════════════════════════
function renderHistoryReview() {
  const ws = getWs().find(w => w.id === state.selectedHistoryWorkshopId);
  if (!ws) return;
  const div = divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
  if (!div) return;
  const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
  const asIsFns = getWorkshopAsIs(ws);

  const isSubmitted = !!ws.submitted_for_hr_review_at;
  document.getElementById('history-review-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-screen-2xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.goToHistory()">${ICONS.arrowLeft}</button>
      <div class="flex-1 flex items-center gap-3"><div style="width:32px;height:32px;border-radius:8px;background:rgba(46,100,44,0.1);display:flex;align-items:center;justify-content:center;">${ICONS.history}</div><h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">Workshop from ${new Date(ws.completed_at || ws.created_at).toLocaleDateString()} ${new Date(ws.completed_at || ws.created_at).toLocaleTimeString()}</h1>${isSubmitted ? `<span class="hr-status-badge hr-status-badge--submitted">${ICONS.checkCircle} Submitted for HR Review</span>` : ''}</div>
      ${isSubmitted ? `<button class="zbod-btn-primary" style="padding:8px 16px;font-size:12px;" onclick="app.goToHRReview()">${ICONS.eye} View HR Submission</button>` : ''}
    </div>`;

  // Destroy old charts before injecting HTML to prevent Chart.js canvas conflicts
  destroyAllDashboardCharts();
  state.dashboardParentFilter = '';
  const dash = buildDashboardHTML(ws, div, fns, asIsFns, 'hist_');
  document.getElementById('history-review-content').innerHTML = dash.html;
  requestAnimationFrame(() => renderDashboardCharts(dash.inc, dash.kp, dash.opt, dash.elm, dash.fns, asIsFns, div, 'hist_', state.dashboardParentFilter, ws));
}


// ═══════════════════════════════════════════
// RENDER: HR REVIEW SUBMISSION PAGE
// ═══════════════════════════════════════════
function renderHRReview() {
  const ws = getWs().find(w => w.id === state.selectedHistoryWorkshopId);
  if (!ws) {
    document.getElementById('hr-review-content').innerHTML = `<div class="text-center py-12"><p style="color:#6b7280;">No workshop data found.</p><button onclick="app.goToWorkspace()" class="zbod-btn-primary mt-4">Return to Workplace</button></div>`;
    return;
  }
  const div = getDivs().find(d => d.id === ws.division_id);
  if (!div) {
    document.getElementById('hr-review-content').innerHTML = `<div class="text-center py-12"><p style="color:#6b7280;">No division data found.</p><button onclick="app.goToWorkspace()" class="zbod-btn-primary mt-4">Return to Workplace</button></div>`;
    return;
  }
  const fns = freshWorkshopFns(ws);
  const totalToBeHC = calculateProposedHeadcount(ws.id);
  const totalToBeBudget = calculateProposedBudget(ws.id);
  // Root-level only — see calculateWorkshopAllocationTotals; a child's counts are carved out of
  // its parent's, not additive.
  const fnIds = new Set(fns.map(f => f.id));
  const rootFns = fns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
  const totalToBeMgrs = rootFns.reduce((s, f) => s + (f.manager_count || 0), 0);
  const totalToBeProfs = rootFns.reduce((s, f) => s + (f.professional_count || 0), 0);
  const wsDate = ws.completed_at ? new Date(ws.completed_at).toLocaleDateString() : new Date(ws.created_at).toLocaleDateString();

  document.getElementById('hr-review-header').innerHTML = `
    <div class="flex items-center gap-4 max-w-3xl mx-auto">
      <button class="zbod-btn-secondary" style="padding:10px 14px;" onclick="app.goToWorkspace()">${ICONS.arrowLeft}</button>
      <h1 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:18px;color:#111827;">HR Review Submission</h1>
    </div>`;

  document.getElementById('hr-review-content').innerHTML = `
    <div class="text-center mb-8">
      <div class="hr-success-icon">${ICONS.checkCircle}</div>
      <h2 style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:32px;color:#111827;margin-bottom:8px;">Workshop Submitted Successfully</h2>
      <p style="font-size:15px;color:#6b7280;max-width:480px;margin:0 auto;line-height:1.6;">The workshop has been finalized successfully. All submitted data will now be reviewed by the HR team for further analysis and validation.</p>
    </div>

    <div class="hr-status-badge hr-status-badge--submitted mb-6" style="display:flex;justify-content:center;">
      <span style="display:inline-flex;align-items:center;gap:6px;">${ICONS.checkCircle} Submitted for HR Review</span>
    </div>

    <div class="hr-summary-card mb-8">
      <h3 style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;color:#0F3C76;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Workshop Summary</h3>
      <div class="hr-summary-row"><span class="hr-summary-label">Structure Name</span><span class="hr-summary-value">${escHtml(div.structure_name || '-')}</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Structure Type</span><span class="hr-summary-value">${escHtml(div.structure_type || '-')}</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Workshop Date</span><span class="hr-summary-value">${wsDate}</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Proposed HC</span><span class="hr-summary-value" style="color:#16A34A;">${formatNumber(totalToBeHC)}</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Proposed Cost</span><span class="hr-summary-value" style="color:#16A34A;">${formatNumber(totalToBeBudget)} AZN</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Proposed Managers</span><span class="hr-summary-value">${formatNumber(totalToBeMgrs)}</span></div>
      <div class="hr-summary-row"><span class="hr-summary-label">Proposed Professionals</span><span class="hr-summary-value">${formatNumber(totalToBeProfs)}</span></div>
    </div>

    <div class="flex flex-col gap-3">
      <button onclick="app.exportToExcel()" class="zbod-btn-export" style="width:100%;justify-content:center;">${ICONS.download} Export Report</button>
      <button onclick="app.goToWorkspace()" class="zbod-btn-secondary" style="width:100%;justify-content:center;padding:14px 32px;">${ICONS.home} Return to Workplace</button>
      <button onclick="app.viewHistoryWorkshop('${escHtml(ws.id)}')" class="zbod-btn-primary" style="width:100%;justify-content:center;padding:14px 32px;">${ICONS.activity} View Workshop Summary</button>
    </div>
  `;
}


// ═══════════════════════════════════════════
// CONTEXT MENU (reusable — positioned next to cursor)
// ═══════════════════════════════════════════
function showContextMenu(x, y, items) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = items.map(item =>
    `<button type="button" class="zbod-context-menu-item${item.danger ? ' zbod-context-menu-item-danger' : ''}" onclick="closeContextMenu();${item.onclick}">${item.label}</button>`
  ).join('');
  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  menu.style.left = Math.max(8, Math.min(x, maxX)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, maxY)) + 'px';
}
function closeContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.classList.add('hidden');
}

// ═══════════════════════════════════════════
// CONFIRM DIALOG (reusable)
// ═══════════════════════════════════════════
function showConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirmAttr }) {
  document.getElementById('confirm-dialog-title').innerText = title;
  document.getElementById('confirm-dialog-body').innerText = message;
  document.getElementById('confirm-dialog-buttons').innerHTML =
    `<button class="zbod-btn-secondary flex-1" onclick="hideConfirmDialog()">${cancelLabel}</button>
     <button class="${danger ? 'zbod-btn-danger' : 'zbod-btn-primary'} flex-1" onclick="hideConfirmDialog();${onConfirmAttr}">${confirmLabel}</button>`;
  document.getElementById('confirm-dialog').classList.remove('hidden');
}
function hideConfirmDialog() {
  document.getElementById('confirm-dialog').classList.add('hidden');
}

// ═══════════════════════════════════════════
// FIELD HELP POPOVER (reusable — a small "?" icon anchored inside any input,
// opening a Q&A popover next to it. `renderFieldHelp` only renders the icon; the popover
// itself is a single shared element living at the top level of the DOM (#field-help-popover
// in index.html, a sibling of <body>'s other page content, outside every card) so it is never
// clipped by an ancestor's overflow or containing-block-creating properties (e.g. a
// .zbod-card's backdrop-filter). `id` must be unique per field instance, e.g. derived from a
// record id; its Q&A content is kept in fieldHelpRegistry and swapped into the shared popover
// on open.
// ═══════════════════════════════════════════
const FUNCTION_NAME_HELP_QA = [
  { q: 'What should I write in this field?', a: 'Please write the name of the future function/capability you believe should exist in the future structure.' },
  { q: 'Should I list current or future functions?', a: 'The "Function" field should mainly reflect the future/proposed structure. If a current function will remain relevant in the future structure, you may keep the same function name. If not, you should write the future function name you would create from a zero-based perspective.' },
];

const PHASE2_SCORE_GUIDE_QA = [
  { q: 'How do my answers to Q1 and Q2 determine the ZBOD decision?', a: 'Your answers to Q1 and Q2 are combined into a business-impact result, which is then linked to the relevant ZBOD decision: whether the function should be invested in, kept, optimized/automated, outsourced, or eliminated.' },
];

const LAYER_GUIDE_QA = [
  { q: 'Senior Management', a: 'Strategic leadership and executive oversight.' },
  { q: 'Middle Management', a: 'Department heads and operational management.' },
  { q: 'Lower Management', a: 'Team leads and front-line supervision.' },
];

// Q1 and Q2 each have their own five-step scale. The stored number (1-5) is what drives the ZBOD
// decision (see computePhase2Decision) and is never shown; users only see the label text, in the
// dropdown, the "?" help popover and the Excel export.
const IMPACT_Q1_HELP_QA = [
  { q: 'No Value', a: 'This function has no clear connection to business strategy or key outcomes, creates no measurable impact, and the business can operate the same without it.' },
  { q: 'Very Limited Value', a: 'This function has only indirect or localized impact, is not scalable or strategic, and contributes minimally to efficiency or outcomes.' },
  { q: 'Moderate Value', a: 'This function supports specific business objectives and delivers real but limited improvements, making it useful but not critical.' },
  { q: 'Strong Value', a: 'This function significantly contributes to key business outcomes and plays an important, scalable role in efficiency, revenue, or automation.' },
  { q: 'Critical Value', a: 'This function is a core component of business strategy and is essential for scalable value creation, without which strategic execution is severely constrained.' },
];
const IMPACT_Q2_HELP_QA = [
  { q: 'No Impact', a: 'Stopping this function would cause no meaningful legal, financial, regulatory, reputational, or operational impact, and business continuity would not be affected.' },
  { q: 'Minor Impact', a: 'Stopping this function would cause minor, manageable disruptions or risks, with limited impact on operations or controls and no serious legal or regulatory consequences.' },
  { q: 'Moderate Impact', a: 'Stopping this function would create noticeable operational disruption or risk exposure that requires management attention, but the business could continue operating in the short term.' },
  { q: 'High Impact', a: 'Stopping this function would cause significant operational disruption or material risk, potentially leading to financial loss, compliance issues, or reputational damage.' },
  { q: 'Critical Impact', a: 'Stopping this function would severely disrupt business continuity and expose the organization to major legal, regulatory, financial, or reputational risks that could threaten the business.' },
];

// [stored value, label, description]. The number drives the ZBOD decision and is never shown.
const IMPACT_SCALE_Q1 = IMPACT_Q1_HELP_QA.map((h, i) => [i + 1, h.q, h.a]);
const IMPACT_SCALE_Q2 = IMPACT_Q2_HELP_QA.map((h, i) => [i + 1, h.q, h.a]);

const IMPACT_QUESTIONS = [
  { key: 'question1_score', label: 'Q1',
    text: 'Does this function materially contribute to business strategy and outcomes, and enable scalable, efficient value creation (e.g. revenue, productivity, customer experience, automation)?',
    scale: IMPACT_SCALE_Q1 },
  { key: 'question2_score', label: 'Q2',
    text: 'How critical is this function to business continuity and risk management, and what would be the impact if it were stopped today (legal, financial, regulatory, reputational, operational)?',
    scale: IMPACT_SCALE_Q2 },
];

// The answer statement behind a stored Q1/Q2 value; the number itself is never shown to users.
function impactAnswer(key, val) {
  const q = IMPACT_QUESTIONS.find(x => x.key === key);
  const hit = q && q.scale.find(([sc]) => String(sc) === String(val));
  return hit ? hit[1] : '';
}

const HC_ALLOCATION_HELP_QA = [
  { q: 'What does HC allocation mean?', a: 'It shows what percentage of the available headcount you would allocate to each proposed function. It is about people/FTE distribution.' },
];

const COST_ALLOCATION_HELP_QA = [
  { q: 'What does cost allocation mean?', a: 'It shows what percentage of the available employee cost or budget you would allocate to each proposed function. It is about cost/budget distribution.' },
];

const HC_COST_ALLOCATION_TITLE_HELP_QA = [
  { q: 'What is the difference between HC Allocation and Cost Allocation?', a: 'HC Allocation shows how many people should be assigned to a function. Cost Allocation shows how much budget should be assigned to that function. These two may be different.' },
];

const PEOPLE_ALLOCATION_HELP_QA = [
  { q: 'What should I write under "Managers" & "Professionals"?', a: 'Please indicate how the proposed headcount should be split between managerial roles and professionals/specialist roles within each proposed function.' },
];

const AS_IS_BASELINE_HELP_QA = [
  { q: 'What is the purpose of this section?', a: 'This section shows the existing structure, current headcount, current cost, and current manager/professional split. It is only a reference for comparison with the proposed structure.' },
];

const fieldHelpRegistry = {};

function renderFieldHelp(id, qaPairs) {
  fieldHelpRegistry[id] = qaPairs;
  return `<button type="button" class="zbod-help-icon-btn" onclick="event.stopPropagation();app.toggleFieldHelp('${escHtml(id)}', this)" aria-label="Help" aria-haspopup="true" aria-expanded="false" aria-describedby="field-help-popover">?</button>`;
}

function closeAllFieldHelpPopovers() {
  const popover = document.getElementById('field-help-popover');
  if (!popover) return;
  if (popover._anchorEl && popover._anchorEl.isConnected) popover._anchorEl.setAttribute('aria-expanded', 'false');
  popover.classList.add('hidden');
  popover._openId = null;
  popover._anchorEl = null;
}

// Opens the shared popover beside `anchorEl` (the help icon): to the right by default, flipping
// to the left only when the right side doesn't have room. Vertically centered on the icon,
// clamped to stay fully inside the viewport on every axis. The connecting arrow is repositioned
// to track the icon's actual vertical offset within the (possibly clamped) popover.
function showFieldHelpPopover(id, anchorEl) {
  const popover = document.getElementById('field-help-popover');
  if (!popover) return;
  if (!anchorEl || !anchorEl.isConnected) { closeAllFieldHelpPopovers(); return; }
  const body = document.getElementById('field-help-popover-body');
  const qaPairs = fieldHelpRegistry[id] || [];
  body.innerHTML = qaPairs.map(qa => `<div class="zbod-help-popover__item"><p class="zbod-help-popover__q">${qa.q}</p><p class="zbod-help-popover__a">${qa.a}</p></div>`).join('');
  popover._openId = id;
  popover._anchorEl = anchorEl;
  anchorEl.setAttribute('aria-expanded', 'true');

  popover.classList.remove('hidden');
  popover.style.visibility = 'hidden'; // measure/position before it's visible, so there's no flash at the wrong spot
  const arrow = popover.querySelector('.zbod-help-popover__arrow');
  const anchorRect = anchorEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const gap = 10;
  const margin = 8;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const fitsRight = anchorRect.right + gap + popRect.width <= vw - margin;
  const side = fitsRight ? 'right' : 'left';
  let left = side === 'right' ? anchorRect.right + gap : anchorRect.left - gap - popRect.width;
  left = Math.max(margin, Math.min(left, vw - margin - popRect.width));
  popover.classList.toggle('zbod-help-popover--right', side === 'right');
  popover.classList.toggle('zbod-help-popover--left', side === 'left');

  let top = anchorRect.top + anchorRect.height / 2 - popRect.height / 2;
  top = Math.max(margin, Math.min(top, vh - margin - popRect.height));

  popover.style.left = left + 'px';
  popover.style.top = top + 'px';

  if (arrow) {
    const iconCenterY = anchorRect.top + anchorRect.height / 2;
    const arrowTop = Math.max(12, Math.min(popRect.height - 12, iconCenterY - top - 5));
    arrow.style.top = arrowTop + 'px';
  }

  popover.style.visibility = '';
}

// ═══════════════════════════════════════════
// APP CONTROLLER
// ═══════════════════════════════════════════
const app = {

  // === NAVIGATION ===
  goToLanding() { showPage('landing'); renderLanding(); },
  goToDivisions() { showPage('divisions'); renderDivisions(); },
  // Admin reaches the Divisions page the same way a regular account does
  // (the landing hero's own "Start Workshop" button, already rendered into
  // Admin Panel's shared landing content) -- getVisibleDivs() shows admin
  // every structure, not just their own. Back needs to return to wherever
  // that account actually came from, not always Landing.
  backFromDivisions() { isCurrentUserAdmin() ? this.goToAdmin() : this.goToLanding(); },
  searchDivisions(query) { renderDivisions(query); },
  goToWorkspace() { showPage('workspace'); renderWorkspace(); },
  goToHistory() { showPage('history'); renderHistory(); },
  goToHRReview() {
    const wsId = state.selectedWorkshopId || state.selectedHistoryWorkshopId;
    const w = getWs().find(x => x.id === wsId);
    const d = w && getDivs().find(x => x.id === w.division_id);
    if (!w || !d || !canAccessDivision(d)) { toast('You do not have access to this workshop', { type: 'error' }); return; }
    showPage('hr-review'); renderHRReview();
  },

  verifyAndSelectDivision(id) {
    const div = getDivs().find(d => d.id === id);
    if (!div) return;
    // Defense in depth: renderDivisions() already only lists structures this
    // account can see, so this only matters against a manipulated/stale id,
    // but the guard belongs at the actual entry point, not just in what gets
    // listed.
    if (!canAccessDivision(div)) { toast('You do not have access to this structure', { type: 'error' }); return; }
    if (!div.division_password_temp) { this.selectDivision(id); return; }
    state._passwordTargetId = id;
    document.getElementById('password-verification-dialog').classList.remove('hidden');
    document.getElementById('password-verification-errors').innerHTML = '';
    document.getElementById('structure-password-input').value = '';
  },

  hidePasswordModal() {
    document.getElementById('password-verification-dialog').classList.add('hidden');
    state._passwordTargetId = null;
  },

  submitPassword() {
    const input = document.getElementById('structure-password-input').value;
    const id = state._passwordTargetId;
    if (!id) return;
    const div = getDivs().find(d => d.id === id);
    if (!div) return;
    if (input === div.division_password_temp) {
      document.getElementById('password-verification-dialog').classList.add('hidden');
      state._passwordTargetId = null;
      this.selectDivision(id);
    } else {
      document.getElementById('password-verification-errors').innerHTML = 'Incorrect password. Please try again.';
    }
  },

  // === RESET PASSWORD FLOW ===
  // The structure password is reset by who you are, not by a code: the reset code used to be a fixed
  // string in this public file, so anyone could read it. Only the structure's owner or an admin may
  // set a new one (the same accounts the database lets write the structure).
  showResetPassword() {
    const div = state._passwordTargetId && getDivs().find(d => d.id === state._passwordTargetId);
    if (!canWriteDivision(div)) {
      document.getElementById('password-verification-errors').innerHTML = 'Only the structure owner or an administrator can reset its password.';
      return;
    }
    document.getElementById('password-verification-dialog').classList.add('hidden');
    document.getElementById('new-password-dialog').classList.remove('hidden');
    document.getElementById('new-password-errors').innerHTML = '';
    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-new-password-input').value = '';
  },

  hideResetCodeModal() {
    document.getElementById('reset-code-dialog').classList.add('hidden');
    document.getElementById('password-verification-dialog').classList.remove('hidden');
    document.getElementById('reset-code-input').value = '';
    document.getElementById('reset-code-errors').innerHTML = '';
  },

  submitResetCode() { this.showResetPassword(); },

  hideNewPasswordModal() {
    document.getElementById('new-password-dialog').classList.add('hidden');
    document.getElementById('password-verification-dialog').classList.remove('hidden');
    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-new-password-input').value = '';
    document.getElementById('new-password-errors').innerHTML = '';
  },

  saveNewPassword() {
    const newPw = document.getElementById('new-password-input').value;
    const confirmPw = document.getElementById('confirm-new-password-input').value;
    const id = state._passwordTargetId;

    let error = '';
    if (!newPw) error = 'New Password is required.';
    else if (!confirmPw) error = 'Confirm New Password is required.';
    else if (newPw.length < 6) error = 'Password must be at least 6 characters.';
    else if (newPw !== confirmPw) error = 'Passwords do not match.';

    if (error) {
      document.getElementById('new-password-errors').innerHTML = error;
      return;
    }

    // The reset code alone must not be enough to rewrite a structure you have no access to.
    const targetDiv = id && getDivs().find(d => d.id === id);
    if (!targetDiv || !canWriteDivision(targetDiv)) {
      document.getElementById('new-password-errors').innerHTML = 'You do not have access to this structure.';
      return;
    }
    updDiv(id, { division_password_temp: newPw });

    document.getElementById('new-password-dialog').classList.add('hidden');
    document.getElementById('password-verification-dialog').classList.remove('hidden');
    document.getElementById('structure-password-input').value = '';
    document.getElementById('password-verification-errors').innerHTML = '';
    state._passwordTargetId = id;

    document.getElementById('new-password-input').value = '';
    document.getElementById('confirm-new-password-input').value = '';
    document.getElementById('new-password-errors').innerHTML = '';

    toast('Password has been reset successfully.');
  },

  // The ownership check lives here rather than only in verifyAndSelectDivision, so it also covers
  // a direct call with an id read out of the (anon-readable) divisions table.
  selectDivision(id) {
    const div = getDivs().find(d => d.id === id);
    if (!div || !canAccessDivision(div)) { toast('You do not have access to this structure', { type: 'error' }); return; }
    state.selectedDivisionId = id; state.editingDivision = false; state._divEditForm = null;
    state.asIsNewRows = []; state.asIsEditing = {}; state.asIsSaved = false; state.metricsSaved = false;
    state.aaaEditCardIdx = null;
    showPage('workspace'); renderWorkspace();
  },

  // === LANDING PAGE EDIT (SIMPLIFIED - OVERVIEW ONLY) ===
  editLanding() {
    const defaultContent = {
      overviewTitle: 'What is Zero-Based Organizational Design?',
      overviewText: 'Zero-Based Organizational Design (ZBOD) is a comprehensive methodology for building organizational structures from the ground up. Rather than making incremental changes to existing structures, ZBOD enables organizations to strategically rethink and redesign their entire operating model to align with business priorities.',
    };
    const content = {...defaultContent, ...lsGet(LS.landing, {})};
    state.landingEditing = 'overview';
    state.landingDrafts = { overviewTitle: content.overviewTitle, overviewText: content.overviewText };
    renderLanding();
  },

  editGuideline() {
    const guidelineDefaults = [
      { id: 'gl1', iconKey: 'compass',  title: 'STARTING POINT',  text: 'Set the current organizational structure completely aside; redesign from zero. Primary focus: revisit and redesign the organization based on strategy and business priorities.' },
      { id: 'gl2', iconKey: 'target',   title: 'VALUE FOCUS',     text: 'Identify only functions that create measurable value. The argument "it existed before" is not valid. Remove low-value activities.' },
      { id: 'gl3', iconKey: 'userCog',  title: 'FUNCTIONS',       text: 'Design functions that add value to the business. Ask yourself: Can this function be eliminated? Can it be automated? Can it be outsourced? Only create the function if the answer to all three questions is "no" (business justification needed). Shadow support activities should be automated, outsourced, or eliminated.' },
      { id: 'gl4', iconKey: 'users',    title: 'MANAGEMENT',      text: 'Minimize the number of management layers. Do not create deputy / deputy-of-deputy structures. Target 8\u201312 direct reports per manager to ensure an effective span of control. Deploy human resources in the functions that deliver the highest business value.' },
      { id: 'gl5', iconKey: 'userCheck',title: 'PEOPLE QUALITY',  text: 'Aim to work with a small but highly talented team. Automate or outsource low-grade work. Always consider optimization targets and size the team accordingly.' },
      { id: 'gl6', iconKey: 'layers',   title: 'PROCESSES',       text: 'Eliminate or simplify manual and complex processes. Job = end-to-end accountability. Redesign processes based on newly created functions. For every process, automation, AI, and RPA should be top priorities.' },
      { id: 'gl7', iconKey: 'dollar',   title: 'COST & CAPITAL',  text: 'Every function must have a clear cost vs. value justification.' },
    ];
    const savedGuidelines = lsGet('zbod_guidelines', null);
    const guidelineData = savedGuidelines && Array.isArray(savedGuidelines) ? savedGuidelines : guidelineDefaults;
    const guidelineTitle = lsGet('zbod_guideline_title', 'ZBOD GUIDELINE');
    state.landingEditing = 'guideline';
    state.landingDrafts = { guidelineTitle };
    guidelineData.forEach((g, i) => {
      state.landingDrafts[`gl_title_${i}`] = g.title;
      state.landingDrafts[`gl_text_${i}`] = g.text;
    });
    renderLanding();
  },

  saveGuideline() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const guidelineDefaults = [
      { id: 'gl1', iconKey: 'compass',  title: 'STARTING POINT',  text: 'Set the current organizational structure completely aside; redesign from zero. Primary focus: revisit and redesign the organization based on strategy and business priorities.' },
      { id: 'gl2', iconKey: 'target',   title: 'VALUE FOCUS',     text: 'Identify only functions that create measurable value. The argument "it existed before" is not valid. Remove low-value activities.' },
      { id: 'gl3', iconKey: 'userCog',  title: 'FUNCTIONS',       text: 'Design functions that add value to the business. Ask yourself: Can this function be eliminated? Can it be automated? Can it be outsourced? Only create the function if the answer to all three questions is "no" (business justification needed). Shadow support activities should be automated, outsourced, or eliminated.' },
      { id: 'gl4', iconKey: 'users',    title: 'MANAGEMENT',      text: 'Minimize the number of management layers. Do not create deputy / deputy-of-deputy structures. Target 8\u201312 direct reports per manager to ensure an effective span of control. Deploy human resources in the functions that deliver the highest business value.' },
      { id: 'gl5', iconKey: 'userCheck',title: 'PEOPLE QUALITY',  text: 'Aim to work with a small but highly talented team. Automate or outsource low-grade work. Always consider optimization targets and size the team accordingly.' },
      { id: 'gl6', iconKey: 'layers',   title: 'PROCESSES',       text: 'Eliminate or simplify manual and complex processes. Job = end-to-end accountability. Redesign processes based on newly created functions. For every process, automation, AI, and RPA should be top priorities.' },
      { id: 'gl7', iconKey: 'dollar',   title: 'COST & CAPITAL',  text: 'Every function must have a clear cost vs. value justification.' },
    ];
    const savedGuidelines = lsGet('zbod_guidelines', null);
    const guidelineData = savedGuidelines && Array.isArray(savedGuidelines) ? [...savedGuidelines] : guidelineDefaults;

    if (state.landingDrafts.guidelineTitle) {
      lsSet('zbod_guideline_title', state.landingDrafts.guidelineTitle);
    }
    guidelineData.forEach((g, i) => {
      if (state.landingDrafts[`gl_title_${i}`] !== undefined) g.title = state.landingDrafts[`gl_title_${i}`];
      if (state.landingDrafts[`gl_text_${i}`] !== undefined) g.text = state.landingDrafts[`gl_text_${i}`];
    });
    lsSet('zbod_guidelines', guidelineData);

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        if (state.landingDrafts.guidelineTitle) {
          window.zbodSupabase.sbSaveLandingBox({
            box_id: 'guideline_title',
            position_order: 0,
            title: state.landingDrafts.guidelineTitle,
            content: '',
          });
        }
        guidelineData.forEach((g, i) => {
          window.zbodSupabase.sbSaveLandingBox({
            box_id: g.id,
            position_order: i + 1,
            title: g.title,
            content: g.text,
          });
        });
      } catch (e) { console.warn('Supabase guideline sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Guideline saved');
  },

  cancelGuidelineEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editBenefits() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    state.landingEditing = 'benefits';
    state.landingDrafts = { benefits_title: getBenefitsTitle() };
    getBenefits().forEach((b, i) => {
      state.landingDrafts[`bf_title_${i}`] = b.title;
      state.landingDrafts[`bf_text_${i}`] = b.text;
    });
    renderLanding();
  },

  saveBenefits() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const items = getBenefits().map((b, i) => {
      const t = state.landingDrafts[`bf_title_${i}`];
      const x = state.landingDrafts[`bf_text_${i}`];
      return { ...b, title: (t !== undefined && t.trim()) ? t.trim() : b.title, text: x !== undefined ? x.trim() : b.text };
    });
    const draftTitle = state.landingDrafts['benefits_title'];
    const title = (draftTitle !== undefined && draftTitle.trim()) ? draftTitle.trim() : getBenefitsTitle();
    lsSet('zbod_benefits', items);
    lsSet('zbod_benefits_title', title);

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({ box_id: 'benefits_title', position_order: 649, title, content: '' });
        items.forEach((b, i) => {
          window.zbodSupabase.sbSaveLandingBox({ box_id: b.id, position_order: 650 + i, title: b.title, content: b.text });
        });
      } catch (e) { console.warn('Supabase benefits sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Key benefits saved');
  },

  cancelBenefitsEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editProblems() {
    const problemsDefaults = [
      'Too many management layers',
      'Decentralized and duplicated functions',
      'Low span of control',
      'Low-grade employees',
      'Shadow Support Functions',
      'Complex, manual-based processes and jobs',
      'Multi-layered deputy hierarchy',
    ];
    const savedProblems = lsGet('zbod_problems', null);
    const problemsData = savedProblems && Array.isArray(savedProblems) ? savedProblems : problemsDefaults;
    const problemsTitleDefault = 'PROBLEM STATEMENT';
    const savedProblemsTitle = lsGet('zbod_problems_title', null);
    const problemsTitle = savedProblemsTitle !== null ? savedProblemsTitle : problemsTitleDefault;
    state.landingEditing = 'problems';
    state.landingDrafts = { problems_title: problemsTitle };
    problemsData.forEach((t, i) => {
      state.landingDrafts[`pr_text_${i}`] = t;
    });
    renderLanding();
  },

  saveProblems() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const problemsDefaults = [
      'Too many management layers',
      'Decentralized and duplicated functions',
      'Low span of control',
      'Low-grade employees',
      'Shadow Support Functions',
      'Complex, manual-based processes and jobs',
      'Multi-layered deputy hierarchy',
    ];
    const savedProblems = lsGet('zbod_problems', null);
    const problemsData = savedProblems && Array.isArray(savedProblems) ? [...savedProblems] : [...problemsDefaults];
    problemsData.forEach((t, i) => {
      if (state.landingDrafts[`pr_text_${i}`] !== undefined) problemsData[i] = state.landingDrafts[`pr_text_${i}`];
    });
    lsSet('zbod_problems', problemsData);
    if (state.landingDrafts['problems_title'] !== undefined) {
      lsSet('zbod_problems_title', state.landingDrafts['problems_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'problems',
          position_order: 99,
          title: state.landingDrafts['problems_title'] || 'Problem Statement',
          content: JSON.stringify(problemsData),
        });
      } catch (e) { console.warn('Supabase problems sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Problem statement saved');
  },

  cancelProblemsEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editQuestions() {
    const questionsDefaults = [
      { id: 'mq1', label: 'MQ1', text: "Let's assume we are building the structure from scratch. According to your vision, which business functions must be created in order to add value to the business?" },
      { id: 'mq2', label: 'MQ2', text: 'To what degree is it possible to automate or outsource the proposed function?' },
      { id: 'mq3', label: 'MQ3', text: 'Is there any function that is currently being overlooked or ignored?' },
    ];
    const savedQuestions = lsGet('zbod_questions', null);
    const questionsData = savedQuestions && Array.isArray(savedQuestions) ? savedQuestions : questionsDefaults;
    const questionsTitleDefault = 'MAIN QUESTIONS';
    const savedQuestionsTitle = lsGet('zbod_questions_title', null);
    const questionsTitle = savedQuestionsTitle !== null ? savedQuestionsTitle : questionsTitleDefault;
    state.landingEditing = 'questions';
    state.landingDrafts = { questions_title: questionsTitle };
    questionsData.forEach((q, i) => {
      state.landingDrafts[`mq_label_${i}`] = q.label;
      state.landingDrafts[`mq_text_${i}`] = q.text;
    });
    renderLanding();
  },

  saveQuestions() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const questionsDefaults = [
      { id: 'mq1', label: 'MQ1', text: "Let's assume we are building the structure from scratch. According to your vision, which business functions must be created in order to add value to the business?" },
      { id: 'mq2', label: 'MQ2', text: 'To what degree is it possible to automate or outsource the proposed function?' },
      { id: 'mq3', label: 'MQ3', text: 'Is there any function that is currently being overlooked or ignored?' },
    ];
    const savedQuestions = lsGet('zbod_questions', null);
    const questionsData = savedQuestions && Array.isArray(savedQuestions) ? [...savedQuestions] : [...questionsDefaults];
    questionsData.forEach((q, i) => {
      if (state.landingDrafts[`mq_label_${i}`] !== undefined) q.label = state.landingDrafts[`mq_label_${i}`];
      if (state.landingDrafts[`mq_text_${i}`] !== undefined) q.text = state.landingDrafts[`mq_text_${i}`];
    });
    lsSet('zbod_questions', questionsData);
    if (state.landingDrafts['questions_title'] !== undefined) {
      lsSet('zbod_questions_title', state.landingDrafts['questions_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'questions_title',
          position_order: 195,
          title: state.landingDrafts['questions_title'] || 'MAIN QUESTIONS',
          content: '',
        });
        questionsData.forEach((q, i) => {
          window.zbodSupabase.sbSaveLandingBox({
            box_id: q.id,
            position_order: 200 + i,
            title: q.label,
            content: q.text,
          });
        });
      } catch (e) { console.warn('Supabase questions sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Questions saved');
  },

  cancelQuestionsEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editQuote() {
    const quoteDefault = "Let's put the current organizational structure aside and focus purely on the strategy. Let's think about where the business is going over the next three years and how the organization should add value to that direction. If we were designing the organization from scratch, which capabilities would be most critical for delivering the strategy? Let's work together to shape a structure that will genuinely enable the business and maximize value over the next three years.";
    const savedQuote = lsGet('zbod_quote', null);
    const quoteText = savedQuote !== null ? savedQuote : quoteDefault;
    state.landingEditing = 'quote';
    state.landingDrafts = { quote_text: quoteText };
    renderLanding();
  },

  saveQuote() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    if (state.landingDrafts['quote_text'] !== undefined) {
      lsSet('zbod_quote', state.landingDrafts['quote_text']);
      if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
        try {
          window.zbodSupabase.sbSaveLandingBox({
            box_id: 'quote',
            position_order: 300,
            title: 'Strategic Quote',
            content: state.landingDrafts['quote_text'],
          });
        } catch (e) { console.warn('Supabase quote sync failed:', e); }
      }
    }
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Quote saved');
  },

  cancelQuoteEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editStrategic() {
    const strategicDefaults = [
      { id: 'sq1', label: 'SQ1', text: 'Does this function materially contribute to business strategy and outcomes, and enable scalable, efficient value creation (e.g. revenue, productivity, customer experience, automation)?' },
      { id: 'sq2', label: 'SQ2', text: 'How critical is this function to business continuity and risk management, and what would be the impact if it were stopped today (legal, financial, regulatory, reputational, operational)?' },
    ];
    const savedStrategic = lsGet('zbod_strategic', null);
    const strategicData = savedStrategic && Array.isArray(savedStrategic) ? savedStrategic : strategicDefaults;
    const strategicTitleDefault = 'STRATEGIC QUESTIONS';
    const savedStrategicTitle = lsGet('zbod_strategic_title', null);
    const strategicTitle = savedStrategicTitle !== null ? savedStrategicTitle : strategicTitleDefault;
    state.landingEditing = 'strategic';
    state.landingDrafts = { strategic_title: strategicTitle };
    strategicData.forEach((s, i) => {
      state.landingDrafts[`sq_label_${i}`] = s.label;
      state.landingDrafts[`sq_text_${i}`] = s.text;
    });
    renderLanding();
  },

  saveStrategic() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const strategicDefaults = [
      { id: 'sq1', label: 'SQ1', text: 'Does this function materially contribute to business strategy and outcomes, and enable scalable, efficient value creation (e.g. revenue, productivity, customer experience, automation)?' },
      { id: 'sq2', label: 'SQ2', text: 'How critical is this function to business continuity and risk management, and what would be the impact if it were stopped today (legal, financial, regulatory, reputational, operational)?' },
    ];
    const savedStrategic = lsGet('zbod_strategic', null);
    const strategicData = savedStrategic && Array.isArray(savedStrategic) ? [...savedStrategic] : [...strategicDefaults];
    strategicData.forEach((s, i) => {
      if (state.landingDrafts[`sq_label_${i}`] !== undefined) s.label = state.landingDrafts[`sq_label_${i}`];
      if (state.landingDrafts[`sq_text_${i}`] !== undefined) s.text = state.landingDrafts[`sq_text_${i}`];
    });
    lsSet('zbod_strategic', strategicData);
    if (state.landingDrafts['strategic_title'] !== undefined) {
      lsSet('zbod_strategic_title', state.landingDrafts['strategic_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'strategic_title',
          position_order: 395,
          title: state.landingDrafts['strategic_title'] || 'STRATEGIC QUESTIONS',
          content: '',
        });
        strategicData.forEach((s, i) => {
          window.zbodSupabase.sbSaveLandingBox({
            box_id: s.id,
            position_order: 400 + i,
            title: s.label,
            content: s.text,
          });
        });
      } catch (e) { console.warn('Supabase strategic sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Strategic questions saved');
  },

  cancelStrategicEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editFcmatrix() {
    const fcmatrixDefaults = [
      { id: 'fca', letter: 'A', score: '9\u201310', title: 'Strategic', action: 'Invest', variant: 'a' },
      { id: 'fcb', letter: 'B', score: '7\u20138', title: 'Core Operations', action: 'Keep', variant: 'b' },
      { id: 'fcc', letter: 'C', score: '5\u20136', title: 'Efficiency', action: 'Optimize / Automate', variant: 'c' },
      { id: 'fcd', letter: 'D', score: '2\u20134', title: 'Non-Core', action: 'Eliminate / Outsource', variant: 'd' },
    ];
    const savedFcmatrix = lsGet('zbod_fcmatrix', null);
    const fcmatrixData = savedFcmatrix && Array.isArray(savedFcmatrix) ? savedFcmatrix : fcmatrixDefaults;
    const fcmatrixTitleDefault = 'FUNCTION CATEGORIZATION MATRIX';
    const savedFcmatrixTitle = lsGet('zbod_fcmatrix_title', null);
    const fcmatrixTitle = savedFcmatrixTitle !== null ? savedFcmatrixTitle : fcmatrixTitleDefault;
    state.landingEditing = 'fcmatrix';
    state.landingDrafts = { fcmatrix_title: fcmatrixTitle };
    fcmatrixData.forEach((item, i) => {
      state.landingDrafts[`fc_score_${i}`] = item.score;
      state.landingDrafts[`fc_title_${i}`] = item.title;
      state.landingDrafts[`fc_action_${i}`] = item.action;
    });
    renderLanding();
  },

  saveFcmatrix() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const fcmatrixDefaults = [
      { id: 'fca', letter: 'A', score: '9\u201310', title: 'Strategic', action: 'Invest', variant: 'a' },
      { id: 'fcb', letter: 'B', score: '7\u20138', title: 'Core Operations', action: 'Keep', variant: 'b' },
      { id: 'fcc', letter: 'C', score: '5\u20136', title: 'Efficiency', action: 'Optimize / Automate', variant: 'c' },
      { id: 'fcd', letter: 'D', score: '2\u20134', title: 'Non-Core', action: 'Eliminate / Outsource', variant: 'd' },
    ];
    const savedFcmatrix = lsGet('zbod_fcmatrix', null);
    const fcmatrixData = savedFcmatrix && Array.isArray(savedFcmatrix) ? [...savedFcmatrix] : [...fcmatrixDefaults];
    fcmatrixData.forEach((item, i) => {
      if (state.landingDrafts[`fc_score_${i}`] !== undefined) item.score = state.landingDrafts[`fc_score_${i}`];
      if (state.landingDrafts[`fc_title_${i}`] !== undefined) item.title = state.landingDrafts[`fc_title_${i}`];
      if (state.landingDrafts[`fc_action_${i}`] !== undefined) item.action = state.landingDrafts[`fc_action_${i}`];
    });
    lsSet('zbod_fcmatrix', fcmatrixData);
    if (state.landingDrafts['fcmatrix_title'] !== undefined) {
      lsSet('zbod_fcmatrix_title', state.landingDrafts['fcmatrix_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'fcmatrix',
          position_order: 600,
          title: state.landingDrafts['fcmatrix_title'] || 'Function Categorization Matrix',
          content: JSON.stringify(fcmatrixData),
        });
      } catch (e) { console.warn('Supabase fcmatrix sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Matrix saved');
  },

  cancelFcmatrixEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editSupport() {
    const supportDefaults = [
      { id: 'sf1', iconKey: 'settings', title: 'IT Support', text: 'Manage and maintain technology infrastructure, provide technical assistance, and ensure system reliability across the organization.' },
      { id: 'sf2', iconKey: 'shield', title: 'Security & Compliance', text: 'Oversee data protection, enforce security policies, and ensure regulatory compliance to minimize risk and safeguard organizational assets.' },
      { id: 'sf3', iconKey: 'barChart', title: 'Finance & Accounting', text: 'Handle budgeting, financial reporting, payroll processing, and fiscal planning to maintain organizational financial health.' },
      { id: 'sf4', iconKey: 'users', title: 'HR Administration', text: 'Manage recruitment, employee onboarding, benefits administration, and workplace policies to support workforce needs.' },
    ];
    const savedSupport = lsGet('zbod_support', null);
    const supportData = savedSupport && Array.isArray(savedSupport) ? savedSupport : supportDefaults;
    const supportTitleDefault = 'SUPPORT FUNCTIONS';
    const savedSupportTitle = lsGet('zbod_support_title', null);
    const supportTitle = savedSupportTitle !== null ? savedSupportTitle : supportTitleDefault;
    state.landingEditing = 'support';
    state.landingDrafts = { support_title: supportTitle };
    supportData.forEach((s, i) => {
      state.landingDrafts[`sf_title_${i}`] = s.title;
      state.landingDrafts[`sf_text_${i}`] = s.text;
    });
    renderLanding();
  },

  saveSupport() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const supportDefaults = [
      { id: 'sf1', iconKey: 'settings', title: 'IT Support', text: 'Manage and maintain technology infrastructure, provide technical assistance, and ensure system reliability across the organization.' },
      { id: 'sf2', iconKey: 'shield', title: 'Security & Compliance', text: 'Oversee data protection, enforce security policies, and ensure regulatory compliance to minimize risk and safeguard organizational assets.' },
      { id: 'sf3', iconKey: 'barChart', title: 'Finance & Accounting', text: 'Handle budgeting, financial reporting, payroll processing, and fiscal planning to maintain organizational financial health.' },
      { id: 'sf4', iconKey: 'users', title: 'HR Administration', text: 'Manage recruitment, employee onboarding, benefits administration, and workplace policies to support workforce needs.' },
    ];
    const savedSupport = lsGet('zbod_support', null);
    const supportData = savedSupport && Array.isArray(savedSupport) ? [...savedSupport] : [...supportDefaults];
    supportData.forEach((s, i) => {
      if (state.landingDrafts[`sf_title_${i}`] !== undefined) s.title = state.landingDrafts[`sf_title_${i}`];
      if (state.landingDrafts[`sf_text_${i}`] !== undefined) s.text = state.landingDrafts[`sf_text_${i}`];
    });
    lsSet('zbod_support', supportData);
    if (state.landingDrafts['support_title'] !== undefined) {
      lsSet('zbod_support_title', state.landingDrafts['support_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'support',
          position_order: 700,
          title: state.landingDrafts['support_title'] || 'Support Functions',
          content: JSON.stringify(supportData),
        });
      } catch (e) { console.warn('Supabase support sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Support functions saved');
  },

  cancelSupportEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  editPrinciples() {
    const principlesDefaults = [
      'Key strategic directions for cost and process optimization',
      'Ignore the current org chart and design it from zero',
      'Automate or outsource before creation',
      'Focus on value creation',
    ];
    const savedPrinciples = lsGet('zbod_principles', null);
    const principlesData = savedPrinciples && Array.isArray(savedPrinciples) ? savedPrinciples : principlesDefaults;
    const principlesTitleDefault = 'CORE PRINCIPLES';
    const savedPrinciplesTitle = lsGet('zbod_principles_title', null);
    const principlesTitle = savedPrinciplesTitle !== null ? savedPrinciplesTitle : principlesTitleDefault;
    state.landingEditing = 'principles';
    state.landingDrafts = { principles_title: principlesTitle };
    principlesData.forEach((t, i) => {
      state.landingDrafts[`pr_text_${i}`] = t;
    });
    renderLanding();
  },

  savePrinciples() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const principlesDefaults = [
      'Key strategic directions for cost and process optimization',
      'Ignore the current org chart and design it from zero',
      'Automate or outsource before creation',
      'Focus on value creation',
    ];
    const savedPrinciples = lsGet('zbod_principles', null);
    const principlesData = savedPrinciples && Array.isArray(savedPrinciples) ? [...savedPrinciples] : [...principlesDefaults];
    principlesData.forEach((t, i) => {
      if (state.landingDrafts[`pr_text_${i}`] !== undefined) principlesData[i] = state.landingDrafts[`pr_text_${i}`];
    });
    lsSet('zbod_principles', principlesData);
    if (state.landingDrafts['principles_title'] !== undefined) {
      lsSet('zbod_principles_title', state.landingDrafts['principles_title']);
    }

    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'principles',
          position_order: 500,
          title: state.landingDrafts['principles_title'] || 'Core Principles',
          content: JSON.stringify(principlesData),
        });
      } catch (e) { console.warn('Supabase principles sync failed:', e); }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Core principles saved');
  },

  cancelPrinciplesEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  // Which structure's targets the landing page's Strategic Overview block is showing. Switching
  // structures never carries a half-finished edit across, so the picker is hidden while editing.
  // Which (C-level, area) pair the Strategic Overview block shows. The value is validated against
  // the options this account may actually see, so a hand-typed key cannot reach someone else's.
  selectStrategicOverviewOption(key) {
    const opts = getStrategicOverviewOptions();
    if (!opts.some(o => o.cxoId + '::' + o.area === key)) return;
    state.strategicOverviewKey = key;
    renderLanding();
  },

  _currentStrategicOverviewOption() {
    const opts = getStrategicOverviewOptions();
    return opts.find(o => o.cxoId + '::' + o.area === state.strategicOverviewKey) || opts[0] || null;
  },

  editStrategicOverview() {
    const opt = this._currentStrategicOverviewOption();
    if (!opt) { toast('No C-level area selected', { type: 'error' }); return; }
    if (!canEditStrategicOverview(opt)) { toast('Admin only', { type: 'error' }); return; }
    // An area with nothing saved yet opens on the standard metric names with empty values, so the
    // editor never seeds it with figures belonging to another area or another C-level.
    const so = getStrategicOverview(opt.cxoId, opt.area) || blankStrategicOverview();
    state.strategicOverviewKey = opt.cxoId + '::' + opt.area;
    state.landingEditing = 'strategicOverview';
    state.landingDrafts = {
      so_title: so.title,
      so_subtitle: so.subtitle,
      so_cols: [...so.columns],
      so_rows: so.rows.map(r => ({...r})),
    };
    renderLanding();
  },

  saveStrategicOverview() {
    const opt = this._currentStrategicOverviewOption();
    if (!opt) { toast('No C-level area selected', { type: 'error' }); return; }
    if (!canEditStrategicOverview(opt)) { toast('Admin only', { type: 'error' }); return; }
    const existing = getStrategicOverview(opt.cxoId, opt.area) || blankStrategicOverview();
    const so = {
      title: state.landingDrafts['so_title'] !== undefined ? state.landingDrafts['so_title'] : existing.title,
      subtitle: state.landingDrafts['so_subtitle'] !== undefined ? state.landingDrafts['so_subtitle'] : existing.subtitle,
      columns: state.landingDrafts['so_cols'] !== undefined ? state.landingDrafts['so_cols'] : existing.columns,
      rows: state.landingDrafts['so_rows'] !== undefined ? state.landingDrafts['so_rows'] : existing.rows,
    };
    setStrategicOverview(opt.cxoId, opt.area, so);

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast(`Strategic overview saved for ${opt.cxoName} — ${opt.area}`);
  },

  cancelStrategicOverviewEdit() {
    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
  },

  saveLanding() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const defaultContent = {
      overviewTitle: 'What is Zero-Based Organizational Design?',
      overviewText: 'Zero-Based Organizational Design (ZBOD) is a comprehensive methodology for building organizational structures from the ground up. Rather than making incremental changes to existing structures, ZBOD enables organizations to strategically rethink and redesign their entire operating model to align with business priorities.',
    };
    let content = {...defaultContent, ...lsGet(LS.landing, {})};

    const titleEl = document.getElementById('landing-overviewTitle');
    const textEl = document.getElementById('landing-overviewText');
    if (titleEl) content.overviewTitle = titleEl.value;
    if (textEl) content.overviewText = textEl.value;

    lsSet(LS.landing, content);

    // SYNC TO SUPABASE
    if (window.zbodSupabase && window.zbodSupabase.supabaseAvailable) {
      try {
        window.zbodSupabase.sbSaveLandingBox({
          box_id: 'overview',
          position_order: 0,
          title: content.overviewTitle,
          content: content.overviewText,
        });
      } catch (e) {
        console.warn('Supabase landing sync failed:', e);
      }
    }

    state.landingEditing = null;
    state.landingDrafts = {};
    renderLanding();
    toast('Saved');
  },

  cancelLandingEdit() { state.landingEditing = null; state.landingDrafts = {}; renderLanding(); },

  // === DIVISION / STRUCTURE CRUD ===
  // Creator identity is no longer collected here -- it's admin-managed (see Manage Users:
  // fullName/position/email on the signed-in account), so submitAddDivision() reads it from
  // getUsers() by the signed-in email instead of asking the creator to re-type it.
  showAddDivision() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    state._addForm = {};
    document.getElementById('division-dialog').classList.remove('hidden');
    document.getElementById('division-form-errors').innerHTML = '';
    renderDivisionForm();
  },

  hideAddDivision() { document.getElementById('division-dialog').classList.add('hidden'); },

  handleDivisionSelectChange(field, value) {
    if (field === 'structure_name') {
      const other = document.getElementById('div-structure_name-other');
      if (value === 'Other') { other.classList.remove('hidden'); } else { other.classList.add('hidden'); other.value = ''; }
    }
    if (field === 'structure_type') {
      const other = document.getElementById('div-structure_type-other');
      if (value === 'Other') { other.classList.remove('hidden'); } else { other.classList.add('hidden'); other.value = ''; }
    }
  },

  submitAddDivision() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const fields = getDivisionFormFields();
    const isAdmin = isCurrentUserAdmin();
    const data = {};
    let errors = [];
    // HRBP must hand the structure off to a CxO at creation time -- that's what makes it visible
    // to that CxO later (see getVisibleDivs). Picked from the same "C-Level Full Name" field
    // (the select's value is the CxO's email, its label is their name) rather than a separate
    // field, since a structure's C-Level owner and its assigned CxO are the same person for HRBP.
    // Admin's own flow is untouched, so no CxO is required and the field stays free text there.
    let cxoEmail = '';
    fields.forEach(f => {
      const el = document.getElementById(`div-${f.key}`);
      let val = el ? el.value : '';
      if (f.key === 'structure_name' && val === 'Other') {
        const otherEl = document.getElementById('div-structure_name-other');
        val = otherEl ? otherEl.value : '';
      }
      if (f.key === 'structure_type' && val === 'Other') {
        const otherEl = document.getElementById('div-structure_type-other');
        val = otherEl ? otherEl.value : '';
      }
      if (f.key === 'c_level_name' && !isAdmin) {
        cxoEmail = val;
        const cxoUser = getUsers().find(u => (u.email || '').toLowerCase() === val.toLowerCase());
        val = (cxoUser && cxoUser.fullName) || val;
      }
      if (typeof val === 'string') val = val.trim();
      if (f.type === 'number' || f.type === 'money') {
        const r = f.type === 'number' ? readWholeCount(val) : readMoney(val);
        const label = f.label.replace(/\s*\*$/, '');
        if (r.missing) { errors.push(`${label} is required`); return; }
        if (r.invalid) { errors.push(f.type === 'number' ? `${label} must be a whole number, 0 or more` : `${label} must be an amount, 0 or more`); return; }
        val = r.value;
      }
      data[f.key] = val;
      if (val === '' || val === null || val === undefined) errors.push(`${f.label.replace(/\s*\*$/, '')} is required`);
    });
    if (errors.length > 0) { document.getElementById('division-form-errors').innerHTML = errors.join('<br>'); return; }
    // Creator identity comes from the signed-in account's admin-managed profile (Manage Users),
    // not a manually-typed dialog -- also doubles as the ownership stamp for per-account data
    // isolation (see getVisibleDivs).
    const signedInEmail = (currentProfile && currentProfile.email) || getCurrentEmail();
    const creatorUser = isAdmin ? null : (currentProfile || getUsers().find(u => (u.email || '').toLowerCase() === signedInEmail.toLowerCase()));
    data.created_by_name = isAdmin ? 'Admin' : ((creatorUser && creatorUser.fullName) || signedInEmail);
    data.created_by_position = isAdmin ? '' : ((creatorUser && creatorUser.position) || '');
    data.creator_email = signedInEmail;
    data.owner_email = signedInEmail;
    if (cxoEmail) data.cxo_email = cxoEmail;
    addDiv(data);
    this.hideAddDivision();
    renderDivisions();
    toast('Structure added');
  },

  verifyAndDeleteDivision(id) {
    const div = getDivs().find(d => d.id === id);
    if (!div) return;
    if (!canAccessDivision(div)) { toast('You do not have access to this structure', { type: 'error' }); return; }
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    if (!div.division_password_temp) {
      showConfirmDialog({
        title: 'Delete Structure',
        message: 'Delete this structure? All data will be removed.\n\nThis action cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        danger: true,
        onConfirmAttr: `app.deleteDivision('${escHtml(id)}')`,
      });
      return;
    }
    state._deletePasswordTargetId = id;
    document.getElementById('delete-password-dialog').classList.remove('hidden');
    document.getElementById('delete-password-errors').innerHTML = '';
    document.getElementById('delete-password-input').value = '';
  },

  hideDeletePasswordModal() {
    document.getElementById('delete-password-dialog').classList.add('hidden');
    state._deletePasswordTargetId = null;
  },

  submitDeletePassword() {
    const input = document.getElementById('delete-password-input').value;
    const id = state._deletePasswordTargetId;
    if (!id) return;
    const div = getDivs().find(d => d.id === id);
    if (!div) return;
    if (input === div.division_password_temp) {
      document.getElementById('delete-password-dialog').classList.add('hidden');
      state._deletePasswordTargetId = null;
      this.deleteDivision(id);
    } else {
      document.getElementById('delete-password-errors').innerHTML = 'Incorrect password. Deletion cancelled.';
    }
  },

  // Root cause of "Delete Division does nothing" in automated/embedded browser contexts (e.g. a
  // preview pane): this used window.confirm(), which such environments silently auto-decline —
  // the same class of bug already fixed for the workshop delete / AS-IS delete flows (see
  // confirmDeleteWorkshop / confirmDeleteAsIs). Confirmation now happens before this is ever
  // called (showConfirmDialog in verifyAndDeleteDivision above, or the password check in
  // submitDeletePassword). It still re-checks access itself: confirmation is a UI step, not a
  // permission, and this method is directly reachable with any id.
  deleteDivision(id) {
    const target = getDivs().find(d => d.id === id);
    if (!target || !canAccessDivision(target)) { toast('You do not have access to this structure', { type: 'error' }); return; }
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    // Clean up workshop functions in localStorage (workshops are removed by delWsByDivision)
    const divWsIds = new Set(getWs().filter(w => w.division_id === id).map(w => w.id));
    if (divWsIds.size > 0) {
      lsSet(LS.functions, getFns().filter(f => !divWsIds.has(f.workshop_id)));
    }
    // Clean up AAA cards for this division in localStorage
    const cards = getAAACards();
    if (cards[id]) { delete cards[id]; lsSet(LS.aaaCards, cards); }
    // ...and its AS-IS Metrics blob, which otherwise accumulates in localStorage forever.
    const allMetrics = getMetrics();
    // No division id passed on purpose: delDiv already removes the cloud row, and pushing here
    // would immediately re-create it as an empty blob.
    if (allMetrics[id]) { delete allMetrics[id]; setMetrics(allMetrics); }
    // Strategic Overview is NOT touched here: it belongs to the C-level and their areas, not
    // to this structure, and the same C-level may still be assigned elsewhere.
    // Remove division, as-is functions, and workshops from localStorage + sync to Supabase
    delDiv(id);
    delAsIsByDivision(id);
    delWsByDivision(id);
    renderDivisions();
    toast('Structure deleted');
  },

  editDivisionData() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    state.editingDivision = true;
    state._divEditForm = { current_total_hc: div.current_total_hc, current_total_budget: div.current_total_budget, headcount_target: div.headcount_target, budget_target: div.budget_target };
    renderWorkspace();
  },

  saveDivisionData() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const updates = {};
    const errors = [];
    const labels = { current_total_hc: 'Current Total Headcount', headcount_target: 'Headcount Target', current_total_budget: 'Current Total Budget', budget_target: 'Budget Target' };
    ['current_total_hc','current_total_budget','headcount_target','budget_target'].forEach(k => {
      const el = document.getElementById(`wdiv-${k}`);
      const isHC = k.endsWith('_hc') || k === 'headcount_target';
      const r = isHC ? readWholeCount(el?.value) : readMoney(el?.value);
      if (r.missing) errors.push(`${labels[k]} is required`);
      else if (r.invalid) errors.push(isHC ? `${labels[k]} must be a whole number, 0 or more` : `${labels[k]} must be an amount, 0 or more`);
      else updates[k] = r.value;
    });
    if (errors.length) { toast('Not saved', { type: 'error', description: errors.join('. ') + '.' }); return; }
    updDiv(state.selectedDivisionId, updates);
    state.editingDivision = false;
    state._divEditForm = null;
    renderWorkspace();
    toast('Saved');
  },

  cancelDivisionEdit() { state.editingDivision = false; state._divEditForm = null; renderWorkspace(); },

  // === AS-IS FUNCTIONS ===
  addAsIsRow() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    state.asIsNewRows.push({ id: genId(), name: '', mgr: '', emp: '', mgrcost: '', profcost: '', parentId: '' });
    renderWorkspace();
  },

  // Opens the OS file picker (a hidden <input type="file"> is the only web-standard way to reach
  // it) so the user can pick a completed "Function Register" workbook and bulk-create AS-IS rows
  // from it, instead of typing each function in one at a time. See
  // importAsIsFunctionsFromWorkbook for the actual parsing.
  autofillAsIsFromExcel() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const divisionId = state.selectedDivisionId;
    if (!divisionId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          importAsIsFunctionsFromWorkbook(divisionId, e.target.result);
        } catch (err) {
          console.error('Autofill import error:', err);
          toast('Import failed: ' + err.message, { type: 'error' });
        }
      };
      reader.onerror = () => toast('Could not read the file', { type: 'error' });
      reader.readAsArrayBuffer(file);
    };
    document.body.appendChild(input);
    input.click();
  },

  updateAsIsNewRow(id, field, value) {
    const row = state.asIsNewRows.find(r => r.id === id);
    if (row) row[field] = value;
  },

  // Creates one AS-IS function from a "new row" card. Its figures are pushed up through its parents
  // (first using up whatever the parent had not yet given to a sub-function), see planAsIsMutation.
  _createAsIsFromRow(divisionId, row) {
    const totals = { mgr: cleanCount(row.mgr), emp: cleanCount(row.emp), mc: cleanMoney(row.mgrcost), pc: cleanMoney(row.profcost) };
    const parentId = row.parentId || null;
    const plan = planAsIsMutation(getAsIs().filter(f => f.division_id === divisionId), { kind: 'add', parentId, totals });
    applyAsIsMutation(plan);
    const fn = addAsIsFn(divisionId, row.name);
    updAsIsFn(fn.id, { ...asIsFieldsFromTotals(totals), parent_id: parentId });
    return fn;
  },

  saveAsIsNewRow(id) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const row = state.asIsNewRows.find(r => r.id === id);
    if (!row) return;
    if (!String(row.name || '').trim()) { toast('Function title is required', { type: 'error' }); return; }
    row.name = String(row.name).trim();
    this._createAsIsFromRow(state.selectedDivisionId, row);
    state.asIsNewRows = state.asIsNewRows.filter(r => r.id !== id);
    renderWorkspace();
  },

  cancelAsIsNewRow(id) { state.asIsNewRows = state.asIsNewRows.filter(r => r.id !== id); renderWorkspace(); },

  startAsIsEdit(id) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const fn = getAsIs().find(f => f.id === id);
    if (!fn) return;
    state.asIsEditing[id] = { name: fn.function_name, mgr: fn.manager_count, emp: fn.current_employee_count, mgrcost: fn.managers_cost || 0, profcost: fn.professionals_cost || 0, parentId: fn.parent_id || null };
    renderWorkspace();
  },

  updateAsIsEdit(id, field, value) { if (state.asIsEditing[id]) state.asIsEditing[id][field] = value; },

  updateAsIsInline(id, field, value) {
    if (isReadOnlyViewer()) return;
    const fn = getAsIs().find(f => f.id === id);
    if (!fn) return;
    const divFns = getAsIs().filter(f => f.division_id === fn.division_id);
    if (field === 'parent_id') {
      // A move: the function's people and cost leave the old parent chain and join the new one.
      const plan = planAsIsMutation(divFns, { kind: 'edit', id, newParentId: value || null });
      if (plan === null) { toast('A function cannot be moved under itself or one of its own sub-functions.', { type: 'error' }); return; }
      applyAsIsMutation(plan);
      updAsIsFn(id, { parent_id: value || null });
      announceAsIsMove(plan.changed);
      return;
    }
    const numeric = { manager_count: 'mgr', current_employee_count: 'emp', managers_cost: 'mc', professionals_cost: 'pc' };
    if (numeric[field]) {
      // Any change to a function's own figures reaches every parent above it.
      const nt = asIsTotals(fn);
      nt[numeric[field]] = (field === 'managers_cost' || field === 'professionals_cost') ? cleanMoney(value) : cleanCount(value);
      const plan = planAsIsMutation(divFns, { kind: 'edit', id, newTotals: nt });
      if (plan === null) return;
      applyAsIsMutation(plan);
      updAsIsFn(id, asIsFieldsFromTotals(plan.targetTotals));
      return;
    }
    if (field === 'function_name' && !String(value || '').trim()) { toast('Function title is required', { type: 'error' }); renderWorkspace(); return; }
    updAsIsFn(id, { [field]: typeof value === 'string' ? value.trim() : value });
  },

  editAsIsSection() { if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; } state.asIsSaved = false; renderWorkspace(); },

  saveAsIsEdit(id) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const edit = state.asIsEditing[id];
    if (!edit) return;
    const fn = getAsIs().find(f => f.id === id);
    if (!fn) return;
    if (!String(edit.name || '').trim()) { toast('Function title is required', { type: 'error' }); return; }
    edit.name = String(edit.name).trim();
    const nt = { mgr: cleanCount(edit.mgr), emp: cleanCount(edit.emp), mc: cleanMoney(edit.mgrcost), pc: cleanMoney(edit.profcost) };
    const parentId = edit.parentId || null;
    const parentChanged = (fn.parent_id || null) !== parentId;
    // New figures and a new parent are applied together: the old chain gives up what was saved,
    // the new chain takes in what is saved now, and shared parents only see the difference.
    const plan = planAsIsMutation(getAsIs().filter(f => f.division_id === fn.division_id), { kind: 'edit', id, newTotals: nt, newParentId: parentId });
    if (plan === null) { toast('A function cannot be moved under itself or one of its own sub-functions.', { type: 'error' }); return; }
    applyAsIsMutation(plan);
    updAsIsFn(id, { function_name: edit.name, parent_id: parentId, ...asIsFieldsFromTotals(plan.targetTotals) });
    delete state.asIsEditing[id];
    renderWorkspace();
    if (parentChanged) announceAsIsMove(plan.changed);
  },

  cancelAsIsEdit(id) { delete state.asIsEditing[id]; renderWorkspace(); },

  toggleAsIsCardCollapse(id) {
    if (!window.asIsCardCollapsed) window.asIsCardCollapsed = new Set();
    if (window.asIsCardCollapsed.has(id)) window.asIsCardCollapsed.delete(id); else window.asIsCardCollapsed.add(id);
    renderWorkspace();
  },

  // Root cause of the old "Delete does nothing" reports: this used window.confirm(), the same
  // native-dialog issue already fixed for the workshop Cancel button — browsers can silently
  // suppress repeated confirm() calls with no visible feedback. Replaced with the app's own
  // reusable showConfirmDialog, mirroring the exact confirmDeleteWorkshop/deleteWorkshop pattern.
  confirmDeleteAsIs(id) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    showConfirmDialog({
      title: 'Delete this current function?',
      message: 'Are you sure you want to delete this current function? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: `app.deleteAsIs('${escHtml(id)}')`,
    });
  },

  deleteAsIs(id) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    // Deleting a function takes its whole figure off every parent above it. Its direct
    // sub-functions are kept and attached straight to the top level (the division), each with its own
    // figures, instead of being left pointing at a parent that no longer exists.
    const target = getAsIs().find(f => f.id === id);
    if (!target) return;
    const plan = planAsIsMutation(getAsIs().filter(f => f.division_id === target.division_id), { kind: 'delete', id });
    applyAsIsMutation(plan);
    delAsIsFn(id);
    renderWorkspace();
    const bits = [];
    if (plan.orphans.length) bits.push(`its ${plan.orphans.length} sub-function${plan.orphans.length > 1 ? 's' : ''} now sit${plan.orphans.length > 1 ? '' : 's'} at the top level`);
    if (plan.changed.some(c => c.dHC || c.dCost)) bits.push('parent totals updated');
    toast('Current function deleted' + (bits.length ? ': ' + bits.join('; ') + '.' : '.'));
  },

  // Confirmed branch of the autofill: clears the division's current AS-IS functions (locally and
  // in the cloud, via delAsIsFn) before creating the imported ones, so the file is the only copy.
  applyPendingAsIsImport() {
    const pending = state._pendingAsIsImport;
    state._pendingAsIsImport = null;
    if (!pending || isReadOnlyViewer()) return;
    getAsIs().filter(f => f.division_id === pending.divisionId).forEach(f => delAsIsFn(f.id));
    state.asIsNewRows = [];
    state.asIsEditing = {};
    applyAsIsImportRows(pending.divisionId, pending.parsedRows);
  },

  confirmDeleteAllAsIs() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const count = getAsIs().filter(f => f.division_id === state.selectedDivisionId).length;
    if (count === 0) return;
    showConfirmDialog({
      title: 'Delete all current functions?',
      message: `This will permanently delete all ${count} current function${count !== 1 ? 's' : ''} for this division. This action cannot be undone.`,
      confirmLabel: 'Delete All',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: 'app.deleteAllAsIs()',
    });
  },

  deleteAllAsIs() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const divisionId = state.selectedDivisionId;
    getAsIs().filter(f => f.division_id === divisionId).forEach(f => delAsIsFn(f.id));
    state.asIsNewRows = [];
    state.asIsEditing = {};
    state.asIsSaved = false;
    renderWorkspace();
    toast('All current functions deleted.');
  },

  saveAllAsIs() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const pending = [...state.asIsNewRows];
    pending.forEach(row => {
      if (String(row.name || '').trim()) { row.name = String(row.name).trim(); this._createAsIsFromRow(state.selectedDivisionId, row); }
    });
    state.asIsNewRows = [];

    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) { renderWorkspace(); return; }
    const asIsFns = getAsIs().filter(f => f.division_id === div.id);
    // Root-level only: a sub-function's HC/budget is nested inside the parent function it's
    // grouped under, not additive to it (same rule as the TO-BE workshop functions), so only
    // functions attached directly to the division should be checked against the division's
    // single Current Total HC/Budget — otherwise every nested function inflates the sum and the
    // check fails even when the entered numbers are actually consistent.
    const asIsFnIds = new Set(asIsFns.map(f => f.id));
    const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && asIsFnIds.has(f.parent_id)));
    const totalHC = rootAsIsFns.reduce((s, f) => s + (f.current_function_hc || 0), 0);
    const totalBudget = rootAsIsFns.reduce((s, f) => s + (f.current_budget || 0), 0);

    // Root cause of "clicking Save All Functions does nothing" reports: this used window.confirm()
    // for the budget/HC mismatch check, the same native-dialog issue already fixed for
    // Delete Division/Workshop/AS-IS elsewhere in this file (browsers can silently auto-decline
    // repeated confirm() calls, especially in embedded/automated contexts, with zero visible
    // feedback) — replaced with the app's own showConfirmDialog, combining both checks into one
    // dialog instead of two sequential native prompts.
    const issues = [];
    // Compared at qapik precision. Summing decimal amounts in binary floating point leaves a
    // residue (0.1 + 0.2 is famously not 0.3), so a strict !== flagged budgets that are equal to
    // the last qapik — the dialog printed the same number twice and said they did not match.
    if (roundMoney(totalBudget) !== roundMoney(parseFloat(div.current_total_budget || 0))) {
      issues.push(`Sum of function budgets (${formatNumber(totalBudget)}) does not match Current Total Budget (${formatNumber(div.current_total_budget || 0)}).`);
    }
    if (totalHC !== parseFloat(div.current_total_hc || 0)) {
      issues.push(`Sum of function HC (${formatNumber(totalHC)}) does not match Current Total Headcount (${formatNumber(div.current_total_hc || 0)}).`);
    }

    renderWorkspace();
    if (issues.length > 0) {
      showConfirmDialog({
        title: 'Validation Warning',
        message: issues.join('\n\n') + '\n\nSave anyway, or cancel to edit the numbers?',
        confirmLabel: 'Save Anyway',
        cancelLabel: 'Cancel',
        danger: true,
        onConfirmAttr: 'app.finalizeSaveAllAsIs()',
      });
      return;
    }
    this.finalizeSaveAllAsIs();
  },

  // Split out of saveAllAsIs so the "Save Anyway" button on the validation-warning dialog can
  // reach it too -- both paths (no mismatch, or user proceeds despite one) end up here.
  finalizeSaveAllAsIs() {
    state.asIsSaved = true;
    renderWorkspace();
    toast('All functions saved');
  },

  // === METRICS ===
  _getDefaultMetrics() {
    return [
      { id: 'm1', label: 'Management Layers', value: '', type: 'number' },
      { id: 'm2', label: 'Average Span of Control', value: '', type: 'number' },
      { id: 'm3', label: 'High Grade Employees', value: '', type: 'number' },
      { id: 'm4', label: 'Low Grade Employees', value: '', type: 'number' },
      { id: 'm5', label: 'Multi-layered Hierarchy', value: '', type: 'select', options: ['Exist', 'Do not exist', '-'] },
      { id: 'm6', label: 'Decentralized and Centralized', value: '', type: 'select', options: ['Decentralized', 'Centralized', '-'] },
      { id: 'm7', label: 'Duplicated Functions', value: '', type: 'select', options: ['Exist', 'Do not exist', '-'] },
      { id: 'm8', label: 'Shadow Support Functions', value: '', type: 'select', options: ['Exist', 'Do not exist', 'Other'], customValue: '' },
      { id: 'm9', label: 'Complex Manual Based Process and Job', value: '', type: 'text' },
      { id: 'm10', label: 'Shared Services Opportunities', value: '', type: 'text' },
      { id: 'm11', label: 'Automation & AI Opportunities (RPA)', value: '', type: 'text' },
      { id: 'm12', label: 'Outsourcing Opportunity', value: '', type: 'text' },
      { id: 'm15', label: 'Cost Median for Managers', value: '', type: 'number' },
      { id: 'm16', label: 'Cost Median for Professionals', value: '', type: 'number' },
    ];
  },

  updateMetric(idx, value) {
    if (isReadOnlyViewer()) return;
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    if (!state.metricsDraft[div.id]) state.metricsDraft[div.id] = {};
    state.metricsDraft[div.id][idx] = value;
    const allMetrics = getMetrics();
    if (!allMetrics[div.id]) allMetrics[div.id] = this._getDefaultMetrics();
    const divMetrics = allMetrics[div.id];
    if (divMetrics[idx]) divMetrics[idx].value = value;
    allMetrics[div.id] = divMetrics;
    setMetrics(allMetrics, div.id);
  },

  updateMetricCustom(idx, value) {
    if (isReadOnlyViewer()) return;
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    const allMetrics = getMetrics();
    if (!allMetrics[div.id]) allMetrics[div.id] = this._getDefaultMetrics();
    const divMetrics = allMetrics[div.id];
    if (divMetrics[idx]) divMetrics[idx].customValue = value;
    allMetrics[div.id] = divMetrics;
    setMetrics(allMetrics, div.id);
  },

  saveMetrics() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    state.metricsSaved = true;
    renderWorkspace();
    toast('Metrics saved');
  },

  editMetricsSection() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    state.metricsSaved = false;
    renderWorkspace();
  },

  deleteMetric(idx) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    const allMetrics = getMetrics();
    if (!allMetrics[div.id]) allMetrics[div.id] = this._getDefaultMetrics();
    const divMetrics = allMetrics[div.id];
    divMetrics.splice(idx, 1);
    allMetrics[div.id] = divMetrics;
    setMetrics(allMetrics, div.id);
    renderWorkspace();
  },

  // === AAA SECTION ===
  saveAAACard(idx) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const el = document.getElementById(`aaa-card-${idx}`);
    if (!el) return;
    try {
      const div = getDivs().find(d => d.id === state.selectedDivisionId);
      if (!div) { toast('Error: Division not found'); return; }
      const val = el.value.trim();
      const allCards = getAAACards();
      if (!allCards[div.id]) allCards[div.id] = [];
      if (idx >= 0 && idx < allCards[div.id].length) {
        allCards[div.id][idx] = val;
      }
      setAAACards(allCards, div.id);
      state.aaaEditCardIdx = null;
      if (state.aaaCards[div.id]) delete state.aaaCards[div.id][idx];
      renderWorkspace();
      toast('Saved');
    } catch (err) {
      console.error('saveAAACard error:', err);
      toast('Save failed');
    }
  },

  addAAACard() {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    try {
      const div = getDivs().find(d => d.id === state.selectedDivisionId);
      if (!div) return;
      const allCards = getAAACards();
      if (!allCards[div.id]) allCards[div.id] = [];
      allCards[div.id].push('');
      setAAACards(allCards, div.id);
      const newIdx = allCards[div.id].length - 1;
      state.aaaEditCardIdx = newIdx;
      if (!state.aaaCards[div.id]) state.aaaCards[div.id] = {};
      state.aaaCards[div.id][newIdx] = '';
      renderWorkspace();
      setTimeout(() => { const el = document.getElementById(`aaa-card-${newIdx}`); if (el) el.focus(); }, 50);
    } catch (err) {
      console.error('addAAACard error:', err);
    }
  },

  cancelAAACardEdit() {
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (div && state.aaaCards[div.id] && canWriteDivision(div)) {
      const idx = state.aaaEditCardIdx;
      const allCards = getAAACards();
      if (idx !== null && allCards[div.id] && allCards[div.id][idx] === '') {
        allCards[div.id].splice(idx, 1);
        setAAACards(allCards, div.id);
      }
      delete state.aaaCards[div.id][idx];
    }
    state.aaaEditCardIdx = null;
    renderWorkspace();
  },

  confirmDeleteAAACard(idx) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    showConfirmDialog({
      title: 'Delete this card?',
      message: 'Are you sure you want to delete this card? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: `app.deleteAAACard(${idx})`,
    });
  },

  deleteAAACard(idx) {
    if (isReadOnlyViewer()) { toast('View only', { type: 'error' }); return; }
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    const allCards = getAAACards();
    if (allCards[div.id]) {
      allCards[div.id].splice(idx, 1);
      setAAACards(allCards, div.id);
    }
    renderWorkspace();
  },

  // === WORKSHOP DIALOG ===
  showWorkshopDialog() {
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) return;
    const draftWs = getWs().filter(w => w.division_id === div.id && w.status === 'draft');
    const hasAsIsBaseline = getAsIs().some(f => f.division_id === div.id);
    const copyBaselineBtn = hasAsIsBaseline
      ? `<button onclick="app.copyAsIsBaselineWorkshop()" class="zbod-btn-secondary">${ICONS.copy} Analyze AS-IS Baseline</button>`
      : '';
    if (draftWs.length > 0) {
      document.getElementById('workshop-dialog-title').innerText = 'Workshop In Progress';
      document.getElementById('workshop-dialog-body').innerText = 'You have a draft workshop. Resume it or start new?';
      document.getElementById('workshop-dialog-buttons').innerHTML =
        `<button onclick="app.resumeWorkshop('${draftWs[0].id}',${draftWs[0].phase})" class="zbod-btn-primary">${ICONS.play} Resume</button>
         <button onclick="app.startNewWorkshop()" class="zbod-btn-secondary">${ICONS.plus} New</button>
         ${copyBaselineBtn}
         <button onclick="app.hideWorkshopDialog()" class="zbod-btn-secondary">Cancel</button>`;
    } else {
      document.getElementById('workshop-dialog-title').innerText = 'Start New Workshop';
      document.getElementById('workshop-dialog-body').innerText = 'This will create a new TO-BE organizational design workshop for ' + div.structure_name + '.';
      document.getElementById('workshop-dialog-buttons').innerHTML =
        `<button onclick="app.startNewWorkshop()" class="zbod-btn-primary">${ICONS.play} Start</button>
         ${copyBaselineBtn}
         <button onclick="app.hideWorkshopDialog()" class="zbod-btn-secondary">Cancel</button>`;
    }
    document.getElementById('workshop-dialog').classList.remove('hidden');
  },

  hideWorkshopDialog() { document.getElementById('workshop-dialog').classList.add('hidden'); },

  startNewWorkshop() {
    const ws = addWs(state.selectedDivisionId);
    state.selectedWorkshopId = ws.id;
    state.editingValues = {};
    state.phase3Values = {};
    state.p3ExpandedChildren = new Set();
    this.hideWorkshopDialog();
    showPage('phase1'); renderPhase1();
  },

  copyAsIsBaselineWorkshop() {
    const ws = copyAsIsBaselineToWorkshop(state.selectedDivisionId);
    if (!ws) return;
    state.selectedWorkshopId = ws.id;
    state.editingValues = {};
    state.phase3Values = {};
    state.p3ExpandedChildren = new Set();
    this.hideWorkshopDialog();
    showPage('phase1'); renderPhase1();
    toast('New workshop created from AS-IS Baseline.');
    // The numbers were copied exactly as they are. If a parent function holds more than its
    // sub-functions add up to, say so: only the user can decide where the difference belongs.
    const unallocated = asIsUnallocatedParents(getAsIs().filter(f => f.division_id === state.selectedDivisionId));
    if (unallocated.length) {
      toast('Some parent functions have unallocated amounts', {
        type: 'error',
        description: `${describeUnallocated(unallocated)}. The difference is not assigned to any sub-function. Assign it in Phase 2.`,
      });
    }
  },

  resumeWorkshop(id, phase) {
    const w = getWs().find(x => x.id === id);
    const d = w && getDivs().find(x => x.id === w.division_id);
    if (!w || !d || !canAccessDivision(d)) { toast('You do not have access to this workshop', { type: 'error' }); return; }
    if (w.status === 'completed') { toast('This workshop is already completed', { type: 'error' }); return; }
    state.selectedWorkshopId = id;
    state.editingValues = {};
    state.phase3Values = {};
    state.p3ExpandedChildren = new Set();
    this.hideWorkshopDialog();
    updWs(id, { status: 'draft' });
    // Stored 3 = allocation; anything earlier (incl. legacy 2, the old Business Impact step) = merged Phase 1.
    if (phase === 3) { showPage('phase3'); renderPhase3(); }
    else { showPage('phase1'); renderPhase1(); }
  },

  // Root cause of the old "Cancel does nothing" reports: this used window.confirm(), a native
  // blocking dialog that browsers silently suppress after repeated calls (and in embedded/
  // automated contexts) — it can return false, or never appear at all, with zero visible
  // feedback. Replaced with the app's own reusable showConfirmDialog component (the same one
  // already used for deleting a draft workshop), which can't be silently suppressed and matches
  // the app's actual modal design language. Skips the dialog entirely when the workshop has no
  // functions yet, since there is nothing to lose.
  confirmQuitPhase() {
    const hasProgress = getFns().filter(f => f.workshop_id === state.selectedWorkshopId).length > 0;
    if (!hasProgress) {
      // An empty draft (nothing added yet) is removed instead of piling up in "Workshops in Progress".
      const ws = getWs().find(w => w.id === state.selectedWorkshopId);
      if (ws && ws.status === 'draft' && !isReadOnlyViewer()) delWs(ws.id);
      this.exitWorkshop();
      return;
    }
    // Everything in a workshop is saved as it is typed, so leaving loses nothing.
    showConfirmDialog({
      title: 'Leave the workshop?',
      message: 'Your progress is saved automatically. You can continue this workshop later from the structure page.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      danger: false,
      onConfirmAttr: 'app.exitWorkshop()',
    });
  },

  // Shared cleanup + navigation for leaving a workshop mid-edit, reused by confirmQuitPhase
  // regardless of whether the confirm dialog was shown.
  exitWorkshop() {
    cleanupPhase3Sticky();
    this.goToWorkspace();
  },

  // === WORKSHOP DELETE (draft and completed/previous workshops) ===
  // A completed workshop is a finished report, so view-only accounts can't delete one.
  canDeleteWorkshop(w) {
    if (!w) return false;
    if (w.status === 'draft') return true;
    return w.status === 'completed' && !isReadOnlyViewer();
  },

  openWorkshopContextMenu(event, id) {
    event.preventDefault();
    const w = getWs().find(x => x.id === id);
    if (!this.canDeleteWorkshop(w)) return;
    showContextMenu(event.clientX, event.clientY, [
      { label: '🗑 Delete Workshop', danger: true, onclick: `app.confirmDeleteWorkshop('${escHtml(id)}')` },
    ]);
  },

  confirmDeleteWorkshop(id) {
    const w = getWs().find(x => x.id === id);
    if (!this.canDeleteWorkshop(w)) { toast('View only', { type: 'error' }); return; }
    const kind = w.status === 'completed' ? 'completed workshop and its report' : 'draft workshop';
    showConfirmDialog({
      title: 'Delete Workshop',
      message: `Are you sure you want to permanently delete this ${kind}?\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: `app.deleteWorkshop('${escHtml(id)}')`,
    });
  },

  async deleteWorkshop(id) {
    const w = getWs().find(x => x.id === id);
    if (!this.canDeleteWorkshop(w)) { toast('View only', { type: 'error' }); return; }
    const label = w.status === 'completed' ? 'Completed workshop' : 'Draft workshop';
    const ok = await delWs(id);
    if (ok) {
      if (state.selectedHistoryWorkshopId === id) state.selectedHistoryWorkshopId = null;
      renderWorkspace();
      toast(`${label} deleted successfully.`);
    } else {
      toast('Failed to delete workshop', { type: 'error', description: `The ${label.toLowerCase()} could not be deleted. Please try again.` });
    }
  },

  // === PHASE 1 — FUNCTION EDITOR MODAL (org-chart driven add/edit) ===
  openAddFunctionModal(parentId) {
    const ws = getWs().find(w => w.id === state.selectedWorkshopId);
    if (!ws) return;
    state.fnModal = {
      mode: 'add',
      fnId: null,
      parentId: parentId || '',
      draft: { proposed_function_name: '', career_level: '', function_structure_type: '', can_be_eliminated: '', can_be_automated: '', can_be_outsourced: '', strategic_justification: '', question1_score: '', question2_score: '' },
    };
    renderFunctionModal();
  },

  openEditFunctionModal(fnId) {
    const f = getFns().find(x => x.id === fnId);
    if (!f) return;
    state.fnModal = {
      mode: 'edit',
      fnId,
      parentId: f.parent_id || '',
      draft: {
        proposed_function_name: f.proposed_function_name || '',
        career_level: f.career_level || '',
        function_structure_type: f.function_structure_type || '',
        can_be_eliminated: f.can_be_eliminated || '',
        can_be_automated: f.can_be_automated || '',
        can_be_outsourced: f.can_be_outsourced || '',
        strategic_justification: f.strategic_justification || '',
        question1_score: f.question1_score ? String(f.question1_score) : '',
        question2_score: f.question2_score ? String(f.question2_score) : '',
      },
    };
    renderFunctionModal();
  },

  updateFnModalDraft(field, value) {
    const m = state.fnModal;
    if (!m) return;
    if (field === 'parent_id') {
      if (value && (value === m.fnId || getDescendantIds(m.fnId, getFns()).has(value))) {
        toast('A function cannot be nested under itself or its own child', { type: 'error' });
        return;
      }
      m.parentId = value;
    } else {
      m.draft[field] = value;
    }
    renderFunctionModal();
  },

  closeFunctionModal() {
    state.fnModal = null;
    renderFunctionModal();
  },

  saveFunctionModal() {
    const m = state.fnModal;
    if (!m) return;
    const d = m.draft;
    if (!d.proposed_function_name || !d.proposed_function_name.trim()) {
      toast('Function name is required', { type: 'error' }); return;
    }
    if (!d.career_level) { toast('Management Layer is required', { type: 'error' }); return; }
    if (!d.function_structure_type) { toast('Structure Type is required', { type: 'error' }); return; }
    if (!d.can_be_eliminated || !d.can_be_automated || !d.can_be_outsourced) {
      toast('Please answer Elimination / Automation / Outsourcing Opportunity', { type: 'error' }); return;
    }
    if (!d.question1_score || !d.question2_score) {
      toast('Please answer Q1 and Q2', { type: 'error' }); return;
    }
    const q1 = parseInt(d.question1_score), q2 = parseInt(d.question2_score);
    let movedReset = null;
    const updates = {
      proposed_function_name: d.proposed_function_name.trim(),
      career_level: d.career_level,
      function_structure_type: d.function_structure_type,
      can_be_eliminated: d.can_be_eliminated,
      can_be_automated: d.can_be_automated,
      can_be_outsourced: d.can_be_outsourced,
      strategic_justification: d.strategic_justification || '',
      parent_id: m.parentId || '',
      justification_alert: computePhase1Alert(d.can_be_eliminated, d.can_be_automated, d.can_be_outsourced),
      question1_score: q1,
      question2_score: q2,
      total_score: q1 + q2,
      zbod_decision: computePhase2Decision(q1, q2),
    };
    if (m.mode === 'add') {
      const ws = getWs().find(w => w.id === state.selectedWorkshopId);
      if (!ws) return;
      const num = getFns().filter(f => f.workshop_id === ws.id).length + 1;
      const fn = addFn(ws.id, num);
      updFn(fn.id, updates);
      window._ocJustAdded = fn.id; // one-shot: renderOrgChart gives this node its "sparkle" entrance
    } else {
      // Moving a unit under another parent in an AS-IS Baseline workshop: re-organise the baseline
      // first (it needs the old parent chain), so Phase 2 and the charts use the new structure.
      const before = getFns().find(f => f.id === m.fnId);
      if (before && (before.parent_id || '') !== (m.parentId || '')) {
        const changed = workshopMoveFunction(before.workshop_id, m.fnId, m.parentId || null);
        if (changed === null) { toast('A function cannot be nested under itself or its own child', { type: 'error' }); return; }
        movedReset = describeAsIsChanges(changed);
      }
      updFn(m.fnId, updates);
    }
    const wasAdd = m.mode === 'add';
    state.fnModal = null;
    renderFunctionModal();
    renderPhase1();
    toast(movedReset ? `Function moved. Totals updated: ${movedReset}` : (wasAdd ? 'Function added' : 'Function updated'));
  },

  confirmRemoveFunctionFromModal(id) {
    showConfirmDialog({
      title: 'Remove this function?',
      message: 'Are you sure you want to remove this function? This action cannot be undone.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: `app.removeProposedFunction('${escHtml(id)}');app.closeFunctionModal();`,
    });
  },

  removeProposedFunction(id) {
    const gone = getFns().find(f => f.id === id);
    // Its sub-functions go to the top level and every parent above loses its figure.
    const res = gone ? workshopDeleteFunction(gone.workshop_id, id) : { changed: [], orphans: 0 };
    const ws = getWs().find(w => w.id === state.selectedWorkshopId);
    if (ws) {
      const fns = getFns().filter(f => f.workshop_id === ws.id).sort((a, b) => a.function_number - b.function_number);
      fns.forEach((f, i) => { if (f.function_number !== i + 1) updFn(f.id, { function_number: i + 1 }); });
    }
    renderPhase1();
  },

  toggleFieldHelp(id, btnEl) {
    const popover = document.getElementById('field-help-popover');
    if (!popover) return;
    const wasOpen = !popover.classList.contains('hidden') && popover._openId === id;
    closeAllFieldHelpPopovers();
    if (!wasOpen) showFieldHelpPopover(id, btnEl);
  },

  // Toggles a renderMaskedPassword() span between its dots and the real value.
  togglePasswordText(btn) {
    const span = btn.previousElementSibling;
    if (!span) return;
    if (span.dataset.masked === 'true') {
      span.textContent = span.dataset.value;
      span.dataset.masked = 'false';
      btn.innerHTML = ICONS.eyeOff;
    } else {
      span.textContent = '••••••••';
      span.dataset.masked = 'true';
      btn.innerHTML = ICONS.eye;
    }
  },

  // Toggles a renderPasswordInput() / #user-form-password field between type="password" and
  // type="text".
  togglePasswordInput(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = ICONS.eyeOff;
    } else {
      input.type = 'password';
      btn.innerHTML = ICONS.eye;
    }
  },

  savePhase1() {
    renderPhase1();
    toast('Saved');
  },

  // Phase 1 (Function ID + Business Impact) now leads straight to allocation. The allocation step
  // keeps its stored workshop.phase value of 3 (existing data and all of its code are untouched);
  // only the labels count it as "Phase 2 of 2".
  goToPhase3() { updWs(state.selectedWorkshopId, { phase: 3 }); showPage('phase3'); renderPhase3(); },
  backToPhase1() { cleanupPhase3Sticky(); updWs(state.selectedWorkshopId, { phase: 1 }); showPage('phase1'); renderPhase1(); },

  // === PHASE 3 ===
  updatePhase3Value(fnId, field, value) {
    const own = getFns().find(f => f.id === fnId);
    if (own && wfIsBaseline(own.workshop_id)) {
      // Numbers and percentages are two views of one figure; the change reaches every parent above.
      workshopEditFigure(own.workshop_id, fnId, field, value);
      renderPhase3();
      return;
    }
    if (!state.phase3Values[fnId]) state.phase3Values[fnId] = {};
    // An empty box clears the value; 0 is a real value (not "clear"); nothing may go below 0; text
    // that is not a number changes nothing.
    const rawText = String(value == null ? '' : value).trim();
    let parsed;
    if (rawText === '') parsed = null;
    else if (!/\d/.test(rawText)) { renderPhase3(); return; }
    else if (field === 'manager_count' || field === 'professional_count') parsed = Math.max(0, parseInt(rawText, 10) || 0);
    else if (field === 'proposed_budget') parsed = Math.max(0, parseMoney(rawText));
    else { const n = parseFloat(rawText); if (!isFinite(n)) { renderPhase3(); return; } parsed = Math.max(0, n); }
    state.phase3Values[fnId][field] = parsed;
    // Clearing a figure hands the function back to its percentage share. Typing a Cost % makes the
    // percentage drive the cost again (it used to be silently ignored after a cost had been typed).
    const extra = field === 'proposed_budget' ? { proposed_budget_manual: parsed !== null }
      : field === 'hc_allocation_percent' ? { hc_allocation_percent_manual: parsed !== null }
      : field === 'cost_allocation_percent' && parsed !== null ? { proposed_budget_manual: false }
      : {};
    if (field === 'cost_allocation_percent' && parsed !== null) delete state.phase3Values[fnId].proposed_budget;
    updFn(fnId, { [field]: parsed, ...extra });
    recomputeAndSaveAllCascaded(state.selectedWorkshopId, state.phase3Values);
    renderPhase3();
  },

  savePhase3() { renderPhase3(); toast('Saved'); },

  goToReview() { cleanupPhase3Sticky(); showPage('review'); renderReview(); },
  backToPhase3() { showPage('phase3'); renderPhase3(); },

  // === FINISH WORKSHOP ===
  // What is still open in a workshop before it is completed. An empty workshop cannot be completed;
  // anything else is listed and the user decides (a workshop can legitimately be closed with gaps).
  _workshopCompletionIssues(wsId) {
    const ws = getWs().find(w => w.id === wsId);
    const div = ws && getDivs().find(d => d.id === ws.division_id);
    if (!ws || !div) return { blocking: 'Workshop not found.', warnings: [] };
    const fns = freshWorkshopFns(ws);
    if (!fns.length) return { blocking: 'This workshop has no functions yet. Add functions in Phase 1 first.', warnings: [] };
    const warnings = [];
    const undecided = fns.filter(f => !decisionOf(f));
    if (undecided.length) warnings.push(`${undecided.length} of ${fns.length} functions ${undecided.length === 1 ? 'has' : 'have'} no ZBOD decision (Q1/Q2 not answered)`);
    const ids = new Set(fns.map(f => f.id));
    const over = fns.filter(p => {
      const kids = fns.filter(c => c.parent_id === p.id);
      if (!kids.length) return false;
      const hc = kids.reduce((a, c) => a + (c.proposed_hc || 0), 0), bud = kids.reduce((a, c) => a + (c.proposed_budget || 0), 0);
      return hc > (p.proposed_hc || 0) || roundMoney(bud) > roundMoney(p.proposed_budget || 0);
    });
    if (over.length) warnings.push(`sub-functions exceed their parent in: ${over.slice(0, 3).map(f => f.proposed_function_name || 'Unnamed').join(', ')}${over.length > 3 ? ` and ${over.length - 3} more` : ''}`);
    const roots = fns.filter(f => !(f.parent_id && ids.has(f.parent_id)));
    const hc = roots.reduce((a, f) => a + (f.proposed_hc || 0), 0), bud = roots.reduce((a, f) => a + (f.proposed_budget || 0), 0);
    if (hc > (div.headcount_target || 0)) warnings.push(`proposed headcount ${formatNumber(hc)} is above the target ${formatNumber(div.headcount_target || 0)}`);
    if (roundMoney(bud) > roundMoney(div.budget_target || 0)) warnings.push(`proposed budget ${formatNumber(roundMoney(bud))} AZN is above the target ${formatNumber(div.budget_target || 0)} AZN`);
    return { blocking: null, warnings };
  },

  finishWorkshop(confirmed) {
    const check = this._workshopCompletionIssues(state.selectedWorkshopId);
    if (check.blocking) { toast('Workshop cannot be completed', { type: 'error', description: check.blocking }); return; }
    if (check.warnings.length && confirmed !== true) {
      showConfirmDialog({
        title: 'Complete the workshop with open points?',
        message: 'Please check before completing:\n\n• ' + check.warnings.join('\n• ') + '\n\nYou can go back and fix them, or complete the workshop as it is.',
        confirmLabel: 'Complete anyway',
        cancelLabel: 'Go back',
        danger: true,
        onConfirmAttr: 'app.finishWorkshop(true)',
      });
      return;
    }
    cleanupPhase3Sticky();
    finalizeWorkshopCalculations(state.selectedWorkshopId);
    saveCompletedWorkshop(state.selectedWorkshopId);
    state.selectedHistoryWorkshopId = state.selectedWorkshopId;
    showPage('transition'); renderTransition();
    toast('Workshop completed!');
  },

  submitForHRReview() {
    const wsId = state.selectedWorkshopId || state.selectedHistoryWorkshopId;
    if (!wsId) { toast('No workshop selected.'); return; }
    finalizeWorkshopCalculations(wsId);
    const now = new Date().toISOString();
    // See saveCompletedWorkshop's comment: finalizeWorkshopCalculations + updWs already synced
    // everything that actually changed here, individually — no bulk sbSyncAll needed or wanted.
    const wsNow = getWs().find(w => w.id === wsId);
    const divNow = wsNow && getDivs().find(d => d.id === wsNow.division_id);
    const snap = wsNow && wsNow.target_headcount_snapshot != null ? {} : {
      target_headcount_snapshot: divNow ? (divNow.headcount_target || 0) : null,
      target_budget_snapshot: divNow ? (divNow.budget_target || 0) : null };
    updWs(wsId, { status: 'completed', completed_at: wsNow?.completed_at || now, submitted_for_hr_review_at: now, phase: 3, ...snap });
    state.selectedHistoryWorkshopId = wsId;
    this.goToHRReview();
    toast('Workshop submitted for HR review!');
  },

  // === DASHBOARD: DISTRIBUTION ANALYSIS PARENT FILTER (defaults to the Division itself) ===
  filterDashboardDistribution(selectedIndex, chartPrefix) {
    const wsId = chartPrefix === 'hist_' ? state.selectedHistoryWorkshopId : state.selectedWorkshopId;
    const ws = getWs().find(w => w.id === wsId);
    if (!ws) return;
    const div = divForWorkshop(ws, getDivs().find(d => d.id === ws.division_id));
    if (!div) return;
    const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
    const asIsFns = getWorkshopAsIs(ws);
    const options = getDashboardParentOptions(fns, asIsFns);
    const parentFilter = selectedIndex > 0 ? options[selectedIndex - 1] : '';
    state.dashboardParentFilter = parentFilter;
    const metrics = calculateDashboardMetrics(ws.id);
    renderDashboardCharts(metrics.invest, metrics.keep, metrics.optimize, metrics.eliminate, fns, asIsFns, div, chartPrefix, parentFilter, ws);
  },

  // === HISTORY ===
  // Resolves the workshop back to its division and checks access: a workshop id is enough to
  // read another division's full dashboard otherwise.
  viewHistoryWorkshop(id) {
    const w = getWs().find(x => x.id === id);
    const d = w && getDivs().find(x => x.id === w.division_id);
    if (!w || !d || !canAccessDivision(d)) { toast('You do not have access to this workshop', { type: 'error' }); return; }
    state.selectedHistoryWorkshopId = id; showPage('history-review'); renderHistoryReview();
  },

  // === EXPORT TO EXCEL ===
  exportToExcel() {
    const div = getDivs().find(d => d.id === state.selectedDivisionId);
    if (!div) { toast('Please select a division before exporting.'); return; }

    const wsAll = getWs().filter(w => w.division_id === div.id);
    const completedWs = wsAll.filter(w => w.status === 'completed').sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
    const draftWs = wsAll.find(w => w.status === 'draft');
    const allForExport = [...(draftWs ? [draftWs] : []), ...completedWs];

    if (allForExport.length === 0) { toast('No workshop reports found for this division.'); return; }

    const overlay = document.getElementById('export-modal-overlay');
    const body = document.getElementById('export-modal-body');
    let html = '';
    allForExport.forEach((w, i) => {
      const dt = new Date(w.completed_at || w.created_at);
      const fns = getFns().filter(f => f.workshop_id === w.id);
      const isComplete = w.status === 'completed';
      html += `<div class="export-ws-item${i === 0 ? ' selected' : ''}" onclick="app._selectExportWs(this,'${escHtml(w.id)}')" data-wsid="${w.id}">
        <div><div class="ws-title">${isComplete ? '&#10004; Completed' : '&#9998; Draft'} Workshop #${w.id.slice(0,8)}</div>
        <div class="ws-meta">${dt.toLocaleDateString()} &mdash; ${fns.length} functions</div></div>
      </div>`;
    });
    body.innerHTML = html;

    const footer = document.getElementById('export-modal-footer');
    footer.innerHTML = `<button onclick="app.closeExportModal()" class="zbod-btn-secondary" style="padding:10px 20px;">Cancel</button><button onclick="app._doExport()" class="zbod-btn-primary" style="padding:10px 24px;">${ICONS.download} Export Report</button>`;

    state._exportSelectedWsId = allForExport[0].id;
    overlay.style.display = 'flex';
  },

  closeExportModal() {
    document.getElementById('export-modal-overlay').style.display = 'none';
    state._exportSelectedWsId = null;
  },

  _selectExportWs(el, wsId) {
    document.querySelectorAll('.export-ws-item').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    state._exportSelectedWsId = wsId;
  },

  async _doExport() {
    const wsId = state._exportSelectedWsId;
    if (!wsId) return;
    const ws = getWs().find(w => w.id === wsId);
    const div = ws && divForWorkshop(ws, getDivs().find(d => d.id === state.selectedDivisionId));
    if (!ws || !div) return;

    const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
    // Root-level only, reused below wherever a Managers/Professionals or decision-bucket total is
    // summed directly from fns — a child's manager_count/professional_count/proposed_hc/
    // proposed_budget is carved out of its parent's allocation, not additive to it, so summing
    // every function (parents + children) would double-count everything below the top level.
    const fnIds = new Set(fns.map(f => f.id));
    const rootFns = fns.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
    const asIsFns = getWorkshopAsIs(ws);
    // Same root-level rule applied to the AS-IS side: a sub-function's HC/budget is nested inside
    // the parent it's grouped under.
    const asIsFnIds = new Set(asIsFns.map(f => f.id));
    const rootAsIsFns = asIsFns.filter(f => !(f.parent_id && asIsFnIds.has(f.parent_id)));
    const totalToBeHC = calculateProposedHeadcount(ws.id);
    const totalToBeBudget = calculateProposedBudget(ws.id);
    const totalAsIsHC = rootAsIsFns.reduce((s, f) => s + (f.current_function_hc || 0), 0);
    const totalAsIsBudget = rootAsIsFns.reduce((s, f) => s + ((f.managers_cost || 0) + (f.professionals_cost || 0)), 0);
    const totalAsIsMgrs = rootAsIsFns.reduce((s, f) => s + (f.manager_count || 0), 0);
    const totalAsIsProfs = rootAsIsFns.reduce((s, f) => s + (f.current_employee_count || 0), 0);
    const totalToBeMgrs = rootFns.reduce((s, f) => s + (f.manager_count || 0), 0);
    const totalToBeProfs = rootFns.reduce((s, f) => s + (f.professional_count || 0), 0);
    const avgSpan = totalToBeMgrs > 0 ? (totalToBeProfs / totalToBeMgrs).toFixed(1) : 'N/A';
    const allMetrics = getMetrics();
    const mets = allMetrics[div.id] || [];
    const findMetric = (label) => {
      const m = mets.find(x => x.label === label);
      if (!m) return '';
      if (m.value === 'Other' && m.customValue) return `Other: ${m.customValue}`;
      return m.value || '';
    };
    const getDecision = f => decisionOf(f) || 'PENDING';
    const inc = fns.filter(f => getDecision(f) === 'INVEST');
    const kp  = fns.filter(f => getDecision(f) === 'KEEP');
    const opt = fns.filter(f => getDecision(f) === 'OPTIMIZE');
    const elm = fns.filter(f => getDecision(f) === 'ELIMINATE');
    const hcDiff = totalToBeHC - (div.headcount_target || 0);
    const budgDiff = roundMoney(totalToBeBudget - (div.budget_target || 0));
    const wsDateStr = ws.completed_at ? new Date(ws.completed_at).toLocaleDateString() : new Date(ws.created_at).toLocaleDateString();

    // AS-IS Baseline analysis workshops compare AS-IS vs Target only in the Dashboard/Final
    // Summary sheets below — no TO-BE/Proposed values there. Sheets 1-5 and 8 (division info,
    // AS-IS baseline detail, Phase 1-3 data, raw data) are normal workshop content and are
    // untouched regardless of workshop type.
    const isAsIs = ws.source === 'as_is_baseline';
    const asIsHcDiff = totalAsIsHC - (div.headcount_target || 0);
    const asIsBudgDiff = totalAsIsBudget - (div.budget_target || 0);
    const asIsAvgSpan = totalAsIsMgrs > 0 ? (totalAsIsProfs / totalAsIsMgrs).toFixed(1) : 'N/A';

    // --- colour palette ---
    const C = {
      navy: 'FF0F3C76', navyLight: 'FFE8EEF7',
      green: 'FF2E642C', greenLight: 'FFE8F5E9',
      gold: 'FF92690A', goldLight: 'FFFDF3DC',
      red: 'FFB71C1C', redLight: 'FFFEECEB',
      blue: 'FF0277BD', blueLight: 'FFE1F0FA',
      purple: 'FF6A1B9A', purpleLight: 'FFF3E5F5',
      teal: 'FF00695C', tealLight: 'FFE0F2F1',
      gray: 'FF6B7280', gray2: 'FFF3F4F6', gray3: 'FFE5E7EB',
      white: 'FFFFFFFF', black: 'FF111827',
    };

    // --- style factories ---
    const mkFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const mkFont = (opts) => ({ name: 'Calibri', size: 10, color: { argb: C.black }, ...opts });
    const mkBorder = (style = 'thin', color = C.gray3) => ({ top: { style, color: { argb: color } }, bottom: { style, color: { argb: color } }, left: { style, color: { argb: color } }, right: { style, color: { argb: color } } });
    const mkAlign = (h = 'left', v = 'middle', wrap = false) => ({ horizontal: h, vertical: v, wrapText: wrap });

    // Reusable style objects
    const S = {
      // Sheet title banner
      sheetTitle: { font: mkFont({ bold: true, size: 18, color: { argb: C.white } }), fill: mkFill(C.navy), alignment: mkAlign('left', 'middle') },
      // Section header row
      sectionHdr: { font: mkFont({ bold: true, size: 11, color: { argb: C.white } }), fill: mkFill(C.navy), alignment: mkAlign('left', 'middle'), border: mkBorder('medium', C.navy) },
      // Sub-section label/key on left
      rowLabel: { font: mkFont({ bold: true, size: 10, color: { argb: C.navy } }), fill: mkFill(C.navyLight), alignment: mkAlign('left', 'middle'), border: mkBorder('hair', C.gray3) },
      // Value cell
      rowValue: { font: mkFont({ size: 10 }), fill: mkFill(C.white), alignment: mkAlign('left', 'middle'), border: mkBorder('hair', C.gray3) },
      // Table column header
      tblHdr: { font: mkFont({ bold: true, size: 10, color: { argb: C.white } }), fill: mkFill(C.green), alignment: mkAlign('center', 'middle', true), border: mkBorder('thin', C.green) },
      // Table data cell
      tblCell: { font: mkFont({ size: 10 }), fill: mkFill(C.white), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      tblCellL: { font: mkFont({ size: 10 }), fill: mkFill(C.white), alignment: mkAlign('left', 'middle'), border: mkBorder('hair', C.gray3) },
      tblAlt: { font: mkFont({ size: 10 }), fill: mkFill(C.gray2), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      tblAltL: { font: mkFont({ size: 10 }), fill: mkFill(C.gray2), alignment: mkAlign('left', 'middle'), border: mkBorder('hair', C.gray3) },
      // Highlight cells
      greenBold: { font: mkFont({ bold: true, size: 10, color: { argb: C.green } }), fill: mkFill(C.greenLight), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      redBold:   { font: mkFont({ bold: true, size: 10, color: { argb: C.red   } }), fill: mkFill(C.redLight  ), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      goldBold:  { font: mkFont({ bold: true, size: 10, color: { argb: C.gold  } }), fill: mkFill(C.goldLight ), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      blueBold:  { font: mkFont({ bold: true, size: 10, color: { argb: C.blue  } }), fill: mkFill(C.blueLight ), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      purpleBold:{ font: mkFont({ bold: true, size: 10, color: { argb: C.purple} }), fill: mkFill(C.purpleLight), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
      tealBold:  { font: mkFont({ bold: true, size: 10, color: { argb: C.teal  } }), fill: mkFill(C.tealLight ), alignment: mkAlign('center', 'middle'), border: mkBorder('hair', C.gray3) },
    };

    // Helper: apply style object to cell
    const applyStyle = (cell, style) => { Object.assign(cell, style); };

    // Helper: write a section banner across N columns
    const writeBanner = (sh, row, cols, text, style) => {
      sh.mergeCells(`A${row}:${String.fromCharCode(64 + cols)}${row}`);
      const cell = sh.getCell(`A${row}`);
      cell.value = text;
      applyStyle(cell, style);
      for (let c = 2; c <= cols; c++) sh.getCell(row, c).fill = style.fill;
      sh.getRow(row).height = 28;
    };

    // Helper: write a label-value pair row
    const writeKV = (sh, row, label, value, valueCols, numFmt) => {
      sh.getCell(row, 1).value = label; applyStyle(sh.getCell(row, 1), S.rowLabel);
      if (valueCols > 1) sh.mergeCells(row, 2, row, 1 + valueCols);
      const vc = sh.getCell(row, 2); vc.value = value; applyStyle(vc, S.rowValue);
      if (numFmt) vc.numFmt = numFmt;
      sh.getRow(row).height = 18;
    };

    // Helper: write table header row
    const writeTblHdr = (sh, row, headers) => {
      headers.forEach((h, i) => { const c = sh.getCell(row, i + 1); c.value = h; applyStyle(c, S.tblHdr); });
      sh.getRow(row).height = 32;
    };

    // Helper: decision colour style
    const decStyle = (dec) => {
      if (dec === 'INVEST')   return S.greenBold;
      if (dec === 'KEEP')     return S.goldBold;
      if (dec === 'OPTIMIZE') return S.blueBold;
      if (dec === 'ELIMINATE') return S.redBold;
      return S.tblCell;
    };

    // Helper: add auto-filter to a range
    const addFilter = (sh, topRow, numCols) => {
      sh.autoFilter = { from: { row: topRow, column: 1 }, to: { row: topRow, column: numCols } };
    };

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ZBOD Tool';
      workbook.created = new Date();
      workbook.properties.date1904 = false;

      // ════════════════════════════════════════════════════════════════
      // SHEET 1 — DIVISION & STRUCTURE
      // ════════════════════════════════════════════════════════════════
      const sh1 = workbook.addWorksheet('1. Division & Structure');
      sh1.views = [{ state: 'frozen', ySplit: 3, xSplit: 0 }];
      sh1.columns = [{ width: 30 }, { width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];

      let r = 1;
      writeBanner(sh1, r, 6, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  ${wsDateStr}`, S.sheetTitle); r++;
      writeBanner(sh1, r, 6, '1. DIVISION & STRUCTURE INFORMATION', S.sectionHdr); r++;

      // Resolved live from Manage Users by email where possible, rather than trusting the name
      // snapshotted onto the division at creation time -- a CxO's or HRBP's profile can be
      // edited after the fact, and the report should reflect who they are now.
      const cxoUser = div.cxo_email ? getUsers().find(u => (u.email || '').toLowerCase() === div.cxo_email.toLowerCase()) : null;
      const cxoDisplayName = (cxoUser && cxoUser.fullName) || div.c_level_name || '';
      const creatorUser = div.creator_email ? getUsers().find(u => (u.email || '').toLowerCase() === div.creator_email.toLowerCase()) : null;
      const creatorDisplayName = (creatorUser && creatorUser.fullName) || div.created_by_name || '';
      const creatorDisplayPosition = (creatorUser && creatorUser.position) || div.created_by_position || '';

      const divInfo = [
        ['Structure Name', div.structure_name || ''],
        ['Structure Type', div.structure_type || ''],
        ['C-Level Owner / Executive Sponsor (CxO)', cxoDisplayName],
        ['CxO Email', div.cxo_email || ''],
        ['Prepared By', creatorDisplayName],
        ['Prepared By — Position', creatorDisplayPosition],
        ['Prepared By — Email', div.creator_email || ''],
        ['Current Total Headcount', div.current_total_hc || 0, '#,##0'],
        ['Current Total Budget (AZN)', div.current_total_budget || 0, '#,##0'],
        ['Headcount Target', div.headcount_target || 0, '#,##0'],
        ['Budget Target (AZN)', div.budget_target || 0, '#,##0'],
        ['Number of AS-IS Functions (as of export)', asIsFns.length],
        ['AS-IS Total Managers (as of export)', totalAsIsMgrs, '#,##0'],
        ['AS-IS Total Professionals (as of export)', totalAsIsProfs, '#,##0'],
        ['Workshop Status', ws.status || ''],
        ['Workshop Created', new Date(ws.created_at).toLocaleDateString()],
        ['Workshop Completed', ws.completed_at ? new Date(ws.completed_at).toLocaleDateString() : 'In Progress'],
        ['Last Updated', ws.updated_at ? new Date(ws.updated_at).toLocaleDateString() : ''],
      ];
      divInfo.forEach(([lbl, val, fmt]) => { writeKV(sh1, r, lbl, val, 4, fmt); r++; });
      r++;
      // AS-IS totals above (and the AS-IS Baseline sheet, and every AS-IS-derived figure in the
      // Final Summary/Dashboard sheets) reflect the division's *current* AS-IS data, not a
      // snapshot taken when this workshop ran -- AS-IS functions can be bulk-replaced via
      // Delete All / Autofill from Excel independently of any workshop. Said plainly here rather
      // than left implicit, since a completed workshop's AS-IS numbers can otherwise silently
      // drift from what was actually true when it was run.
      sh1.mergeCells(r, 1, r, 6);
      const noteCell = sh1.getCell(r, 1);
      noteCell.value = 'Note: AS-IS figures throughout this report reflect the division’s current AS-IS Baseline data as of the time of export, not a snapshot from when this workshop was run.';
      noteCell.font = mkFont({ italic: true, size: 9, color: { argb: C.gray } });
      noteCell.alignment = mkAlign('left', 'middle', true);
      sh1.getRow(r).height = 18; r += 2;

      writeBanner(sh1, r, 6, 'AS-IS BASELINE METRICS', S.sectionHdr); r++;
      // Labels must match _getDefaultMetrics() (the actual AS-IS Metrics page) exactly, or every
      // row silently renders blank via findMetric()'s label lookup below.
      const metricPairs = [
        ['Management Layers', 'Average Span of Control'],
        ['High Grade Employees', 'Low Grade Employees'],
        ['Multi-layered Hierarchy', 'Decentralized and Centralized'],
        ['Duplicated Functions', 'Shadow Support Functions'],
        ['Complex Manual Based Process and Job', 'Shared Services Opportunities'],
        ['Automation & AI Opportunities (RPA)', 'Outsourcing Opportunity'],
        ['Cost Median for Managers', 'Cost Median for Professionals'],
      ];
      metricPairs.forEach(([l1, l2]) => {
        sh1.getCell(r, 1).value = l1; applyStyle(sh1.getCell(r, 1), S.rowLabel);
        sh1.getCell(r, 2).value = findMetric(l1); applyStyle(sh1.getCell(r, 2), S.rowValue);
        if (l2) {
          sh1.getCell(r, 3).value = l2; applyStyle(sh1.getCell(r, 3), S.rowLabel);
          sh1.getCell(r, 4).value = findMetric(l2); applyStyle(sh1.getCell(r, 4), S.rowValue);
        }
        sh1.getRow(r).height = 18; r++;
      });
      r++;

      // Key Findings lives in its own store (getAAACards), not the AS-IS Metrics array -- it's a
      // list of free-text cards, not a single scalar, so it gets its own section rather than a
      // findMetric() row (which could never find it and can't hold more than one value anyway).
      writeBanner(sh1, r, 6, 'KEY FINDINGS', S.sectionHdr); r++;
      const keyFindings = (getAAACards()[div.id] || []).filter(f => (f || '').trim());
      if (keyFindings.length === 0) {
        sh1.mergeCells(r, 1, r, 6);
        const emptyCell = sh1.getCell(r, 1);
        emptyCell.value = 'No key findings recorded.';
        emptyCell.font = mkFont({ italic: true, color: { argb: C.gray } });
        emptyCell.alignment = mkAlign('left', 'middle');
        sh1.getRow(r).height = 18; r++;
      } else {
        keyFindings.forEach((finding, i) => {
          sh1.getCell(r, 1).value = `Finding #${i + 1}`; applyStyle(sh1.getCell(r, 1), S.rowLabel);
          sh1.mergeCells(r, 2, r, 6);
          const vc = sh1.getCell(r, 2); vc.value = finding; applyStyle(vc, S.rowValue);
          vc.alignment = mkAlign('left', 'middle', true);
          sh1.getRow(r).height = 32; r++;
        });
      }

      // ════════════════════════════════════════════════════════════════
      // SHEET 2 — AS-IS BASELINE
      // ════════════════════════════════════════════════════════════════
      const sh2 = workbook.addWorksheet('2. AS-IS Baseline');
      sh2.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
      sh2.columns = [
        { width: 5 }, { width: 28 }, { width: 20 }, { width: 10 }, { width: 10 },
        { width: 10 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 12 },
      ];
      r = 1;
      writeBanner(sh2, r, 11, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  AS-IS Baseline`, S.sheetTitle); r++;
      writeBanner(sh2, r, 11, '2. CURRENT FUNCTIONS / AS-IS BASELINE', S.sectionHdr); r++;
      const ai2Hdrs = ['#', 'Function Name', 'Parent Function', 'Mgrs HC', 'Profs HC', 'Total HC', 'HC Alloc %', 'Mgr Cost/mo', 'Prof Cost/mo', 'Total Cost/mo', 'Cost Alloc %'];
      writeTblHdr(sh2, r, ai2Hdrs);
      addFilter(sh2, r, ai2Hdrs.length); r++;
      const asIsById = {};
      asIsFns.forEach(f => asIsById[f.id] = f);
      asIsFns.forEach((f, i) => {
        const alt = i % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const csL = alt ? S.tblAltL : S.tblCellL;
        const parentName = f.parent_id && asIsById[f.parent_id] ? asIsById[f.parent_id].function_name : (f.parent_id ? '' : 'Division (Root)');
        const mgr = f.manager_count || 0;
        const prof = f.current_employee_count || 0;
        const mgrCost = f.managers_cost || 0;
        const profCost = f.professionals_cost || 0;
        const totalHC = mgr + prof;
        const totalCost = mgrCost + profCost;
        sh2.getCell(r, 1).value = i + 1; applyStyle(sh2.getCell(r, 1), cs);
        sh2.getCell(r, 2).value = f.function_name || 'Unnamed'; applyStyle(sh2.getCell(r, 2), csL);
        sh2.getCell(r, 3).value = parentName; applyStyle(sh2.getCell(r, 3), csL);
        sh2.getCell(r, 4).value = mgr; applyStyle(sh2.getCell(r, 4), cs); sh2.getCell(r, 4).numFmt = '#,##0';
        sh2.getCell(r, 5).value = prof; applyStyle(sh2.getCell(r, 5), cs); sh2.getCell(r, 5).numFmt = '#,##0';
        sh2.getCell(r, 6).value = totalHC; applyStyle(sh2.getCell(r, 6), cs); sh2.getCell(r, 6).numFmt = '#,##0';
        sh2.getCell(r, 7).value = totalAsIsHC > 0 ? totalHC / totalAsIsHC : 0; applyStyle(sh2.getCell(r, 7), cs); sh2.getCell(r, 7).numFmt = '0.0%';
        sh2.getCell(r, 8).value = mgrCost; applyStyle(sh2.getCell(r, 8), cs); sh2.getCell(r, 8).numFmt = '#,##0';
        sh2.getCell(r, 9).value = profCost; applyStyle(sh2.getCell(r, 9), cs); sh2.getCell(r, 9).numFmt = '#,##0';
        sh2.getCell(r, 10).value = totalCost; applyStyle(sh2.getCell(r, 10), cs); sh2.getCell(r, 10).numFmt = '#,##0';
        sh2.getCell(r, 11).value = totalAsIsBudget > 0 ? totalCost / totalAsIsBudget : 0; applyStyle(sh2.getCell(r, 11), cs); sh2.getCell(r, 11).numFmt = '0.0%';
        sh2.getRow(r).height = 18; r++;
      });
      // Totals row
      const ai2TotRow = sh2.getRow(r);
      ai2TotRow.getCell(1).value = ''; applyStyle(ai2TotRow.getCell(1), S.tblHdr);
      ai2TotRow.getCell(2).value = 'TOTAL'; applyStyle(ai2TotRow.getCell(2), S.tblHdr);
      ai2TotRow.getCell(3).value = ''; applyStyle(ai2TotRow.getCell(3), S.tblHdr);
      ai2TotRow.getCell(4).value = totalAsIsMgrs; applyStyle(ai2TotRow.getCell(4), S.tblHdr); ai2TotRow.getCell(4).numFmt = '#,##0';
      ai2TotRow.getCell(5).value = totalAsIsProfs; applyStyle(ai2TotRow.getCell(5), S.tblHdr); ai2TotRow.getCell(5).numFmt = '#,##0';
      ai2TotRow.getCell(6).value = totalAsIsHC; applyStyle(ai2TotRow.getCell(6), S.tblHdr); ai2TotRow.getCell(6).numFmt = '#,##0';
      ai2TotRow.getCell(7).value = ''; applyStyle(ai2TotRow.getCell(7), S.tblHdr);
      ai2TotRow.getCell(8).value = rootAsIsFns.reduce((s, f) => s + (f.managers_cost || 0), 0); applyStyle(ai2TotRow.getCell(8), S.tblHdr); ai2TotRow.getCell(8).numFmt = '#,##0';
      ai2TotRow.getCell(9).value = rootAsIsFns.reduce((s, f) => s + (f.professionals_cost || 0), 0); applyStyle(ai2TotRow.getCell(9), S.tblHdr); ai2TotRow.getCell(9).numFmt = '#,##0';
      ai2TotRow.getCell(10).value = totalAsIsBudget; applyStyle(ai2TotRow.getCell(10), S.tblHdr); ai2TotRow.getCell(10).numFmt = '#,##0';
      ai2TotRow.getCell(11).value = ''; applyStyle(ai2TotRow.getCell(11), S.tblHdr);
      ai2TotRow.height = 22;

      // ════════════════════════════════════════════════════════════════
      // SHEET 3 — PHASE 1
      // ════════════════════════════════════════════════════════════════
      const sh3 = workbook.addWorksheet('3. Phase 1 — Function Design');
      sh3.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
      sh3.columns = [
        { width: 5 }, { width: 28 }, { width: 14 }, { width: 18 }, { width: 22 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 36 },
      ];
      r = 1;
      writeBanner(sh3, r, 11, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Phase 1: Function Design`, S.sheetTitle); r++;
      writeBanner(sh3, r, 11, '3. PHASE 1 — FUNCTION DESIGN & ELIMINATION FILTER', S.sectionHdr); r++;
      const p1Hdrs = ['#', 'Function Name', 'Mgmt Level', 'Structure Type', 'Reports To (Parent)', 'Eliminate?', 'Automate?', 'Outsource?', 'Review Status', 'P1 Alert', 'Strategic Justification'];
      writeTblHdr(sh3, r, p1Hdrs);
      addFilter(sh3, r, p1Hdrs.length); r++;
      fns.forEach((f, i) => {
        const alt = i % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const csL = alt ? S.tblAltL : S.tblCellL;
        const elim = f.can_be_eliminated || '';
        const auto = f.can_be_automated || '';
        const out = f.can_be_outsourced || '';
        const reviewFail = elim === 'Yes' || auto === 'Yes' || out === 'Yes';
        const reviewStatus = reviewFail ? 'REVIEW REQUIRED' : 'PASSED FILTER';
        const alert = phase1AlertLabel(f.justification_alert) || (elim && auto && out ? computePhase1Alert(elim, auto, out) : '');
        const parentFn = fns.find(p => p.id === f.parent_id);
        sh3.getCell(r, 1).value = f.function_number; applyStyle(sh3.getCell(r, 1), cs);
        sh3.getCell(r, 2).value = f.proposed_function_name || ''; applyStyle(sh3.getCell(r, 2), csL);
        sh3.getCell(r, 3).value = f.career_level || ''; applyStyle(sh3.getCell(r, 3), cs);
        sh3.getCell(r, 4).value = f.function_structure_type || ''; applyStyle(sh3.getCell(r, 4), cs);
        sh3.getCell(r, 5).value = parentFn ? parentFn.proposed_function_name : '(Root)'; applyStyle(sh3.getCell(r, 5), csL);
        sh3.getCell(r, 6).value = elim; applyStyle(sh3.getCell(r, 6), elim === 'Yes' ? S.redBold : cs);
        sh3.getCell(r, 7).value = auto; applyStyle(sh3.getCell(r, 7), auto === 'Yes' ? S.goldBold : cs);
        sh3.getCell(r, 8).value = out;  applyStyle(sh3.getCell(r, 8), out  === 'Yes' ? S.goldBold : cs);
        applyStyle(sh3.getCell(r, 9), reviewFail ? S.redBold : S.greenBold); sh3.getCell(r, 9).value = reviewStatus;
        sh3.getCell(r, 10).value = alert || 'OK'; applyStyle(sh3.getCell(r, 10), alert && !alert.includes('PASSED') ? S.redBold : cs);
        sh3.getCell(r, 11).value = f.strategic_justification || ''; applyStyle(sh3.getCell(r, 11), csL);
        sh3.getRow(r).height = 18; r++;
      });

      // ════════════════════════════════════════════════════════════════
      // SHEET 4 — PHASE 2
      // ════════════════════════════════════════════════════════════════
      const sh4 = workbook.addWorksheet('4. Phase 1 — Scoring');
      sh4.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
      sh4.columns = [
        { width: 5 }, { width: 28 }, { width: 14 }, { width: 40 }, { width: 40 },
        { width: 14 }, { width: 30 }, { width: 30 },
      ];
      r = 1;
      writeBanner(sh4, r, 8, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Phase 1: Business Impact`, S.sheetTitle); r++;
      writeBanner(sh4, r, 8, '4. PHASE 1 — BUSINESS IMPACT & ZBOD DECISION', S.sectionHdr); r++;
      // Question legend sub-header
      sh4.mergeCells(`A${r}:H${r}`);
      const legCell = sh4.getCell(`A${r}`);
      legCell.value = 'SQ1: Does this function materially contribute to business strategy and outcomes?   |   SQ2: How critical is this function to business continuity and risk management?';
      applyStyle(legCell, { font: mkFont({ italic: true, size: 9, color: { argb: C.gray } }), fill: mkFill(C.gray2), alignment: mkAlign('left', 'middle') });
      sh4.getRow(r).height = 16; r++;
      const p2Hdrs = ['#', 'Function Name', 'Mgmt Level', 'SQ1 Answer', 'SQ2 Answer', 'ZBOD Decision', 'Business Impact Output', 'P1 Alert / Notes'];
      writeTblHdr(sh4, r, p2Hdrs);
      addFilter(sh4, r, p2Hdrs.length); r++;
      fns.forEach((f, i) => {
        const alt = i % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const csL = alt ? S.tblAltL : S.tblCellL;
        const dec = getDecision(f);
        sh4.getCell(r, 1).value = f.function_number; applyStyle(sh4.getCell(r, 1), cs);
        sh4.getCell(r, 2).value = f.proposed_function_name || ''; applyStyle(sh4.getCell(r, 2), csL);
        sh4.getCell(r, 3).value = f.career_level || ''; applyStyle(sh4.getCell(r, 3), cs);
        sh4.getCell(r, 4).value = impactAnswer('question1_score', f.question1_score); applyStyle(sh4.getCell(r, 4), csL);
        sh4.getCell(r, 5).value = impactAnswer('question2_score', f.question2_score); applyStyle(sh4.getCell(r, 5), csL);
        sh4.getCell(r, 6).value = dec; applyStyle(sh4.getCell(r, 6), decStyle(dec));
        sh4.getCell(r, 7).value = f.business_impact_output || ''; applyStyle(sh4.getCell(r, 7), csL);
        sh4.getCell(r, 8).value = phase1AlertLabel(f.justification_alert) || ''; applyStyle(sh4.getCell(r, 8), csL);
        sh4.getRow(r).height = 18; r++;
      });
      // Decision summary footer
      r++;
      sh4.mergeCells(`A${r}:H${r}`);
      const decSumCell = sh4.getCell(`A${r}`);
      decSumCell.value = `DECISION SUMMARY:   INVEST: ${inc.length}   |   KEEP: ${kp.length}   |   OPTIMIZE: ${opt.length}   |   ELIMINATE: ${elm.length}   |   Total Functions: ${fns.length}`;
      applyStyle(decSumCell, { font: mkFont({ bold: true, size: 11, color: { argb: C.white } }), fill: mkFill(C.navy), alignment: mkAlign('center', 'middle') });
      sh4.getRow(r).height = 24;

      // ════════════════════════════════════════════════════════════════
      // SHEET 5 — PHASE 3
      // ════════════════════════════════════════════════════════════════
      const sh5 = workbook.addWorksheet('5. Phase 2 — Allocation');
      sh5.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
      sh5.columns = [
        { width: 5 }, { width: 28 }, { width: 22 }, { width: 14 }, { width: 12 },
        { width: 12 }, { width: 12 }, { width: 14 }, { width: 10 }, { width: 10 },
        { width: 12 }, { width: 14 }, { width: 16 },
      ];
      r = 1;
      writeBanner(sh5, r, 13, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Phase 2: Resource Allocation`, S.sheetTitle); r++;
      writeBanner(sh5, r, 13, '5. PHASE 3 — RESOURCE ALLOCATION (TO-BE)', S.sectionHdr); r++;
      const p3Hdrs = ['#', 'Function Name', 'Parent (Allocation Base)', 'ZBOD Decision', 'HC Alloc %', 'Proposed HC', 'Cost Alloc %', 'Proposed Budget', 'Prop. Mgrs', 'Prop. Profs', 'Span of Control', 'Span Alert', 'Allocation Alert'];
      writeTblHdr(sh5, r, p3Hdrs);
      addFilter(sh5, r, p3Hdrs.length); r++;

      // Build parent map for allocation base label
      const fnById = {};
      fns.forEach(f => fnById[f.id] = f);
      fns.forEach((f, i) => {
        const alt = i % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const csL = alt ? S.tblAltL : S.tblCellL;
        const mgr = f.manager_count || 0;
        const prof = f.professional_count || 0;
        const span = mgr > 0 ? (prof / mgr) : null;
        const spanTxt = span !== null ? span.toFixed(1) : 'N/A';
        // Same rule as the Phase 2 card (per management layer), not a flat 8:1.
        const spanAlertTxt = getSpanAlert(span, f.career_level, mgr, prof) || (span !== null ? 'OK' : 'N/A');
        const parentFn2 = f.parent_id && fnById[f.parent_id] ? fnById[f.parent_id] : null;
        const allocBase = parentFn2 ? `${parentFn2.proposed_function_name} (HC: ${parentFn2.proposed_hc || 0})` : `Division Target (HC: ${div.headcount_target || 0})`;
        let allocAlert = '';
        if (f.hc_allocation_percent > 100) allocAlert += 'HC >100%; ';
        if (f.cost_allocation_percent > 100) allocAlert += 'Cost >100%; ';
        const dec = getDecision(f);
        sh5.getCell(r, 1).value = f.function_number; applyStyle(sh5.getCell(r, 1), cs);
        sh5.getCell(r, 2).value = f.proposed_function_name || ''; applyStyle(sh5.getCell(r, 2), csL);
        sh5.getCell(r, 3).value = allocBase; applyStyle(sh5.getCell(r, 3), csL);
        sh5.getCell(r, 4).value = dec; applyStyle(sh5.getCell(r, 4), decStyle(dec));
        sh5.getCell(r, 5).value = (f.hc_allocation_percent || 0) / 100; applyStyle(sh5.getCell(r, 5), cs); sh5.getCell(r, 5).numFmt = '0.0%';
        sh5.getCell(r, 6).value = f.proposed_hc || 0; applyStyle(sh5.getCell(r, 6), S.greenBold); sh5.getCell(r, 6).numFmt = '#,##0';
        sh5.getCell(r, 7).value = (f.cost_allocation_percent || 0) / 100; applyStyle(sh5.getCell(r, 7), cs); sh5.getCell(r, 7).numFmt = '0.0%';
        sh5.getCell(r, 8).value = f.proposed_budget || 0; applyStyle(sh5.getCell(r, 8), S.greenBold); sh5.getCell(r, 8).numFmt = '#,##0';
        sh5.getCell(r, 9).value = mgr; applyStyle(sh5.getCell(r, 9), cs); sh5.getCell(r, 9).numFmt = '#,##0';
        sh5.getCell(r, 10).value = prof; applyStyle(sh5.getCell(r, 10), cs); sh5.getCell(r, 10).numFmt = '#,##0';
        sh5.getCell(r, 11).value = spanTxt; applyStyle(sh5.getCell(r, 11), cs);
        sh5.getCell(r, 12).value = spanAlertTxt; applyStyle(sh5.getCell(r, 12), (spanAlertTxt === 'Healthy Span' || spanAlertTxt === 'OK') ? S.greenBold : (spanAlertTxt === 'N/A' ? cs : S.redBold));
        sh5.getCell(r, 13).value = allocAlert || 'OK'; applyStyle(sh5.getCell(r, 13), allocAlert ? S.redBold : S.greenBold);
        sh5.getRow(r).height = 18; r++;
      });
      // Phase 3 totals
      const p3TotRow = sh5.getRow(r);
      ['', 'TOTAL', '', '', '', '', '', '', '', '', '', '', ''].forEach((v, i) => {
        applyStyle(p3TotRow.getCell(i + 1), S.tblHdr);
        p3TotRow.getCell(i + 1).value = v;
      });
      p3TotRow.getCell(6).value = totalToBeHC; p3TotRow.getCell(6).numFmt = '#,##0';
      p3TotRow.getCell(8).value = totalToBeBudget; p3TotRow.getCell(8).numFmt = '#,##0';
      p3TotRow.getCell(9).value = totalToBeMgrs; p3TotRow.getCell(9).numFmt = '#,##0';
      p3TotRow.getCell(10).value = totalToBeProfs; p3TotRow.getCell(10).numFmt = '#,##0';
      p3TotRow.height = 22;

      // ════════════════════════════════════════════════════════════════
      // SHEET 6 — FINAL SUMMARY
      // ════════════════════════════════════════════════════════════════
      const sh6 = workbook.addWorksheet('6. Final Summary');
      sh6.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];
      sh6.columns = [{ width: 32 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 22 }];
      r = 1;
      writeBanner(sh6, r, 5, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Final Summary`, S.sheetTitle); r++;
      writeBanner(sh6, r, 5, '6. FINAL REVIEW & SUMMARY', S.sectionHdr); r++;

      const summaryKVs = isAsIs ? [
        ['', 'AS-IS', 'TARGET', '', 'STATUS'],
        ['Total Headcount', totalAsIsHC, div.headcount_target || 0, '', asIsHcDiff === 0 ? 'On Target' : asIsHcDiff > 0 ? `Over by ${asIsHcDiff}` : `Under by ${Math.abs(asIsHcDiff)}`],
        ['Total Budget (AZN)', totalAsIsBudget, div.budget_target || 0, '', asIsBudgDiff === 0 ? 'On Target' : asIsBudgDiff > 0 ? `Over by ${asIsBudgDiff.toLocaleString()}` : `Under by ${Math.abs(asIsBudgDiff).toLocaleString()}`],
        ['Total Managers', totalAsIsMgrs, '', '', ''],
        ['Total Professionals', totalAsIsProfs, '', '', ''],
        ['Average Span of Control', '', '', '', asIsAvgSpan !== 'N/A' && parseFloat(asIsAvgSpan) > 8 ? 'Warning: >8:1' : 'OK'],
        ['Number of Functions', asIsFns.length, '', '', ''],
      ] : [
        ['', 'AS-IS', 'TARGET', 'PROPOSED', 'STATUS'],
        ['Total Headcount', totalAsIsHC, div.headcount_target || 0, totalToBeHC, hcDiff === 0 ? 'On Target' : hcDiff > 0 ? `Over by ${hcDiff}` : `Under by ${Math.abs(hcDiff)}`],
        ['Total Budget (AZN)', totalAsIsBudget, div.budget_target || 0, totalToBeBudget, budgDiff === 0 ? 'On Target' : budgDiff > 0 ? `Over by ${budgDiff.toLocaleString()}` : `Under by ${Math.abs(budgDiff).toLocaleString()}`],
        ['Total Managers', totalAsIsMgrs, '', totalToBeMgrs, ''],
        ['Total Professionals', totalAsIsProfs, '', totalToBeProfs, ''],
        ['Average Span of Control', '', '', avgSpan, avgSpan !== 'N/A' && parseFloat(avgSpan) > 8 ? 'Warning: >8:1' : 'OK'],
        ['Number of Functions', asIsFns.length, '', fns.length, ''],
      ];
      summaryKVs.forEach((row, idx) => {
        if (idx === 0) {
          // Column headers
          row.forEach((v, c) => {
            const cell = sh6.getCell(r, c + 1);
            cell.value = v;
            applyStyle(cell, c === 0 ? S.rowLabel : S.tblHdr);
          });
          sh6.getRow(r).height = 22; r++;
        } else {
          const [lbl, asis, tgt, prop, status] = row;
          sh6.getCell(r, 1).value = lbl; applyStyle(sh6.getCell(r, 1), S.rowLabel);
          sh6.getCell(r, 2).value = asis !== '' ? asis : '—'; applyStyle(sh6.getCell(r, 2), S.tblCell); if (typeof asis === 'number') sh6.getCell(r, 2).numFmt = '#,##0';
          sh6.getCell(r, 3).value = tgt !== '' ? tgt : '—'; applyStyle(sh6.getCell(r, 3), S.goldBold); if (typeof tgt === 'number') sh6.getCell(r, 3).numFmt = '#,##0';
          sh6.getCell(r, 4).value = prop !== '' ? prop : '—'; applyStyle(sh6.getCell(r, 4), S.greenBold); if (typeof prop === 'number') sh6.getCell(r, 4).numFmt = '#,##0';
          const isOverTarget = typeof status === 'string' && status.startsWith('Over');
          const isOnTarget = status === 'On Target' || status === 'OK';
          sh6.getCell(r, 5).value = status || '—';
          applyStyle(sh6.getCell(r, 5), isOnTarget ? S.greenBold : isOverTarget ? S.redBold : S.tblCell);
          sh6.getRow(r).height = 18; r++;
        }
      });
      r++;

      // Decision breakdown table
      writeBanner(sh6, r, 5, 'ZBOD DECISION BREAKDOWN', S.sectionHdr); r++;
      const decBreakHdrs = ['Decision', 'Count', '% of Total', 'Proposed HC', 'Proposed Budget (AZN)'];
      writeTblHdr(sh6, r, decBreakHdrs); r++;
      const decRows = [
        ['INVEST',    inc, S.greenBold],
        ['KEEP',      kp,  S.goldBold],
        ['OPTIMIZE',  opt, S.blueBold],
        ['ELIMINATE', elm, S.redBold],
      ];
      decRows.forEach(([label, arr, style]) => {
        const pct = fns.length > 0 ? arr.length / fns.length : 0;
        const rootArr = arr.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
        const dHC = rootArr.reduce((s, f) => s + (f.proposed_hc || 0), 0);
        const dBudg = rootArr.reduce((s, f) => s + (f.proposed_budget || 0), 0);
        sh6.getCell(r, 1).value = label; applyStyle(sh6.getCell(r, 1), style);
        sh6.getCell(r, 2).value = arr.length; applyStyle(sh6.getCell(r, 2), S.tblCell);
        sh6.getCell(r, 3).value = pct; applyStyle(sh6.getCell(r, 3), S.tblCell); sh6.getCell(r, 3).numFmt = '0.0%';
        sh6.getCell(r, 4).value = dHC; applyStyle(sh6.getCell(r, 4), S.tblCell); sh6.getCell(r, 4).numFmt = '#,##0';
        sh6.getCell(r, 5).value = dBudg; applyStyle(sh6.getCell(r, 5), S.tblCell); sh6.getCell(r, 5).numFmt = '#,##0';
        sh6.getRow(r).height = 20; r++;
      });
      // Totals
      const decTotRow = sh6.getRow(r);
      decTotRow.getCell(1).value = 'TOTAL'; applyStyle(decTotRow.getCell(1), S.tblHdr);
      decTotRow.getCell(2).value = fns.length; applyStyle(decTotRow.getCell(2), S.tblHdr);
      decTotRow.getCell(3).value = ''; applyStyle(decTotRow.getCell(3), S.tblHdr);
      decTotRow.getCell(4).value = totalToBeHC; applyStyle(decTotRow.getCell(4), S.tblHdr); decTotRow.getCell(4).numFmt = '#,##0';
      decTotRow.getCell(5).value = totalToBeBudget; applyStyle(decTotRow.getCell(5), S.tblHdr); decTotRow.getCell(5).numFmt = '#,##0';
      decTotRow.height = 22;

      // ════════════════════════════════════════════════════════════════
      // SHEET 7 — DASHBOARD
      // ════════════════════════════════════════════════════════════════
      const sh7 = workbook.addWorksheet('7. Dashboard');
      sh7.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];
      sh7.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 18 }];
      r = 1;
      writeBanner(sh7, r, 6, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Dashboard`, S.sheetTitle); r++;

      // HC comparison block
      writeBanner(sh7, r, 6, isAsIs ? 'HEADCOUNT COMPARISON (AS-IS vs TARGET)' : 'HEADCOUNT COMPARISON (AS-IS vs TARGET vs PROPOSED)', S.sectionHdr); r++;
      (isAsIs ? [
        ['AS-IS Total HC',   totalAsIsHC,           '#,##0', S.tblCell],
        ['Target HC',        div.headcount_target || 0, '#,##0', S.goldBold],
        ['HC Difference (AS-IS vs Target)', asIsHcDiff, '+#,##0;-#,##0;0', asIsHcDiff > 0 ? S.redBold : asIsHcDiff < 0 ? S.greenBold : S.tblCell],
        ['HC Change %', div.headcount_target > 0 ? (asIsHcDiff / div.headcount_target) : 0, '0.0%', S.tblCell],
      ] : [
        ['AS-IS Total HC',   totalAsIsHC,           '#,##0', S.tblCell],
        ['Target HC',        div.headcount_target || 0, '#,##0', S.goldBold],
        ['Proposed HC',      totalToBeHC,           '#,##0', S.greenBold],
        ['HC Difference (Proposed vs Target)', hcDiff, '+#,##0;-#,##0;0', hcDiff > 0 ? S.redBold : hcDiff < 0 ? S.greenBold : S.tblCell],
        ['HC Change %', div.headcount_target > 0 ? (hcDiff / div.headcount_target) : 0, '0.0%', S.tblCell],
      ]).forEach(([lbl, val, fmt, style]) => {
        sh7.getCell(r, 1).value = lbl; applyStyle(sh7.getCell(r, 1), S.rowLabel);
        sh7.getCell(r, 2).value = val; applyStyle(sh7.getCell(r, 2), style); sh7.getCell(r, 2).numFmt = fmt;
        sh7.getRow(r).height = 18; r++;
      });
      r++;

      // Budget comparison block
      writeBanner(sh7, r, 6, isAsIs ? 'BUDGET COMPARISON (AS-IS vs TARGET)' : 'BUDGET COMPARISON (AS-IS vs TARGET vs PROPOSED)', S.sectionHdr); r++;
      (isAsIs ? [
        ['AS-IS Total Budget (AZN)',   totalAsIsBudget,         '#,##0', S.tblCell],
        ['Target Budget (AZN)',        div.budget_target || 0,  '#,##0', S.goldBold],
        ['Budget Difference (AS-IS vs Target)', asIsBudgDiff, '+#,##0;-#,##0;0', asIsBudgDiff > 0 ? S.redBold : asIsBudgDiff < 0 ? S.greenBold : S.tblCell],
        ['Budget Change %', div.budget_target > 0 ? (asIsBudgDiff / div.budget_target) : 0, '0.0%', S.tblCell],
      ] : [
        ['AS-IS Total Budget (AZN)',   totalAsIsBudget,         '#,##0', S.tblCell],
        ['Target Budget (AZN)',        div.budget_target || 0,  '#,##0', S.goldBold],
        ['Proposed Budget (AZN)',      totalToBeBudget,         '#,##0', S.greenBold],
        ['Budget Difference (Proposed vs Target)', budgDiff, '+#,##0;-#,##0;0', budgDiff > 0 ? S.redBold : budgDiff < 0 ? S.greenBold : S.tblCell],
        ['Budget Change %', div.budget_target > 0 ? (budgDiff / div.budget_target) : 0, '0.0%', S.tblCell],
      ]).forEach(([lbl, val, fmt, style]) => {
        sh7.getCell(r, 1).value = lbl; applyStyle(sh7.getCell(r, 1), S.rowLabel);
        sh7.getCell(r, 2).value = val; applyStyle(sh7.getCell(r, 2), style); sh7.getCell(r, 2).numFmt = fmt;
        sh7.getRow(r).height = 18; r++;
      });
      r++;

      // Manager & professional block
      writeBanner(sh7, r, 6, 'PEOPLE COMPOSITION', S.sectionHdr); r++;
      (isAsIs ? [
        ['AS-IS Managers',          totalAsIsMgrs,  '#,##0', S.tblCell],
        ['AS-IS Professionals',     totalAsIsProfs, '#,##0', S.tblCell],
        ['Average Span of Control', asIsAvgSpan === 'N/A' ? 'N/A' : parseFloat(asIsAvgSpan), asIsAvgSpan === 'N/A' ? '' : '0.0', S.tblCell],
      ] : [
        ['AS-IS Managers',          totalAsIsMgrs,  '#,##0', S.tblCell],
        ['Proposed Managers',       totalToBeMgrs,  '#,##0', S.greenBold],
        ['AS-IS Professionals',     totalAsIsProfs, '#,##0', S.tblCell],
        ['Proposed Professionals',  totalToBeProfs, '#,##0', S.greenBold],
        ['Average Span of Control', avgSpan === 'N/A' ? 'N/A' : parseFloat(avgSpan), avgSpan === 'N/A' ? '' : '0.0', S.tblCell],
      ]).forEach(([lbl, val, fmt, style]) => {
        sh7.getCell(r, 1).value = lbl; applyStyle(sh7.getCell(r, 1), S.rowLabel);
        sh7.getCell(r, 2).value = val; applyStyle(sh7.getCell(r, 2), style); if (fmt) sh7.getCell(r, 2).numFmt = fmt;
        sh7.getRow(r).height = 18; r++;
      });
      r++;

      // Decision distribution
      writeBanner(sh7, r, 6, 'DECISION DISTRIBUTION', S.sectionHdr); r++;
      writeTblHdr(sh7, r, ['Decision', 'Count', '% of Total', 'Proposed HC', 'Proposed Budget (AZN)', '']); r++;
      [
        ['INVEST',    inc, S.greenBold],
        ['KEEP',      kp,  S.goldBold],
        ['OPTIMIZE',  opt, S.blueBold],
        ['ELIMINATE', elm, S.redBold],
      ].forEach(([label, arr, style], idx) => {
        const alt = idx % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const pct = fns.length > 0 ? arr.length / fns.length : 0;
        const rootArr = arr.filter(f => !(f.parent_id && fnIds.has(f.parent_id)));
        const dHC = rootArr.reduce((s, f) => s + (f.proposed_hc || 0), 0);
        const dBudg = rootArr.reduce((s, f) => s + (f.proposed_budget || 0), 0);
        sh7.getCell(r, 1).value = label; applyStyle(sh7.getCell(r, 1), style);
        sh7.getCell(r, 2).value = arr.length; applyStyle(sh7.getCell(r, 2), cs);
        sh7.getCell(r, 3).value = pct; applyStyle(sh7.getCell(r, 3), cs); sh7.getCell(r, 3).numFmt = '0.0%';
        sh7.getCell(r, 4).value = dHC; applyStyle(sh7.getCell(r, 4), cs); sh7.getCell(r, 4).numFmt = '#,##0';
        sh7.getCell(r, 5).value = dBudg; applyStyle(sh7.getCell(r, 5), cs); sh7.getCell(r, 5).numFmt = '#,##0';
        sh7.getCell(r, 6).value = ''; applyStyle(sh7.getCell(r, 6), cs);
        sh7.getRow(r).height = 20; r++;
      });

      // ════════════════════════════════════════════════════════════════
      // SHEET 8 — RAW DATA
      // ════════════════════════════════════════════════════════════════
      const sh8 = workbook.addWorksheet('8. Raw Data');
      sh8.views = [{ state: 'frozen', ySplit: 2, xSplit: 2 }];
      sh8.columns = [
        { width: 5  }, { width: 26 }, { width: 22 }, { width: 14 }, { width: 18 },
        { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 },
        { width: 12 }, { width: 36 }, { width: 36 }, { width: 16 },
        { width: 10 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 10 },
        { width: 10 }, { width: 12 }, { width: 14 }, { width: 18 },
      ];
      r = 1;
      writeBanner(sh8, r, 23, `ZBOD REPORT  —  ${div.structure_name || 'Division'}  |  Raw Data (Machine-Readable)`, S.sheetTitle); r++;
      const rawHdrs = [
        '#', 'Function Name', 'Parent Function', 'Mgmt Level', 'Structure Type',
        'Eliminate?', 'Automate?', 'Outsource?', 'P1 Alert', 'SQ1 Answer',
        'SQ2 Answer', 'ZBOD Decision', 'P1 Review Status',
        'HC Alloc %', 'Proposed HC', 'Cost Alloc %', 'Proposed Budget (AZN)',
        'Prop. Managers', 'Prop. Professionals', 'Span of Control',
        'Span Alert', 'Strategic Justification', 'Business Impact Output',
      ];
      writeTblHdr(sh8, r, rawHdrs);
      addFilter(sh8, r, rawHdrs.length); r++;
      fns.forEach((f, i) => {
        const alt = i % 2 === 1;
        const cs = alt ? S.tblAlt : S.tblCell;
        const csL = alt ? S.tblAltL : S.tblCellL;
        const elim = f.can_be_eliminated || '';
        const auto = f.can_be_automated || '';
        const out  = f.can_be_outsourced || '';
        const alert = phase1AlertLabel(f.justification_alert) || (elim && auto && out ? computePhase1Alert(elim, auto, out) : '');
        const reviewFail = elim === 'Yes' || auto === 'Yes' || out === 'Yes';
        const dec = getDecision(f);
        const parentFnRaw = f.parent_id && fnById[f.parent_id] ? fnById[f.parent_id] : null;
        const mgr  = f.manager_count || 0;
        const prof = f.professional_count || 0;
        const span = mgr > 0 ? (prof / mgr) : null;
        const cells = [
          [f.function_number, cs],
          [f.proposed_function_name || '', csL],
          [parentFnRaw ? parentFnRaw.proposed_function_name : '(Root)', csL],
          [f.career_level || '', cs],
          [f.function_structure_type || '', cs],
          [elim, elim === 'Yes' ? S.redBold : cs],
          [auto, auto === 'Yes' ? S.goldBold : cs],
          [out,  out  === 'Yes' ? S.goldBold : cs],
          [alert || 'OK', cs],
          [impactAnswer('question1_score', f.question1_score), csL],
          [impactAnswer('question2_score', f.question2_score), csL],
          [dec, decStyle(dec)],
          [reviewFail ? 'REVIEW REQUIRED' : 'PASSED FILTER', reviewFail ? S.redBold : S.greenBold],
          [(f.hc_allocation_percent || 0) / 100, cs],
          [f.proposed_hc || 0, S.greenBold],
          [(f.cost_allocation_percent || 0) / 100, cs],
          [f.proposed_budget || 0, S.greenBold],
          [mgr, cs],
          [prof, cs],
          [span !== null ? span : 'N/A', cs],
          [getSpanAlert(span, f.career_level, mgr, prof) || (span !== null ? 'OK' : 'N/A'), cs],
          [f.strategic_justification || '', csL],
          [f.business_impact_output || '', csL],
        ];
        const numFmts = [null, null, null, null, null, null, null, null, null, null, null, null, null, '0.0%', '#,##0', '0.0%', '#,##0', '#,##0', '#,##0', '0.0', null, null, null];
        cells.forEach(([val, style], ci) => {
          const cell = sh8.getCell(r, ci + 1);
          cell.value = val;
          applyStyle(cell, style);
          if (numFmts[ci]) cell.numFmt = numFmts[ci];
        });
        sh8.getRow(r).height = 18; r++;
      });

      // ════════════════════════════════════════════════════════════════
      // Write file
      // ════════════════════════════════════════════════════════════════
      const safeName = (div.structure_name || 'Division').replace(/[^a-zA-Z0-9]/g, '_');
      const wsDateFile = ws.completed_at ? new Date(ws.completed_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const fileName = `ZBOD_Report_${safeName}_${wsDateFile}.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, fileName);

      this.closeExportModal();
      toast('Report exported successfully.');
    } catch (err) {
      console.error('Export error:', err);
      toast('Export failed: ' + err.message);
    }
  },

  // === ORG CHART CONTROLS ===
  // id="org-canvas" is reused by renderOrgChart/renderAsIsOrgChart across Phase 1, Transition and
  // History Review, and hidden (not removed) .page divs left over from earlier navigation can each
  // hold their own copy in the DOM at once. Every lookup below is scoped to the visible .page so
  // these controls always act on the chart the user is actually looking at.
  orgZoom(delta) {
    const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
    const next = Math.max(0.3, Math.min(2.5, orgZoomScale + delta));
    if (canvas) ocApplyZoom(canvas, next); else orgZoomScale = next;
  },
  orgZoomReset() {
    const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
    if (canvas) ocApplyZoom(canvas, 1); else orgZoomScale = 1.0;
  },
  orgZoomFit() {
    const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
    if (canvas && canvas.dataset.w) { ocFit(canvas, 1.5, 0.25); return; } // TO-BE chart: fit both ways, however small
    const viewport = canvas?.parentElement;
    if (!canvas || !viewport) return;
    const vW = viewport.clientWidth - 48;
    const cW = canvas.scrollWidth;
    if (cW > 0) {
      orgZoomScale = Math.max(0.3, Math.min(1.0, vW / cW));
      canvas.style.transform = `scale(${orgZoomScale})`;
    }
  },
  setOrgHighlight(k) {
    window._ocHl = (k && window._ocHl !== k) ? k : null;
    ocApplyHighlight();
  },
  // Scroll-wheel zoom on the editable chart, anchored on the cursor so the point under it stays put.
  orgWheel(e) {
    e.preventDefault();
    const vp = e.currentTarget;
    const canvas = vp.querySelector('#org-canvas');
    const sz = canvas && canvas.parentElement;
    if (!canvas || !sz) return;
    const old = orgZoomScale;
    const next = Math.max(0.3, Math.min(2.5, old * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    if (Math.abs(next - old) < 0.001) return;
    const r = vp.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const px = (vp.scrollLeft + cx - sz.offsetLeft) / old;
    const py = (vp.scrollTop + cy - sz.offsetTop) / old;
    // No animation while wheeling, or the sizer's offset would be read mid-transition.
    canvas.style.transition = sz.style.transition = 'none';
    ocApplyZoom(canvas, next);
    vp.scrollLeft = px * next + sz.offsetLeft - cx;
    vp.scrollTop = py * next + sz.offsetTop - cy;
    window._ocHintSeen = true;
    const h = document.getElementById('p1-hint'); if (h) h.remove();
    clearTimeout(this._wheelT);
    this._wheelT = setTimeout(() => { canvas.style.transition = sz.style.transition = ''; }, 200);
  },
  // Restores 100% zoom AND centers the chart in the viewport (unlike orgZoomReset, which only
  // resets scale) — this is what the org chart's "reset" control (the circular-arrow button)
  // triggers, distinct from the "1:1" button's plain actual-size reset.
  orgZoomResetCenter() {
    orgZoomScale = 1.0;
    const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
    const viewport = canvas?.parentElement;
    if (!canvas || !viewport) return;
    canvas.style.transform = 'scale(1)';
    viewport.scrollLeft = Math.max(0, (canvas.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (canvas.scrollHeight - viewport.clientHeight) / 2);
  },
  // Phase 1's "Full Screen" toggle — expands the org chart card to fill the entire browser
  // viewport via a fixed-position overlay (not the native Fullscreen API, so it works the same
  // way whether this page is embedded in an iframe or opened directly, with no permission
  // prompt). Re-fits the chart to whichever viewport size is now active rather than leaving it
  // at its old scale, which would otherwise look arbitrarily cropped or tiny after the resize.
  toggleOrgFullscreen() {
    const card = document.getElementById('p1-orgchart-card');
    const btn = document.getElementById('oc-fs-toggle-btn');
    if (!card) return;
    const isFs = state.ocFullscreen = !state.ocFullscreen;
    card.classList.toggle('oc-fullscreen', isFs);
    // The enter animation belongs to the toggle only — re-renders while already full screen
    // (after each save) must not replay it.
    card.classList.toggle('oc-fs-enter', isFs);
    document.body.classList.toggle('oc-fullscreen-lock', isFs);
    if (btn) {
      btn.innerHTML = isFs ? `${ICONS.minimize} Exit Full Screen` : `${ICONS.maximize} Full Screen`;
      btn.title = isFs ? 'Exit full screen' : 'Expand to full screen';
    }
    requestAnimationFrame(() => this.orgZoomFit());
  },
  toggleP3Child(fnId) {
    if (state.p3ExpandedChildren.has(fnId)) {
      state.p3ExpandedChildren.delete(fnId);
    } else {
      state.p3ExpandedChildren.add(fnId);
    }
    renderPhase3();
  },
  toggleOrgNode(nodeId) {
    if (!window.orgCollapsedNodes) window.orgCollapsedNodes = new Set();
    if (window.orgCollapsedNodes.has(nodeId)) {
      window.orgCollapsedNodes.delete(nodeId);
    } else {
      window.orgCollapsedNodes.add(nodeId);
    }
    const ws = getWs().find(w => w.id === state.selectedWorkshopId);
    if (!ws) return;
    const div = getDivs().find(d => d.id === ws.division_id);
    if (!div) return;
    const fns = freshWorkshopFns(ws).sort((a, b) => a.function_number - b.function_number);
    const container = document.querySelector('.org-chart-container');
    const oldVp = container && container.querySelector('.oc-viewport');
    const keep = oldVp ? { l: oldVp.scrollLeft, t: oldVp.scrollTop } : null;
    if (container) container.innerHTML = renderOrgChart(fns, div.structure_name, div, state.currentPage === 'phase1');
    const newVp = container && container.querySelector('.oc-viewport');
    if (newVp && keep) { newVp.scrollLeft = keep.l; newVp.scrollTop = keep.t; }
    ocApplyHighlight();
  },
  // Mirrors toggleOrgNode above but for the AS-IS org chart: its own collapse-state set
  // (window.asIsOrgCollapsedNodes, never shared with the TO-BE chart's), and resolves the right
  // workshop/division via chartPrefix since this chart is shared between the just-completed
  // workshop view (chartPrefix '') and the History Review view (chartPrefix 'hist_'), which keep
  // their "currently viewed workshop" in different state fields.
  toggleAsIsOrgNode(nodeId, chartPrefix) {
    if (!window.asIsOrgCollapsedNodes) window.asIsOrgCollapsedNodes = new Set();
    if (window.asIsOrgCollapsedNodes.has(nodeId)) {
      window.asIsOrgCollapsedNodes.delete(nodeId);
    } else {
      window.asIsOrgCollapsedNodes.add(nodeId);
    }
    const wsId = chartPrefix === 'hist_' ? state.selectedHistoryWorkshopId : state.selectedWorkshopId;
    const ws = getWs().find(w => w.id === wsId);
    if (!ws) return;
    const asIsFns = getWorkshopAsIs(ws);
    // Scoped to the page that's actually showing this chart: the Transition and History Review
    // pages can both have a populated (but hidden) .org-chart-container left over in the DOM from
    // an earlier visit in the same session, so an unscoped querySelector could silently update the
    // wrong, invisible one instead of the chart the user is actually looking at.
    const pageId = chartPrefix === 'hist_' ? 'history-review-content' : 'transition-content';
    const container = document.querySelector(`#${pageId} .org-chart-container`);
    if (container) container.innerHTML = renderAsIsOrgChart(asIsFns, chartPrefix);
    const canvas = document.querySelector('.page:not(.hidden) #org-canvas');
    if (canvas && orgZoomScale !== 1) canvas.style.transform = `scale(${orgZoomScale})`;
  },
  startOrgPan(event) {
    const viewport = event.currentTarget;
    orgIsPanning = true;
    orgPanStart = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.style.cursor = 'grabbing';
  },
  doOrgPan(event) {
    if (!orgIsPanning) return;
    const viewport = event.currentTarget;
    const dx = event.clientX - orgPanStart.x;
    const dy = event.clientY - orgPanStart.y;
    if (!window._ocHintSeen && Math.abs(dx) + Math.abs(dy) > 6) {
      window._ocHintSeen = true;
      const h = document.getElementById('p1-hint'); if (h) h.remove();
    }
    viewport.scrollLeft = orgPanStart.scrollLeft - dx;
    viewport.scrollTop = orgPanStart.scrollTop - dy;
  },
  endOrgPan(event) {
    if (!orgIsPanning) return;
    orgIsPanning = false;
    event.currentTarget.style.cursor = 'grab';
  },

  // === SIGN IN ===
  // Real authentication: the password goes to Supabase Auth, is verified against a hash there, and
  // never exists in this file, in the database, or in localStorage. An account also needs a
  // `profiles` row — that is what carries its role, and only an admin can create one, so an auth
  // account made by any other route cannot get in.
  async signIn() {
    const input = document.getElementById('signin-email-input');
    const passwordInput = document.getElementById('signin-password-input');
    const errorEl = document.getElementById('signin-error');
    const email = (input.value || '').trim();
    const password = passwordInput.value || '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Zəhmət olmasa düzgün email daxil edin.';
      return;
    }
    if (!password) { errorEl.textContent = 'Parol daxil edin.'; return; }
    const sb = window.zbodSupabase;
    if (!sb || !sb.supabaseAvailable) {
      errorEl.textContent = 'Bazaya bağlantı yoxdur. İnternet bağlantınızı yoxlayın.';
      return;
    }

    errorEl.textContent = '';
    const btn = document.querySelector('#page-signin .zbod-btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Yoxlanılır…'; }
    const res = await sb.sbAuthSignIn(email, password);
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
      errorEl.textContent = /invalid login/i.test(res.error || '')
        ? 'Email və ya parol yanlışdır.' : (res.error || 'Giriş alınmadı.');
      return;
    }

    // Signed in, but the account still needs a profile: without one it has no role, and letting it
    // through would mean an unknown permission level.
    const profile = await resolveSession();
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    if (!profile) {
      await sb.sbAuthSignOut();
      errorEl.textContent = 'Bu hesaba icazə verilməyib. Administratorla əlaqə saxlayın.';
      return;
    }
    passwordInput.value = '';
    await this.init();
  },

  async signOut() {
    const sb = window.zbodSupabase;
    // Changes still waiting to reach the cloud get one last chance (bounded, so sign-out can't hang).
    if (sb && sb.supabaseAvailable && sb.sbFlushOutbox && sb.sbOutboxCount && sb.sbOutboxCount() > 0) {
      try { await Promise.race([sb.sbFlushOutbox(), new Promise(r => setTimeout(r, 5000))]); } catch (_) {}
    }
    if (sb && sb.supabaseAvailable) await sb.sbAuthSignOut();
    setCurrentProfile(null);
    // Nothing of the account that just left may stay on this computer: structures, AS-IS salary
    // costs, workshops, the profile list and the sync queue are all removed.
    clearLocalWorkspaceCache();
    state.selectedDivisionId = null; state.selectedWorkshopId = null; state.selectedHistoryWorkshopId = null;
    state.phase3Values = {}; state.asIsNewRows = []; state.asIsEditing = {}; state.fnModal = null;
    const input = document.getElementById('signin-email-input');
    if (input) input.value = '';
    const passwordInput = document.getElementById('signin-password-input');
    if (passwordInput) passwordInput.value = '';
    const errorEl = document.getElementById('signin-error');
    if (errorEl) errorEl.textContent = '';
    showPage('signin');
  },

  // === INIT ===
  async init() {
    // Trust the Supabase session, not a leftover localStorage flag: a stale email in storage must
    // not stand in for being signed in.
    const profile = currentProfile || await resolveSession();
    if (!profile) { setCurrentProfile(null); showPage('signin'); return; }
    const email = profile.email || '';
    const displayName = getDisplayName(email);
    const initialsEl = document.getElementById('user-session-initials');
    if (initialsEl) initialsEl.textContent = getInitials(displayName);
    const sessionNameEl = document.getElementById('user-session-name');
    if (sessionNameEl) sessionNameEl.textContent = displayName;
    const sessionEmailEl = document.getElementById('user-session-email');
    if (sessionEmailEl) sessionEmailEl.textContent = email;
    const adminEmailEl = document.getElementById('admin-user-email');
    if (adminEmailEl) adminEmailEl.textContent = displayName;
    if (profile.role === 'admin') {
      // Admin used to skip bootZbod() entirely and never loaded cloud data, so a fresh browser
      // showed an empty Manage Users / Divisions / Landing editor even though the real data was
      // sitting in Supabase all along.
      if (window.zbodSupabase && window.zbodSupabase.sbFlushOutbox) {
        try { await Promise.race([window.zbodSupabase.sbFlushOutbox(), new Promise(r => setTimeout(r, 8000))]); } catch (_) {}
      }
      await loadFromSupabase();
      repairParentCycles();
      showPage('admin'); renderLanding(); return;
    }
    await this.bootZbod();
  },

  // === MANAGE USERS (Admin only) ===
  goToAdmin() { showPage('admin'); renderLanding(); },

  // One-click full backup. The Supabase free plan takes no backups at all, so without this the
  // only copy of a workshop is the live database — one mistaken delete and it is gone. Reads
  // everything the signed-in admin is allowed to see and saves it as a single JSON file; run it
  // before anything risky, and periodically.
  //
  // Read-only: it writes nothing and changes nothing, so it cannot itself become the accident.
  async downloadBackup() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const sb = window.zbodSupabase;
    if (!sb || !sb.supabaseAvailable) { toast('Bazaya bağlantı yoxdur', { type: 'error' }); return; }
    toast('Ehtiyat nüsxə hazırlanır…');
    try {
      const data = await sb.sbLoadAll();
      if (!data) { toast('Məlumat oxunmadı', { type: 'error' }); return; }
      const payload = {
        exported_at: new Date().toISOString(),
        exported_by: getCurrentEmail(),
        source: (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : '',
        divisions: data.divisions || [],
        workshops: data.workshops || [],
        workshop_functions: data.functions || [],
        as_is_functions: data.asIsFns || [],
        profiles: data.users || [],
        landing_box_settings: data.landingBoxes || [],
      };
      const counts = `${payload.divisions.length} struktur, ${payload.workshops.length} workshop, ${payload.workshop_functions.length} funksiya`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      saveAs(blob, `zbod-backup-${stamp}.json`);
      toast('Ehtiyat nüsxə yükləndi', { description: counts });
    } catch (e) {
      console.error('Backup failed:', e);
      toast('Ehtiyat nüsxə alınmadı', { type: 'error', description: e.message });
    }
  },
  goToManageUsers() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    showPage('manage-users'); renderManageUsers();
  },

  // Avatar button dropdown (My Account / Sign Out) — stopPropagation keeps the same click from
  // immediately re-closing it via the outside-click listener below.
  toggleUserMenu(event) {
    if (event) event.stopPropagation();
    document.getElementById('user-session-dropdown').classList.toggle('hidden');
  },

  // === MY ACCOUNT (User side) ===
  goToAccount() { state.accountChangingPassword = false; showPage('account'); renderAccount(); },

  showChangePassword() { state.accountChangingPassword = true; renderAccount(); },
  cancelChangePassword() { state.accountChangingPassword = false; renderAccount(); },

  // Updates the same zbod_users record Manage Users (Admin Panel) reads from — there is no
  // separate copy to keep in sync, so the change is automatically visible to the admin the next
  // time they open Manage Users.
  async changeOwnPassword() {
    const newPassword = document.getElementById('account-new-password').value;
    const confirmPassword = document.getElementById('account-confirm-password').value;
    const errorEl = document.getElementById('account-password-error');
    if (!newPassword) { errorEl.textContent = 'Yeni parol daxil edin.'; return; }
    if (newPassword.length < 6) { errorEl.textContent = 'Parol ən azı 6 simvol olmalıdır.'; return; }
    if (newPassword !== confirmPassword) { errorEl.textContent = 'Parollar uyğun gəlmir.'; return; }
    const sb = window.zbodSupabase;
    if (!sb || !sb.supabaseAvailable) { errorEl.textContent = 'Bazaya bağlantı yoxdur.'; return; }
    // Goes to Supabase Auth for the signed-in session only — nothing is written to profiles, and
    // no password is ever held here.
    const res = await sb.sbAuthUpdatePassword(newPassword);
    if (!res.ok) { errorEl.textContent = res.error; return; }
    state.accountChangingPassword = false;
    renderAccount();
    toast('Parol yeniləndi.');
  },

  showAddUser() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    state._userEditId = null;
    document.getElementById('user-form-title').textContent = 'Add User';
    document.getElementById('user-form-errors').innerHTML = '';
    document.getElementById('user-form-role').value = '';
    document.getElementById('user-form-fullname').value = '';
    document.getElementById('user-form-position').value = '';
    document.getElementById('user-form-area').value = '';
    document.getElementById('user-form-email').value = '';
    document.getElementById('user-form-email').disabled = false;
    // Re-enabled here because editUser() disables it: a password can only be set when the account
    // is first created.
    const pwField = document.getElementById('user-form-password');
    pwField.value = '';
    pwField.disabled = false;
    pwField.placeholder = '';
    document.getElementById('user-form-dialog').classList.remove('hidden');
  },

  editUser(id) {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    state._userEditId = id;
    document.getElementById('user-form-title').textContent = 'Edit User';
    document.getElementById('user-form-errors').innerHTML = '';
    document.getElementById('user-form-role').value = user.role || '';
    document.getElementById('user-form-fullname').value = user.fullName || '';
    document.getElementById('user-form-position').value = user.position || '';
    document.getElementById('user-form-area').value = user.areaOfResponsibility || '';
    document.getElementById('user-form-email').value = user.email || '';
    // An admin cannot read or set someone else's password: Supabase Auth holds it, and changing it
    // from another account needs the service_role key, which must never ship in a browser. The
    // account owner changes their own from My Account; otherwise use Supabase's password reset.
    const pwField = document.getElementById('user-form-password');
    pwField.value = '';
    pwField.disabled = true;
    pwField.placeholder = 'Supabase Auth tərəfindən idarə olunur';
    // The email is the account's login in Supabase Auth and the key every structure is shared by.
    // Changing it here would only change the profile copy and lock the person out of their own data.
    document.getElementById('user-form-email').disabled = true;
    document.getElementById('user-form-dialog').classList.remove('hidden');
  },

  hideUserForm() {
    document.getElementById('user-form-dialog').classList.add('hidden');
    state._userEditId = null;
  },

  async submitUserForm() {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    const role = document.getElementById('user-form-role').value;
    const fullName = document.getElementById('user-form-fullname').value.trim();
    const position = document.getElementById('user-form-position').value.trim();
    const areaOfResponsibility = document.getElementById('user-form-area').value.trim();
    const email = document.getElementById('user-form-email').value.trim();
    const password = document.getElementById('user-form-password').value;
    const wasEditing = !!state._userEditId;
    const errors = [];
    if (!role) errors.push('Role is required');
    if (!fullName) errors.push('Full Name is required');
    if (!position) errors.push('Position is required');
    if (!email) errors.push('Email is required');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email must be a valid email address');
    // Only a new account needs a password — Supabase Auth owns it from then on, and an admin
    // cannot read or change someone else's password from the browser.
    if (!wasEditing && !password) errors.push('Password is required');
    if (!wasEditing && password && password.length < 6) errors.push('Password must be at least 6 characters');
    const duplicate = getUsers().find(u => (u.email || '').toLowerCase() === email.toLowerCase() && u.id !== state._userEditId);
    if (duplicate) errors.push('A user with this email already exists');

    if (errors.length > 0) {
      document.getElementById('user-form-errors').innerHTML = errors.join('<br>');
      return;
    }

    const data = { role, fullName, position, areaOfResponsibility, email };
    if (wasEditing) {
      const existing = getUsers().find(u => u.id === state._userEditId);
      if (existing) data.email = existing.email;          // the login email never changes from here
      if (currentProfile && state._userEditId === currentProfile.id && role !== 'admin') {
        document.getElementById('user-form-errors').innerHTML = 'You cannot remove the administrator role from your own account.';
        return;
      }
      updUser(state._userEditId, data);
    } else {
      const sb = window.zbodSupabase;
      if (!sb || !sb.supabaseAvailable) {
        document.getElementById('user-form-errors').textContent = 'Bazaya bağlantı yoxdur — hesab yaradıla bilmir.';
        return;
      }
      const btn = document.querySelector('#user-form-dialog .zbod-btn-primary');
      if (btn) { btn.disabled = true; btn.textContent = 'Yaradılır…'; }
      // Two steps, in this order: create the credentials in Supabase Auth, then store the role
      // against the id it returns. profiles.id must be the auth account's id — that is the link
      // the RLS policies resolve through.
      const created = await sb.sbCreateAccount(email, password);
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      if (!created.ok) {
        // Accounts hard-deleted before deactivation existed still hold their email in Supabase
        // Auth with no profile left behind, so there is nothing here to reactivate. Only an admin
        // working in the Supabase dashboard can release that email.
        document.getElementById('user-form-errors').innerHTML = /already registered/i.test(created.error || '')
          ? 'Bu email Supabase Auth-da artıq qeydiyyatdadır, amma ona bağlı profil yoxdur (bu hesab köhnə üsulla silinib).<br><br>'
            + 'Həll: Supabase → Authentication → Users bölməsində həmin email-i tapıb silin, sonra buradan yenidən yaradın. '
            + 'Və ya başqa email istifadə edin.'
          : escHtml(created.error);
        return;
      }
      addUser(created.userId, data);
    }

    document.getElementById('user-form-dialog').classList.add('hidden');
    state._userEditId = null;
    renderManageUsers();
    toast(wasEditing ? 'User updated' : 'User added');
  },

  confirmDeleteUser(id) {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    if (currentProfile && id === currentProfile.id) { toast('You cannot delete your own account', { type: 'error' }); return; }
    const user = getUsers().find(u => u.id === id);
    if (!user) return;
    showConfirmDialog({
      title: 'Hesabı sil',
      message: `${user.fullName || user.email} silinsin?

Hesab tamamilə silinəcək və bu email azad olacaq — eyni email ilə yenidən hesab yarada bilərsiniz.`,
      confirmLabel: 'Sil',
      cancelLabel: 'Cancel',
      danger: true,
      onConfirmAttr: `app.deleteUser('${escHtml(id)}')`,
    });
  },

  deleteUser(id) {
    if (!isCurrentUserAdmin()) { toast('Admin only', { type: 'error' }); return; }
    if (currentProfile && id === currentProfile.id) { toast('You cannot delete your own account', { type: 'error' }); return; }
    delUser(id);
    renderManageUsers();
    toast('Hesab silindi', { description: 'Email azad oldu — eyni email ilə yenidən yarada bilərsiniz.' });
  },


  // The ZBOD tool's own original boot sequence (data load + landing/divisions routing) —
  // unchanged, just moved behind the Sign In gate in init() above.
  async bootZbod() {
    // Deliver whatever failed to sync in an earlier session FIRST, so the load below sees it (a
    // delete made offline must not be merged back in from the cloud).
    if (window.zbodSupabase && window.zbodSupabase.sbFlushOutbox) {
      try { await Promise.race([window.zbodSupabase.sbFlushOutbox(), new Promise(r => setTimeout(r, 8000))]); } catch (_) {}
    }
    await loadFromSupabase();
    repairParentCycles();

    // Silently sync unsynced local data to Supabase, one time per browser, whenever it's live —
    // no dialog, no user decision (see autoMigrateToSupabase).
    const sb = window.zbodSupabase;
    if (sb && sb.supabaseAvailable && !lsGet('zbod_sb_migrated', false)) {
      const hasCoreData    = getDivs().length > 0 || getWs().length > 0 || getFns().length > 0 || getAsIs().length > 0;
      const hasLandingData = buildLandingBoxesFromLocalStorage().length > 0;
      if (hasCoreData || hasLandingData) autoMigrateToSupabase();
    }

    const h = window.location.hash.slice(1);
    if (h === 'divisions') { showPage('divisions'); renderDivisions(); }
    else { showPage('landing'); renderLanding(); }
  },
};

// ═══════════════════════════════════════════
// HELPER: Delete cascading
// ═══════════════════════════════════════════
function delAsIsByDivision(divisionId) { lsSet(LS.asIs, getAsIs().filter(f => f.division_id !== divisionId)); }
function delWsByDivision(divisionId) { lsSet(LS.workshops, getWs().filter(w => w.division_id !== divisionId)); }

// ═══════════════════════════════════════════
// GLOBAL EVENT LISTENERS
// ═══════════════════════════════════════════
document.addEventListener('wheel', function(e) {
  if (document.activeElement && document.activeElement.type === 'number') {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('mousedown', function(e) {
  const menu = document.getElementById('context-menu');
  if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
    closeContextMenu();
  }
  if (!(e.target.closest && e.target.closest('.zbod-help-icon-btn'))) {
    document.querySelectorAll('.zbod-help-popover:not(.hidden)').forEach(p => {
      if (!p.contains(e.target)) p.classList.add('hidden');
    });
  }
  const userDropdown = document.getElementById('user-session-dropdown');
  const userBar = document.getElementById('user-session-bar');
  if (userDropdown && !userDropdown.classList.contains('hidden') && userBar && !userBar.contains(e.target)) {
    userDropdown.classList.add('hidden');
  }
});
// Escape closes the top-most open dialog (one per key press), like Cancel would.
const ESC_DIALOGS = [
  ['confirm-dialog', () => hideConfirmDialog()],
  ['new-password-dialog', () => app.hideNewPasswordModal()],
  ['reset-code-dialog', () => app.hideResetCodeModal()],
  ['delete-password-dialog', () => app.hideDeletePasswordModal()],
  ['password-verification-dialog', () => app.hidePasswordModal()],
  ['fn-editor-modal', () => app.closeFunctionModal()],
  ['user-form-dialog', () => app.hideUserForm()],
  ['division-dialog', () => app.hideAddDivision()],
  ['workshop-dialog', () => app.hideWorkshopDialog()],
  ['export-modal-overlay', () => app.closeExportModal()],
];
function closeTopDialog() {
  for (const [id, close] of ESC_DIALOGS) {
    const el = document.getElementById(id);
    if (!el) continue;
    const open = id === 'export-modal-overlay' ? el.style.display === 'flex' : !el.classList.contains('hidden');
    if (open) { try { close(); } catch (_) { el.classList.add('hidden'); } return true; }
  }
  return false;
}
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (closeTopDialog()) return;
    closeContextMenu(); closeAllFieldHelpPopovers();
    const fsCard = document.getElementById('p1-orgchart-card');
    if (fsCard && fsCard.classList.contains('oc-fullscreen')) app.toggleOrgFullscreen();
  }
});
// ── Org chart hover effects (presentation only) ─────────────────────────────
// "Reporting line": hovering a box lights up its chain of boxes and connectors up to the root
// and dims everything else. Delegated on document because the chart DOM is rebuilt on every
// render. Relies on data-oc-id / data-oc-parent on cards and data-to on each parent→child connector.
function ocClearPath(canvas) {
  canvas.classList.remove('oc-has-path');
  canvas.querySelectorAll('.oc-on-path').forEach(el => el.classList.remove('oc-on-path'));
}
document.addEventListener('mouseover', function(e) {
  const card = e.target.closest && e.target.closest('[data-oc-id]');
  const canvas = card && card.closest('.oc-canvas');
  if (!canvas || canvas._ocHover === card) return;
  canvas._ocHover = card;
  ocClearPath(canvas);
  const chain = new Set();
  for (let cur = card; cur; ) {
    chain.add(cur.getAttribute('data-oc-id'));
    cur.classList.add('oc-on-path');
    const pid = cur.getAttribute('data-oc-parent');
    cur = pid ? canvas.querySelector(`[data-oc-id="${CSS.escape(pid)}"]`) : null;
  }
  if (chain.size < 2) return; // the root alone has no line to trace
  canvas.classList.add('oc-has-path');
  canvas.querySelectorAll('.oc-line').forEach(l => {
    const to = l.getAttribute('data-to');
    if (to && chain.has(to)) l.classList.add('oc-on-path');
  });
});
document.addEventListener('mouseout', function(e) {
  const card = e.target.closest && e.target.closest('[data-oc-id]');
  if (!card || (e.relatedTarget && card.contains(e.relatedTarget))) return;
  const canvas = card.closest('.oc-canvas');
  if (!canvas) return;
  canvas._ocHover = null;
  ocClearPath(canvas);
});
// Soft spotlight under the cursor on the chart canvas (read by .oc-viewport's background).
document.addEventListener('mousemove', function(e) {
  const vp = e.target.closest && e.target.closest('.oc-viewport');
  if (!vp) return;
  const r = vp.getBoundingClientRect();
  vp.style.setProperty('--mx', `${e.clientX - r.left}px`);
  vp.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

window.addEventListener('scroll', function() { closeAllFieldHelpPopovers(); }, true);
window.addEventListener('resize', function() {
  const popover = document.getElementById('field-help-popover');
  if (popover && !popover.classList.contains('hidden') && popover._anchorEl) {
    showFieldHelpPopover(popover._openId, popover._anchorEl);
  }
});

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// SYNC FAILURE WARNING
// Saving is local-first: the value is written to localStorage immediately and the cloud copy is
// attempted separately, so a sync problem never blocks the user or loses what they typed on this
// device. What it used to do was stay invisible — the app reported "Saved" either way, and the
// gap only turned up later when someone opened the same structure elsewhere and found it empty.
//
// The save path itself is unchanged. This only surfaces failures the wrapper in supabase.js
// already knew about, so the user learns their change has not left this computer while they can
// still do something about it (reconnect, then re-save).
//
// Debounced: one failed action can produce several failed row writes, and a dropped connection
// produces one per attempt. A single warning every half-minute says what matters without burying
// the page in toasts.
let lastSyncWarningAt = 0;

// Says WHY a write did not reach the cloud. "Check your connection" was the only message for every
// failure, but a refused row (no permission, parent missing, column missing) has nothing to do with
// the connection, so the user could not tell what to do — and neither could we.
const SYNC_TABLE_LABELS = { divisions: 'Struktur', workshops: 'Workshop', workshop_functions: 'Workshop funksiyası', as_is_functions: 'AS-IS funksiya', landing_box_settings: 'Məzmun / Metrics', profiles: 'İstifadəçi' };
function describeSyncError(e, ctx) {
  const code = String((e && e.code) || '');
  const what = SYNC_TABLE_LABELS[ctx && ctx.table] || (ctx && ctx.table) || 'Qeyd';
  const retryNote = ctx && ctx.retry ? ' Avtomatik yenidən cəhd olunacaq.' : '';
  if (typeof sbIsTransientClient === 'function' ? sbIsTransientClient(e) : !code) {
    return `${what}: bulud əlçatan deyil (internet və ya server).${retryNote} Dəyişiklik bu kompüterdə saxlanıb.`;
  }
  if (code === '42501') return `${what}: bu hesabın bu qeydi buluda yazmağa icazəsi yoxdur. Qeyd yalnız bu kompüterdə qalır — sahibi (HRBP) və ya admin dəyişməlidir.`;
  if (code === '23503') return `${what}: bağlı olduğu struktur/workshop buludda tapılmadı.${retryNote} Alt qeyd əvvəl valideynlə birlikdə göndərilməlidir.`;
  if (code === 'PGRST204' || code === 'ZBOD_SCHEMA' || /column/i.test((e && e.message) || '')) return `${what}: bazada sütun çatışmır. Supabase SQL Editor-da supabase_*.sql faylları icra edilməlidir. (${(e && e.message) || code})`;
  if (code === '22P02' || code === '22003' || code === '23502' || code === '23514') return `${what}: qeydin dəyəri bazanın qəbul etdiyi formata uyğun deyil. (${(e && e.message) || code})`;
  return `${what}: ${(e && (e.message || e.code)) || 'naməlum xəta'}.${retryNote}`;
}
// supabase.js owns the real classifier; this mirrors it only for the message wording above.
function sbIsTransientClient(e) {
  if (!e) return false;
  const code = String(e.code || '');
  if (code === 'PGRST301' || code === 'PGRST303') return true;
  if (e.status >= 500 || e.status === 408 || e.status === 429) return true;
  if (!code && !e.status) return true;
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out/i.test(e.message || '');
}

function reportSyncFailure(e, count, ctx) {
  const now = Date.now();
  if (now - lastSyncWarningAt < 30000) return;
  lastSyncWarningAt = now;
  toast('Buludla sinxronlaşmadı', { type: 'error', description: describeSyncError(e, ctx) });
}

// Fired once everything that had failed has finally been delivered by the retry queue.
function reportSyncRecovered(sent) {
  toast('Buludla sinxronlaşdı', { description: `${sent} gözləyən dəyişiklik buluda göndərildi.` });
}

// The row saved, but without a column the database doesn't have yet — so that one value is silently
// missing on every other computer. Said once per column per session so it can't be missed or spam.
const warnedSchemaGaps = new Set();
function reportSchemaGap(table, column) {
  const key = table + '.' + column;
  if (warnedSchemaGaps.has(key)) return;
  warnedSchemaGaps.add(key);
  toast('Bazada sütun çatışmır', { type: 'error', description: `${table}.${column} buluda yazılmır — bu dəyər başqa kompüterdə görünməyəcək. Supabase SQL Editor-da supabase_*.sql faylları icra edilməlidir.` });
}

// When a child row is refused because its parent never reached the cloud, supabase.js asks for the
// ancestors (read from this browser's own copy) and sends them first. Only ancestors of a row the
// user is actively writing — never the whole local cache.
function resolveSyncParents(table, row) {
  const out = [];
  const div = id => getDivs().find(d => d.id === id);
  const addDivision = id => { const d = div(id); if (d) out.push({ table: 'divisions', row: d, onConflict: 'id' }); };
  if (table === 'workshops') addDivision(row.division_id);
  else if (table === 'as_is_functions') addDivision(row.division_id);
  else if (table === 'workshop_functions') {
    const w = getWs().find(x => x.id === row.workshop_id);
    if (w) { addDivision(w.division_id); out.push({ table: 'workshops', row: w, onConflict: 'id' }); }
  }
  return out;
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.zbodSupabase && window.zbodSupabase.sbSetWriteErrorHandler) {
    window.zbodSupabase.sbSetWriteErrorHandler(reportSyncFailure);
    window.zbodSupabase.sbSetRecoveredHandler(reportSyncRecovered);
    window.zbodSupabase.sbSetSchemaGapHandler(reportSchemaGap);
    window.zbodSupabase.sbSetParentResolver(resolveSyncParents);
  }
  app.init();
});
