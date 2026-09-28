// Tutorial: mark attendance, change the hours, look at another day.
import { seedEmployees } from './lib.mjs';

function seedCrew({ users }) {
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.removeItem('attendance');
  localStorage.setItem('checkMode', 'modal');
}

const recordOf = (page, uid) => page.evaluate(id => getRecord(id) || null, uid);

export default {
  id: 'marcar-asistencia',
  title: 'Marcar asistencia',
  seed: { fn: seedCrew, arg: { users: seedEmployees(6) } },
  async steps({ page, say, tap, point, pause, assert }) {
    await say('Cada día marcás quién vino y cuántas horas trabajó.', 300);
    await say('1 · Tocá el cuadrito de la persona: queda presente con la jornada completa.');
    await tap('.user-card:nth-child(1) .check-box');
    await tap('.user-card:nth-child(2) .check-box');
    assert.equal((await recordOf(page, 'u0'))?.hours, 8, 'first employee present, 8 h');
    assert.equal((await recordOf(page, 'u1'))?.hours, 8, 'second employee present, 8 h');

    await say('2 · ¿Trabajó más o menos? Tocá sus horas.');
    await tap('.user-card:nth-child(1) .hours-badge');
    await say('3 · Mové la barra y tocá "Guardar".');
    await point('#hours-slider', 500);
    for (const value of [8.5, 9, 9.5, 10]) {
      await page.evaluate(v => { const s = document.getElementById('hours-slider'); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, value);
      await pause(220);
    }
    await tap('#btn-save-hours');
    assert.equal((await recordOf(page, 'u0'))?.hours, 10, 'hours changed to 10');
    await point('.user-card:nth-child(1) .hours-badge', 1200);

    await say('4 · Para otro día, usá las flechas de la fecha.');
    await tap('#btn-prev-day');
    assert.equal(await recordOf(page, 'u0'), null, 'yesterday has no marks');
    await pause(600);
    await tap('#btn-next-day');
    assert.equal((await recordOf(page, 'u0'))?.hours, 10, 'back to today');
    await say('¡Listo! Todo se guarda solo en el celular.', 400);
  }
};
