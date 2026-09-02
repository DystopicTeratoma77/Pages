/*const VERSION_APP = "2026-07-13_19-55";*/

function doGet(e) {
  /*console.log("VERSION APP:", VERSION_APP);*/

  return procesarRegistro(obtenerDatosRequest(e));
}

function doPost(e) {
  return procesarRegistro(obtenerDatosRequest(e));
}

/**
 * Unifica parámetros de query (GET) y cuerpo POST (por si fetch pierde el body en el redirect).
 */
function obtenerDatosRequest(e) {
  const data = Object.assign({}, e.parameter || {});

  if (e.postData && e.postData.contents) {
    const delBody = parsearFormUrlEncoded(e.postData.contents);
    Object.keys(delBody).forEach(function (clave) {
      if (delBody[clave] !== "" && (!data[clave] || data[clave] === "")) {
        data[clave] = delBody[clave];
      }
    });
  }

  return data;
}

function parsearFormUrlEncoded(contents) {
  const params = {};
  const pairs = String(contents).split("&");

  for (let i = 0; i < pairs.length; i++) {
    const partes = pairs[i].split("=");
    const clave = decodeURIComponent((partes[0] || "").replace(/\+/g, " "));
    const valor = decodeURIComponent((partes[1] || "").replace(/\+/g, " "));
    if (clave) params[clave] = valor;
  }

  return params;
}

function procesarRegistro(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Registro_de_Bonos");
  const params = cargarParametros(ss);
  const calendar = cargarCalendarizacion(ss);

  Logger.log("Parámetros recibidos: " + JSON.stringify({
    user: data.user || "",
    cve: data.cve || "",
    mes: data.mes || "",
    bonus_type: data.bonus_type || "",
    staff: data.staff || ""
  }));

  if (!data.user) {
    return respuestaTexto("ERROR: Falta el parámetro user.");
  }

  const userEmail = String(data.user).toLowerCase();
  const isStaff = String(data.staff || "").toLowerCase() === "true";
  if (userEmail.includes(params.dominio_bloqueado) && !isStaff) {
    return respuestaTexto("ERROR: No tiene permisos para realizar esta acción.");
  }

  const mes = convertirMesInyectado(data.mes);
  if (!mes) {
    return respuestaTexto("ERROR: Mes de incentivo no válido o no proporcionado.");
  }
  if (!calendar[mes]) {
    return respuestaTexto("ERROR: No existe calendarización para el mes " + mes);
  }

  const now = new Date();
  const hoy = new Date();
  hoy.setHours(0,0,0,0);

  const fechaIni = new Date(calendar[mes].fecha_ini);
  fechaIni.setHours(0,0,0,0);

  const fechaCierre = new Date(calendar[mes].fecha_cierre);
  fechaCierre.setHours(0,0,0,0);

  Logger.log("Mes guardado (yyyy-MM): " + mes);

  if (!userEmail.includes(params.dominio_admin) && !userEmail.includes(params.dominio_bloqueado)) {
    if (hoy < fechaIni || hoy > fechaCierre) {
      return respuestaTexto("ERROR: Fuera del periodo de calendarización.");
    }

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const rowCve = rows[i][2];
      const rowMonth = normalizarMesFila(rows[i][4]);

      if (rowCve == data.cve && rowMonth === mes) {
        return respuestaTexto("ERROR: Solo se puede responder una vez por clave matriz.");
      }
    }
  }

  sheet.appendRow([
    now,
    userEmail,
    data.cve,
    data.bonus_type,
    mes
  ]);

  return respuestaTexto("OK");
}

function respuestaTexto(texto) {
  return ContentService
    .createTextOutput(texto)
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Convierte el mes inyectado por URL/formulario a formato yyyy-MM.
 * Acepta "MMM YYYY" (en-US, ej. "Apr 2025") o yyyy-MM ya formateado.
 */
function convertirMesInyectado(mesInyectado) {
  const limpio = String(mesInyectado || "").trim();
  if (!limpio) return null;

  if (/^\d{4}-\d{2}$/.test(limpio)) {
    return limpio;
  }

  const isoParcial = limpio.match(/^(\d{4})-(\d{2})/);
  if (isoParcial) {
    return isoParcial[1] + "-" + isoParcial[2];
  }

  const match = limpio.match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return null;

  const fecha = new Date(match[1] + " 1, " + match[2]);
  if (isNaN(fecha.getTime())) return null;

  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM");
}

function normalizarMesFila(valor) {
  if (!valor) return "";

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM");
  }

  const convertido = convertirMesInyectado(String(valor).trim());
  if (convertido) return convertido;

  const isoParcial = String(valor).trim().match(/^(\d{4})-(\d{2})/);
  if (isoParcial) {
    return isoParcial[1] + "-" + isoParcial[2];
  }

  return "";
}

/**
 * Lee los parámetros desde la pestaña "Parametros".
 * mes_respuesta se ignora para el registro; solo se usa data.mes del formulario.
 */
function cargarParametros(ss) {
  const hoja = ss.getSheetByName("Parametros");
  const filas = hoja.getDataRange().getValues();
  const params = {};

  for (let i = 1; i < filas.length; i++) {
    const clave = String(filas[i][0]).trim().toLowerCase();
    const valor = filas[i][1];
    params[clave] = valor;
  }

  params.dominio_bloqueado = String(params.dominio_bloqueado || "@stellantis.com").toLowerCase();
  params.dominio_admin = String(params.dominio_admin || "@simdatagroup.com").toLowerCase();

  return params;
}

function cargarCalendarizacion(ss) {
  const hoja = ss.getSheetByName("Calendarizacion");
  const datos = hoja.getDataRange().getValues();

  const calendar = {};

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];

    const mes = Utilities.formatDate(
      new Date(fila[0]),
      Session.getScriptTimeZone(),
      "yyyy-MM"
    );

    calendar[mes] = {
      fecha_ini: fila[1],
      fecha_cierre: fila[2]
    };
  }

  return calendar;
}