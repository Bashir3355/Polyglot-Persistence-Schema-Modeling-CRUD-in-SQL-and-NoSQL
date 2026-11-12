const express = require('express');
const path = require('path');
const sqlStore = require('./sqlStore');
const mongoStore = require('./mongoStore');
const { HttpError, validateProject, validateTask } = require('./errors');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const found = (v) => { if (!v) throw new HttpError(404, 'not found'); return v; };

// One router factory, two engines -> identical API surface (/api/sql/* and /api/mongo/*)
function buildRouter(s) {
  const r = express.Router();
  r.post('/projects', wrap(async (req, res) => res.status(201).json(await s.createProject(validateProject(req.body)))));
  r.get('/projects', wrap(async (_q, res) => res.json(await s.listProjects())));
  r.get('/projects/:id', wrap(async (req, res) => res.json(found(await s.getProject(req.params.id)))));
  r.patch('/projects/:id', wrap(async (req, res) =>
    res.json(found(await s.updateProject(req.params.id, validateProject(req.body, true))))));
  r.delete('/projects/:id', wrap(async (req, res) => { found(await s.deleteProject(req.params.id)); res.status(204).end(); }));
  r.post('/projects/:id/tasks', wrap(async (req, res) =>
    res.status(201).json(found(await s.addTask(req.params.id, validateTask(req.body))))));
  r.patch('/projects/:id/tasks/:taskId', wrap(async (req, res) =>
    res.json(found(await s.updateTask(req.params.id, req.params.taskId, validateTask(req.body, true))))));
  r.delete('/projects/:id/tasks/:taskId', wrap(async (req, res) => {
    found(await s.deleteTask(req.params.id, req.params.taskId)); res.status(204).end(); }));
  return r;
}

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/sql', buildRouter(sqlStore));
app.use('/api/mongo', buildRouter(mongoStore));

// Map DB driver errors to HTTP statuses
app.use((err, _req, res, _next) => {
  let status = err.status || 500, message = err.message;
  if (err.type === 'entity.parse.failed') { status = 400; message = 'invalid JSON'; }
  else if (err.code === '23503') { status = 409; message = `foreign key violation: ${err.detail || err.constraint}`; }
  else if (['22P02', '23502', '23514', '22001'].includes(err.code)) { status = 400; message = `constraint/format error (${err.code})`; }
  else if (err.code === 121) { status = 400; message = 'document failed schema validation'; }
  if (status >= 500) { console.error(err); message = 'internal error'; }
  res.status(status).json({ error: message });
});

const port = process.env.PORT || 3000;
if (require.main === module) app.listen(port, () => console.log(`http://localhost:${port}`));
module.exports = app;
