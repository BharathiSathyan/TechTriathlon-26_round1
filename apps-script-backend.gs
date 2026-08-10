/**
 * ROUND 1 COIN TRACKER — Google Apps Script backend.
 *
 * SETUP:
 * 1. Create a new blank Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Delete any starter code, paste this whole file in, and save (Ctrl/Cmd+S).
 * 4. Click Deploy > New deployment.
 *    - Type: "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click Deploy, authorize the permissions it asks for, then copy the
 *    "Web app URL" it gives you (looks like https://script.google.com/macros/s/XXXX/exec).
 * 6. Paste that URL into API_URL near the top of coin-tracker.html.
 *
 * The three tabs (Teams, Stalls, Matches) are created automatically the first
 * time the app calls this script — you don't need to make them by hand.
 */

const SHEET_NAMES = { teams: 'Teams', stalls: 'Stalls', matches: 'Matches' };

function doGet(e) {
  return handle(e);
}
function doPost(e) {
  return handle(e);
}

function handle(e) {
  try {
    let params;
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      params = e.parameter;
    }
    const action = params.action;
    let result;
    switch (action) {
      case 'getAll': result = getAll(); break;
      case 'addTeam': result = addTeam(params); break;
      case 'deleteTeam': result = deleteTeam(params.id); break;
      case 'addStall': result = addStall(params); break;
      case 'deleteStall': result = deleteStall(params.id); break;
      case 'updateTeamCoins': result = updateTeamCoins(params); break;
      case 'appendMatch': result = appendMatch(params); break;
      case 'resetAll': result = resetAll(); break;
      default: result = { error: 'Unknown action: ' + action };
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

function teamsSheet() { return getSheet(SHEET_NAMES.teams, ['id', 'name', 'past', 'present', 'future']); }
function stallsSheet() { return getSheet(SHEET_NAMES.stalls, ['id', 'name', 'category', 'minWager']); }
function matchesSheet() {
  return getSheet(SHEET_NAMES.matches, [
    'time', 'stallId', 'stallName', 'teamAId', 'teamAName', 'teamBId', 'teamBName',
    'wager', 'coinType', 'resultA', 'resultB', 'changeA', 'changeB', 'conductor'
  ]);
}

function rowsToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
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
    const id = 't_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
    sh.appendRow([id, p.name, Number(p.past) || 0, Number(p.present) || 0, Number(p.future) || 0]);
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
