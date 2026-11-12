// MongoDB store. Tasks are EMBEDDED in the project document (one read = whole aggregate).
const { MongoClient, ObjectId } = require('mongodb');
const { HttpError } = require('./errors');

const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017');
let projects;

const oid = (v) => { if (!ObjectId.isValid(v) || String(v).length !== 24) throw new HttpError(400, 'invalid id'); return new ObjectId(v); };
const dto = (d) => d && ({ ...d, id: String(d._id), _id: undefined,
  tasks: (d.tasks || []).map((t) => ({ ...t, id: String(t._id), _id: undefined })) });

async function init() {
  if (projects) return projects;
  await client.connect();
  const db = client.db(process.env.MONGO_DB || 'polyglot');
  const validator = { $jsonSchema: { bsonType: 'object', required: ['name', 'tasks', 'createdAt'],
    properties: { name: { bsonType: 'string', minLength: 1, maxLength: 120 },
      tasks: { bsonType: 'array', items: { bsonType: 'object', required: ['_id', 'title', 'status'],
        properties: { title: { bsonType: 'string', maxLength: 200 },
          status: { enum: ['todo', 'in_progress', 'done'] } } } } } } };
  const exists = await db.listCollections({ name: 'projects' }).toArray();
  if (!exists.length) await db.createCollection('projects', { validator });
  else await db.command({ collMod: 'projects', validator });
  projects = db.collection('projects');
  await projects.createIndex({ createdAt: -1 });
  await projects.createIndex({ 'tasks.status': 1 }); // multikey index on embedded array
  return projects;
}

module.exports = {
  name: 'mongo',
  async createProject({ name, description = null }) {
    const c = await init(); const now = new Date();
    const doc = { name, description, tasks: [], createdAt: now, updatedAt: now };
    const r = await c.insertOne(doc); return dto({ ...doc, _id: r.insertedId });
  },
  async listProjects() { return (await (await init()).find().sort({ createdAt: -1 }).toArray()).map(dto); },
  async getProject(id) { return dto(await (await init()).findOne({ _id: oid(id) })); }, // single query
  async updateProject(id, fields) {
    const r = await (await init()).findOneAndUpdate({ _id: oid(id) },
      { $set: { ...fields, updatedAt: new Date() } }, { returnDocument: 'after' });
    return dto(r);
  },
  async deleteProject(id) { return (await (await init()).deleteOne({ _id: oid(id) })).deletedCount > 0; },
  // Atomic push into embedded array. No FK in a document DB: unknown parent => matchedCount 0 => 404.
  async addTask(id, { title, status = 'todo' }) {
    const task = { _id: new ObjectId(), title, status, createdAt: new Date() };
    const r = await (await init()).updateOne({ _id: oid(id) }, { $push: { tasks: task }, $set: { updatedAt: new Date() } });
    return r.matchedCount ? dto({ tasks: [task] }).tasks[0] : null;
  },
  async updateTask(id, taskId, { title, status }) {
    const set = { updatedAt: new Date() };
    if (title !== undefined) set['tasks.$.title'] = title;
    if (status !== undefined) set['tasks.$.status'] = status;
    const r = await (await init()).updateOne({ _id: oid(id), 'tasks._id': oid(taskId) }, { $set: set });
    return r.matchedCount ? { id: taskId, title, status } : null;
  },
  async deleteTask(id, taskId) {
    const r = await (await init()).updateOne({ _id: oid(id) }, { $pull: { tasks: { _id: oid(taskId) } } });
    return r.modifiedCount > 0;
  },
  async close() { await client.close(); },
};
