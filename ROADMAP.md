# RADAR — Roadmap de Continuidad

Plataforma de registro contable y elaboracion de reportes para clientes de
contabilidad, desarrollada por Jonas Penaloza. Este documento existe para que
cualquier sesion de trabajo (con o sin memoria de conversaciones anteriores)
pueda retomar el proyecto sabiendo que esta hecho, que sigue y por que.

Como usarlo: al empezar una sesion nueva, marca la fase/tarea en la que estas
trabajando. Al cerrar una sesion, actualiza el estado de las tareas tocadas y
agrega una linea en "Historial" con la fecha y un resumen de 1-2 lineas.

Leyenda de estado: `[ ]` pendiente · `[~]` en curso · `[x]` hecho

---

## Fase 0 — MVP funcional (hecho)

- [x] Estructura Vite + React de una sola pagina (`src/App.jsx`)
- [x] Modulos: Inicio, Empresas, RADAR (evaluaciones F22/Tributario/Financiero/360),
      Contabilidad, Remuneraciones, Documentos, Planificacion, Portal Cliente
- [x] Plan de cuentas IFRS a 4 niveles (Clase / Grupo / Clasificacion / Cuenta),
      editable, con deteccion de cuentas de detalle (hojas del arbol)
- [x] Asientos, Libro Diario, Libro Mayor, Balance, Estado de Resultados,
      Balance 8 Columnas — todos calculando sobre las cuentas hoja reales
- [x] Persistencia en `localStorage` del navegador

**Limitacion conocida:** los datos viven solo en el navegador de un
computador. Sin base de datos real, no hay multi-dispositivo, no hay acceso
de clientes al Portal, y hay riesgo de perder informacion.

---

## Fase 1 — Persistencia real (Supabase)

Objetivo: que los datos sobrevivan a un cambio de navegador o de equipo, y
sea la base para que el Portal del Cliente sea usable por terceros.

- [x] Esquema definido en `supabase/schema.sql`: una tabla generica
      `radar_data` (`user_id`, `collection`, `row_id`, `payload jsonb`) que
      guarda empresas, plan_cuentas, asientos, evaluaciones, remuneraciones,
      documentos, tareas y log — mismo formato que usaba localStorage, para
      no reescribir la UI. Se puede normalizar a tablas relacionales mas
      adelante si el volumen de datos o los reportes lo piden.
- [x] Row Level Security: cada fila solo es visible/editable por su
      `user_id` (`auth.uid()`), incluida en el mismo `schema.sql`
- [x] Autenticacion (Supabase Auth) con correo/contrasena: pantalla de
      login/crear cuenta (`AuthScreen`), gate en `App` que solo muestra el
      dashboard con sesion activa, boton "Salir" en el sidebar
- [x] `src/lib/supabaseClient.js` + `src/lib/sync.js` reemplazan `ld()`/`sv()`
      (localStorage) por carga/guardado en Supabase, sin tocar la logica de
      los componentes (`setEmps`, `setAccts`, etc. siguen igual)
- [x] Pantalla de configuracion faltante si no hay `.env` con las variables
      de Supabase, en vez de que la app truene
- [x] Proyecto creado en supabase.com, `supabase/schema.sql` corrido, `.env`
      configurado y probado en el computador de Jonas (Windows) — login y
      creacion de cuenta funcionando de punta a punta
- [ ] Login separado para clientes que entran solo al Portal (hoy todos los
      usuarios ven el dashboard completo del contador)
- [ ] Migracion: si ya cargaste datos de prueba en localStorage en una
      sesion anterior, hoy se pierden al pasar a Supabase — no hay boton de
      exportar/importar todavia (no critico: no hay datos reales de
      clientes en juego aun)

**Como probarlo:** sigue los pasos de `README.md` → "Datos", corre
`npm run dev`, crea una cuenta y confirma que las empresas/asientos que
cargues sigan ahi si recargas la pagina o entras desde otro navegador.

**Bloquea:** Fase 5 (produccion) y el uso real del Portal Cliente.

---

## Fase 2 — Informes con IA

Objetivo: que las evaluaciones RADAR (F22, Tributario, Financiero, 360)
generen un informe redactado profesionalmente, no solo texto plano armado
por reglas.

- [ ] Decidir proveedor: API de un modelo Claude (mejor calidad de
      redaccion, requiere costo) vs. Gemini (gratis, calidad menor) — o
      dejar ambas opciones configurables
- [ ] Guardar la API key de forma segura (variable de entorno en el backend
      o en Supabase Edge Function; nunca expuesta en el frontend)
- [ ] Construir el prompt a partir de las respuestas de la evaluacion
      (reemplaza o complementa la generacion de texto local actual)
- [ ] Boton "Generar informe con IA" dentro de cada evaluacion, con opcion
      de editar el resultado antes de guardarlo/exportarlo
- [ ] Exportar el informe final a PDF

---

## Fase 3 — Pulido de diseno y UX

Objetivo: que la plataforma se vea y se sienta como un producto terminado,
no un prototipo.

- [ ] Agregar el logo RADAR (reemplazar el icono SVG generico actual)
- [ ] Revisar experiencia movil: el sidebar y las tablas anchas (Balance 8
      Columnas, Libro Mayor) necesitan probarse en pantallas chicas
- [ ] Ajustar el plan de cuentas por defecto con las cuentas reales que usan
      tus clientes actuales (agregar/quitar segun rubro)
- [ ] Revisar textos y validaciones de formularios (ej. creacion de
      empresa, que hoy requiere completar campos sin feedback claro de
      cuales son obligatorios)

Esta fase puede intercalarse con las demas — no depende de Supabase ni de IA.

---

## Fase 4 — Modulos nuevos

- [ ] **RADAR Auditoria**: papeles de trabajo, materialidad, marco COSO
      (mencionado en la conversacion original, marcado "Pronto" en el nav)
- [ ] **Timeline de la empresa**: linea de tiempo de hitos (creacion,
      evaluaciones, cambios de regimen tributario, eventos relevantes)
- [ ] **CRM de prospectos**: seguimiento de clientes potenciales, separado
      de la ficha de empresa activa (que es para clientes ya firmados)

Cada modulo depende de Fase 1 si va a guardar datos por empresa de forma
persistente.

---

## Fase 5 — Produccion

Objetivo: que tus clientes puedan entrar al Portal desde cualquier lugar.

- [ ] Desplegar frontend en Vercel (gratis para este volumen)
- [ ] Conectar variables de entorno de Supabase en Vercel
- [ ] Dominio propio (opcional) y certificado HTTPS (automatico en Vercel)
- [ ] Revision de seguridad: RLS de Supabase, manejo de sesiones, que
      ningun dato de un cliente sea visible para otro
- [ ] Probar el flujo completo como si fueras un cliente entrando al Portal

**Requiere:** Fase 1 completa (sin Supabase no hay produccion real).

---

## Historial de sesiones

- 2026-09-21 — Recuperado el proyecto desde export de sesion anterior
  (localStorage-only). Completada la reestructuracion IFRS del plan de
  cuentas a 4 niveles (nivel 3 = clasificacion, nivel 4 = cuenta de
  detalle) que habia quedado pendiente. Corregido bug donde Balance, EERR,
  8 Columnas y Portal Cliente ignoraban saldos de cuentas con sub-cuentas.
  Creado este roadmap.
- 2026-09-21 — Fase 1 (codigo) completa: esquema `supabase/schema.sql` con
  RLS, cliente Supabase, pantalla de login/crear cuenta, y reemplazo de
  localStorage por sync a Supabase sin reescribir la UI. Falta que el
  usuario cree el proyecto real en supabase.com y complete el `.env`
  (probado localmente contra un proyecto falso: la app maneja bien tanto
  la falta de configuracion como errores de red, sin crashear).
- 2026-09-21 — Fase 1 cerrada de punta a punta: Jonas instalo Node.js y
  VS Code por primera vez, bajo el proyecto desde GitHub, creo el proyecto
  en supabase.com, corrio el schema y configuro el `.env`. Problemas
  resueltos en el camino: PowerShell bloqueaba `npm` por politica de
  ejecucion de scripts (se uso Command Prompt en su lugar), el ZIP de
  GitHub quedo con una carpeta duplicada adentro, y la URL de Supabase
  tenia `/rest/v1/` pegado al final por copiar del lugar equivocado.
  Cuenta creada y login funcionando en su computador.
