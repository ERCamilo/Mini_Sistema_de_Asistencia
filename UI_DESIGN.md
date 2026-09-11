# Guía y Estándares de Diseño UI/UX — Mini Sistema de Asistencia

Este documento establece las reglas, tokens y patrones de diseño visual que rigen la interfaz de **Mini Sistema de Asistencia**. Todo nuevo módulo, modal, vista o componente debe adherirse estrictamente a estas especificaciones para mantener una experiencia homogénea, accesible, ligera y optimizada para dispositivos móviles en campo.

---

## 1. Principios Fundamentales de Diseño

1. **Mobile-First y Touch-First**:
   - La aplicación está diseñada para ser operada con una sola mano en obras o campo.
   - Toda área interactiva (botones, checkboxes, tarjetas, pestañas) debe tener un tamaño táctil mínimo de **44 × 44 px** (o espaciado equivalente).
2. **Local-First y Cero Latencia**:
   - La interfaz responde inmediatamente (<50ms). No se deben bloquear animaciones ni toques por operaciones de almacenamiento o red.
   - No se deben cargar fuentes externas o librerías de estilos pesadas por CDN; todo debe funcionar **100% offline**.
3. **Consistencia Temática**:
   - **Nunca hardcodear colores directos** (`#fff`, `#000`, `rgb(...)`) en componentes o estilos en línea. Usar siempre las variables CSS del sistema (`var(--...)`).
4. **Accesibilidad y Legibilidad**:
   - Alto contraste visual y soporte para daltonismo (complementar colores con iconos y glifos de estado como `✓`, `↑`, `↓`).
   - Foco visible nativo (`outline: 2px solid var(--accent-color)`) para navegación por teclado y lectores de pantalla.

---

## 2. Tokens de Diseño y Variables CSS

La aplicación soporta 4 temas dinámicos (`dark`, `light`, `contrast`, `ocean`). Todas las interfaces deben construirse utilizando exclusivamente estos tokens:

| Token CSS | Propósito / Uso |
| :--- | :--- |
| `--bg-color` | Fondo general de la aplicación y de la pantalla. |
| `--card-bg` | Fondo de tarjetas, paneles, modales y botones elevados. |
| `--input-bg` | Fondo para inputs, textareas, selects y cajas secundarias. |
| `--nav-bg` | Fondo traslúcido para la barra superior y barra de navegación inferior. |
| `--border-color` | Bordes de separación, tarjetas, modales e inputs. |
| `--text-color` | Color del texto principal y títulos. |
| `--text-muted` | Color para subtítulos, etiquetas secundarias, fechas y placeholders. |
| `--accent-color` | Color de énfasis principal (acciones primarias, enlaces, pestañas activas). |
| `--success-color` | Estados positivos (asistencia completa, confirmaciones, guardado). |
| `--danger-color` | Estados de error, alertas, ausencias y acciones destructivas. |
| `--warning-color` | Advertencias, media jornada, estados pendientes. |
| `--extra-color` | Horas extras, variantes secundarias de estado. |

---

## 3. Tipografía

La aplicación utiliza la pila de fuentes nativas del sistema operativo para máxima velocidad y nitidez sin consumo de ancho de banda:

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

### Escala de Tamaños
- **11 px**: Badges, tags de estado, etiquetas uppercase de campos (`letter-spacing: 0.5px; font-weight: 700`).
- **12 px**: Subtítulos de tarjetas, descripciones de ayuda, texto secundario (`color: var(--text-muted)`).
- **13 - 14 px**: Texto del cuerpo, opciones de menú, inputs de búsqueda, selectores.
- **15 - 16 px**: Títulos de tarjetas de empleados/solicitudes, botones principales (`font-weight: 600` o `700`).
- **18 - 20 px**: Títulos de modales y cabeceras de sección (`font-weight: 700`).

---

## 4. Sistema de Iconografía Vectorial (`IconSet`)

Todos los iconos de la aplicación se gestionan a través del módulo centralizado [`src/icon-set.ts`](file:///c:/Users/the_b/proyectos/Asistencia%20mini/src/icon-set.ts).

### Reglas de Uso de Iconos:
1. **Marcado HTML**: Utilizar la etiqueta contenedora con el atributo `data-icon`:
   ```html
   <span class="ic" data-icon="hardHat"></span>
   ```
2. **Renderizado Dinámico**: Al crear o actualizar HTML mediante JavaScript, invocar siempre `applyIcons(container)` para inyectar el SVG o Emoji correspondiente según el tema activo.
3. **Color Adaptativo**: Los iconos Lucide usan `stroke="currentColor"`, por lo que heredan automáticamente el color del texto del contenedor.
4. **Sin emoticones como iconografía de interfaz**: En nuevos botones, accesos directos, navegación, acciones de gestión y estados no se deben escribir emojis o símbolos Unicode decorativos directamente (`🔗`, `⇄`, `📤`, etc.). Se debe usar `IconSet`/Lucide o un SVG vectorial equivalente. Los emojis pueden existir como contenido escrito por el usuario o compatibilidad visual heredada, pero no deben ser el recurso iconográfico de una acción crítica nueva.
5. **Acciones vectoriales obligatorias**: Los accesos críticos que deban conservar iconografía SVG aunque el usuario tenga seleccionado un estilo heredado se marcan con `data-icon-vector`. `applyIcons()` debe renderizarlos mediante `IconSet.iconSvg()` y nunca sustituirlos por emoji.
6. **Icono + texto**: Los accesos principales como `Vincular` deben combinar un SVG reconocible con una etiqueta textual. En pantallas extremadamente estrechas puede ocultarse visualmente el texto si se conserva `aria-label`, `title` y un objetivo táctil mínimo de `44x44px`.

### Catálogo de Iconos Clave:
- **Navegación**: `attendance`, `requests`, `employees`, `reports`, `more`, `add`.
- **Dominio y Contexto**: `hardHat` (Obra / Construcción), `users` (Cuadrilla / Equipo), `briefcase` (Cargos).
- **Acciones y Herramientas**: `edit`, `trash`, `copy`, `share`, `link`, `backup`, `restore`, `refresh`, `pause`, `play`, `search`, `clock`.
- **Estados**: `check`, `close`, `success`, `warning`, `conflict`, `inbox`, `star`, `starFilled`.

---

### 4.1 Estados, Chips y Resoluciones

- Las etiquetas semánticas nuevas no usan el patrón `fondo transparente + borde de color + texto del mismo color`. Usan **relleno sólido semántico** y texto/icono de alto contraste.
- `success/listo` usa el color de éxito; `warning/conflicto` usa advertencia; `error/bloqueo` usa peligro; `nuevo/informativo` usa el acento de la app.
- No depender sólo del color: conflicto, error o advertencia conservan texto o iconografía comprensible.
- En filas repetitivas, el estado `Resuelto` se representa preferentemente con un **SVG checkmark** accesible, no con una píldora textual `Resuelto`.
- Estados ya incorporados/procesados pueden atenuar la tarjeta completa sin hacer ilegible su contenido.
- La misma semántica debe conservar color, icono y redacción en todas las pantallas.

---

## 5. Patrones de Componentes Estándar

### 5.1 Botones de Acción
- **Botón Primario (Acción Principal)**:
  ```html
  <button type="button" class="btn-full btn-primary">Guardar Cambios</button>
  ```
- **Botón Secundario (Cancelar / Filtro)**:
  ```html
  <button type="button" class="btn-full btn-secondary">Cancelar</button>
  ```
- **Botón de Peligro (Destructivo)**:
  ```html
  <button type="button" class="btn-full btn-danger">Eliminar Registro</button>
  ```
- **Botón Compacto de Herramientas**:
  ```html
  <button type="button" class="export-btn" aria-label="Editar" title="Editar">
      <span class="ic" data-icon="edit"></span>
  </button>
  ```

### 5.2 Formularios y Controles de Entrada
- **Inputs y Selects**: Utilizar siempre la clase `.search-input`.
- **Segmented Controls (Selectores de Tipo)**:
  Para elegir entre 2 o 3 opciones mutuamente excluyentes (ej. Obra vs Cuadrilla), preferir botones tipo *pill/tab* visuales en lugar de `<select>` desplegables reducidos:
  ```html
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <button type="button" class="btn-secondary active"><span class="ic" data-icon="hardHat"></span> Obra</button>
      <button type="button" class="btn-secondary"><span class="ic" data-icon="users"></span> Cuadrilla</button>
  </div>
  ```

### 5.3 Modales (Bottom Sheets Móviles)
- **Estructura Estándar**:
  ```html
  <div class="modal big" id="modal-ejemplo">
      <div class="modal-content">
          <div class="modal-handle"></div>
          <div class="modal-header">
              <div class="modal-title"><span class="ic" data-icon="wrench"></span> Título del Modal</div>
              <div class="modal-subtitle">Descripción breve del propósito</div>
          </div>
          <!-- Contenido del modal -->
      </div>
  </div>
  ```
- **Apertura y Cierre**: Usar las funciones globales `openModal('id')` y `closeModal('id')`.

### 5.4 Píldoras de Filtro Rápido
- Utilizar `.category-pill` para filtros de categoría u obras en la parte superior de las listas:
  ```html
  <button type="button" class="category-pill active">Todas</button>
  <button type="button" class="category-pill"><span class="ic" data-icon="hardHat"></span> Torre A</button>
  ```

### 5.5 Estados Vacíos (Empty States)
Cuando una lista o consulta no tenga elementos, mostrar siempre un contenedor informativo:
```html
<div style="text-align:center; padding:28px 16px; color:var(--text-muted); font-size:13px; background:var(--input-bg); border-radius:14px; border:1px dashed var(--border-color);">
    <div style="font-size:28px; margin-bottom:8px; opacity:0.7;"><span class="ic" data-icon="inbox"></span></div>
    <div style="font-weight:600; margin-bottom:4px; color:var(--text-color);">No hay elementos registrados</div>
    <div style="font-size:12px;">Mensaje guía para crear el primer registro.</div>
</div>
```

### 5.6 Avisos y Confirmaciones In-App
- **Toasts**: Usar `showToast('Mensaje breve de confirmación')` (no usar `alert()`).
- **Confirmaciones**: Usar `showConfirm('¿Estás seguro...?', { title: '...', confirmText: '...', danger: true })` (no usar `confirm()` nativo).

---


## 5.7 Transiciones entre vistas/modales de distinto tamaño

Cuando una acción cambia de una vista compacta a otra más grande o pequeña dentro del mismo flujo (por ejemplo: lista → espera de conexión → resultado), se debe percibir como **la transformación del mismo modal**, no como cerrar uno y abrir otro.

- Mantener el mismo overlay y shell montados; sustituir sólo el contenido interior.
- Medir tamaño inicial/final y animar ancho/alto aproximadamente **220–320 ms** con una curva suave tipo `cubic-bezier(.2,.8,.2,1)`.
- Hacer un crossfade corto del contenido mientras el shell cambia de tamaño; nunca dejar un frame vacío.
- En bottom sheet móvil, mantener el borde inferior anclado y permitir que el panel crezca/encoga hacia arriba.
- No reiniciar overlay, scroll global ni foco durante el cambio.
- Los controles que continúan entre estados conservan foco cuando sea posible.
- Interacciones pequeñas dentro de la misma vista no deben reanimar todo el modal.
- Con `prefers-reduced-motion: reduce`, saltar a la geometría final sin animación pero conservando el mismo shell para evitar flash/parpadeo.
- Todos los colores y estados de la transición continúan usando los tokens existentes (`--card-bg`, `--input-bg`, `--border-color`, `--text-color`, `--text-muted`, `--accent-color`, etc.).

### 5.8 Vinculación y Transferencias SA ↔ Mini

- La portada de Transferencias no usa tarjetas grandes por habilidad. Mostrar una **franja compacta de capacidades** en una fila o grid corto (`Personal`, `Asistencia`, `Backup`, `Archivos`) y reservar la mayor parte del modal para dispositivos y acciones reales.
- En escritorio la franja intenta mantenerse en 4 columnas; en móvil puede pasar a 2 columnas sin reducir objetivos táctiles por debajo de `44x44px`.
- Capacidades futuras/deshabilitadas permanecen en la misma franja, atenuadas y sin competir con las funciones disponibles.
- Los SA vinculados se muestran como filas/tarjetas compactas: icono vectorial, alias/nombre, última conexión y acciones. Evitar una tarjeta alta por acción.
- Las acciones principales conservan texto (`Roster`, `Asistencia`, `Escanear QR de SA`); editar, cerrar, volver y desvincular usan SVG de `IconSet`.
- El flujo completo `inicio → QR/código → confirmación → espera → resultado/error` conserva el mismo overlay/shell y utiliza la transición morfológica de 5.7.
- El contenido interior conserva un gutter consistente de `16–20px` (`12–14px` en pantallas estrechas). Ningún control debe quedar pegado al borde del modal.
- No usar `style=` inline para construir nuevas superficies P2P; los estilos pertenecen a la hoja específica y usan exclusivamente los tokens documentados de Mini.
- No usar emojis o símbolos Unicode como iconografía de acciones/estados P2P. Se usan SVG vectoriales incluso si existe un modo visual heredado basado en emoji.
- Desvincular siempre usa `showConfirm()`; nunca `confirm()` nativo.


## 6. Checklist de Validación UI para Nuevos Cambios

Antes de finalizar cualquier modificación en la interfaz, verificar:

1. [ ] ¿Todos los colores usan variables CSS (`var(--...)`) y se ven correctamente en los 4 temas?
2. [ ] ¿Los botones e iconos tienen etiquetas de accesibilidad (`aria-label`, `title`)?
3. [ ] ¿Los iconos están registrados en `IconSet` y se renderizan con `applyIcons()`?
4. [ ] ¿Los botones y campos son cómodos de pulsar en pantallas pequeñas (mínimo 44px de alto)?
5. [ ] ¿Se incluye un estado vacío claro si no hay datos?
6. [ ] ¿Se ejecutan las pruebas (`npm test`) y pasan sin errores de sintaxis o renderizado?

### 5.9 Revisión de roster recibido desde SA

- Un roster `sa-roster/v1` ya validado por P2P no debe saltar al importador JSON genérico. La revisión ocurre dentro del mismo shell de Transferencias y conserva la continuidad espacial de 5.7.
- La primera vista de revisión muestra un resumen ejecutivo de cambios: `Nuevos`, `Modificados`, `Sin cambios` y `Conflictos`. La información secundaria vive en un detalle desplegable; no se muestra un muro de texto ni el JSON crudo por defecto.
- Los empleados que estaban vinculados y ya no aparecen en el roster actual de SA se muestran explícitamente como una advertencia no destructiva: Mini los conserva hasta que exista una decisión específica. Nunca se elimina historial o personal como efecto silencioso de una sincronización.
- Los conflictos de número/identidad se resuelven mediante tarjetas táctiles completas, no radios diminutos. Cada opción explica si conservará el ID local o si el registro quedará sin vincular.
- El pie de revisión tiene una sola acción primaria: `Aplicar roster en Mini`. Si faltan conflictos por resolver, el botón queda deshabilitado y un hint explica cuántos faltan.
- El resultado final muestra contadores reales derivados del resultado aplicado (`Agregados`, `Actualizados`, `Omitidos`). No mostrar valores de demostración ni éxito genérico si quedaron registros sin vincular.
- Todo estado o acción usa `IconSet`/SVG vectorial. No usar emojis ni símbolos Unicode decorativos como iconos en recepción, revisión, resolución o resultado.
- La ruta P2P no escribe directamente en el repositorio de empleados: delega a una función de aplicación propiedad de la app que conserva historial de importación, rollback y renderizado canónico.

### 5.10 Insignia numérica canónica (conteos)

- Los conteos usan una insignia sólida compacta (`.mini-count-badge`): círculo/píldora, número centrado, sin paréntesis tipo `(N)`.
- La insignia usa sólo tokens existentes (`--accent-color` de fondo, `--bg-color` para el número) y texto de 11 px en negrita.
- Cero se oculta salvo que el cero sea informativo (por ejemplo: `Omitidos: 0` en un resultado aplicado sí puede mostrarse como métrica, no como insignia).
- Toda insignia expone el conteo a lectores de pantalla con `role="status"` y `aria-label` numérico (ejemplo: `aria-label="3 cambios"`).
- El detalle de revisión muestra `Ver detalle de cambios` + insignia; la cabecera de conflictos muestra `Resolver vínculos` + insignia + progreso textual `resueltos / totales`.

### 5.11 Retroalimentación de éxito terminal (Meta 3)

- Un único helper reutilizable (`MiniP2PSuccessFeedback.signal`) emite la confirmación de éxito dentro de la UI P2P.
- Sólo eventos terminales con significado real disparan confirmación, exactamente una vez por clave: primer SA vinculado, roster recibido y validado, roster aplicado, respuesta de asistencia enviada. No disparar en estados intermedios (autenticación, progreso, `ready`) ni en duplicados/reintentos.
- Mejora progresiva, siempre con estado visual in-app (pulso + check/status del shell existente con `--success-color`); vibración, chime y notificación del sistema son opcionales y nunca bloquean.
- `navigator.vibrate` sólo si existe, breve (15 ms) y con `try/catch`.
- Chime WebAudio sólo si `AudioContext` existe y está permitido: dos tonos sinusoidales muy cortos (<250 ms totales) a bajo volumen, con `resume()`/`close()` best-effort y errores de autoplay capturados.
- `Notification` sólo si `Notification.permission` ya es `granted` Y `document.hidden` es `true`; nunca pedir permiso automáticamente.
- Con `prefers-reduced-motion: reduce` se conserva el estado estático de éxito pero se omite la animación de pulso.
- Sin sonidos repetidos: cada clave terminal se marca en un `Set` y los duplicados retornan sin reemitir.
- Sin `alert`/`confirm` nativos, sin emojis/símbolos Unicode como iconos (`IconSet`/SVG), objetivos táctiles >=44px.
