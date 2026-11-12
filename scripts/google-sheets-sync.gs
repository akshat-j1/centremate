/** CentreMate Google Form / Sheet sync.
 * Paste into the response spreadsheet's Apps Script editor.
 * Script Properties (Project Settings; never put secrets in cells):
 * CENTREMATE_URL=https://centremate-akshat-9076.vercel.app
 * CENTREMATE_SECRET=the server's FORM_SYNC_SECRET
 * CENTREMATE_SHEET=optional response tab name (otherwise first tab)
 * CENTREMATE_EXAM_ID=optional default exam UUID from CentreMate admin
 * CENTREMATE_CENTRE_ID=optional default centre UUID for a single-centre form
 * CENTREMATE_COLUMNS=optional JSON mapping, for example:
 * {"email":"Email Address","name":"Full name","hostel":"Hostel","centre_id":"Exam Centre"}
 * CENTREMATE_CENTRE_IDS=optional JSON mapping from exact centre name to verified UUID
 * {"CENTRE NAME FROM YOUR FORM":"UUID COPIED FROM CENTREMATE ADMIN"}
 * Headers email,name,hostel,exam_id,centre_id work without mappings.
 * Hostel responses must be Uni 1 / Uni 2. Centre IDs must be verified.
 * Install an authorized spreadsheet "On form submit" trigger for syncCentreMate,
 * or a time-driven trigger (e.g. hourly). Run once manually to grant Sheets/HTTP access.
 * Repeated syncs safely skip existing records. No contacts or consent are transmitted.
 */
function centreMateRows(values, config) {
  if (!values.length) return [];
  const headers = values[0].map(h => String(h).trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate column headers.');
  const fields = ['email','name','hostel','exam_id','centre_id'];
  const mapping = config.columns || {};
  const centreIds = Object.fromEntries(Object.entries(config.centreIds || {}).map(([name,id])=>[name.trim().toLowerCase(),id]));
  return values.slice(1).filter(row=>row.some(value=>String(value).trim())).map((row,index)=>{
    const result = Object.fromEntries(fields.map(field=>{
      const column = String(mapping[field] || field).trim().toLowerCase();
      return [field,String(row[headers.indexOf(column)] || '').trim()];
    }));
    result.email=result.email.toLowerCase();
    result.exam_id=result.exam_id||config.examId||'';
    result.centre_id=result.centre_id||config.centreId||'';
    result.centre_id=centreIds[result.centre_id.toLowerCase()]||result.centre_id;
    if (fields.some(field=>!result[field])) throw new Error('Missing required field on response row '+(index+2)+'. Check column mappings and defaults.');
    return result;
  });
}
function syncCentreMate() {
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try {
    const props=PropertiesService.getScriptProperties();
    const url=props.getProperty('CENTREMATE_URL');const secret=props.getProperty('CENTREMATE_SECRET');
    if(!url||!/^https:\/\//.test(url)||!secret||secret.length<32)throw new Error('Set the HTTPS CentreMate URL and 32+ character secret in Script Properties.');
    const book=SpreadsheetApp.getActiveSpreadsheet();const tab=props.getProperty('CENTREMATE_SHEET');const sheet=tab?book.getSheetByName(tab):book.getSheets()[0];
    if(!sheet)throw new Error('Response sheet not found.');
    const rows=centreMateRows(sheet.getDataRange().getDisplayValues(),{columns:JSON.parse(props.getProperty('CENTREMATE_COLUMNS')||'{}'),centreIds:JSON.parse(props.getProperty('CENTREMATE_CENTRE_IDS')||'{}'),examId:props.getProperty('CENTREMATE_EXAM_ID'),centreId:props.getProperty('CENTREMATE_CENTRE_ID')});
    for(let start=0;start<rows.length;start+=500){
      const response=UrlFetchApp.fetch(url.replace(/\/$/,'')+'/api/sync',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+secret},payload:JSON.stringify({rows:rows.slice(start,start+500)}),muteHttpExceptions:true});
      if(response.getResponseCode()!==200)throw new Error('CentreMate sync failed: HTTP '+response.getResponseCode()+'. Check mappings, IDs and the configured secret.');
    }
  } finally {lock.releaseLock();}
}
