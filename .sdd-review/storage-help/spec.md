# Storage help: full-storage popup, help video, "Hazlo conmigo", archive old months

## Problem
After v2.13.1 duplicated data is removed automatically at boot. A Mini that is
still full is full of real attendance history (localStorage ~5 M chars), and no
in-app action solves that. Users need to be told, shown and guided.

## Behavior
1. **Detection** (boot and after updates): after `runStorageRepair`, measure
   usage. If >= 80 %, show the storage help popup unless it was dismissed in the
   last 24 h (`storageHelpSnoozedUntil`, tiny localStorage key).
2. **Popup** (`modal-storage-help`): usage bar with %, a help video
   (`help/liberar-espacio.webm`, lazy-loaded, not precached; offline shows a
   text fallback), and actions **Hazlo conmigo** / **Ahora no**.
   Ajustes has **Ayuda: liberar espacio** that opens the same popup anytime.
3. **Hazlo conmigo**: a guided tour over the real UI (dim + spotlight + bubble):
   Más -> Datos -> Descargar respaldo -> Ajustes -> Liberar espacio ->
   Datos -> Archivar meses antiguos -> confirm. Tapping the highlighted control
   advances; "Salir" and Android back end the tour.
4. **Archivar meses antiguos** (new, Datos tab):
   - Keep the last N months on the device (3 / 6 / 12, default 3; the current
     month is never archived).
   - Shows months, days, records and the estimated space it frees.
   - Saves a `mini-archive/v1` file (users + archived attendance only), then
     asks for explicit confirmation before removing those days.
   - Removal is archival: no tombstones (it must free space, not create it).
   - The archive file can be loaded back from "Restaurar respaldo": it is
     **merged** (adds the months back, adds missing employees), never replaces.
5. **Video = test**: `scripts/record-help-video.mjs` (Playwright) seeds a full
   device, runs the tour, asserts every outcome (usage drops below 80 %, recent
   months intact, archived months removed and present in the saved file) and
   records the video with step captions. Re-run it whenever the UI changes.

## Out of scope
Storage v2 (IndexedDB) removes the 5 MB limit; this popup stays as a safety net.
