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

### Catálogo de Iconos Clave:
- **Navegación**: `attendance`, `requests`, `employees`, `reports`, `more`, `add`.
- **Dominio y Contexto**: `hardHat` (Obra / Construcción), `users` (Cuadrilla / Equipo), `briefcase` (Cargos).
- **Acciones y Herramientas**: `edit`, `trash`, `copy`, `share`, `backup`, `restore`, `refresh`, `pause`, `play`, `search`, `clock`.
- **Estados**: `check`, `close`, `success`, `warning`, `conflict`, `inbox`, `star`, `starFilled`.

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

## 6. Checklist de Validación UI para Nuevos Cambios

Antes de finalizar cualquier modificación en la interfaz, verificar:

1. [ ] ¿Todos los colores usan variables CSS (`var(--...)`) y se ven correctamente en los 4 temas?
2. [ ] ¿Los botones e iconos tienen etiquetas de accesibilidad (`aria-label`, `title`)?
3. [ ] ¿Los iconos están registrados en `IconSet` y se renderizan con `applyIcons()`?
4. [ ] ¿Los botones y campos son cómodos de pulsar en pantallas pequeñas (mínimo 44px de alto)?
5. [ ] ¿Se incluye un estado vacío claro si no hay datos?
6. [ ] ¿Se ejecutan las pruebas (`npm test`) y pasan sin errores de sintaxis o renderizado?
