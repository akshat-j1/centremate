/** In Apps Script > Project Settings > Script properties add:
 * CENTREMATE_URL: production origin (https://...)
 * CENTREMATE_SECRET: the same 32+ character FORM_SYNC_SECRET as Vercel
 * Sheet headers: email,name,hostel,exam_id,centre_id
 * Install a time-driven trigger for syncCentreMate (e.g. hourly).
 * This script sends no contacts and never grants directory consent.
 */
function syncCentreMate() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('CENTREMATE_URL');
  const secret = props.getProperty('CENTREMATE_SECRET');
  if (!url || !secret) throw new Error('Set CentreMate script properties first.');
  const values = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getDisplayValues();
  const headers = values.shift().map(h => h.trim().toLowerCase());
  const required = ['email', 'name', 'hostel', 'exam_id', 'centre_id'];
  if (!required.every(h => headers.includes(h))) throw new Error('Missing required column headers.');
  const rows = values.filter(row => row.some(Boolean)).map(row => Object.fromEntries(required.map(h => [h, row[headers.indexOf(h)]])));
  for (let start = 0; start < rows.length; start += 500) {
    const response = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/api/sync', {method: 'post', contentType: 'application/json', headers: {Authorization: 'Bearer ' + secret}, payload: JSON.stringify({rows: rows.slice(start, start + 500)}), muteHttpExceptions: true});
    if (response.getResponseCode() !== 200) throw new Error('CentreMate sync failed: HTTP ' + response.getResponseCode());
  }
}
