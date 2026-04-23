function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const data = e.parameter;

  sheet.appendRow([
    new Date(),
    data.user,
    data.cve,
    data.bonus_type
  ]);

  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}