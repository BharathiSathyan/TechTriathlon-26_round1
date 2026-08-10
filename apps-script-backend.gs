/**
 * ROUND 1 COIN TRACKER — Google Apps Script Backend & Supabase Live Sync.
 *
 * SPREADSHEET URL:
 * https://docs.google.com/spreadsheets/d/1a0kTN3_oNyXXU3jfnuT5Cy1v6kVJT32li31HeACjMc4/edit
 *
 * SETUP:
 * 1. Open your Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Delete any code, paste this entire file in, and save (Ctrl/Cmd+S).
 * 4. Click Deploy > New deployment.
 *    - Select type: "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy / Manage Deployments > Edit > New Version > Deploy.
 *
 * AUTOMATIC 1-MINUTE TIME TRIGGER (Optional for hands-free auto-sync):
 * Run the function `setupAutoSyncTrigger()` once in Apps Script to automatically
 * pull from Supabase every minute!
 */

const SUPABASE_URL = 'https://rpqcvqnqpyuvtwqllxzu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwcWN2cW5xcHl1dnR3cWxseHp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjg2NTIsImV4cCI6MjEwMTk0NDY1Mn0.5wEssEKtM6sQtguw3yKGpwinjbLeg0pZHyanovGbd1w';

const SHEET_NAMES = { teams: 'Teams', stalls: 'Stalls', matches: 'Matches' };

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Supabase Sync')
    .addItem('Sync Now from Supabase DB', 'syncFromSupabase')
    .addItem('Setup 1-Minute Auto Sync', 'setupAutoSyncTrigger')
    .addToUi();
}

function setupAutoSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'syncFromSupabase') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncFromSupabase')
    .timeBased()
    .everyMinutes(1)
    .create();
}

function doGet(e) {
  return handle(e);
}
function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    let params;
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
    } else {
      params = {};
    }
    const action = params.action;
    let result;
    switch (action) {
      case 'syncFromSupabase': result = syncFromSupabase(); break;
      case 'getAll': result = getAll(); break;
      case 'addTeam': result = addTeam(params); break;
      case 'deleteTeam': result = deleteTeam(params.id); break;
      case 'addStall': result = addStall(params); break;
      case 'deleteStall': result = deleteStall(params.id); break;
      case 'updateTeamCoins': result = updateTeamCoins(params); break;
      case 'appendMatch': result = appendMatch(params); break;
      case 'resetAll': result = resetAll(); break;
      default:
        // Default action when called without params is sync from Supabase!
        result = syncFromSupabase();
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function teamsSheet() { return getSheet(SHEET_NAMES.teams, ['id', 'name', 'past', 'present', 'future', 'teamId', 'contact']); }
function stallsSheet() { return getSheet(SHEET_NAMES.stalls, ['id', 'name', 'category', 'minWager']); }
function matchesSheet() {
  return getSheet(SHEET_NAMES.matches, [
    'time', 'stallId', 'stallName', 'teamAId', 'teamAName', 'teamBId', 'teamBName',
    'wager', 'coinType', 'resultA', 'resultB', 'changeA', 'changeB', 'conductor'
  ]);
}

/**
 * PULLS ENTIRE DATABASE FROM SUPABASE REST API AND REFRESHES ALL GOOGLE SHEET TABS
 */
function syncFromSupabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const options = {
      method: 'get',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    };

    const teamsRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/teams?select=*', options);
    const stallsRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/stalls?select=*', options);
    const matchesRes = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/matches?select=*&order=time.asc', options);

    const teams = JSON.parse(teamsRes.getContentText()) || [];
    const stalls = JSON.parse(stallsRes.getContentText()) || [];
    const matches = JSON.parse(matchesRes.getContentText()) || [];

    // 1. Overwrite Teams Sheet
    const tSheet = teamsSheet();
    tSheet.clearContents();
    tSheet.appendRow(['id', 'name', 'past', 'present', 'future', 'teamId', 'contact']);
    if (teams && teams.length > 0) {
      const rows = teams.map(t => [
        t.id || '',
        t.name || '',
        Number(t.past) || 0,
        Number(t.present) || 0,
        Number(t.future) || 0,
        t.team_id || t.teamId || '',
        t.contact || ''
      ]);
      tSheet.getRange(2, 1, rows.length, 7).setValues(rows);
    }

    // 2. Overwrite Stalls Sheet
    const sSheet = stallsSheet();
    sSheet.clearContents();
    sSheet.appendRow(['id', 'name', 'category', 'minWager']);
    if (stalls && stalls.length > 0) {
      const rows = stalls.map(s => [
        s.id || '',
        s.name || '',
        s.category || '',
        Number(s.min_wager !== undefined ? s.min_wager : (s.minWager || 1))
      ]);
      sSheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }

    // 3. Overwrite Matches Sheet
    const mSheet = matchesSheet();
    mSheet.clearContents();
    mSheet.appendRow([
      'time', 'stallId', 'stallName', 'teamAId', 'teamAName', 'teamBId', 'teamBName',
      'wager', 'coinType', 'resultA', 'resultB', 'changeA', 'changeB', 'conductor'
    ]);
    if (matches && matches.length > 0) {
      const rows = matches.map(m => [
        Number(m.time) || 0,
        m.stall_id || m.stallId || '',
        m.stall_name || m.stallName || '',
        m.team_a_id || m.teamAId || '',
        m.team_a_name || m.teamAName || '',
        m.team_b_id || m.teamBId || '',
        m.team_b_name || m.teamBName || '',
        Number(m.wager) || 0,
        m.coin_type || m.coinType || '',
        m.result_a || m.resultA || '',
        m.result_b || m.resultB || '',
        Number(m.change_a !== undefined ? m.change_a : m.changeA) || 0,
        Number(m.change_b !== undefined ? m.change_b : m.changeB) || 0,
        m.conductor || ''
      ]);
      mSheet.getRange(2, 1, rows.length, 14).setValues(rows);
    }

    return { ok: true, synced: { teams: teams.length, stalls: stalls.length, matches: matches.length } };
  } catch (err) {
    return { error: err.message };
  } finally {
    lock.releaseLock();
  }
}

function rowsToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data || !data.length) return [];
  const headers = data.shift();
  return data
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i]);
      return o;
    });
}

function getAll() {
  return {
    teams: rowsToObjects(teamsSheet()),
    stalls: rowsToObjects(stallsSheet()),
    matches: rowsToObjects(matchesSheet())
  };
}

function addTeam(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = teamsSheet();
    const id = p.id || ('t_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000));
    sh.appendRow([id, p.name, Number(p.past) || 0, Number(p.present) || 0, Number(p.future) || 0, p.teamId || '', p.contact || '']);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function deleteTeam(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = teamsSheet();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) { sh.deleteRow(i + 1); break; }
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function addStall(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = stallsSheet();
    const id = 's_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
    sh.appendRow([id, p.name, p.category, Number(p.minWager) || 1]);
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function deleteStall(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = stallsSheet();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) { sh.deleteRow(i + 1); break; }
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function updateTeamCoins(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = teamsSheet();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === p.id) {
        sh.getRange(i + 1, 3, 1, 3).setValues([[Number(p.past), Number(p.present), Number(p.future)]]);
        return { ok: true };
      }
    }
    return { error: 'Team not found' };
  } finally { lock.releaseLock(); }
}

function appendMatch(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = matchesSheet();
    sh.appendRow([
      p.time, p.stallId, p.stallName, p.teamAId, p.teamAName, p.teamBId, p.teamBName,
      p.wager, p.coinType, p.resultA, p.resultB, p.changeA, p.changeB, p.conductor || ''
    ]);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function resetAll() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    [SHEET_NAMES.teams, SHEET_NAMES.stalls, SHEET_NAMES.matches].forEach(name => {
      const sh = ss.getSheetByName(name);
      if (sh) ss.deleteSheet(sh);
    });
    teamsSheet(); stallsSheet(); matchesSheet();
    return { ok: true };
  } finally { lock.releaseLock(); }
}
