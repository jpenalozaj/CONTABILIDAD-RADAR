# Herramientas locales (no forman parte de RADAR)

Scripts que corres en tu propio computador — nunca en la nube, nunca dentro
de RADAR mismo — porque necesitan tu clave del SII o similar. Ninguno de
estos archivos se ejecuta en el navegador ni en Supabase.

## Importar Compras/Ventas del SII sin ir al sitio a mano

Usa la CLI open source [`@albertomarturelo/sii-cli`](https://github.com/albertomarturelo/sii)
(MIT, auditada antes de usarla: solo se conecta a dominios `sii.cl` /
`claveunica.gob.cl`, tu Clave se escribe directo en la pagina real del SII
dentro de un navegador — nunca pasa por estos scripts ni por RADAR) y
convierte el resultado al CSV que ya acepta RADAR en Contabilidad >
Compras/Ventas SII. Hay dos formas de usarla:

- **sii-local-server.mjs** — un puente local que deja hacerlo con un clic
  desde dentro de RADAR (boton "Importar automatico"), sin descargar ni
  subir ningun archivo a mano. Recomendado.
- **sii-rcv-export.mjs** — un script de linea de comandos que genera el CSV
  como archivo, para subirlo a mano en RADAR. Util si prefieres no dejar un
  servidor corriendo, o si algo falla con la opcion de arriba.

Ambas comparten la misma logica (`sii-rcv-core.mjs`) y el mismo login.

### Instalacion (una sola vez)

```
npm install -g @albertomarturelo/sii-cli
```

### Cada vez que lo uses

1. Inicia sesion (se abre un navegador, escribes tu Clave ahi — la sesion
   dura aprox. 100 minutos, hazlo justo antes de exportar):

   ```
   sii auth login
   ```

2. **Opcion recomendada — un clic desde RADAR:**

   ```
   node tools/sii-local-server.mjs
   ```

   Dejalo corriendo en esa terminal (escucha solo en `127.0.0.1:4001`,
   ningun otro computador puede usarlo). Con RADAR abierto en el navegador
   (`npm run dev`), ve a Contabilidad > Compras/Ventas SII, escribe el
   periodo (`AAAAMM`) y click en "Importar Compras" / "Importar Ventas" —
   los asientos se cargan directo, sin CSV de por medio.

   **Opcion alternativa — archivo CSV a mano:**

   ```
   node tools/sii-rcv-export.mjs 202605 compra
   node tools/sii-rcv-export.mjs 202605 venta
   ```

   Esto genera `compras_202605.csv` / `ventas_202605.csv` en la carpeta
   donde corriste el comando. Sube ese archivo en RADAR: Contabilidad >
   Compras/Ventas SII > Carga manual > Cargar CSV.

### Por que son scripts aparte y no todo dentro de RADAR

El login pasa por un navegador real (el SII exige reCAPTCHA en esa pantalla,
asi que nunca puede ser 100% automatico) y tu Clave nunca debe tocar un
servidor que no sea del SII — ni el de RADAR/Supabase, ni ningun tercero.
`sii-local-server.mjs` no cambia eso: solo hace de puente *despues* del
login, entre la CLI ya autenticada (en tu maquina) y RADAR (tambien en tu
maquina, via `localhost`). Nunca escucha en la red ni sale de tu
computador.

### Limitaciones conocidas

- No hay servicio "gratis" que se salte el login manual — esto tampoco:
  ahorra el paso de navegar hasta el reporte, exportarlo y subirlo, pero el
  login sigue siendo manual por el reCAPTCHA.
- `@albertomarturelo/sii-cli` es un proyecto joven (semanas de trayectoria
  al momento de escribir esto). El codigo se reviso a mano (ver ROADMAP.md)
  y no encontramos señales de mal manejo de credenciales, pero no tiene el
  historial de un proyecto establecido.
- El formato exacto de fecha que entrega la CLI no se pudo probar contra el
  SII real (se necesitaria una Clave real para eso). `normFecha()` en
  `sii-rcv-core.mjs` maneja los dos formatos mas probables (`AAAA-MM-DD` y
  `DD/MM/AAAA`); si tu CSV sale con fechas raras, avisa para ajustarlo.
- El boton "Importar automatico" en RADAR necesita que
  `sii-local-server.mjs` este corriendo en tu propia maquina al mismo
  tiempo que `npm run dev`; si no lo esta, RADAR te avisa y puedes usar la
  carga manual de CSV mientras tanto.
