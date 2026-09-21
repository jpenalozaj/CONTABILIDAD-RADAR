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

- [ ] Crear proyecto Supabase (plan gratuito) y definir esquema: empresas,
      plan_cuentas, asientos, lineas_asiento, evaluaciones, remuneraciones,
      documentos, tareas — con `usuario_id` / `empresa_id` para aislar datos
- [ ] Autenticacion (Supabase Auth): login del contador (owner) y, mas
      adelante, login separado para clientes que entran al Portal
- [ ] Reemplazar las funciones `ld()`/`sv()` (localStorage) por llamadas a
      Supabase, manteniendo la misma forma de los datos para no reescribir
      la UI
- [ ] Migracion de datos: script o boton "Exportar/Importar" para mover lo
      que ya este cargado en localStorage hacia Supabase
- [ ] Reglas de acceso (Row Level Security) para que cada contador solo vea
      sus propias empresas, y cada cliente solo vea la suya

**Bloquea:** Fase 4 (produccion) y el uso real del Portal Cliente.

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
