---
name: ui-ux-pro-max
description: Audita src/App.jsx contra el checklist de UX/accesibilidad de 10 categorias de ui-ux-pro-max (120 reglas, references/quick-reference.md) — foco (1) Accesibilidad, (2) Touch & Interaction. Usar cuando se pida revisar/mejorar UI/UX, accesibilidad, o aplicar esta skill por nombre. NUNCA generar una paleta/estilo nuevo con esta skill para RADAR — su identidad visual ya esta decidida (ver CLAUDE.md, "Restricciones ya decididas").
---

# UI/UX Pro Max (adaptado para RADAR)

Adaptado de [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
para el uso real que tiene sentido en RADAR: el original es sobre todo una
herramienta de **generacion** de sistema de diseño (`search.py
--design-system`, con datos locales de 80 estilos/192 paletas/74 pares de
tipografia) pensada para elegir la direccion visual de un producto nuevo.
RADAR no es un producto nuevo — su identidad visual ya esta decidida y
protegida explicitamente en CLAUDE.md ("tema claro, acento lima, texto
`--tx:#1B4D2E`, `rd-tilt`, JetBrains Mono... nunca improvisado ni
inconsistente, Restricciones ya decididas, no reabrir sin que el usuario lo
pida"). Por eso esta adaptacion **no instala el script `search.py` ni los
CSV de datos** — solo el checklist estatico de 120 reglas
(`references/quick-reference.md`), usado como lente de auditoria contra la
UI ya construida, nunca como generador de una paleta/estilo nuevo.

## Cuando usar

Pedido explicito de revisar/mejorar UI/UX o accesibilidad de RADAR, o de
aplicar esta skill por nombre. No usar para elegir una paleta/estilo nuevo
— eso ya esta decidido y lo protege CLAUDE.md.

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
