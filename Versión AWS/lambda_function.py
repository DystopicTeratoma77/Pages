import json
import csv
import io
import os
from datetime import datetime, timedelta

import boto3

# ─── CONFIGURACIÓN ───────────────────────────────────────────────
# Estas variables se configuran como Variables de Entorno en la Lambda
S3_BUCKET = os.environ.get("S3_BUCKET", "tu-bucket-bonos")
S3_KEY = os.environ.get("S3_KEY", "registro_bonos.csv")
DOMINIO_BLOQUEADO = os.environ.get("DOMINIO_BLOQUEADO", "@stellantis.com")
DOMINIO_ADMIN = os.environ.get("DOMINIO_ADMIN", "@simdatagroup.com")
CALENDARIO_DIA_INICIO = int(os.environ.get("CALENDARIO_DIA_INICIO", "1"))
CALENDARIO_DIA_FIN = int(os.environ.get("CALENDARIO_DIA_FIN", "7"))
UMBRAL_MES = int(os.environ.get("UMBRAL_MES", "15"))
# Zona horaria de México (UTC-6), ajustar si hay horario de verano
TZ_OFFSET_HOURS = int(os.environ.get("TZ_OFFSET_HOURS", "-6"))

s3 = boto3.client("s3")

# Encabezados del CSV
CSV_HEADERS = ["fecha", "user", "cve", "bonus_type", "mes"]


def lambda_handler(event, context):
    """
    Handler principal de la Lambda.
    Recibe un evento de API Gateway (POST con JSON body).
    """
    try:
        # Parsear el body del request
        if isinstance(event.get("body"), str):
            body = json.loads(event["body"])
        else:
            body = event.get("body", event)

        user = body.get("user", "").lower().strip()
        cve = body.get("cve", "").strip()
        bonus_type = body.get("bonus_type", "").strip()

        # ─── VALIDACIÓN: Dominio bloqueado ───────────────────────
        if DOMINIO_BLOQUEADO in user:
            return respuesta(400, "ERROR", "No tiene permisos para realizar esta acción.")

        # Fecha actual en zona horaria de México
        now = datetime.utcnow() + timedelta(hours=TZ_OFFSET_HOURS)
        current_day = now.day
        current_month = now.strftime("%Y%m")

        # ─── Usuarios admin se saltan calendarización y duplicados ─
        es_admin = DOMINIO_ADMIN in user

        if not es_admin:
            # ─── VALIDACIÓN: Calendarización ─────────────────────
            if current_day < CALENDARIO_DIA_INICIO or current_day > CALENDARIO_DIA_FIN:
                return respuesta(400, "ERROR", "Fuera del periodo de calendarización.")

            # ─── VALIDACIÓN: Duplicados (misma cve en el mismo mes) ─
            registros_existentes = leer_csv_de_s3()
            for row in registros_existentes:
                if len(row) >= 3:
                    row_cve = row[2].strip()
                    row_fecha = row[0].strip()
                    try:
                        row_month = datetime.fromisoformat(row_fecha).strftime("%Y%m")
                    except ValueError:
                        continue
                    if row_cve == cve and row_month == current_month:
                        return respuesta(400, "ERROR", "Solo se puede responder una vez por clave matriz.")

        # ─── Calcular campo "mes" ────────────────────────────────
        # Hasta el día umbral = mes anterior, después = mes actual
        mes_referencia = now
        if current_day <= UMBRAL_MES:
            # Retroceder un mes
            if now.month == 1:
                mes_referencia = now.replace(year=now.year - 1, month=12, day=1)
            else:
                mes_referencia = now.replace(month=now.month - 1, day=1)
        mes = mes_referencia.strftime("%Y-%m")

        # ─── Guardar registro en CSV ─────────────────────────────
        fecha_str = now.strftime("%Y-%m-%dT%H:%M:%S")
        nueva_fila = [fecha_str, user, cve, bonus_type, mes]
        agregar_fila_csv(nueva_fila)

        return respuesta(200, "OK", "Registro guardado exitosamente.")

    except Exception as e:
        print(f"Error: {str(e)}")
        return respuesta(500, "ERROR", f"Error interno del servidor: {str(e)}")


def leer_csv_de_s3():
    """Lee el CSV existente de S3 y retorna las filas (sin encabezado)."""
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY)
        content = response["Body"].read().decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        filas = list(reader)
        # Saltar el encabezado si existe
        if filas and filas[0] == CSV_HEADERS:
            return filas[1:]
        return filas
    except s3.exceptions.NoSuchKey:
        return []
    except Exception as e:
        # Si el archivo no existe aún, retornar vacío
        if "NoSuchKey" in str(e):
            return []
        raise


def agregar_fila_csv(nueva_fila):
    """Agrega una fila al CSV en S3 (lee, agrega y reescribe)."""
    # Leer contenido existente
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=S3_KEY)
        contenido_existente = response["Body"].read().decode("utf-8")
    except Exception:
        # Si no existe, crear con encabezados
        contenido_existente = ""

    output = io.StringIO()
    writer = csv.writer(output)

    if not contenido_existente:
        # Archivo nuevo: escribir encabezados primero
        writer.writerow(CSV_HEADERS)
    else:
        # Escribir el contenido existente
        output.write(contenido_existente)
        # Asegurar que termina con salto de línea
        if not contenido_existente.endswith("\n"):
            output.write("\n")

    # Agregar la nueva fila
    writer.writerow(nueva_fila)

    # Subir de vuelta a S3
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=S3_KEY,
        Body=output.getvalue().encode("utf-8"),
        ContentType="text/csv"
    )


def respuesta(status_code, status, message):
    """Genera la respuesta HTTP para API Gateway."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        "body": json.dumps({
            "status": status,
            "message": message
        })
    }
