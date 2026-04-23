function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = e.parameter;

  const now = new Date();
  const currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMM");

  const rows = sheet.getDataRange().getValues();

  // Recorrer filas existentes (saltando encabezado si tienes)
  for (let i = 1; i < rows.length; i++) {
    const rowDate = rows[i][0]; // Columna fecha
    const rowCve = rows[i][2];  // Columna cve
    const user = rows[i][1];  // Columna user

    const rowMonth = Utilities.formatDate(new Date(rowDate), Session.getScriptTimeZone(), "yyyyMM");

    if (rowCve == data.cve && rowMonth == currentMonth && !(user.includes('@simdatagroup.com') || user.includes('@stellantis.com'))) {
      return ContentService
        .createTextOutput("ERROR: Solo se puede responder una vez por clave matriz.")
        .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // Si no existe registro, guardar
  sheet.appendRow([
    now,
    data.user,
    data.cve,
    data.bonus_type
  ]);

  return ContentService
    .createTextOutput("OK")
    .setMimeType(ContentService.MimeType.TEXT);
}