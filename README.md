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

6. Ejecuta este comando para iniciar RADAR:

   npm run dev

7. Se abrira automaticamente tu navegador en:

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
  src/
    main.jsx          - Punto de entrada
    App.jsx           - TODA la aplicacion RADAR (1297 lineas)

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

Los datos se guardan en el localStorage del navegador.
Mientras uses el mismo navegador, tus datos se mantienen entre sesiones.

## Notas

- Para produccion se necesitaria un backend con base de datos real
- Este es un MVP/prototipo funcional
- Desarrollado por Jonas Penaloza - RADAR 2026
