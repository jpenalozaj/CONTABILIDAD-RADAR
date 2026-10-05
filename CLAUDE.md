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

**Remuneraciones**
- [x] Fase 1 — separar Trabajador (ficha) de Liquidación (histórico) — hecho, commit `ff6ad3c`.
- [x] Fase 3 — Historial por trabajador (vista `vw==="historial"` en `RemP`, botón "Historial" en la ficha) — hecho.
- [ ] Fase 1b — Portal del trabajador (login propio, visibilidad controlada por el contador).
- [ ] Fase 2 — Proceso de cierre de mes (estados Iniciado/En Revisión/Pagado, panel de 6 entregables: Anticipos/Sueldos/Liquidaciones PDF/Libros/Contabilidad/Previred/Libro Electrónico, "Generar todos").
- [ ] Fase 4 — Documentos del cierre (Libro de Remuneraciones CSV, nómina bancaria CSV, archivo de pago Previred, Libro Electrónico/LRE).

**Honorarios**
- [ ] Módulo completo: boletas, tasa de retención parametrizable (15.25% hoy, sube a 17% hacia 2028 por ley — debe ser un parámetro, no hardcode), Libro de Retención de Honorarios, Certificado de Honorarios anual, asiento automático vía cuenta "Honorarios por Pagar".

**Contabilidad / SII**
- [ ] Importación SII v2: wizard de 2 pasos, pantalla de progreso, revisión en 3 pestañas Ventas/Compras/Honorarios con asignación de cuenta por documento, modal de "Cuadratura de documentos" (Neto+IVA≠Total: Ajustar al Neto/Ajustar al Total/No ajustar), creación en lote, separación movimientos vs. Centralización, historial por período con "Actualizar".
- [ ] Conciliación Bancaria v2: lista de Cuentas Bancarias, Historial de Cartolas con progreso por archivo, matching lado a lado (coincidencia exacta/parcial), conciliación en lote, "Reglas de conciliación" (reusa `reglas_categorizacion`).
- [ ] Libro de Caja + Libro de Ingresos y Egresos (régimen Pro Pyme Transparente).
- [ ] Asistente de Centralización general (multi-tipo de movimiento, por rango de fechas, generaliza el botón único "Centralizar" actual).

**RRHH** (usuario confirmó: "sí, todas las funciones")
- [ ] Control de Asistencia (registro/cálculo; integración con hardware/app de marcaje queda fuera de alcance de RADAR).
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
