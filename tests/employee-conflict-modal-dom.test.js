const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmployeeNumberModal } = require('../employee-number-modal.js');
const { MinimalDocument, keyboardEvent } = require('./helpers/minimal-dom.js');

function createFixture() {
  const document = new MinimalDocument();
  const origin = document.createElement('button', { id: 'origin' });
  const modal = document.createElement('div', { id: 'conflict-modal', attributes: { role: 'dialog' } });
  const hidden = document.createElement('button', { id: 'hidden', hidden: true });
  const first = document.createElement('button', { id: 'first' });
  const disabled = document.createElement('button', { id: 'disabled', disabled: true });
  const last = document.createElement('button', { id: 'last' });
  modal.append(hidden, first, disabled, last);
  document.append(origin, modal);
  return { document, origin, modal, first, last };
}

test('production modal focuses the first usable control and restores its origin', () => {
  const { document, origin, modal, first } = createFixture();
  origin.focus();
  const controller = createEmployeeNumberModal({ document, modalId: modal.id });
  controller.open();
  assert.equal(document.activeElement, first);
  assert.equal(modal.classList.contains('active'), true);
  controller.close();
  assert.equal(document.activeElement, origin);
  assert.equal(modal.classList.contains('active'), false);
});

test('production modal closes on Escape and prevents the browser default', () => {
  const { document, origin, modal } = createFixture();
  origin.focus();
  const controller = createEmployeeNumberModal({ document, modalId: modal.id });
  controller.open();
  const event = keyboardEvent('Escape');
  assert.equal(controller.handleKeydown(event), 'closed');
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, origin);
});

test('production modal traps Tab in visible enabled controls in both directions', () => {
  const { document, modal, first, last } = createFixture();
  const controller = createEmployeeNumberModal({ document, modalId: modal.id });
  controller.open();
  last.focus();
  controller.handleKeydown(keyboardEvent('Tab'));
  assert.equal(document.activeElement, first);
  controller.handleKeydown(keyboardEvent('Tab', true));
  assert.equal(document.activeElement, last);
  assert.deepEqual(controller.getFocusableElements(), [first, last]);
});
