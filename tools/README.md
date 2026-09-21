# Herramientas locales (no forman parte de RADAR)

Scripts que corres en tu propio computador — nunca en la nube, nunca dentro
de RADAR mismo — porque necesitan tu clave del SII o similar. Ninguno de
estos archivos se ejecuta en el navegador ni en Supabase.

## sii-rcv-export.mjs — bajar Compras/Ventas del SII sin ir al sitio a mano

Usa la CLI open source [`@albertomarturelo/sii-cli`](https://github.com/albertomarturelo/sii)
(MIT, auditada antes de usarla: solo se conecta a dominios `sii.cl` /
`claveunica.gob.cl`, tu Clave se escribe directo en la pagina real del SII
dentro de un navegador — nunca pasa por este script ni por RADAR) y convierte
el resultado al CSV que ya acepta RADAR en Contabilidad > Compras/Ventas SII.

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

2. Exporta un periodo (formato `AAAAMM`):

   ```
   node tools/sii-rcv-export.mjs 202605 compra
   node tools/sii-rcv-export.mjs 202605 venta
   ```

   Esto genera `compras_202605.csv` / `ventas_202605.csv` en la carpeta
   donde corriste el comando.

3. Sube ese archivo en RADAR: Contabilidad > Compras/Ventas SII > Cargar CSV.

### Por que es un script aparte y no un boton dentro de RADAR

El login pasa por un navegador real (el SII exige reCAPTCHA en esa pantalla,
asi que nunca puede ser 100% automatico) y tu Clave nunca debe tocar un
servidor que no sea del SII — ni el de RADAR/Supabase, ni ningun tercero.
Manteniendolo como un script local, la Clave nunca sale de tu computador.

### Limitaciones conocidas

- No hay servicio "gratis" que se salte el login manual — este tampoco:
  ahorra el paso de navegar hasta el reporte y exportarlo, pero el login
  sigue siendo manual por el reCAPTCHA.
- `@albertomarturelo/sii-cli` es un proyecto joven (semanas de trayectoria
  al momento de escribir esto). El codigo se reviso a mano (ver ROADMAP.md)
  y no encontramos señales de mal manejo de credenciales, pero no tiene el
  historial de un proyecto establecido.
- El formato exacto de fecha que entrega la CLI no se pudo probar contra el
  SII real (se necesitaria una Clave real para eso). `normFecha()` en el
  script maneja los dos formatos mas probables (`AAAA-MM-DD` y
  `DD/MM/AAAA`); si tu CSV sale con fechas raras, avisa para ajustarlo.
