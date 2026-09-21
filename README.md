# RADAR - Plataforma de Inteligencia Empresarial

## Requisitos previos

1. **Node.js** (version 18 o superior)
   - Descarga: https://nodejs.org/
   - Descarga la version LTS (recomendada)
   - Instala con las opciones por defecto

2. **Visual Studio Code**
   - Descarga: https://code.visualstudio.com/

## Instalacion (primera vez)

1. Descomprime esta carpeta donde quieras (ej: C:\Proyectos\RADAR)

2. Abre VS Code

3. Ve a Archivo > Abrir Carpeta > selecciona la carpeta "radar-project"

4. Abre la terminal en VS Code:
   - Menu: Terminal > Nueva Terminal
   - O presiona: Ctrl + ñ (o Ctrl + `)
   - IMPORTANTE: Si usas PowerShell y te da error, cambia a CMD:
     Click en la flecha v al lado del + en la terminal > Command Prompt

5. Ejecuta este comando para instalar las dependencias:

   npm install

   Espera a que termine (puede tardar 1-2 minutos).

6. Configura Supabase (una vez): ver la seccion "Datos" mas abajo. Sin esto
   RADAR muestra una pantalla explicando que falta configurar.

7. Ejecuta este comando para iniciar RADAR:

   npm run dev

8. Se abrira automaticamente tu navegador en:

   http://localhost:5173

   Ahi veras RADAR funcionando.

## Uso diario

Cada vez que quieras usar RADAR:

1. Abre VS Code
2. Abre la carpeta del proyecto
3. Abre terminal (Ctrl + ñ)
4. Ejecuta: npm run dev
5. Se abre el navegador con RADAR

Para detener el servidor: presiona Ctrl + C en la terminal.

## Estructura del proyecto

radar-project/
  index.html          - Pagina principal
  package.json        - Dependencias del proyecto
  vite.config.js      - Configuracion del servidor
  supabase/schema.sql - Esquema y RLS de la base de datos
  .env.example        - Plantilla de variables de entorno
  src/
    main.jsx          - Punto de entrada
    App.jsx           - TODA la aplicacion RADAR
    lib/supabaseClient.js - Cliente de Supabase
    lib/sync.js        - Carga/guardado generico de datos por usuario

## Modulos incluidos

- Inicio (Dashboard)
- Empresas (ficha 360)
- RADAR Evaluaciones (Renta F22, Tributario, Financiero, 360)
- Contabilidad (Plan Cuentas, Asientos, CSV SII, Diario, Mayor, Balance, EERR, 8 Columnas)
- Remuneraciones (calculo automatico AFP, Salud, Cesantia, Imp. Unico)
- Gestion Documental (expediente digital, 8 categorias)
- Planificacion (tareas, prioridades, vencimientos)
- Portal del Cliente (dashboard KPIs)

## Datos

Los datos se guardan en Supabase (Postgres), no en el navegador. Cada
usuario ve solo sus propias empresas y registros (Row Level Security).

Configuracion (una sola vez):

1. Crea una cuenta gratuita en https://supabase.com y un proyecto nuevo.
2. En el proyecto, ve a SQL Editor, pega el contenido de
   `supabase/schema.sql` y ejecutalo. Esto crea la tabla y sus reglas de
   seguridad.
3. Ve a Project Settings > API y copia la "Project URL" y la
   "anon public key".
4. En la carpeta del proyecto crea un archivo `.env` (copia `.env.example`)
   con:

   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key

5. Reinicia `npm run dev`. Ahora RADAR pide crear cuenta / iniciar sesion,
   y tus datos quedan disponibles desde cualquier navegador o equipo.

Por defecto, Supabase Auth exige confirmar el correo antes de poder
iniciar sesion (revisa la bandeja de entrada tras crear la cuenta). Esto se
puede desactivar en Authentication > Providers > Email mientras pruebas.

## Notas

- Ver `ROADMAP.md` para las fases siguientes (informes con IA, modulos
  nuevos, despliegue a produccion).
- Desarrollado por Jonas Penaloza - RADAR 2026
