class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const STATUSES = ['todo', 'in_progress', 'done'];

function validateProject(b = {}, partial = false) {
  const out = {};
  if (b.name !== undefined || !partial) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120)
      throw new HttpError(400, 'name is required (1-120 chars)');
    out.name = b.name.trim();
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 2000)
      throw new HttpError(400, 'description must be a string up to 2000 chars');
    out.description = b.description;
  }
  if (partial && !Object.keys(out).length) throw new HttpError(400, 'nothing to update');
  return out;
}

function validateTask(b = {}, partial = false) {
  const out = {};
  if (b.title !== undefined || !partial) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200)
      throw new HttpError(400, 'title is required (1-200 chars)');
    out.title = b.title.trim();
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
    out.status = b.status;
  }
  if (partial && !Object.keys(out).length) throw new HttpError(400, 'nothing to update');
  return out;
}
module.exports = { HttpError, validateProject, validateTask, STATUSES };
