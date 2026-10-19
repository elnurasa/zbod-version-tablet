// ═══════════════════════════════════════════
// SUPABASE CLIENT CONFIGURATION
// ═══════════════════════════════════════════
// Project: zbod-tool-final (qbwnrganzqwiktuglnow).
// Replaced the earlier qznyesglqkqbbewrkknj project, whose schema was missing the role columns
// (owner_email/cxo_email), workshops.source, the as_is_* snapshot columns and the users table —
// so structures silently never reached the cloud. This project was built from
// supabase_full_setup.sql, which creates the complete schema in one pass.
//
// The anon key is public by design: it is shipped in this client file and grants only what the
// tables' RLS policies allow. The service_role / sb_secret_ keys must NEVER appear here.
const SUPABASE_URL = 'https://qbwnrganzqwiktuglnow.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFid25yZ2FuenF3aWt0dWdsbm93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjIyNzIsImV4cCI6MjA5Njk5ODI3Mn0.GPpUjCE8aLLcP8hIWIeouSsKjlSOEb68VB4yhjzyRUc';

let supabase = null;
let supabaseAvailable = false;

if (typeof window !== 'undefined' &&
    typeof window.supabase !== 'undefined' &&
    typeof window.supabase.createClient === 'function') {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseAvailable = true;
    console.log('Supabase connected');
  } catch (e) {
    console.warn('Supabase connection failed:', e);
    supabaseAvailable = false;
  }
} else {
  console.warn('Supabase JS library not loaded — running in localStorage-only mode.');
}

// ═══════════════════════════════════════════
// SAFE OPERATION WRAPPER + WRITE FAILURE REPORTING
// Every save is local-first and fire-and-forget: the value lands in localStorage, the cloud copy
// is attempted separately, and sbRun swallows whatever goes wrong so a failed sync can never break
// the page. The cost was that it could not be seen either — the app said "Saved" whether or not
// anything reached Supabase, and the gap only surfaced when a colleague opened the same structure
// and found it empty.
//
// Nothing about how writes work changes here. A failed write is simply recorded and handed to
// whatever callback the app registers (see reportSyncFailure in script.js), so the user can be
// told their change is still only on this device.
let sbFailedWrites = 0;
let sbOnWriteError = null;
let sbOnRecovered = null;
let sbOnSchemaGap = null;
let sbLastError = null;
function sbSetWriteErrorHandler(fn) { sbOnWriteError = fn; }
function sbSetRecoveredHandler(fn) { sbOnRecovered = fn; }
function sbSetSchemaGapHandler(fn) { sbOnSchemaGap = fn; }
function sbGetFailedWriteCount() { return sbFailedWrites; }
function sbGetLastError() { return sbLastError; }
// `ctx` says what was being written ({ table, op, retry }) so the warning can name the real reason
// instead of a generic "check your connection" — a rejected row (permissions, missing parent,
// missing column) looks nothing like a dropped connection and needs a different fix.
function sbNoteWriteFailure(e, ctx) {
  sbFailedWrites++;
  sbWarnedSinceOk = true;
  sbLastError = { error: e, table: ctx && ctx.table, op: ctx && ctx.op, retry: !!(ctx && ctx.retry), at: Date.now() };
  console.warn('[sync] write failed', sbLastError);
  try { if (sbOnWriteError) sbOnWriteError(e, sbFailedWrites, ctx || {}); } catch (_) {}
}

// ── Error classification ─────────────────────────────────────────────────────────────────────
// Transient: nothing is wrong with the row itself (no connection, server hiccup, expired token
// mid-refresh) — the same write will succeed later, so it is kept and retried.
function sbIsTransient(e) {
  if (!e) return false;
  const code = String(e.code || '');
  if (code === 'PGRST301' || code === 'PGRST303') return true;            // JWT expired / invalid (refreshing)
  if (e.status >= 500 || e.status === 408 || e.status === 429) return true;
  if (!code && !e.status) return true;                                      // fetch rejected: offline, DNS, CORS
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out/i.test(e.message || '');
}

// ── Outbox: failed writes survive and are retried ────────────────────────────────────────────
// Every save is local-first and fire-and-forget, so a write that failed (offline for a minute, a
// parent row that had not landed yet, a token that expired) used to be lost for good: the toast said
// "not synced", nothing ever tried again, and the change stayed on that computer only. Now the last
// failed version of each row is kept in localStorage and re-sent — in parent-before-child order —
// when the connection returns, on a timer, and at sign-in. Latest write per row wins, so a retry can
// never overwrite a newer edit with an older copy. Only rows whose write actually failed are
// re-sent; the app never re-uploads rows it merely has cached (that would resurrect records another
// device deleted).
const SB_OUTBOX_KEY = 'zbod_sb_outbox';
const SB_MAX_ATTEMPTS_PERMANENT = 4;     // a rejected (non-transient) row is retried a few times, then dropped
const SB_FLUSH_INTERVAL_MS = 30000;
const SB_TABLE_ORDER = ['divisions', 'workshops', 'workshop_functions', 'as_is_functions', 'landing_box_settings', 'profiles'];
let sbParentResolver = null;
let sbFlushing = false;
let sbWarnedSinceOk = false;
function sbSetParentResolver(fn) { sbParentResolver = fn; }
function sbOutboxRead() { try { return JSON.parse(localStorage.getItem(SB_OUTBOX_KEY) || '{}') || {}; } catch (_) { return {}; } }
function sbOutboxWrite(o) { try { localStorage.setItem(SB_OUTBOX_KEY, JSON.stringify(o)); } catch (_) {} }
function sbOutboxKey(table, id) { return table + '|' + id; }
function sbOutboxCount() { return Object.keys(sbOutboxRead()).length; }
async function sbCurrentUid() {
  try { const { data } = await supabase.auth.getSession(); return (data && data.session && data.session.user && data.session.user.id) || null; } catch (_) { return null; }
}
async function sbOutboxPut(entry, id) {
  // Signed out (or the session is gone): there is no account to retry this write for, and nothing
  // may be left on this computer for the next person — so it is not queued.
  const uid = await sbCurrentUid();
  if (!uid) return;
  const o = sbOutboxRead();
  const key = sbOutboxKey(entry.table, id);
  const prev = o[key];
  o[key] = { ...entry, uid, attempts: prev ? prev.attempts : 0, queuedAt: prev ? prev.queuedAt : Date.now() };
  sbOutboxWrite(o);
}
// Tombstones: ids deleted on this device. Until the cloud confirms the delete (the row stops coming
// back), a load must not merge the row back in, and a sync repair must not re-upload it.
const SB_TOMB_KEY = 'zbod_tombstones';
function sbTombRead() { try { return JSON.parse(localStorage.getItem(SB_TOMB_KEY) || '{}') || {}; } catch (_) { return {}; } }
function sbTombWrite(t) { try { localStorage.setItem(SB_TOMB_KEY, JSON.stringify(t)); } catch (_) {} }
function sbAddTombstone(table, id) { const t = sbTombRead(); (t[table] = t[table] || {})[id] = Date.now(); sbTombWrite(t); }
function sbClearTombstone(table, id) { const t = sbTombRead(); if (t[table] && t[table][id]) { delete t[table][id]; sbTombWrite(t); } }
function sbIsTombstoned(table, id) { const t = sbTombRead(); return !!(t[table] && t[table][id]); }
// After a successful load: tombstones whose rows the cloud no longer returns are settled.
function sbForgetTombstones(table, cloudIdSet) {
  const t = sbTombRead(); if (!t[table]) return;
  Object.keys(t[table]).forEach(id => { if (!cloudIdSet.has(id)) delete t[table][id]; });
  sbTombWrite(t);
}
function sbOutboxHas(table, id) { return sbOutboxKey(table, id) in sbOutboxRead(); }
function sbOutboxDrop(table, id) {
  const o = sbOutboxRead(); const key = sbOutboxKey(table, id);
  if (key in o) { delete o[key]; sbOutboxWrite(o); }
}

// `isWrite` marks the calls whose failure means data did not reach the cloud. Reads are left out:
// a failed read falls back to the local copy and loses nothing.
async function sbRun(fn, isWrite, ctx) {
  if (!supabase || !supabaseAvailable) return null;
  try {
    const { data, error } = await fn(supabase);
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('Supabase operation failed:', e);
    if (isWrite) sbNoteWriteFailure(e, ctx);
    return null;
  }
}

// PostgREST rejects an ENTIRE request when the payload names a column the table does not have
// (PGRST204) — so one field the database has not learned about yet silently blocks every save on
// the page, not just that field. This repo has no migration tooling, so the app and the schema can
// legitimately be a step apart: a browser may load new code before the matching SQL has been run.
// Rather than lose the whole row, the unknown column is dropped and the write retried; the record
// still saves, minus that one value, and the console says which column is missing.
const SB_MAX_COLUMN_RETRIES = 4;
function sbMissingColumn(error) {
  if (!error || error.code !== 'PGRST204') return null;
  const m = /'([^']+)' column/.exec(error.message || '');
  return m ? m[1] : null;
}
function sbWithoutColumn(payload, col) {
  const strip = row => { const copy = { ...row }; delete copy[col]; return copy; };
  return Array.isArray(payload) ? payload.map(strip) : strip(payload);
}
// One attempt at an upsert, with the missing-column fallback. Returns { ok:true } or { ok:false, error }.
async function sbTryUpsert(table, payload, onConflict) {
  let body = payload;
  for (let attempt = 0; attempt <= SB_MAX_COLUMN_RETRIES; attempt++) {
    try {
      const { error } = await supabase.from(table).upsert(body, { onConflict });
      if (!error) return { ok: true };
      const col = sbMissingColumn(error);
      if (!col) return { ok: false, error };
      console.warn(`Supabase: ${table} has no '${col}' column — saving without it. Run the pending SQL migration.`);
      // The row is saved, but without that value — so it silently differs between devices. Say so.
      try { if (sbOnSchemaGap) sbOnSchemaGap(table, col); } catch (_) {}
      body = sbWithoutColumn(body, col);
    } catch (e) {
      return { ok: false, error: e };
    }
  }
  // More unknown columns than retries: the schema is further behind than a stripped field or two,
  // so stop guessing and report it rather than dropping the row without a word.
  const tooFarBehind = new Error(`${table}: schema is missing several columns — run the pending SQL migration`);
  tooFarBehind.code = 'ZBOD_SCHEMA';
  return { ok: false, error: tooFarBehind };
}

async function sbUpsert(table, payload, onConflict) {
  if (!supabase || !supabaseAvailable) return null;
  const single = !Array.isArray(payload);
  const rowId = single ? (payload.id !== undefined ? payload.id : payload[onConflict]) : null;
  if (single && rowId != null) sbClearTombstone(table, rowId);
  let r = await sbTryUpsert(table, payload, onConflict);

  // A child whose parent never reached the cloud (created while offline, before the schema was
  // ready, or its own save failed) is refused on the foreign key. Send the missing ancestors from
  // the local copy first, then the row again — that is what turns "never syncs" into "syncs".
  if (!r.ok && r.error && r.error.code === '23503' && sbParentResolver && single) {
    try {
      const parents = (sbParentResolver(table, payload) || []).filter(p => !sbIsTombstoned(p.table, p.row && p.row.id));
      for (const p of parents) await sbTryUpsert(p.table, p.row, p.onConflict || 'id');
      if (parents.length) r = await sbTryUpsert(table, payload, onConflict);
    } catch (_) {}
  }

  if (r.ok) {
    if (single && rowId != null) sbOutboxDrop(table, rowId);
    return true;
  }
  console.warn('Supabase operation failed:', r.error);
  const retry = single && rowId != null;
  if (retry) await sbOutboxPut({ op: 'upsert', table, onConflict, row: payload }, rowId);
  sbNoteWriteFailure(r.error, { table, op: 'upsert', retry });
  return null;
}

// Deletes follow the same rule: a delete that failed is remembered and re-sent, and any pending
// upsert of the same row is replaced (the delete is the newer intent).
async function sbDeleteRow(table, column, id) {
  if (!supabase || !supabaseAvailable) return null;
  sbAddTombstone(table, id);
  try {
    const { error } = await supabase.from(table).delete().eq(column, id);
    if (error) throw error;
    sbOutboxDrop(table, id);
    return true;
  } catch (e) {
    console.warn('Supabase delete failed:', e);
    await sbOutboxPut({ op: 'delete', table, column, id }, id);
    sbNoteWriteFailure(e, { table, op: 'delete', retry: true });
    return null;
  }
}

// Re-sends everything in the outbox, parents before children. Safe to call any time and from
// anywhere: it is a no-op when nothing is pending, when offline, when signed out, or when a flush
// is already running.
async function sbFlushOutbox() {
  if (!supabase || !supabaseAvailable || sbFlushing) return { pending: sbOutboxCount() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { pending: sbOutboxCount() };
  if (sbOutboxCount() === 0) return { pending: 0 };
  const uid = await sbCurrentUid();
  if (!uid) return { pending: sbOutboxCount() };             // signed out: nothing may be written yet
  sbFlushing = true;
  try {
    return await sbQueueWrite(async () => {
      const o = sbOutboxRead();
      // Entries recorded under another account (or with no account) are never sent from this one.
      Object.keys(o).forEach(k => { if (o[k].uid !== uid) delete o[k]; });
      sbOutboxWrite(o);
      const entries = Object.entries(o)
        .sort(([, a], [, b]) => {
          if (a.op !== b.op) return a.op === 'upsert' ? -1 : 1;
          const ia = SB_TABLE_ORDER.indexOf(a.table), ib = SB_TABLE_ORDER.indexOf(b.table);
          return a.op === 'upsert' ? ia - ib : ib - ia;
        });
      let sent = 0;
      for (const [key, e] of entries) {
        let ok = false, err = null;
        if (e.op === 'delete') {
          try { const { error } = await supabase.from(e.table).delete().eq(e.column, e.id); if (error) throw error; ok = true; } catch (x) { err = x; }
        } else {
          let r = await sbTryUpsert(e.table, e.row, e.onConflict);
          if (!r.ok && r.error && r.error.code === '23503' && sbParentResolver) {
            try {
              const parents = (sbParentResolver(e.table, e.row) || []).filter(p => !sbIsTombstoned(p.table, p.row && p.row.id));
              for (const p of parents) await sbTryUpsert(p.table, p.row, p.onConflict || 'id');
              if (parents.length) r = await sbTryUpsert(e.table, e.row, e.onConflict);
            } catch (_) {}
          }
          ok = r.ok; err = r.error;
        }
        const cur = sbOutboxRead();
        if (ok) { delete cur[key]; sent++; }
        else if (cur[key]) {
          cur[key].attempts = (cur[key].attempts || 0) + 1;
          cur[key].lastError = (err && (err.message || err.code)) || 'unknown';
          // A rejected row (not a connectivity problem) will be rejected again — give up on it after
          // a few tries so it cannot warn forever; transient failures are never given up on.
          if (!sbIsTransient(err) && cur[key].attempts >= SB_MAX_ATTEMPTS_PERMANENT) {
            console.warn('[sync] giving up on', key, err);
            delete cur[key];
          }
        }
        sbOutboxWrite(cur);
      }
      const left = sbOutboxCount();
      if (sent > 0 && left === 0 && sbWarnedSinceOk) {
        sbWarnedSinceOk = false;
        try { if (sbOnRecovered) sbOnRecovered(sent); } catch (_) {}
      }
      return { sent, pending: left };
    });
  } finally {
    sbFlushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sbFlushOutbox(); });
  setInterval(() => { if (sbOutboxCount() > 0) sbFlushOutbox(); }, SB_FLUSH_INTERVAL_MS);
}

// ═══════════════════════════════════════════
// WRITE ORDERING
// script.js issues every save as fire-and-forget (addDiv() saves the division and returns, then
// addWs() saves a workshop referencing it, then addFn() a function referencing that workshop) —
// nothing awaits anything. Sent concurrently, those requests can reach PostgREST out of order, so
// the child INSERT arrives before its parent exists and Postgres rejects it on the foreign key
// (23503) — silently, because sbRun swallows the error. Observed in practice: a freshly created
// structure synced, but its workshop and functions were dropped.
//
// Serialising every write through one FIFO chain makes the requests hit the server in the exact
// order the app issued them, which is always parent-before-child. Reads are not queued — they can
// safely run in parallel.
let sbWriteChain = Promise.resolve();
function sbQueueWrite(fn) {
  const run = () => fn();
  const next = sbWriteChain.then(run, run);
  sbWriteChain = next.catch(() => {});
  return next;
}

// ═══════════════════════════════════════════
// DIVISIONS CRUD
// ═══════════════════════════════════════════
async function sbLoadDivisions() {
  return sbRun(db => db.from('divisions').select('*').order('created_at', { ascending: true }));
}

async function sbSaveDivision(division) {
  return sbQueueWrite(() => sbUpsert('divisions', division, 'id'));
}

async function sbDeleteDivision(id) {
  return sbQueueWrite(() => sbDeleteRow('divisions', 'id', id));
}

// ═══════════════════════════════════════════
// WORKSHOPS CRUD
// ═══════════════════════════════════════════
async function sbLoadWorkshops() {
  return sbRun(db => db.from('workshops').select('*').order('created_at', { ascending: true }));
}

async function sbSaveWorkshop(workshop) {
  return sbQueueWrite(() => sbUpsert('workshops', workshop, 'id'));
}

async function sbDeleteWorkshop(id) {
  return sbQueueWrite(() => sbDeleteRow('workshops', 'id', id));
}

// Delete variant that reports true/false success instead of sbRun's
// always-null-on-delete data shape, so callers can react to failures.
async function sbDeleteWorkshopSafe(id) {
  if (!supabase || !supabaseAvailable) return { ok: true };
  sbAddTombstone('workshops', id);
  return sbQueueWrite(async () => {
    try {
      const { error } = await supabase.from('workshops').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('sbDeleteWorkshopSafe failed:', e);
      sbClearTombstone('workshops', id);          // the workshop stays (locally too), so it must keep loading
      sbNoteWriteFailure(e);
      return { ok: false };
    }
  });
}

// ═══════════════════════════════════════════
// WORKSHOP FUNCTIONS CRUD
// ═══════════════════════════════════════════
async function sbLoadFunctions() {
  return sbRun(db => db.from('workshop_functions').select('*').order('function_number', { ascending: true }));
}

async function sbSaveFunction(fn) {
  return sbQueueWrite(() => sbUpsert('workshop_functions', fn, 'id'));
}

async function sbDeleteFunction(id) {
  return sbQueueWrite(() => sbDeleteRow('workshop_functions', 'id', id));
}

// ═══════════════════════════════════════════
// AS-IS FUNCTIONS CRUD
// ═══════════════════════════════════════════
async function sbLoadAsIsFunctions() {
  return sbRun(db => db.from('as_is_functions').select('*').order('created_at', { ascending: true }));
}

async function sbSaveAsIsFunction(fn) {
  return sbQueueWrite(() => sbUpsert('as_is_functions', fn, 'id'));
}

async function sbDeleteAsIsFunction(id) {
  return sbQueueWrite(() => sbDeleteRow('as_is_functions', 'id', id));
}

// ═══════════════════════════════════════════
// AUTHENTICATION (Supabase Auth)
// Passwords used to live in two places that are both readable by anyone who can open the app: a
// constant in script.js for the admin, and a plain-text column for everyone else. Supabase Auth
// removes them from the client entirely — the password goes straight to Supabase, is hashed
// there, and the browser only ever holds a short-lived session token. That is what makes it safe
// to publish this repository.
//
// Roles and personal details live in `profiles`, keyed by the auth user's id. RLS policies are
// written against auth.uid(), so access is enforced by the database rather than by this client.
// ═══════════════════════════════════════════
async function sbAuthSignIn(email, password) {
  if (!supabase || !supabaseAvailable) return { ok: false, error: 'Bağlantı yoxdur' };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Giriş alınmadı' };
  }
}

async function sbAuthSignOut() {
  if (!supabase || !supabaseAvailable) return;
  try { await supabase.auth.signOut(); } catch (e) { console.warn('signOut failed:', e); }
}

// The signed-in user, restored from the persisted session on page load — this is what keeps a
// refresh from bouncing the user back to the Sign In page.
async function sbAuthGetUser() {
  if (!supabase || !supabaseAvailable) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user || null;
  } catch (e) { return null; }
}

async function sbAuthUpdatePassword(newPassword) {
  if (!supabase || !supabaseAvailable) return { ok: false, error: 'Bağlantı yoxdur' };
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Parol dəyişdirilmədi' };
  }
}

// Creating an account signs that account in on the client that performs it — which would kick the
// admin out of their own session mid-task. A second, session-less client keeps the admin's session
// untouched while still creating the user and returning its id for the profile row.
//
// signUp() is a public endpoint, so a stranger could technically create an auth account. It buys
// them nothing: the profiles insert policy is admin-only, so they get no role, and an account with
// no profile is refused at sign-in.
let sbSignupClient = null;
async function sbCreateAccount(email, password) {
  if (!supabase || !supabaseAvailable) return { ok: false, error: 'Bağlantı yoxdur' };
  try {
    if (!sbSignupClient) {
      sbSignupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    const { data, error } = await sbSignupClient.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.user) return { ok: false, error: 'Hesab yaradıldı, amma təsdiq tələb olunur. Supabase-də "Confirm email" söndürülməlidir.' };
    return { ok: true, userId: data.user.id };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Hesab yaradıla bilmədi' };
  }
}

// ═══════════════════════════════════════════
// PROFILES CRUD (role + personal details for each auth account)
// Replaces the old `users` table, which stored passwords in plain text.
// ═══════════════════════════════════════════
async function sbLoadProfiles() {
  return sbRun(db => db.from('profiles').select('*').order('created_at', { ascending: true }));
}

async function sbSaveProfile(profile) {
  return sbQueueWrite(() => sbUpsert('profiles', profile, 'id'));
}

// Deletes the account outright — the Supabase Auth entry as well as the profile — so the email is
// free again and the person can be re-added as if they had never existed.
//
// A browser cannot delete from auth.users directly; that needs the service_role key, which must
// never ship in client code. Instead zbod_delete_user() (see supabase_delete_user.sql) runs as
// SECURITY DEFINER inside the database, checks the caller is an admin, and does the delete there.
// profiles.id references auth.users ON DELETE CASCADE, so the profile goes with it.
async function sbDeleteProfile(id) {
  return sbQueueWrite(async () => {
    if (!supabase || !supabaseAvailable) return null;
    try {
      const { error } = await supabase.rpc('zbod_delete_user', { target: id });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('sbDeleteProfile failed:', e);
      sbNoteWriteFailure(e);
      return null;
    }
  });
}

// ═══════════════════════════════════════════
// LANDING BOX SETTINGS CRUD
// Stores all editable landing page content blocks as key/value rows.
// Each block uses a unique box_id (e.g. 'overview', 'gl1', 'problems').
// AAA cards per division are also stored here with box_id = 'aaa_cards_<divisionId>'.
// ═══════════════════════════════════════════
async function sbLoadLandingBoxes() {
  return sbRun(db => db.from('landing_box_settings').select('*').order('position_order', { ascending: true }));
}

async function sbSaveLandingBox(entry) {
  return sbQueueWrite(() => sbUpsert('landing_box_settings', entry, 'box_id'));
}

async function sbDeleteLandingBox(boxId) {
  return sbQueueWrite(() => sbDeleteRow('landing_box_settings', 'box_id', boxId));
}

// ═══════════════════════════════════════════
// BULK LOAD — called on app startup
// Returns all data needed to hydrate localStorage.
// ═══════════════════════════════════════════
async function sbLoadAll() {
  if (!supabase || !supabaseAvailable) return null;
  const startedAt = new Date().toISOString();
  try {
    const [divisions, workshops, functions, asIsFns, landingBoxes, users] = await Promise.all([
      sbLoadDivisions(),
      sbLoadWorkshops(),
      sbLoadFunctions(),
      sbLoadAsIsFunctions(),
      sbLoadLandingBoxes(),
      sbLoadProfiles(),
    ]);
    // `users` keeps its name through the rest of the app, but the rows are now password-free
    // profiles. RLS returns only what this account may see: every profile for an admin, just
    // their own for anyone else.
    return { divisions, workshops, functions, asIsFns, landingBoxes, users, startedAt };
  } catch (e) {
    console.warn('sbLoadAll failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════
// BULK SYNC — push all local data up to Supabase at once
// sbRun() swallows every error internally (returns null on both success-with-no-data and
// failure), so a try/catch wrapped around calls to it can never actually see a failure — this
// used to make sbSyncAll return true unconditionally, which let migrateLocalStorageToSupabase
// permanently mark the one-time migration as "done" even when every single upsert had failed
// (e.g. a schema mismatch), silently leaving that browser's data unsynced forever with no retry.
// Each upsert here is awaited directly against its real {error} instead, so a real failure is
// both reported to the caller and left for the next boot to retry.
// ═══════════════════════════════════════════
async function sbSyncAll(divisions, workshops, functions, asIsFns) {
  if (!supabase || !supabaseAvailable) return false;
  // Queued like every other write, and internally ordered parent-before-child below, so a bulk
  // push can't race the per-record saves (or its own batches) into a foreign-key rejection.
  return sbQueueWrite(() => sbSyncAllInner(divisions, workshops, functions, asIsFns));
}

async function sbSyncAllInner(divisions, workshops, functions, asIsFns) {
  let allOk = true;
  const tryUpsert = async (table, rows) => {
    if (!rows || rows.length === 0) return;
    // Shares sbUpsert's missing-column retry: without it one field the schema has not learned
    // about yet fails the whole table's batch, and the migration then retries forever.
    if (!(await sbUpsert(table, rows, 'id'))) allOk = false;
  };
  await tryUpsert('divisions', divisions);
  await tryUpsert('workshops', workshops);
  await tryUpsert('workshop_functions', functions);
  await tryUpsert('as_is_functions', asIsFns);
  return allOk;
}

// ═══════════════════════════════════════════
// EXPORT — consumed by script.js as window.zbodSupabase
// ═══════════════════════════════════════════
window.zbodSupabase = {
  supabase,
  supabaseAvailable,
  // Divisions
  sbLoadDivisions,
  sbSaveDivision,
  sbDeleteDivision,
  // Workshops
  sbLoadWorkshops,
  sbSaveWorkshop,
  sbDeleteWorkshop,
  sbDeleteWorkshopSafe,
  // Workshop functions
  sbLoadFunctions,
  sbSaveFunction,
  sbDeleteFunction,
  // As-Is functions
  sbLoadAsIsFunctions,
  sbSaveAsIsFunction,
  sbDeleteAsIsFunction,
  // Users (admin-managed HRBP / CxO accounts)
  // Authentication
  sbAuthSignIn,
  sbAuthSignOut,
  sbAuthGetUser,
  sbAuthUpdatePassword,
  sbCreateAccount,
  // Profiles (role + details; replaces the old plain-text `users` table)
  sbLoadProfiles,
  sbSaveProfile,
  sbDeleteProfile,
  // Landing boxes (includes AAA cards via box_id prefix)
  sbLoadLandingBoxes,
  sbSaveLandingBox,
  sbDeleteLandingBox,
  // Bulk operations
  sbLoadAll,
  sbSyncAll,
  // Write-failure reporting (see the wrapper at the top of this file)
  sbSetWriteErrorHandler,
  sbSetRecoveredHandler,
  sbSetSchemaGapHandler,
  sbSetParentResolver,
  sbGetFailedWriteCount,
  sbGetLastError,
  sbFlushOutbox,
  sbOutboxCount,
  sbOutboxHas,
  sbIsTombstoned,
  sbForgetTombstones,
};
