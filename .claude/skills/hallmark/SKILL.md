---
name: hallmark
description: Construye/mejora paginas de marketing (landing pages) para RADAR siguiendo los principios de diseño "anti-slop" de Hallmark (nutlope/hallmark) — floor de 16 reglas no negociables, temas con tokens propios, estructura por "job" del visitante. Usar cuando se pida mejorar/crear la pagina publica de RADAR o se nombre "Hallmark" explicitamente. NO es para tocar la app interna (src/App.jsx mas alla de LandingP) — esa tiene su propia identidad ya decidida (ver CLAUDE.md).
---

# Hallmark (adaptado para RADAR)

Adaptado de [nutlope/hallmark](https://github.com/Nutlope/hallmark) (Together AI,
MIT). El original se instala con `npx skills add nutlope/hallmark` — ese
instalador quedó **bloqueado por el clasificador de seguridad del harness**
("Undermining Oversight": instala y ejecuta un paquete de terceros a ciegas
vía `npx`). En su lugar se trajeron a mano, vía `raw.githubusercontent.com`
(mismo método que `unslop`/ECC/`ui-ux-pro-max`), solo los archivos de
referencia realmente usados — no las 50 CSV/MD de temas ni los scripts
`theme.mjs`/`sloplint.mjs` (esos sí requieren ejecutar código de terceros
para su parte de "deal"/lint automatizado, que tampoco se corrió; las
reglas de su "Floor" se aplicaron a mano, leyendo el `SKILL.md` original
completo antes de escribir una sola línea).

## Qué se construyó (2026-11-20)

`LandingP` en `src/App.jsx` — la página pública que se ve ANTES de entrar a
la app (pedido explícito del usuario: "mejora la web de radar con hallmark
de github... debe ser la pagina principal antes de entrar a la app"), con
un botón "Comenzar gratis" que lleva a `AuthScreen`. Decisiones:

- **Tema: Dusk** (`references/themes/dusk.md`) — de los 50 temas del catálogo
  original, es el único cuyas keywords calzan de verdad con el dominio de
  RADAR (`treasury, banking, reconciliation, ledger, accounting, close,
  month end, bookkeeping, payroll`), y su propio ejemplo oficial en el
  README de Hallmark es literalmente "Closewise, bank reconciliation".
  Paleta oscura (fondo casi negro, acento periwinkle + apricot), tipografía
  Wix Madefor — **intencionalmente distinta** de la paleta lima/navy/IBM
  Plex Sans de la app interna: un sitio de marketing no tiene por qué
  verse igual que el dashboard (mismo patrón que Linear/Stripe/etc.), y
  ningún tema del catálogo tiene keywords de "contabilidad chilena" exactas
  — se preservan los colores/tipografía reales de RADAR dentro de la app,
  intactos.
- **Job: "sign up"** (`references/anatomy.md`) — acción "Comenzar gratis" en
  nav + hero, secciones = el producto en acción (named moments, nunca
  tiles de iconos), nunca tabla de precios inventada, cierra con la acción
  de nuevo.
- **Fotografía real**, CC BY 3.0 de Thomas Bresson vía Wikimedia Commons
  (`Vallee-brouillard.jpg`, "sea of fog filling a valley below dark hills
  at sunset" — calza con el dial por defecto de Dusk, "fog"), enlazada
  directo a `upload.wikimedia.org` (no copiada al repo, mismo patrón que
  usa la skill original con su librería de fotos) y acreditada en el pie
  de página con link a la página de Commons.
- **Honestidad (Floor #8, nunca inventar un hecho)**: no hay tabla de
  precios (no se conoce un precio real todavía — se omitió la sección en
  vez de inventar una cifra); el panel de cuentas y el "cierre de mes"
  están rotulados explícitamente "Datos de ejemplo"/"Ejemplo de un cierre
  de mes", nunca presentados como métricas reales de un cliente; ningún
  nombre de cliente real de Jonas aparece en la página.
- Verificado con `esbuild --bundle=false` + una corrida real de `vite`
  (placeholder de Supabase solo para preview, nunca commiteado) +
  capturas con Playwright en desktop y mobile + click real del CTA
  confirmando que lleva a `AuthScreen`. **Una limitación de este sandbox,
  no de la página real**: el proxy de salida de esta sesión bloquea
  `upload.wikimedia.org` (policy denial, ver `/root/.ccr/README.md`), así
  que la foto del hero no se pudo ver en las capturas de esta sesión —
  Wikimedia Commons sí permite hotlinking normal a visitantes reales fuera
  de este sandbox; falta que el usuario confirme que carga bien en
  producción.

## Si se pide otra página o un rediseño

1. Leer `references/anatomy.md` para el "job" del visitante (qué viene a
   hacer la página) antes de decidir secciones.
2. Leer `references/layout.md` para la grilla/tamaños/posturas de hero y
   `references/genres/modern-minimal.md` para el registro visual de SaaS/B2B.
3. Elegir un tema del catálogo original por sus keywords reales (no por
   gusto) — si se necesita otro, traerlo a mano de
   `raw.githubusercontent.com/Nutlope/hallmark/main/skills/hallmark/references/themes/<slug>.md`
   y su entrada en `index.json`, mismo método que con `dusk.md`.
4. Aplicar el Floor de 16 reglas (está completo en el `SKILL.md` original,
   resumen: todo color/fuente por token, nunca `transition:all`, nunca
   `vh` en el hero, overflow-x clip, `:focus-visible` en todo interactivo,
   `prefers-reduced-motion`, nunca inventar una cifra/testimonio/logo,
   nunca un eyebrow ni una etiqueta en mayúsculas trackeadas, nunca texto
   unido con punto medio "·", hero visible en 1280×800, ~80 palabras por
   pantalla, contenedor centrado y capado) — leer `references/gates.md`
   para el detalle de cada regla si hay duda.
5. **Nunca inventar un precio, un testimonio, un cliente o una métrica.**
   Si falta el dato real, omitir la sección o dejarla como un slot de
   ejemplo rotulado explícitamente como tal — igual que se hizo aquí.
6. Nunca tocar la paleta/tipografía de la app interna (`ST`, el resto de
   `src/App.jsx`) desde este trabajo — son sistemas de diseño separados a
   propósito.
