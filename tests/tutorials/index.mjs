// Tutorials recorded by `npm run tutorials` and checked by `npm run test:e2e`.
// Same ids as the catalog in src/tutorials.ts.
export const TUTORIALS = ['./marcar-asistencia.mjs', './agregar-empleado.mjs', './liberar-espacio.mjs'];

export async function loadTutorials(filter = process.env.TUTORIALS) {
  const wanted = filter ? new Set(filter.split(',').map(s => s.trim())) : null;
  const all = await Promise.all(TUTORIALS.map(async file => (await import(file)).default));
  return wanted ? all.filter(t => wanted.has(t.id)) : all;
}
