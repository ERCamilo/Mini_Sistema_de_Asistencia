# Tutoriales grabados desde un guion (Mini)

Adaptación de la guía de tutoriales de Trazo a Mini.

## Propuesta
Un guion de código por tutorial (`tests/tutorials/<id>.mjs`) con dos modos:
- **Prueba** (`npm run test:e2e`, CI): corre los pasos rápido sobre la app real, verifica cada resultado
  y exige que sus subtítulos sean exactamente los del video guardado (`tutorials/<id>.json`).
- **Grabación** (`npm run tutorials`): mismos pasos a ritmo humano, con dedo y anillo naranja sobre el
  objetivo; guarda `tutorials/<id>.webm` + `.json` + `.vtt` (subtítulos con tiempos).

## Diferencias con Trazo (decididas)
- Sólo celular (390×844): Mini no tiene versión PC.
- Grabación con `recordVideo` de Playwright (sin CDN ni WebCodecs); tiempos anotados en cada `say()`.
- Sin voz por ahora (el motor deja el gancho `voiceMs`); se agrega cuando haya `GEMINI_API_KEY`.
- Playwright no es devDependency (regla: sólo `typescript`): se usa la instalación global / CI.

## Spec
- `src/tutorials.ts` (`window.Tutorials`): catálogo `{id,title,summary,doneText,tour}`, urls,
  `captionIndexAt`, `stepSegments`, `spokenText`, `toVtt`, `compareScripts`, claves de caché offline.
- `src/tutorial-player.ts` (`window.TutorialPlayer`): video + subtítulo debajo + barra de pasos
  (tocar un tramo salta a ese paso); sin conexión muestra los pasos en texto (JSON precacheado).
  «Guardar para ver sin señal» guarda los videos en Cache Storage (`mini-tutorials-v1`, cuota aparte
  de los ~5 MB de datos); el SW no borra esa caché al actualizar.
- Ajustes › «Tutoriales»: lista, reproductor y «Hazlo conmigo» (tour del catálogo).
- El popup de memoria llena usa el mismo reproductor (tutorial `liberar-espacio`).
- Tutoriales: `liberar-espacio`, `marcar-asistencia`, `agregar-empleado`.
- CI: `.github/workflows/ci.yml` corre `npm test` y los tutoriales en modo prueba.

## Tareas
1. Tests + `src/tutorials.ts`. 2. Motor `tests/tutorials/*`. 3. Reproductor + menú + offline.
4. Guiones y grabación. 5. CI. 6. Quitar `scripts/record-help-video.mjs` y `help/`.
