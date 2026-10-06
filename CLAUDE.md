# RADAR — backlog y decisiones del proyecto

Notas persistentes para retomar el trabajo entre sesiones. RADAR es un SaaS
contable/tributario chileno (React + Vite + Supabase, todo en `src/App.jsx`).

## Principio de arquitectura (no renegociable)

Ninguna clave/credencial real del usuario (Clave Tributaria del SII, llaves
de API de terceros como Fintoc) toca un servidor de RADAR ni de Supabase.
Todo pasa por un puente local (`tools/*-local-server.mjs`) que el propio
usuario corre en su máquina — ver `tools/README.md`. Cualquier diseño nuevo
que implique guardar una clave "cifrada en el servidor" (como hace Nubox con
su Integración SII) se descarta por defecto a menos que el usuario decida
explícitamente lo contrario.

## Fases pendientes (identificadas, no todas diseñadas en detalle)

**Revisión de diseño/correctitud (sesión del 2026-10-06)**
- [x] Fase A — Asiento de Remuneraciones con cuentas reales (no inventadas), desglosado en subcuentas, un asiento por centro de costo; Score del Portal Cliente calculado automático (A-D) desde Liquidez/Endeudamiento/Resultado en vez de depender de una pregunta manual — hecho, commit `ef2621e`.
- [x] Fase B — Nuevo componente `Sw` (toggle lima) reemplaza los 3 checkboxes binarios nativos del navegador; `accent-color` global para los checkboxes de selección en tablas; tarjetas de KPI del Portal Cliente con fuente adaptable + monospace + word-break (ya no se desbordan) — hecho, commit `59e1c7f`.
- [x] Fase C — Nav de Contabilidad: cada grupo (Resumen/Registro/Procesos/Libros/Reportes/Configuración) es ahora su propio menú desplegable (`CONTAB_TAB_GROUPS`, componente `ContabP`), se abre el grupo de la pestaña activa automáticamente. Asientos: filtro por mes/tipo de comprobante/origen, campo `tipo` (Ingreso/Egreso/Traspaso) elegido como segmented-control al crear un asiento manual, campo `origen` (manual/centralizacion/sii/csv/conciliacion/depreciacion/recurrente) tageado en los 6 puntos donde RADAR genera asientos automáticos — hecho, commit pendiente de push.
- Principio del usuario: usar Buk/Nubox como referencia *funcional*, no visual — RADAR debe verse distintivo y propio (lima/verde oscuro/`rd-tilt`/garabato/JetBrains Mono), nunca "improvisado" ni inconsistente entre pantallas.

**Remuneraciones**
- [x] Fase 1 — separar Trabajador (ficha) de Liquidación (histórico) — hecho, commit `ff6ad3c`.
- [x] Fase 3 — Historial por trabajador (vista `vw==="historial"` en `RemP`, botón "Historial" en la ficha) — hecho.
- [x] Fase "panel" — rediseño del panel principal (período vigente, UF/UTM como variable, accesos como tarjetas, liquidaciones agrupadas por período) y lista de Trabajadores con stats — hecho, commit `70eadc5`.
- [x] Fase "ficha completa" (1/5) — Historial fusionado en la Ficha de Trabajador con pestañas Resumen/Liquidaciones/Documentos("Próximamente")/Vacaciones("Próximamente") — hecho, commit `7f476fd`.
- [x] Fase "estilo Buk" — header tipo banner en la ficha (gradiente lima + avatar + badge Activo/Inactivo), pestañas con el subrayado garabato de la nav de Contabilidad, tarjetas de período clicables en el panel principal — hecho, commit `06fe6e6`.
- [x] Fase 2 — Proceso de cierre de mes: colección `procesos_rem` (estado Iniciado/En Revisión/Pagado por período), vista `vw==="proceso"` (como "Procesos de Septiembre" de Buk) con checklist de entregables — Liquidaciones generadas y Centralizado son reales, Liquidaciones PDF/Previred/Libro Electrónico quedan "Próximamente" hasta que existan esos generadores. De paso se corrigió un bug real: `genAsiento` sumaba TODAS las liquidaciones de todos los períodos en un solo asiento (y las duplicaba si centralizabas dos veces) — ahora centraliza un período a la vez — hecho, commit `d3c4299`.
- [ ] Fase "ficha completa" (2/5) — Buscador por nombre/RUT en las listas de Trabajadores y Liquidaciones (hoy no existe en Remuneraciones, aunque sí en otros módulos como Libro de Compras/Ventas).
- [ ] Fase "ficha completa" (3/5) — Vista de liquidación individual como "comprobante" de solo lectura (tipo liquidación de sueldo real, imprimible) separada del formulario de edición — hoy ambas cosas son la misma pantalla de inputs.
- [ ] Fase "ficha completa" (4/5) — Wizard guiado de 3 pasos para Nuevo Trabajador (Datos básicos → Previsionales → Contrato) y para Nueva Liquidación (elegir trabajador → ajustar variables del mes → vista previa de cálculo antes de guardar), en vez de un formulario largo de un tiro.
- [ ] Fase 1b — Portal del trabajador (login propio, visibilidad controlada por el contador). Nota: la vista de Proceso ya tiene el estado Pagado, que es el gatillo natural para activar la visibilidad cuando se construya el portal.
- [ ] Fase 4 — Documentos del cierre (Libro de Remuneraciones XLSX corporativo — en curso, dependencia `write-excel-file` ya instalada —, nómina bancaria, archivo de pago Previred, Libro Electrónico/LRE).

**Honorarios**
- [ ] Módulo completo: boletas, tasa de retención parametrizable (15.25% hoy, sube a 17% hacia 2028 por ley — debe ser un parámetro, no hardcode), Libro de Retención de Honorarios, Certificado de Honorarios anual, asiento automático vía cuenta "Honorarios por Pagar".

**Contabilidad / SII**
- [ ] Importación SII v2: wizard de 2 pasos, pantalla de progreso, revisión en 3 pestañas Ventas/Compras/Honorarios con asignación de cuenta por documento, modal de "Cuadratura de documentos" (Neto+IVA≠Total: Ajustar al Neto/Ajustar al Total/No ajustar), creación en lote, separación movimientos vs. Centralización, historial por período con "Actualizar".
- [ ] Conciliación Bancaria v2: lista de Cuentas Bancarias, Historial de Cartolas con progreso por archivo, matching lado a lado (coincidencia exacta/parcial), conciliación en lote, "Reglas de conciliación" (reusa `reglas_categorizacion`).
- [ ] Libro de Caja + Libro de Ingresos y Egresos (régimen Pro Pyme Transparente).
- [ ] Asistente de Centralización general (multi-tipo de movimiento, por rango de fechas, generaliza el botón único "Centralizar" actual).

**RRHH** (usuario confirmó: "sí, todas las funciones")
- [x] Control de Asistencia v1 — colección `asistencia` (ausencia injustificada, licencia médica, permiso con/sin goce), CRUD en pestaña "Asistencia" de la ficha del trabajador, y **el cálculo de la liquidación (`calcRem`) ya descuenta el sueldo base automáticamente** en proporción a los días sin goce + días de licencia médica del período (permisos con goce no descuentan nada). Se precarga solo al elegir trabajador/período en Nueva Liquidación, queda editable. Licencia médica: se excluye del sueldo que paga la empresa pero el monto del subsidio Isapre/Fonasa/Mutual NO se calcula (fuera de alcance, se gestiona aparte) — hecho, commit `9be7624`.
  - Pendiente dentro de esta misma fase si se necesita más adelante: registro de asistencia diaria real (marcaje entrada/salida) — integración con hardware/app de marcaje queda fuera de alcance de RADAR, esto es solo el registro de eventos tipo ausencia/licencia/permiso por rango de fechas.
- [ ] Vacaciones.
- [ ] Documentos y Firma.

**Bloqueadas — necesitan algo del usuario antes de poder avanzar**
- DJ 1887 / DJ 1879: falta que el usuario pase la Resolución 116 del SII (o instructivo equivalente) con el formato exacto de archivo. No fabricar el formato.
- Integración Fintoc: requiere que el usuario cree una cuenta paga en Fintoc primero. Diseño de arquitectura ya resuelto (puente local `tools/fintoc-local-server.mjs`, igual que el de SII).

**Ideas de menor prioridad (solo mencionadas, sin diseño)**
Importador universal de cartolas con IA, preguntas en lenguaje natural sobre los datos, insights/narrativa automática, portal de autoservicio para clientes, importación automática de ventas e-commerce, conciliación de pagos parciales/múltiples facturas, OCR de boletas, Balance General Consolidado, constructor de Tablas de Parámetros genérico.

## Restricciones ya decididas (de sesiones anteriores, no reabrir sin que el usuario lo pida)

- Nada de flujos de aprobación de asientos por celular.
- Tipografía monoespaciada para montos es intencional (JetBrains Mono, webfont — no depender de fuentes locales del sistema).
- Tema claro (crema/salvia), acento lima, texto principal verde oscuro (`--tx:#1B4D2E`), tarjetas con borde y `rd-tilt` para composición "grid roto".
- Parámetros Previsionales (UF/UTM/tasas AFP) son de solo lectura en la UI y se actualizan solos en segundo plano (una vez al día, mindicador.cl + puente local Previred). Nunca mostrar el error técnico de la fuente al usuario ni volver a agregar inputs editables ahí — son valores legales nacionales, un numero mal escrito a mano descuadraría todas las liquidaciones de todas las empresas.
