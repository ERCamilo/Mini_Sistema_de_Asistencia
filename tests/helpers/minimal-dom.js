class MinimalClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class MinimalElement {
  constructor(document, tagName, options = {}) {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.id = options.id || '';
    this.hidden = Boolean(options.hidden);
    this.disabled = Boolean(options.disabled);
    this.attributes = { ...(options.attributes || {}) };
    this.children = [];
    this.classList = new MinimalClassList();
  }
  get offsetParent() { return this.hidden ? null : {}; }
  append(...children) { children.forEach(child => this.children.push(child)); }
  focus() { this.ownerDocument.activeElement = this; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelectorAll() {
    const result = [];
    const visit = element => {
      element.children.forEach(child => {
        if (child.tagName === 'BUTTON' || child.tagName === 'INPUT'
          || (child.getAttribute('tabindex') && child.getAttribute('tabindex') !== '-1')) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }
}

class MinimalDocument {
  constructor() { this.elements = new Map(); this.activeElement = null; }
  createElement(tagName, options) { return new MinimalElement(this, tagName, options); }
  append(...elements) {
    const register = element => {
      if (element.id) this.elements.set(element.id, element);
      element.children.forEach(register);
    };
    elements.forEach(register);
  }
  getElementById(id) { return this.elements.get(id) || null; }
}

function keyboardEvent(key, shiftKey = false) {
  return { key, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

module.exports = { MinimalDocument, keyboardEvent };
