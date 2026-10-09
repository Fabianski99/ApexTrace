# ApexTrace v0.1 — archivos para integrar en tu React

No es un proyecto React nuevo: solo son los archivos `src` para copiar dentro de tu proyecto existente.

## Dependencias

Desde la carpeta de tu proyecto actual:

```bash
npm install recharts lucide-react
npm run dev
```

## Colocación

Copia los archivos de `src/` sobre el directorio `src/` de tu proyecto, manteniendo las carpetas `components/` y `utils/`.

- `src/App.jsx`: navegación, dashboard, importación, filtros e historial.
- `src/App.css`: estilos responsive.
- `src/components/UploadZone.jsx`: zona de arrastrar y soltar archivos.
- `src/components/Comparison.jsx`: comparación y análisis.
- `src/components/TelemetryChart.jsx`: gráficas Recharts sincronizadas.
- `src/utils/motec.js`: lector de MoTeC LD y marcas de vuelta LDX.
- `src/utils/analysis.js`: comparación por distancia, deltas, zonas aproximadas de curvas.
- `src/utils/storage.js`: persistencia local en IndexedDB.

Mantén tu `src/main.jsx` existente siempre que importe `App` como componente principal. Si viene con el `index.css` de Vite, elimínale los estilos de demostración que puedan interferir, o deja el archivo vacío. `App.css` ya contiene los estilos base.

## Cómo usar

1. En ACC activa `Telemetry Laps` en la sección Electronics del setup del coche.
2. Corre vueltas; busca los archivos en `Documentos/Assetto Corsa Competizione/MoTeC`.
3. Importa `.ld` y `.ldx` juntos y con el mismo nombre base. Se admiten varios pares a la vez. Selecciona ambos ficheros **en la misma operación** (no primero uno y luego el otro).
4. Ve a Comparar vueltas y escoge una vuelta A y otra B del mismo coche y circuito.
5. Consulta las señales, el delta acumulado y las zonas de mínima velocidad estimadas.
6. Filtra el historial por coche/circuito para ver la evolución de tiempos.

## Tu proyecto React existente

No reemplaces `package.json`, `src/main.jsx`, `index.html` ni otras partes del proyecto. Solo mezcla esta carpeta `src` con la tuya. Si utilizas Vite, normalmente `src/main.jsx` ya importa `App.jsx`.

Si el estilo de ejemplo de Vite permanece en `src/index.css`, quita su contenido para evitar conflictos con el diseño de ApexTrace.

## Límites y decisiones deliberadas

- La telemetría se lee en el navegador. No se sube a un servidor.
- Los registros se guardan en IndexedDB de ese navegador. Conserva los `.ld/.ldx` originales: eliminar datos del sitio, usar modo incógnito o cambiar de dispositivo puede borrar el historial.
- Si importaste una sesión sin `.ldx`, después puedes volver a importar **el par completo** para reemplazar el registro provisional.
- La detección de vueltas se basa en **pares consecutivos de marcas en el archivo `.ldx`**. Sin ellas, se muestra la sesión entera **sin considerarla una vuelta cronometrada**.
- Una marca de vuelta delimita el tiempo, pero **no certifica** que la vuelta sea válida en el juego por límites de pista.
- El eje X del comparador es porcentaje de distancia estimada por integración de velocidad; no es una reconstrucción GPS ni un trazado oficial. Las zonas C1, C2... son mínimas de velocidad estimadas, no nombres exactos de las curvas.
- Los tramos 1 a 3 son tercios de distancia y **no** los sectores oficiales.
- Las fuentes originales tienen distintas frecuencias de muestreo. Se interpolan a una cuadrícula común a efectos de comparación; no son lecturas nativas exactas para cada píxel.
- La versión inicial solo soporta canales frecuentes de MoTeC ACC. Los archivos reales pueden traer variantes de nombre/unidad; en ese caso se adapta el mapeo en `utils/motec.js`.
- Para comparaciones válidas, usa mismo circuito y coche, preferiblemente mismas condiciones de sesión.
- Para probar el comportamiento exacto del importador con tu versión de ACC hace falta importar un par real `.ld`/`.ldx` generado por tu juego.

## Comprobaciones realizadas

Se verificó la sintaxis de los cuatro componentes JSX y tres módulos JavaScript. Se ejecutó una prueba con un archivo MoTeC binario sintético con canales de velocidad, acelerador, freno y marcha y tres marcas en LDX: se detectaron dos vueltas de 1:00.000 y se generaron los 401 puntos de cada vuelta. Todavía no se ha probado con archivos reales exportados desde tu instalación de ACC.
