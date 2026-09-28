# Tutoriales de Mini: cómo se hacen

Los tutoriales son videos cortos con subtítulos que **se graban solos a partir de un guion de código**.
El mismo guion sirve para dos cosas:

| Modo | Qué hace | Cuándo se usa |
|---|---|---|
| **Prueba** | Ejecuta los pasos rápido sobre la app real y comprueba que cada uno funcione | En cada cambio (`npm run test:e2e` y GitHub Actions) |
| **Grabación** | Ejecuta los mismos pasos a ritmo humano, con un dedo y un anillo naranja sobre lo que se va a tocar, y los filma | Cuando se crea o cambia un tutorial (`npm run tutorials`) |

Así un tutorial no puede quedar viejo: si la app cambia y un paso ya no funciona, o si un subtítulo del guion
ya no coincide con el video guardado, la prueba falla y avisa.

## 1. Dónde está cada cosa

| Archivo | Para qué |
|---|---|
| `tests/tutorials/<id>.mjs` | El guion de cada tutorial (datos + pasos + subtítulos + comprobaciones) |
| `tests/tutorials/index.mjs` | La lista de tutoriales |
| `tests/tutorials/lib.mjs` | El motor: modo prueba o grabación, dedo, anillo, servidor con `Range`, preparación de datos |
| `tests/tutorials/record.mjs` | Graba todos (o algunos) tutoriales |
| `tests/e2e/tutorials.e2e.mjs` | La prueba: cada tutorial, el reproductor, «Guardar para ver sin señal» y cada «Hazlo conmigo» |
| `tutorials/` | Lo grabado: `<id>.webm` (390×844), `<id>.json` / `.vtt` (subtítulos con sus tiempos) |
| `src/tutorials.ts` | El catálogo que ve la app (título, resumen, texto final, pasos de «Hazlo conmigo») y utilidades puras |
| `src/tutorial-player.ts` | El reproductor: video, subtítulo debajo, barra de pasos, copia sin señal |

## 2. Escribir un tutorial nuevo

```js
// tests/tutorials/mi-tutorial.mjs
import { seedEmployees } from './lib.mjs';

function seed({ users }) {                 // corre en el navegador ANTES de abrir la app (no se filma)
  localStorage.setItem('users', JSON.stringify(users));
}

export default {
  id: 'mi-tutorial',                        // nombre de los archivos y clave en src/tutorials.ts
  title: 'Título que ve la persona',
  seed: { fn: seed, arg: { users: seedEmployees(4) } },
  async steps({ page, say, tap, point, type, key, pause, download, assert }) {
    await say('Para qué sirve esto, en una frase.', 300);
    await say('1 · Tocá "Más".');
    await tap('#nav-more');
    assert.ok(await page.isVisible('#btn-tutorials'));   // comprobá lo que el subtítulo promete
    await say('¡Listo! Qué se logró.');
  }
};
```

Después: agregalo a `tests/tutorials/index.mjs`, al catálogo `LIST` de `src/tutorials.ts` (mismo `id`, con su `tour`)
y su `./tutorials/<id>.json` al precache de `sw.js`. Los tests de `tests/tutorials.test.js` avisan si falta algo.

### Acciones del guion

| Acción | Qué hace | En grabación |
|---|---|---|
| `say(texto, espera=0)` | Muestra un subtítulo desde ahora hasta el siguiente | Espera el tiempo de lectura (1,4–4,2 s) + espera |
| `tap(objetivo, {ring})` | Toca un selector CSS o `{sel, text}` | Anillo naranja, el dedo se mueve suave, onda al tocar |
| `point(objetivo, ms)` | Señala algo sin tocarlo | Anillo y dedo encima un momento |
| `type(objetivo, texto)` | Escribe | Letra por letra |
| `key(tecla)` | Pulsa una tecla | Pausa corta |
| `download(acción)` | Ejecuta la acción y devuelve el JSON descargado | — |
| `pause(ms)` | Pausa | Solo en grabación |

### Reglas que evitan fallos
- Cada tutorial parte de un estado conocido: el motor crea un equipo nuevo, le pone nombre y pospone el aviso de memoria llena.
- El service worker está bloqueado en los tutoriales: su primera activación recarga la app en medio de un paso.
- Comprobá con `assert` todo lo que el subtítulo promete: así el tutorial también es una prueba.

### Cómo escribir los subtítulos
- Una idea por subtítulo, 1 a 2 líneas, en español claro de obra (voseo).
- Numerá los pasos: `1 · …`, `2 · …` (arman la barra de pasos del reproductor).
- Primero para qué sirve (sin número); al final, qué se logró.
- Los textos entre comillas nombran botones tal como aparecen en la app.

## 3. Grabar

```bash
npm run tutorials                          # todos
TUTORIALS=liberar-espacio npm run tutorials   # sólo algunos
```

Necesita Playwright + Chromium (`npm i -g playwright && playwright install chromium`, o `PLAYWRIGHT_MODULE=/ruta/index.mjs`).
Playwright no es dependencia del proyecto. Los videos (~1–2,5 MB) se suben al repositorio.

## 4. Voz (pendiente)
El motor tiene el gancho `voiceMs(texto)`: cuando haya voces (p. ej. Gemini TTS con `GEMINI_API_KEY` en el entorno,
nunca en el repo), cada subtítulo durará al menos lo que su audio.

## 5. En la app
- **Ajustes › Tutoriales**: lista → reproductor (subtítulo debajo, barra de pasos que salta) → «Hazlo conmigo».
- **Memoria llena** (≥ 80 %): el aviso muestra el tutorial `liberar-espacio`.
- **Sin señal**: los subtítulos están precacheados, así que se ven los pasos en texto; «Guardar para ver sin señal»
  guarda los videos en Cache Storage (`mini-tutorials-v1`, cuota aparte de los ~5 MB de datos; sobrevive a las actualizaciones).

## 6. Probar
- `npm run test:e2e`: cada tutorial, el reproductor, la copia sin señal y cada «Hazlo conmigo».
- Mientras escribís un guion: `TUTORIALS_DRAFT=1 TUTORIALS=<id> npm run test:e2e` (no exige el video).
