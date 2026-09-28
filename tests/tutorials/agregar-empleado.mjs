// Tutorial: add an employee by hand and mark them present.
import { seedEmployees } from './lib.mjs';

function seedCrew({ users }) {
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.removeItem('attendance');
  localStorage.setItem('checkMode', 'modal');
}

export default {
  id: 'agregar-empleado',
  title: 'Agregar un empleado',
  seed: { fn: seedCrew, arg: { users: seedEmployees(3) } },
  async steps({ page, say, tap, type, point, assert }) {
    await say('Sumá a una persona nueva a la lista en segundos.', 300);
    await say('1 · Tocá el botón "+" de abajo.');
    await tap('#nav-add');
    await say('2 · Elegí "Manual".');
    await tap('#btn-add-manual');
    await say('3 · Escribí su nombre y su cargo. El número se sugiere solo.');
    await type('#user-name', 'Ramón Ortiz');
    await type('#user-position', 'Ayudante');
    await point('#user-number', 900);
    assert.equal(await page.inputValue('#user-number'), '4', 'next number suggested');
    await say('4 · Tocá "Guardar Empleado".');
    await tap('#user-form button[type="submit"]');
    const added = await page.evaluate(() => users.find(u => u.name === 'Ramón Ortiz') || null);
    assert.ok(added, 'employee saved');
    assert.equal(added.number, '4');
    assert.equal(added.position, 'Ayudante');

    await say('5 · Ya aparece en "Asistencia": marcalo presente.');
    await tap('#nav-attendance');
    const card = { sel: '.user-card', text: 'Ramón Ortiz' };
    await point(card, 700);
    await tap('.user-card:has-text("Ramón Ortiz") .check-box');
    assert.equal(await page.evaluate(id => getRecord(id)?.hours ?? null, added.id), 8, 'new employee present');
    await say('¡Listo! Para corregir sus datos, tocalo en "Empleados".', 400);
  }
};
