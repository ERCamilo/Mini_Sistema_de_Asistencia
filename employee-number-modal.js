(function exposeEmployeeNumberModal(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmployeeNumberModal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModalApi() {
  function createEmployeeNumberModal({ document, modalId }) {
    const modal = document.getElementById(modalId);
    let returnFocus = null;

    function getFocusableElements() {
      return [...modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.offsetParent !== null && !element.disabled);
    }

    function open(origin = document.activeElement) {
      returnFocus = origin;
      modal.classList.add('active');
      getFocusableElements()[0]?.focus();
    }

    function close() {
      modal.classList.remove('active');
      const origin = returnFocus;
      returnFocus = null;
      origin?.focus();
      return 'closed';
    }

    function handleKeydown(event) {
      if (!modal.classList.contains('active')) return null;
      if (event.key === 'Escape') {
        event.preventDefault();
        return close();
      }
      if (event.key !== 'Tab') return null;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return null;
      const activeIndex = focusable.indexOf(document.activeElement);
      const offset = event.shiftKey ? -1 : 1;
      const nextIndex = (activeIndex + offset + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
      return 'focused';
    }

    return { open, close, handleKeydown, getFocusableElements };
  }

  return { createEmployeeNumberModal };
});
