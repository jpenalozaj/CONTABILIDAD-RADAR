---
name: unslop
description: Remove AI-generated "slop" from RADAR's codebase by deleting redundant comments and unused code (imports, destructured props, local variables, orphaned state), and normalizing duplicated inline-style patterns. Use when asked to clean up code, remove unnecessary comments, or reduce unused imports/variables/props in src/App.jsx or the lib/ files.
---

# Unslop (adaptado para RADAR)

Adaptado de [onmax/claude-config](https://github.com/onmax/claude-config/tree/HEAD/skills/unslop)
para el stack real de este proyecto: React + Vite, todo en `src/App.jsx`,
estilos inline vía `style={{...}}` (no Tailwind, no Vue/Nuxt UI), un unico
bloque de CSS-en-JS (la constante `ST`) para clases globales (`.rd-glass`,
`.rd-tilt`, etc).

## Overview
Eliminar artefactos de bajo valor en código generado por IA, preservando
comportamiento e intención. RADAR ya tiene como regla propia (ver
CLAUDE.md del repo y las instrucciones del proyecto) "comentarios solo si
explican el POR QUÉ, nunca el QUÉ" — este skill verifica que esa regla se
cumpla y limpia lo que se haya colado.

## Workflow

1. **Triage**
   - Identificar si el archivo es `src/App.jsx` (un solo archivo enorme,
     cientos de componentes función como `function Xyz({...}){...}`) o uno
     de los módulos en `src/lib/`.
   - Antes de tocar nada: correr `npx esbuild src/App.jsx --bundle=false
     --format=esm --outfile=/tmp/check.js` para confirmar que el archivo
     parsea limpio ANTES de empezar (línea base).

2. **Detectar código muerto de forma confiable — no confiar en ESLint a ciegas aquí**
   - Este proyecto no tiene ESLint configurado. Un `no-unused-vars` con un
     config minimo (sin `eslint-plugin-react`) da **falsos positivos
     masivos**: cualquier componente/función solo referenciado vía JSX
     (`<Foo/>`) aparece como "nunca usado" aunque sí lo esté, porque el
     `no-unused-vars` base de ESLint no entiende que un `JSXElement` es una
     referencia al identificador. Ya se confirmó esto en la práctica:
     ~80 de ~95 avisos en una corrida real eran puros falsos positivos
     (componentes PascalCase usados solo en JSX).
   - Por eso, **cada hallazgo de ESLint debe verificarse a mano** antes de
     tocar código: `grep -n "^function NombreDelCandidato\|^function
     SiguienteFuncion"` para encontrar el rango exacto de líneas de esa
     función, y luego `awk 'NR==inicio,NR==fin' src/App.jsx | grep -oE
     "[^a-zA-Z]nombreVar\b"` dentro de ESE rango exacto — nunca en todo el
     archivo completo, porque nombres cortos (`isDeb`, `nombreCta`, `e`,
     `si`) se repiten shadowed en múltiples funciones distintas.
   - Ojo con los falsos positivos de signo contrario: una palabra como
     "tareas" aparece también dentro de texto de interfaz en español
     ("Sin tareas", "tareas pendientes") — un grep de substring puede
     confundir eso con una referencia real a la variable. Si hay duda,
     leer la función completa con la herramienta de lectura en vez de
     confiar solo en grep.
   - Candidatos reales confirmados en la práctica (patrón reutilizable):
     imports nunca usados, un `const` a nivel de módulo nunca referenciado
     en ningún otro lado, una variable local calculada pero nunca leída
     dentro de su callback/función, un parámetro de índice en `.map((x,i)=>`
     cuando el cuerpo solo usa `x`, y — el más común en este archivo —
     **props destructuradas que duplican una versión ya filtrada**: muchos
     componentes reciben tanto la colección cruda (`entries`, `rems`,
     `tareas`, `docs`, `accts`) como su version ya filtrada por empresa
     (`empEntries`, `empRems`, `empTareas`, `empDocs`, `leafAccts`) — la
     cruda casi nunca se usa dentro del componente, queda ahí por copiar
     el patrón de wiring del componente padre (`Dashboard`).

3. **Quitar comentarios redundantes**
   - Eliminar comentarios que solo repiten lo obvio (nombre de función,
     de prop, de componente).
   - Mantener los que explican el POR QUÉ: una restricción legal/SII, un
     workaround, un orden que importa, una decisión explícita del usuario
     documentada ("instrucción explícita del usuario: ...").
   - En este archivo, en la práctica, casi no hay comentarios QUÉ para
     sacar — la disciplina ya viene de antes. Si una pasada no encuentra
     ninguno, está bien reportarlo así; no inventar limpieza donde no la
     hay.

4. **Borrar código muerto**
   - Imports, variables, props destructuradas, estado (`useState`) que se
     declara pero nunca se lee ni se actualiza en ningún otro lado.
   - Bloques de código comentado, ramas inalcanzables o placeholders.
   - Al borrar una prop destructurada, **no** tocar el sitio donde se
     llama al componente (`<Componente prop={x}/>` en `Dashboard`) —
     pasar una prop de más que el hijo ignora es inofensivo en React y
     tocar esas líneas larguísimas de JSX agrega riesgo sin beneficio.

5. **Normalizar estilos repetidos (inline, no Tailwind)**
   - Si un mismo bloque de `style={{...}}` se repite idéntico 3+ veces en
     componentes hermanos, considerar extraerlo a una constante o a una
     clase en `ST` — pero solo si el usuario lo pide explícitamente o el
     ahorro es grande; RADAR no usa utility classes, así que no hay
     "Tailwind" que normalizar, y la convención ya establecida del proyecto
     es repetir estilos inline por componente (ver CLAUDE.md: "nunca
     improvisado ni inconsistente", no "nunca repetido").
   - Nunca renombrar ni reordenar props de estilo "por prolijidad" — eso
     es el tipo de refactor no solicitado que el proyecto pide evitar.

6. **Validar**
   - Correr `npx esbuild src/App.jsx --bundle=false --format=esm
     --outfile=/tmp/check.js` de nuevo — debe compilar limpio.
   - Re-correr el ESLint ad hoc (ver abajo) y confirmar que el número de
     avisos bajó exactamente en la cantidad de hallazgos reales
     confirmados, sin avisos nuevos inesperados.
   - **No correr `npm run build` (Vite/Rollup) como verificación** — este
     proyecto tiene un problema de tree-shaking preexistente no relacionado
     (documentado en CLAUDE.md) donde `vite build` descarta casi toda la
     app; usar siempre la transformación aislada de esbuild de arriba.

## Config ad hoc de ESLint para detectar candidatos (no instalar como dependencia)

```bash
cat > /tmp/eslint.config.mjs << 'EOF'
export default [{
  files: ["**/*.jsx"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } }
  },
  rules: { "no-unused-vars": "warn", "no-undef": "off" }
}];
EOF
npx --yes eslint@9 --no-config-lookup --config /tmp/eslint.config.mjs src/App.jsx
```

Esto da una lista de **candidatos**, no de hallazgos confirmados. El paso 2
de arriba (verificación manual por rango de función) es obligatorio antes
de borrar nada.

## Checklist de decisión

- **¿El comentario explica el por qué?** Mantener.
- **¿Solo repite lo que ya dice el código?** Sacar.
- **¿Esta prop/variable se referencia en algún lado dentro de su propio
  alcance (función/componente), verificado con el rango exacto de líneas?**
  Si no, borrar.
- **¿Borrarlo cambiaría el comportamiento o el output visual?** Si hay
  duda, no tocar y reportarlo en vez de adivinar.
- **¿Es un `catch(e)` donde `e` no se usa?** Dejarlo — es un patrón
  idiomático de manejo de errores en este archivo, no "slop" real; cambiar
  a `catch{}` no aporta nada y agrega diff sin beneficio.

## Resultado esperado

- Un diff enfocado solo en eliminación — nunca renombrar, nunca refactor
  no pedido.
- Si no se encuentra nada que limpiar en una pasada, decirlo explícitamente
  en vez de forzar cambios cosméticos.
