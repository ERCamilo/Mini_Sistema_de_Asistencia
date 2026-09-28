# Estándares de Código - Mini Sistema de Asistencia

> Guía para agentes y revisores de código (también es el `RULES_FILE` de `.gga`).
> Mantenelo breve y verificable: cada regla debe poder chequearse leyendo un diff.

## 1. Rol del Agente
- Actúa como Ingeniero de Software Senior, pragmático y enfocado en arquitectura limpia.
- Keep It Simple: sin sobre-ingeniería, sin abstracciones "por si acaso".

## 2. Qué es este proyecto (stack real)
- **PWA offline-first en JavaScript puro** (sin framework, sin bundler). Se publica en GitHub Pages directo desde `main`: lo que está en `main` va a producción.
- **UI:** `index.html` (script inline) + `p2p-transfer.css`. Diseño según **`UI_DESIGN.md`** (tokens `var(--...)`, touch ≥ 44px, sin CDNs). No hay React ni Tailwind.
- **Lógica tipada:** módulos TypeScript en `src/*.ts`, compilados por `tsc` a `*.js` en la raíz (`module: "none"`, `outDir: "."`). Los `.js` compilados **se commitean** porque se sirven tal cual.
- **Persistencia local:** `local-db.js` + repositorios (`*-repository`). **P2P** (WebRTC SA ↔ Mini): `p2p-*.js`, ver `docs/P2P_V1_GUIDE.md` cuando exista.
- **Librerías de terceros:** sólo vendorizadas en `vendor/`, con su licencia en `THIRD_PARTY_NOTICES.md`.

## 3. Migración progresiva a TypeScript (regla obligatoria)
- **Todo código nuevo se escribe en TypeScript** (`src/<nombre>.ts`). No se crean archivos `.js` escritos a mano nuevos.
- Al modificar de forma sustancial un `.js` escrito a mano (p. ej. `p2p-*.js`, `employee-number-modal.js`), preferí migrarlo a `src/*.ts` en ese mismo cambio o en uno inmediato, con tests.
- Lógica nueva que hoy iría inline en `index.html`: extraerla a un módulo TS puro y dejar en `index.html` sólo el cableado de DOM.
- **Nunca edites a mano un `.js` que tenga su `src/*.ts`**: editá el `.ts` y corré `npm run build`.
- Tipado estricto (`strict: true`). Evitá `any`; el único uso aceptado es el parámetro `root` del wrapper UMD.

### Patrón obligatorio de módulo TS
- Wrapper **UMD dual** que expone `module.exports` (para `node --test`) y `window.<NombreModulo>` (para `index.html`). Copiá la forma de un módulo existente, p. ej. `src/work-context.ts`.
- **Gotcha de `module: "none"`:** todos los `src/*.ts` comparten UN scope global de tipos.
  - Prefijá los tipos con el nombre del módulo (`WorkContext*`, `Draft*`, `Report*`, ...) para no redeclarar nombres (error TS2451).
  - `declare const module` existe **una sola vez** (`src/employee-number-rules.ts`); no lo redeclares.
- Registrá el `.js` compilado con `<script>` en `index.html` y en el precache de `sw.js`.

## 4. Reglas de Oro
- **No inventes ni instales librerías** para problemas simples (fechas, formatos, ids): escribí la función. Nada de dependencias de runtime vía npm; `typescript` es la única devDependency.
- **Funciones cortas y de responsabilidad única.** Nombres descriptivos en inglés en el código; textos de UI en español.
- **Manejo de errores:** toda llamada `async/await` va en `try/catch`, con logs claros y fallos no destructivos (nunca perder datos del usuario).
- **Datos del usuario:** cambios en el esquema de `localStorage`/`local-db` deben ser retrocompatibles o incluir migración con test.
- **Sin secretos nuevos en el cliente.** (La `OCR_API_KEY` de `index.html` es deuda conocida; no agregues más.)

## 5. Tests y build
- `npm test` corre `tsc` y luego `node --test` sobre `tests/*.test.js`. Debe quedar **100% verde** antes de commitear.
- **TDD:** antes de crear, mover o refactorizar una función, verificá que tenga test; si no, escribilo primero, correlo, hacé el cambio y volvé a correrlo.
- `build-info.js` y el `CACHE_VERSION` de `sw.js` se sellan solos: el hook `.githooks/pre-commit` corre `scripts/stamp-build.mjs` en cada commit (`npm run build` hace lo mismo + `tsc`). No los edites a mano.
- Hay tests que leen `index.html` y `sw.js` como texto (wiring/precache): si cambiás scripts o el precache, actualizá esos tests juntos.

## 6. Flujo de trabajo (SDD)
- Para cambios no triviales, primero una especificación breve (propuesta/spec/diseño/tareas) en `.sdd-review/<cambio>/`.
- Explicá los cambios antes de modificar archivos existentes.
- Commits convencionales (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`), una rama por cambio, merge a `main` sólo con tests verdes.
