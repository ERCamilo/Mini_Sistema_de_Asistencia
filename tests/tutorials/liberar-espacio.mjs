// Tutorial: archive old months to a file (nothing is lost) to keep the phone light.
import { seedEmployees } from './lib.mjs';

// ~60 employees × every workday of the last 18 months: an almost-full Mini.
function seedFullDevice({ users, months }) {
  const attendance = {};
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth() - months, 1, 12);
  for (let d = first; d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    attendance[key] = {};
    for (const u of users) attendance[key][u.id] = { status: 'present', hours: 8, schemaVersion: 1, localOnly: true, createdAt: key + 'T12:00:00.000Z', updatedAt: key + 'T12:00:00.000Z' };
  }
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('attendance', JSON.stringify(attendance));
}

const dayKeys = page => page.evaluate(() => Object.keys(attendanceRepository.getAll()).sort());

export default {
  id: 'liberar-espacio',
  title: 'Archivar meses antiguos',
  seed: { fn: seedFullDevice, arg: { users: seedEmployees(60), months: 18 } },
  async steps({ page, say, tap, point, download, assert }) {
    const daysBefore = (await dayKeys(page)).length;
    assert.ok(daysBefore > 300, `seeded history should be long (got ${daysBefore} days)`);

    await say('Con los meses, Mini acumula mucha asistencia. Archivá los meses viejos en un archivo, sin perder nada.', 400);
    await say('1 · Abrí "Más".');
    await tap('#nav-more');
    await say('2 · Entrá a "Datos".');
    await tap('#btn-more-tab-data');
    await say('3 · Primero guardá un "Respaldo completo".');
    const backup = await download(() => tap('#btn-download-backup'));
    assert.equal(Object.keys(backup.attendance).length, daysBefore, 'the backup has every day');

    await say('4 · Tocá "Archivar meses antiguos".');
    await tap('#btn-archive-months');
    await say('5 · Elegí cuántos meses mantener en el celular. Recomendado: 3.');
    await tap('#btn-archive-keep-3');
    await point('#archive-summary .archive-total', 1800);
    await say('6 · Tocá "Guardar archivo y archivar": se descarga un archivo con los meses viejos.');
    const archive = await download(() => tap('#btn-archive-run'));
    assert.equal(archive.kind, 'mini-archive');
    await say('7 · Con el archivo guardado, confirmá "Archivar".');
    await tap('#modal-confirm.active .btn-danger');

    const remaining = await dayKeys(page);
    assert.equal(remaining.length + Object.keys(archive.attendance).length, daysBefore, 'no day lost: kept + archived = before');
    assert.ok(remaining[0] > archive.range.to, 'kept days are newer than archived ones');
    assert.ok(remaining.length < 90, `only ~3 months stay (got ${remaining.length} days)`);
    assert.equal(await page.evaluate(() => attendanceRepository.getTombstones().length), 0, 'archiving creates no tombstones');
    assert.equal(await page.evaluate(() => users.length), 60, 'employees untouched');
    await say('¡Listo! Si algún día necesitás esos meses, restaurá el archivo desde "Datos".', 600);
  }
};
