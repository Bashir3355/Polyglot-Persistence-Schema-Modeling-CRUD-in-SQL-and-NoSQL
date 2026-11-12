# Week 05 – Polyglot Persistence: Projects & Tasks in PostgreSQL and MongoDB

One domain (**Projects 1—* Tasks**), two engines, one API. The same CRUD surface is exposed at
`/api/sql/*` (PostgreSQL) and `/api/mongo/*` (MongoDB), plus a small responsive UI at `/`.

## 1. Domain, schemas, ER diagram

**Domain:** a project-management feature. A project has many tasks; each task has a status (`todo | in_progress | done`).

### SQL (PostgreSQL, 3NF) – see `sql/schema.sql`
```
┌────────────────────┐ 1        * ┌─────────────────────────────┐
│ projects           │─────────────│ tasks                       │
├────────────────────┤             ├─────────────────────────────┤
│ id PK uuid         │◄────────────│ project_id FK uuid NOT NULL │
│ name varchar(120)  │ ON DELETE   │ id PK uuid                  │
│ description text   │ CASCADE     │ title varchar(200) NOT NULL │
│ created_at, upd_at │             │ status CHECK(3 values)      │
└────────────────────┘             │ created_at, updated_at      │
                                   └─────────────────────────────┘
Indexes: idx_tasks_project_id (project_id), idx_tasks_project_status (project_id, status)
```
3NF: every non-key attribute depends on the key, the whole key, and nothing but the key. Task facts live in `tasks`, project facts in `projects`; no repeated project data in task rows.

### NoSQL (MongoDB) – `projects` collection, tasks **embedded** (validator + indexes in `src/mongoStore.js`)
```json
{
  "_id": "66f1c0a2e4b0a1b2c3d4e5f6",
  "name": "Website Redesign",
  "description": "Q4 launch",
  "tasks": [
    { "_id": "66f1c0a2e4b0a1b2c3d4e5f7", "title": "Wireframes", "status": "done", "createdAt": "2026-11-12T10:00:00Z" },
    { "_id": "66f1c0a2e4b0a1b2c3d4e5f8", "title": "Build header", "status": "todo", "createdAt": "2026-11-12T10:05:00Z" }
  ],
  "createdAt": "2026-11-12T09:55:00Z",
  "updatedAt": "2026-11-12T10:05:00Z"
}
```
**Why embed?** The access pattern is "show a project with all its tasks" → one `findOne`, no `$lookup`, no second round trip. Tasks belong to exactly one project and are bounded in number, so embedding is safe (16 MB document cap is not a concern). Indexes: `createdAt` and multikey `tasks.status`.

## 2. Prerequisites & setup
Requires Node 18+ and Docker.
```bash
git clone https://github.com/<your-username>/week05-database-crud && cd week05-database-crud
docker compose up -d          # Postgres 16 (schema auto-applied from sql/schema.sql) + Mongo 7
npm install
npm start                     # http://localhost:3000   (PG_URL / MONGO_URL env vars override defaults)
npm run qa                    # automated QA suite (server must be running)
```
Mongo's collection validator and indexes are created automatically on first use. No seed is required; create data via the UI or API.

Inspect the databases:
```bash
docker compose exec postgres psql -U app -d polyglot -c "\d tasks"
docker compose exec mongo mongosh polyglot --eval "db.projects.find().pretty()"
```

## 3. API (identical for `sql` and `mongo`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/{engine}/projects` | Create project |
| GET | `/api/{engine}/projects` / `/:id` | List / read (with tasks) |
| PATCH | `/api/{engine}/projects/:id` | Update name/description |
| DELETE | `/api/{engine}/projects/:id` | Delete (SQL: cascades tasks) |
| POST | `/api/{engine}/projects/:id/tasks` | Add task (SQL: INSERT, Mongo: `$push`) |
| PATCH | `/api/{engine}/projects/:id/tasks/:taskId` | Update task (Mongo: positional `$`) |
| DELETE | `/api/{engine}/projects/:id/tasks/:taskId` | Delete task (Mongo: `$pull`) |

Status codes: 200/201/204 success, 400 validation/malformed id, 404 not found, **409 foreign-key violation (SQL)**.

## 4. AI disclosure & prompt appendix
**AI tool used:** Claude (Anthropic).

**Prompt submitted (adapted from the assignment template):**
```
Act as a senior database architect. I am designing a backend feature for a Task Management System with Projects and Tasks.

I need to implement polyglot persistence to compare relational (SQL) and non-relational (NoSQL) modeling:

Relational Schema (PostgreSQL/MySQL/SQLite):
   - Create normalized (3NF) tables with primary keys, foreign keys, timestamps, and indexes.
   - Ensure proper referential integrity (e.g., ON DELETE CASCADE).

NoSQL Schema (MongoDB/Document Store):
   - Design an idiomatic document model for the exact same domain.
   - Optimize for reading a complete project with its associated tasks in a single query (denormalized or embedded array).

Working Application / CRUD Service (Node.js, Python, or Go):
   - Implement basic CRUD endpoints/methods for both databases:
     * Create a record/document
     * Read by ID and list all records
     * Update an attribute
     * Delete a record

A minimal frontend or test script to execute and verify these operations against both databases.

Provide the SQL DDL statements, NoSQL schema/JSON structure, database connection logic, and CRUD controller code.
```
Follow-up prompts (add yours here): _e.g. "Add a QA script covering FK rejection and cascade", "Make the UI mobile friendly"._

### Audit of the AI output (Data Architecture Audit Checklist)
> ✏️ **Before submitting, re-run this audit yourself and edit this table to match what you actually observed** – the grader wants *your* critique. Verify each row by reading the code/running the DB.

| Checklist item | Result | Evidence / fix |
|---|---|---|
| SQL referential integrity | ✅ Real `REFERENCES … ON DELETE CASCADE` on `tasks.project_id`. **Patched/Added:** explicit index on the FK column (Postgres doesn't create one) and a composite `(project_id, status)` index; `CHECK` constraints on `status` and non-blank text. | `sql/schema.sql` |
| NoSQL anti-patterns | ✅ Tasks embedded in project doc, one `findOne` read. **Patched/Added:** `$jsonSchema` validator and multikey index on `tasks.status`. A relational-style `tasks` collection with `projectId` refs was the anti-pattern to reject. | `src/mongoStore.js` |
| SQLi / parameterization | ✅ All queries use `$1..$n` placeholders; no string concatenation. Table/column names are static. | `src/sqlStore.js` |
| ID generation | UUIDv4 (`gen_random_uuid()`) in SQL – safe across distributed writers, unlike serial ints. Mongo uses ObjectId; ids are validated (`400` on malformed). | both stores |
| Error handling (extra) | FK violation (`23503`) → 409, bad UUID (`22P02`) → 400, Mongo validator (code 121) → 400. The FK is **not** pre-checked in app code, so the DB is the enforcer. | `src/server.js` |
| Trade-off | Mongo has **no FK**: an unknown parent yields a 404 from `matchedCount = 0`, and integrity is the application's job. Embedded tasks make cross-project task queries (e.g. "all my tasks") harder than in SQL. | – |

## 5. QA test summary
Automated: `npm run qa` (prints PASS/FAIL per check, exits non-zero on failure). Manual items are demonstrated in the video.

| # | Check | SQL | Mongo | How verified |
|---|---|---|---|---|
| 1 | Create parent + child, joined/embedded read returns both in one call | ☐ | ☐ | qa.js + psql / mongosh |
| 2 | Update attribute, subsequent read reflects it | ☐ | ☐ | qa.js |
| 3 | Delete parent: children cascade (SQL) / doc removed (Mongo) | ☐ | ☐ | `SELECT count(*) FROM tasks WHERE project_id=…` → 0 |
| 4 | NEGATIVE: orphan task with invalid project id rejected | ☐ (409, FK error) | n/a (404) | qa.js + server log |
| 5 | Atomic embedded update / `$push` / `$pull` | n/a | ☐ | mongosh |
| 6 | UI responsive on desktop + mobile viewport; empty & long input handled | ☐ | ☐ | DevTools device toolbar |
| 7 | DevTools Network shows 200/201/400/404/409; terminal shows parameterized queries, no driver warnings | ☐ | ☐ | DevTools + terminal |

Tick the boxes after you've run everything on your machine.
