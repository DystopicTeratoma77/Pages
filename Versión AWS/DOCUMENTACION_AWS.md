# Guía de Implementación: Registro de Bonos en AWS

Este documento detalla la estructura y los pasos necesarios para desplegar el sistema de registro de bonos utilizando una arquitectura Serverless en AWS (S3 + Lambda + API Gateway).

## 1. Arquitectura del Sistema
El flujo de datos es el siguiente:
`Usuario (HTML)` -> `API Gateway (POST JSON)` -> `Lambda (Python)` -> `Archivo CSV (S3)`

## 2. Componentes

### A. Frontend (`Formulario_Bono_v2.html`)
- **Tecnología:** HTML5 / Vanilla JS.
- **Función:** Captura el usuario y la clave desde la URL (`?user=...&cve=...`), permite seleccionar el tipo de beneficio y envía un objeto JSON a la API.
- **Punto clave:** Debes reemplazar la variable `apiUrl` con el endpoint generado por AWS API Gateway.

### B. Backend (`lambda_function.py`)
- **Tecnología:** Python 3.x (Boto3).
- **Lógica de Negocio Incluida:**
  - **Bloqueo:** Rechaza correos de `@stellantis.com`.
  - **Excepción Admin:** Usuarios de `@simdatagroup.com` no tienen restricciones de fecha ni duplicados.
  - **Calendarización:** Solo permite registros entre los días **1 y 7** de cada mes para usuarios normales.
  - **Control de Duplicados:** Valida que no exista un registro previo para la misma clave (`cve`) en el mes actual dentro del CSV.
  - **Cálculo de Mes:** Antes del día 16 registra el mes anterior; del 16 en adelante registra el mes actual (formato `YYYY-MM`).

## 3. Pasos para la Configuración

### Paso 1: Configurar el Bucket de S3
1. Crea un bucket en S3 (ej: `sistema-bonos-csv`).
2. Sube un archivo llamado `registro_bonos.csv` con el siguiente encabezado para inicializarlo (opcional, la Lambda lo creará si no existe):
   `fecha,user,cve,bonus_type,mes`

### Paso 2: Crear la Función Lambda
1. Crea una función Lambda desde cero con **Python 3.12**.
2. Pega el código de `lambda_function.py`.
3. En la pestaña **Configuration** -> **Environment variables**, añade:
   - `S3_BUCKET`: Nombre de tu bucket.
   - `S3_KEY`: `registro_bonos.csv`
   - `DOMINIO_BLOQUEADO`: `@stellantis.com`
   - `DOMINIO_ADMIN`: `@simdatagroup.com`
   - `CALENDARIO_DIA_INICIO`: `1`
   - `CALENDARIO_DIA_FIN`: `7`
   - `UMBRAL_MES`: `15`

### Paso 3: Permisos de IAM
Solicita a tu administrador que el Rol de la Lambda tenga la siguiente política:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:PutObject"],
            "Resource": ["arn:aws:s3:::TU-BUCKET/*"]
        },
        {
            "Effect": "Allow",
            "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

### Paso 4: Configurar API Gateway
1. Crea una **HTTP API**.
2. Añade una ruta `POST /registro`.
3. En **Integrations**, conecta esa ruta con tu función Lambda.
4. **IMPORTANTE:** En la pestaña **CORS**, permite:
   - **Access-Control-Allow-Origin:** `*` (o el dominio donde alojes el HTML).
   - **Access-Control-Allow-Methods:** `POST`, `OPTIONS`.
   - **Access-Control-Allow-Headers:** `Content-Type`.

### Paso 5: Vincular con el HTML
1. Copia la "Invoke URL" de tu API Gateway.
2. Pégala en `Formulario_Bono_v2.html` en la línea:
   `const apiUrl = "TU_API_GATEWAY_URL_AQUI";`

---
**Nota:** El sistema está diseñado para manejar la zona horaria de México (UTC-6) mediante la variable `TZ_OFFSET_HOURS` en el código.
