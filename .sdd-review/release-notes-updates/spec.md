# Novedades y actualización voluntaria

Fuente canónica en src/app-version.ts (UMD puro compilado a app-version.js): APP_VERSION/CHANGELOG/políticas; versión coincidente con package/build-info. app-release.json generado por scripts desde ese módulo, sin ejecutar JavaScript de la versión entrante. El hook sincroniza metadatos y cache; no sube una versión sin novedades.

Dos modales integrados en openModal/closeModal y BackNavigation: Novedades y Actualización con Actualizar ahora/Más tarde. Primera instalación no avisa; recarga tras actualización muestra todas las novedades no vistas; no marcar como visto al posponer. Lectura/escritura local por app/dispositivo, sin restaurar ni sobrescribir claves de datos canónicos. Escritura de referencia solo al cerrar realmente las novedades.

Controlador probado con reloj/IO inyectados: intervalo 30 min, red/visibilidad, timeout, consulta manual, controllerchange con hasController, defer por versión y no retroceder lastSeen. Recarga solo explícita, tras esperar arranque y cola de persistencia local; si hay editor o fallo de guardado, detener sin perder pantalla. No borrar caches/datos para la actualización normal; mantener reparación manual independiente.

Pruebas TDD de política/controlador y wiring. Chromium en Mini real: primera carga, novedades acumuladas, posponer, manual, datos intactos, atrás sin pila duplicada, fallo de guardado, offline, temas/320–480 px. Actualizar tests que exigían recarga automática junto al nuevo comportamiento autorizado. Build/TS/tests/tutoriales completos antes del commit. Documentar reglas de publicación y abrir PR separado a main.
