---
name: ui-ux-pro-max
description: Audita src/App.jsx contra el checklist de UX/accesibilidad de 10 categorias de ui-ux-pro-max (120 reglas, references/quick-reference.md) — foco (1) Accesibilidad, (2) Touch & Interaction. Tambien incluye el generador de sistema de diseño (scripts/search.py --design-system), instalado y aplicado a pedido explicito del usuario el 2026-11-14 (ver seccion propia mas abajo para la paleta/tipografia vigente y la regla de confirmacion antes de volver a cambiarla). Usar cuando se pida revisar/mejorar UI/UX, accesibilidad, o aplicar esta skill por nombre.
---

# UI/UX Pro Max (adaptado para RADAR)

Adaptado de [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
El original es sobre todo una herramienta de **generacion** de sistema de
diseño (`search.py --design-system`) pensada para elegir la direccion
visual de un producto nuevo. RADAR no es un producto nuevo — su identidad
visual ya esta decidida y protegida explicitamente en CLAUDE.md ("tema
claro, acento lima, texto `--tx:#1B4D2E`, `rd-tilt`, JetBrains Mono...
nunca improvisado ni inconsistente, Restricciones ya decididas, no reabrir
sin que el usuario lo pida"). Primera pasada (auditoria de accesibilidad)
instalo solo el checklist estatico; el usuario pidio explicitamente
despues "aplica el generador de paletas" / "Maximo potencial", asi que
`scripts/` y el subset de `data/*.csv` que necesita `--design-system`
(`styles.csv`, `colors.csv`, `landing.csv`, `products.csv`,
`typography.csv`, `ui-reasoning.csv`, `motion.csv` — no los otros dominios
de la skill original como `ux`/`icons`/`chart`/`google-fonts`, que RADAR no
usa) quedaron instalados tambien. Correr con:
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p "RADAR" [--variance N --motion N --density N] [--persist --output-dir .]
```

**Resultado real obtenido (2026-11-14)**, con variance 3/motion 3/density 8
y query orientada a "B2B financial professional accounting trust": estilo
"Minimalism & Swiss Style", paleta navy/azul/gris (`#0F172A`/`#0369A1`/
`#F8FAFC`), tipografia IBM Plex Sans — persistido en
`design-system/radar/MASTER.md` como documento de referencia. El dataset
del generador no tiene una categoria real para "software contable
chileno" — el resultado es la aproximacion mas cercana disponible (B2B
Service / Productivity Tool), no un match exacto.

**Aplicado a `src/App.jsx` el mismo dia, pero no tal cual salio del
generador** — el usuario no aprobo el output en bloque. El flujo real fue:
generar mockups HTML comparativos (Playwright, nunca tocar codigo antes de
mostrar), el usuario fue decidiendo pieza por pieza ("combinalas ambas" →
diseño propio mezclando el header/nav navy de la generada con la identidad
RADAR -- crema/lima/JetBrains Mono se mantenian; "no me gusta el crema de
fondo" → 3 alternativas de fondo; "la tipografia me gusta mas la propuesta
por la skill" → IBM Plex Sans; "el segundo" → fondo gris azulado
`#F8FAFC`), y solo despues de esas 4 decisiones se pregunto explicitamente
"¿aplico esto ahora al codigo real?" antes de tocar `src/App.jsx`. Paleta
vigente ahora: `--bg:#F8FAFC`/`--sf:#FFFFFF`/`--tx3:#64748B`, sidebar
`--navy:#0F172A` con texto `--on-navy`, tipografia `IBM Plex Sans`. Lima
(`--cy`/`--cy-fill`), verde oscuro (`--tx`), `JetBrains Mono` en montos y
`Fraunces` en el wordmark **no cambiaron** -- nunca estuvieron en discusion.
Detalle completo de cada edicion en la entrada "Re-tema" de CLAUDE.md
(seccion Mantenimiento).

**Regla para el futuro**: el generador queda instalado y disponible para
correrlo y guardar su resultado como referencia (`--persist`, no destructivo,
solo crea archivos nuevos en `design-system/`). **Nunca** reemplazar
colores/tipografia reales en `src/App.jsx` a partir de su output sin que el
usuario confirme explicitamente sobre el resultado CONCRETO que se va a
aplicar (no alcanza con un pedido generico de "aplica el generador" — eso
solo autoriza correrlo y mostrar/persistir el resultado). La vez que si se
aplico, la confirmacion llego recien despues de mostrar mockups y de que el
usuario tomara cada decision de diseño una por una -- ese es el nivel de
confirmacion que hace falta, no un "si" a la primera propuesta cruda del
generador. Pendiente: `.rd-mesh-bg`/`.rd-glass-card` (efecto vidrio de
Portal Cliente, aprobado en una sesion anterior con datos reales) no se
tocaron en este cambio y puede que ya no luzcan iguales sobre el nuevo
fondo gris azulado -- falta que el usuario lo revise ahi.

## Cuando usar

Pedido explicito de revisar/mejorar UI/UX o accesibilidad de RADAR, de
correr el generador de paletas, o de aplicar esta skill por nombre.

## Prioridad (igual que el original — ver detalle completo en
`references/quick-reference.md`)

| Prioridad | Categoria | Impacto |
|---|---|---|
| 1 | Accesibilidad | CRITICO |
| 2 | Touch & Interaction | CRITICO |
| 3 | Performance | ALTO |
| 4 | Style Selection | ALTO |
| 5 | Layout & Responsive | ALTO |
| 6 | Typography & Color | MEDIO |
| 7 | Animation | MEDIO |
| 8 | Forms & Feedback | MEDIO |
| 9 | Navigation Patterns | ALTO |
| 10 | Charts & Data | BAJO |

## Metodologia (igual disciplina que `unslop`/ECC)

1. Leer `references/quick-reference.md` para la categoria en cuestion.
2. Para cada regla candidata, **verificar a mano contra el codigo real**
   (grep + leer el rango exacto, no asumir) antes de tocar nada — mismo
   criterio que `unslop`: un hallazgo de un checklist generico no es un
   hallazgo confirmado hasta que se lee el código.
3. Aplicar solo arreglos acotados y de bajo riesgo (ej. `aria-label` en un
   boton, `focus-visible`, asociar `label`/`input`). Nunca usar esta skill
   como excusa para rediseñar tamaños, espaciados o la paleta — eso viola
   las restricciones ya decididas del proyecto.
4. Cuando un hallazgo real requiere un cambio de diseño con impacto visible
   (ej. contraste de color, tamaño de touch targets) **documentar el
   hallazgo y preguntar al usuario** en vez de decidir unilateralmente —
   mismo criterio que se uso con los hallazgos de ECC (llave de Anthropic,
   `key={i}`).

## Hallazgos ya aplicados (sesion 2026-11-14)

Categoria 1 (Accesibilidad), contra el `src/App.jsx` real:

- **`focus-states`** — no existia ningun `:focus-visible` en toda la hoja
  de estilos global (`ST`); casi todos los elementos interactivos son
  `<button>` (no `<a>`), asi que no habia ninguna señal visible de foco al
  navegar con teclado. Agregado `button:focus-visible{outline:2px solid
  var(--cy);outline-offset:2px}` junto a la regla `button{...}` existente.
- **`aria-labels`** — 10 botones "solo icono" (`>x</button>`, cancelar o
  eliminar una fila) sin nombre accesible, repartidos en Plan de Cuentas,
  Asientos, Asistencia, Trabajadores, Remuneraciones (2 listas distintas
  con el mismo markup — proceso de cierre y lista general, verificadas por
  separado), Documentos y Tareas. Se agrego `aria-label` especifico a cada
  uno (ej. "Eliminar asiento", "Eliminar ficha", "Eliminar liquidacion").
- **`form-labels`** — los componentes compartidos `Fi` (input) y `Se`
  (select), usados en cientos de formularios de toda la app, tenian un
  `<label>` sin `for`/`htmlFor` apuntando al `id` de su input/select — no
  habia ninguna asociacion programatica entre etiqueta y campo. Corregido
  con `useId()` de React (ya importado desde `"react"`) generando un `id`
  estable por instancia, usado en `htmlFor` y en el `id` del
  `input`/`select`. No se toco `TdInp` (solo input, sin label propio — no
  aplica).

## Hallazgos sin corregir, pendientes de decision del usuario

- **`color-contrast`** — calculado el ratio WCAG real (formula de
  luminancia relativa) para los pares de color que mas se usan en texto:
  `--tx3:#817C5F` (texto secundario/labels, la mayoria de las etiquetas de
  `Fi`/KPIs) sobre `--bg:#EDEAD9` da **3.49:1** y sobre `--sf:#F7F5EA` da
  **3.85:1** — ambos por debajo del minimo AA de 4.5:1 para texto normal
  (solo pasa el umbral de "texto grande", 3:1). `--gn:#0D8A5F` (montos en
  verde) tambien queda bajo, 3.61-3.99:1. No se tocó ningun color — la
  paleta de RADAR es una decision ya cerrada del usuario ("Restricciones
  ya decididas... no reabrir sin que el usuario lo pida"); requiere que el
  usuario decida si ajustar `--tx3`/`--gn` un poco mas oscuros (manteniendo
  la misma identidad lima/crema) o aceptar el contraste actual.
- **`touch-target-size`** — los 10 botones "x" de eliminar/cancelar tienen
  un area clickeable chica (padding 3-4px + fuente 10-14px, bastante menos
  que el minimo recomendado 44×44pt/48×48dp de Apple HIG/Material). No se
  agrando porque tocaria el espaciado de filas en listas densas (Plan de
  Cuentas, Asientos, Trabajadores) en toda la app — un cambio de layout
  visible, no un arreglo acotado de accesibilidad. Pendiente de que el
  usuario decida si vale la pena el cambio visual.

No se instalaron `scripts/search.py` ni los CSV de datos (`data/*.csv`) de
la skill original — nunca se van a invocar para RADAR.
