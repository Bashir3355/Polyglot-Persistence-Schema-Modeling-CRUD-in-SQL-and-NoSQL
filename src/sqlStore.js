// PostgreSQL store. EVERY query is parameterized ($1, $2...) -> no SQL injection.
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.PG_URL || 'postgres://app:app@localhost:5432/polyglot',
  max: 10,
});
pool.on('error', (e) => console.error('[pg] idle client error', e.message));

const q = async (text, params) => {
  console.log('[pg]', text.replace(/\s+/g, ' ').trim().slice(0, 110), JSON.stringify(params));
  return pool.query(text, params);
};

// One round trip; JOIN + json_agg gives the project with all its tasks.
const WITH_TASKS = `
  SELECT p.*, COALESCE(json_agg(t ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL), '[]') AS tasks
  FROM projects p LEFT JOIN tasks t ON t.project_id = p.id`;

module.exports = {
  name: 'sql',
  async createProject({ name, description = null }) {
    const r = await q('INSERT INTO projects (name, description) VALUES ($1,$2) RETURNING *', [name, description]);
    return { ...r.rows[0], tasks: [] };
  },
  async listProjects() {
    return (await q(`${WITH_TASKS} GROUP BY p.id ORDER BY p.created_at DESC`, [])).rows;
  },
  async getProject(id) {
    return (await q(`${WITH_TASKS} WHERE p.id = $1 GROUP BY p.id`, [id])).rows[0] || null;
  },
  async updateProject(id, { name, description }) {
    const r = await q(
      `UPDATE projects SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
       WHERE id = $1 RETURNING id`, [id, name ?? null, description ?? null]);
    return r.rowCount ? this.getProject(id) : null;
  },
  async deleteProject(id) {
    return (await q('DELETE FROM projects WHERE id = $1 RETURNING id', [id])).rowCount > 0; // tasks cascade
  },
  // FK violation (23503) is deliberately NOT pre-checked: the DB is the enforcer.
  async addTask(projectId, { title, status = 'todo' }) {
    return (await q('INSERT INTO tasks (project_id, title, status) VALUES ($1,$2,$3) RETURNING *',
      [projectId, title, status])).rows[0];
  },
  async updateTask(projectId, taskId, { title, status }) {
    const r = await q(
      `UPDATE tasks SET title = COALESCE($3, title), status = COALESCE($4, status), updated_at = now()
       WHERE id = $2 AND project_id = $1 RETURNING *`, [projectId, taskId, title ?? null, status ?? null]);
    return r.rows[0] || null;
  },
  async deleteTask(projectId, taskId) {
    return (await q('DELETE FROM tasks WHERE id = $2 AND project_id = $1 RETURNING id', [projectId, taskId])).rowCount > 0;
  },
  async close() { await pool.end(); },
};
