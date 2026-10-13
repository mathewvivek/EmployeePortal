import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));
const schema = JSON.parse(await readFile(`${directory}EmployeePortal-Database-Schema.json`, 'utf8'));
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const tables = new Map(schema.tables.map((table) => [table.name, table]));
const descriptions = {
  employees: ['Current employee directory and annual base salary.', 'employee_id is a unique business identifier, not a foreign key. Department, country and designation are strings, not separate lookup tables. Future effective dates and zero salaries are valid.'],
  salary_changes: ['Old/new compensation values for confirmed salary changes.', 'Salary updates and history insertion happen in one locked transaction. Persisted history is read-only through Rails, not through a database trigger. There is no changed_by user column. Initial salaries need not have a history row.'],
  users: ['HR authentication identities, separate from payroll employees.', 'Rails normalizes emails and uses bcrypt password digests. The schema allows multiple unique-email users; the application currently seeds one HR user. Only superadmin is supported. The email index is not case-insensitive by itself.'],
  sessions: ['Server-side records for authenticated bearer sessions.', 'Only SHA-256 token digests are stored, not raw bearer tokens. Rails issues eight-hour sessions and checks user activity and expiry. Changing a password or activity status revokes sessions through application logic.'],
  salary_data_quality_scans: ['Manual salary-check runs, authors, timings and aggregate counters.', 'Counters default to zero. The scan service uses batched reads and a transaction advisory lock. It does not edit employees. Scan counters are historical summaries; there is no per-scan finding-membership join table.'],
  salary_data_anomalies: ['Persisted flags, detection evidence and the latest HR review state.', 'The fingerprint uniquely identifies matching evidence. JSONB stores the employee snapshot, observed values and reference thresholds. last_seen_scan_id points to the most recent scan detecting this evidence. Reviewed and cleared timestamps are optional.'],
  salary_data_anomaly_reviews: ['Append-only HR review decisions and notes for each finding.', 'Rails requires notes for confirmed_error and legitimate and limits notes to 2,000 characters. Persisted reviews are read-only through Rails; SQL can still change them. The anomaly row caches the latest decision while this table keeps the audit trail.'],
};
const checkMeaning = {
  employees_nonnegative_salary: 'base_salary must be nonnegative.',
  employees_supported_currency: 'currency must be INR, USD, GBP, EUR or JPY.',
  employees_supported_status: 'status must be active or inactive.',
  salary_changes_nonnegative_salaries: 'Old and new salary amounts must both be nonnegative.',
  salary_changes_supported_currencies: 'Both old and new currency must be INR, USD, GBP, EUR or JPY.',
  users_superadmin_role: 'role must be superadmin.',
  salary_anomalies_review_status: 'review_status must be pending, investigating, confirmed_error or legitimate.',
  salary_anomalies_severity: 'severity must be warning or info.',
  salary_anomaly_reviews_status: 'status must be pending, investigating, confirmed_error or legitimate.',
};
const relationships = [
  ['users', 'sessions', 'user_id'],
  ['users', 'salary_data_quality_scans', 'requested_by_id'],
  ['users', 'salary_data_anomalies', 'reviewed_by_id'],
  ['users', 'salary_data_anomaly_reviews', 'reviewed_by_id'],
  ['employees', 'salary_changes', 'employee_id'],
  ['employees', 'salary_data_anomalies', 'employee_id'],
  ['salary_data_quality_scans', 'salary_data_anomalies', 'last_seen_scan_id'],
  ['salary_data_anomalies', 'salary_data_anomaly_reviews', 'salary_data_anomaly_id'],
];
assert.equal(schema.tables.length, 7);
assert.equal(schema.tables.reduce((count, table) => count + table.foreign_keys.length, 0), relationships.length);
for (const [parent, child, column] of relationships) {
  assert.ok(tables.get(child).foreign_keys.some((fk) => fk.column === column && fk.to_table === parent));
}
const optional = (child, column) => tables.get(child).columns.find((field) => field.name === column).nullable;
const keys = (table, column) => [
  column.name === table.primary_key && 'PK',
  table.foreign_keys.some((fk) => fk.column === column.name) && 'FK',
  table.indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0] === column.name) && 'UQ',
].filter(Boolean).join(' / ') || '-';
const shortType = (type) => type.replace('character varying', 'varchar').replace(' without time zone', '');
const defaults = (column) => column.default_function ? 'Sequence-generated' : column.default === null ? '-' : column.default;

const nodes = [
  ['users', 40, 80, 400, ['id', 'email', 'password_digest', 'role', 'active']],
  ['sessions', 670, 80, 400, ['id', 'user_id', 'token_digest', 'expires_at']],
  ['salary_data_quality_scans', 1240, 80, 440, ['id', 'requested_by_id', 'started_at', 'completed_at']],
  ['employees', 40, 430, 400, ['id', 'employee_id', 'base_salary', 'currency', 'effective_date']],
  ['salary_changes', 40, 840, 400, ['id', 'employee_id', 'old_base_salary', 'new_base_salary']],
  ['salary_data_anomalies', 670, 430, 400, ['id', 'employee_id', 'last_seen_scan_id', 'reviewed_by_id', 'fingerprint', 'review_status']],
  ['salary_data_anomaly_reviews', 1240, 650, 440, ['id', 'salary_data_anomaly_id', 'reviewed_by_id', 'status', 'notes']],
];
const paths = [
  ['M440 160 H670', 535, 146],
  ['M240 80 V30 H1450 V80', 830, 22],
  ['M440 220 H560 V480 H670', 573, 340],
  ['M390 312 V360 H1710 V725 H1680', 1190, 350],
  ['M240 662 V840', 252, 757],
  ['M440 545 H670', 536, 532],
  ['M1340 280 V400 H870 V430', 1110, 390],
  ['M1070 640 H1155 V725 H1240', 1167, 695],
];
const diagram = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1750 1090" role="img" aria-labelledby="title desc">
<title id="title">Employee Portal database entity relationships</title><desc id="desc">Seven PostgreSQL application tables linked by eight foreign keys. Arrows run from parent to child; relationship three has an optional parent.</desc>
<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="#526477"/></marker></defs>
<rect width="1750" height="1090" fill="white"/>
${paths.map(([path, x, y], index) => `<path d="${path}" fill="none" stroke="#526477" stroke-width="3" marker-end="url(#arrow)"/><text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="#344b62">R${index + 1}${index === 2 ? ' (optional)' : ''}</text>`).join('')}
${nodes.map(([name, x, y, width, fields]) => {
  const table = tables.get(name);
  const height = 72 + fields.length * 32;
  const fill = name === 'users' || name === 'sessions' ? '#edf0fa' : name.startsWith('salary_data') ? '#fff4e4' : '#e8f4ee';
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="white" stroke="#b2c1cb" stroke-width="2"/><path d="M${x + 6} ${y} H${x + width - 6} Q${x + width} ${y} ${x + width} ${y + 6} V${y + 50} H${x} V${y + 6} Q${x} ${y} ${x + 6} ${y}" fill="${fill}"/><text x="${x + 16}" y="${y + 33}" font-size="22" font-weight="bold" font-family="monospace" fill="#23394d">${name}</text>${fields.map((field, index) => { const column = table.columns.find((item) => item.name === field); return `<text x="${x + 16}" y="${y + 80 + index * 32}" font-family="monospace" font-size="21" fill="#23394d">${escape(keys(table, column).replace(' / ', '+').padEnd(4))} ${field}${column.nullable ? ' ?' : ''}</text>`; }).join('')}</g>`;
}).join('')}
</svg>`;
await writeFile(`${directory}EmployeePortal-Database-ERD.svg`, diagram);
const mermaid = ['erDiagram', ...relationships.map(([parent, child, column]) => `    ${parent} ${optional(child, column) ? '|o' : '||'}--o{ ${child} : "${column}"`), ...schema.tables.map((table) => `    ${table.name} {\n${table.columns.map((column) => `        ${column.type.startsWith('numeric') ? 'decimal' : column.type.startsWith('timestamp') ? 'datetime' : column.type === 'character varying' ? 'string' : column.type} ${column.name}${keys(table, column) === '-' ? '' : ' ' + keys(table, column).replaceAll('UQ', 'UK').replaceAll(' / ', ', ')}`).join('\n')}\n    }`)].join('\n');
await writeFile(`${directory}EmployeePortal-Database-ERD.mmd`, `${mermaid}\n`);

const pages = [];
const page = (title, body, landscape = false) => pages.push({ title, body, landscape });
page('Employee Portal Database ERD', `<p>PostgreSQL | Schema version <code>${schema.schema_version}</code> | ${schema.generated_on}</p><div class="diagram">${diagram}</div><p class="small">Key fields are shown above; full column definitions follow. PK = primary key, FK = foreign key, UQ = unique index, ? = nullable. Arrows point from parent to child; labels R1-R8 refer to the relationship dictionary on page 2.</p>`, true);
page('Schema Overview and Relationships', `<div class="stats"><div><strong>${schema.tables.length}</strong>Application tables</div><div><strong>${schema.tables.reduce((n, t) => n + t.columns.length, 0)}</strong>Columns</div><div><strong>${relationships.length}</strong>Foreign keys</div><div><strong>${schema.tables.reduce((n, t) => n + t.indexes.length, 0)}</strong>Secondary indexes</div></div>
<p>This report documents <code>Backend/db/schema.rb</code>, verified against local development metadata on ${schema.generated_on}. No employee records, password hashes, tokens or connection credentials were read or included. It does not certify the production database state.</p>
<h2>Relationship Dictionary</h2><table><thead><tr><th>Ref.</th><th>Parent</th><th>Child / Foreign Key</th><th>Child Requires Parent?</th></tr></thead><tbody>${relationships.map(([parent, child, column], index) => `<tr><td>R${index + 1}</td><td><code>${parent}.id</code></td><td><code>${child}.${column}</code></td><td>${optional(child, column) ? 'No: 0 or 1 parent' : 'Yes: exactly 1 parent'}</td></tr>`).join('')}</tbody></table>
<p>Every parent can have zero or many children. No foreign key is unique, so none of these relationships is one-to-one. <code>salary_data_anomalies.reviewed_by_id</code> is the only nullable foreign key.</p>
<h2>Scope and Identity</h2><ul><li>Every application table has a sequence-generated <code>bigint id</code> primary key and required <code>created_at</code> / <code>updated_at</code> timestamps.</li><li><code>employees.employee_id</code> is a string business ID. Other tables' numeric <code>employee_id</code> foreign keys reference <code>employees.id</code>, not that business ID.</li><li>Framework bookkeeping tables <code>schema_migrations</code> and <code>ar_internal_metadata</code> are excluded from the seven-table count. Rails model <code>Compensation</code> is not a persisted table.</li><li>This is the primary application schema. Production configuration also names cache, queue and cable databases; their schemas are not covered here.</li></ul>`);
for (const table of schema.tables) {
  const foreign = (column) => table.foreign_keys.find((fk) => fk.column === column.name);
  const dictionary = `<p class="lead">${descriptions[table.name][0]}</p>
<table class="columns"><thead><tr><th>Column</th><th>SQL Type</th><th>NULL?</th><th>Default</th><th>Key / Reference</th></tr></thead><tbody>${table.columns.map((column) => `<tr><td><code>${column.name}</code></td><td><code>${shortType(column.type)}</code></td><td>${column.nullable ? 'Yes' : 'No'}</td><td><code>${escape(defaults(column))}</code></td><td><strong>${keys(table, column)}</strong>${foreign(column) ? `<small>${foreign(column).to_table}.id</small>` : ''}</td></tr>`).join('')}</tbody></table>
<p class="small muted">SQL type aliases: varchar = character varying; timestamp(6) = timestamp(6) without time zone. A dash under Default means no declared default, not that NULL is permitted. Sequence-generated IDs use PostgreSQL nextval defaults.</p>`;
  const details = `<h2>Indexes</h2><ul class="indexes">${table.indexes.map((index) => `<li><code>${index.name}</code><span>${index.unique ? 'Unique' : 'Non-unique'} ${index.using} (${index.columns.join(', ')})${index.where ? ` WHERE ${escape(index.where)}` : ''}</span></li>`).join('')}</ul>
<h2>Database Checks</h2>${table.checks.length ? `<ul class="checks">${table.checks.map((check) => `<li><code>${check.name}</code><span>${checkMeaning[check.name]}</span></li>`).join('')}</ul>` : '<p>No CHECK constraints declared for this table.</p>'}
<h2>Application Behavior</h2><p>${descriptions[table.name][1]}</p>`;
  if (table.name === 'salary_data_anomalies') {
    page(table.name, dictionary + '<p>Indexes, constraints and review-state behavior continue on the next page.</p>');
    page('salary_data_anomalies: Supporting Details', details);
  } else {
    page(table.name, dictionary + details);
  }
}
page('Database Guarantees and Operating Notes', `<h2>Enforced by PostgreSQL</h2><ul><li>Seven primary keys, eight foreign keys and ${schema.tables.reduce((n, t) => n + t.checks.length, 0)} CHECK constraints. There are 19 secondary indexes, four unique, in addition to the seven primary-key indexes.</li><li>Unique secondary indexes protect employee business IDs, user emails, bearer token digests and anomaly fingerprints.</li><li>Annual salary amounts use exact <code>numeric(18,2)</code>: up to 16 integer digits and two decimal digits. Supported currencies are INR, USD, GBP, EUR and JPY. Monetary aggregates never combine currencies.</li><li>Dates use PostgreSQL <code>date</code>. Timestamps use <code>timestamp(6) without time zone</code>; Rails manages application time interpretation. JSONB evidence defaults to an empty object and is required, but has no database-level JSON shape constraint.</li><li>All eight foreign keys have default NO ACTION behavior for deletes and updates: no database ON DELETE CASCADE is declared.</li></ul>
<h2>Enforced by Rails, Not Database Triggers</h2><ul><li>Required strings must be nonblank; NULL constraints alone do not reject whitespace. Email normalization and format checks run in Rails.</li><li>Salary changes require explicit confirmation. Employee updates and their history rows are written atomically while locking the employee.</li><li>Salary history and anomaly review records are read-only once persisted through Active Record. Direct SQL can bypass this application safeguard.</li><li>Review notes are required for Confirmed error and Legitimate, and are limited to 2,000 characters. Those conditional requirements are not SQL constraints.</li><li>Deleting an employee with history/findings, or a finding with reviews, is restricted by model associations. User deletion destroys sessions through Rails; audit foreign keys can still prevent deleting that user.</li></ul>
<h2>Data-Quality Lifecycle</h2><p>A scan writes summary counters and fingerprints matching findings. Unchanged reruns retain the existing finding and HR decision. Changed evidence creates a new Pending finding; cleared evidence stays stored with <code>active=false</code> and <code>cleared_at</code>. HR decisions append review events, and the finding caches the latest reviewer, notes and status. Scans never automatically alter salary.</p>
<h2>Deployment and Sources</h2><p>Latest migration: <code>20261013000004_create_salary_data_quality_reviews.rb</code>. Apply migrations before deploying code that queries the review tables. The schema report includes these local changes; deployment is separate. See <code>Backend/db/schema.rb</code>, <code>Backend/db/migrate/</code>, <code>Backend/app/models/</code> and the salary-update/check/review services.</p><p class="small muted">The adjacent JSON preserves exact PostgreSQL types, index definitions, foreign keys, default expressions and CHECK expressions. The SVG and Mermaid files are editable ERD sources. This report contains structure only, not live employee counts or private data.</p>`);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Employee Portal Database Schema</title><style>
@page { size: A4; margin: 0; } @page erd { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; } body { margin: 0; color: #263a48; font: 12px/1.5 Arial,sans-serif; background: white; }
.page { width: 210mm; height: 297mm; padding: 14mm 16mm 12mm; display: flex; flex-direction: column; break-after: page; }
.page:last-child { break-after: auto; } .landscape { width: 297mm; height: 210mm; page: erd; padding: 10mm 14mm; }
header { display: flex; justify-content: space-between; font-size: 10px; border-bottom: 2px solid #277964; padding-bottom: 9px; margin-bottom: 18px; color: #5e727e; }
h1 { margin: 0 0 10px; font-size: 23px; line-height: 1.3; overflow-wrap: anywhere; } h2 { font-size: 13px; margin: 12px 0 8px; }
p { margin: 0 0 10px; } .lead { font-size: 13px; } .small { font-size: 10px; } .muted { color: #607583; }
table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 8px 0 12px; } th { text-align: left; background: #eaf2ef; color: #315e50; padding: 8px 7px; } td { padding: 6px 7px; border-bottom: 1px solid #dce5e9; vertical-align: top; } tr { break-inside: avoid; }
code { font: 10px/1.5 Menlo,Consolas,monospace; overflow-wrap: anywhere; } small { display: block; font-size: 9px; color: #607583; overflow-wrap: anywhere; }
.columns td:first-child { width: 31%; } .columns td:nth-child(2) { width: 20%; } .columns td:nth-child(3) { white-space: nowrap; } .columns td:last-child { width: 23%; }
ul { margin: 0 0 8px; padding-left: 18px; } li { margin-bottom: 7px; } .indexes,.checks { list-style: none; padding: 0; font-size: 10.5px; } .indexes li,.checks li { margin-bottom: 7px; } .indexes span,.checks span { display: block; color: #607583; }
.stats { display: grid; grid-template-columns: repeat(4,1fr); padding: 17px 0; margin: 4px 0 18px; border-top: 1px solid #dce5e9; border-bottom: 1px solid #dce5e9; font-size: 10px; } .stats strong { display: block; font-size: 27px; color: #277964; }
.diagram { height: 510px; margin: 0 0 12px; } .diagram svg { width: 100%; height: 100%; }
footer { display: flex; justify-content: space-between; margin-top: auto; padding-top: 10px; border-top: 1px solid #dce5e9; font-size: 9px; color: #607583; }
</style></head><body>${pages.map((item, index) => `<section class="page${item.landscape ? ' landscape' : ''}"><header><strong>Employee Portal</strong><span>Database Schema | ${schema.generated_on}</span></header><h1>${item.title}</h1>${item.body}<footer><span>Schema ${schema.schema_version} | Structure only, no private records</span><span>${index + 1} / ${pages.length}</span></footer></section>`).join('')}</body></html>`;
await writeFile(`${directory}EmployeePortal-Database-Schema.html`, html);
console.log(`Generated ERD and schema document: ${schema.tables.length} tables, ${relationships.length} foreign keys, ${pages.length} pages.`);
if (process.argv.includes('--pdf')) {
  const { chromium } = await import('../Frontend/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ channel: process.platform === 'darwin' ? 'chrome' : undefined, headless: true });
  try {
    const tab = await browser.newPage();
    await tab.goto(new URL('EmployeePortal-Database-Schema.html', import.meta.url).href);
    await tab.emulateMedia({ media: 'print' });
    await tab.evaluate(() => document.fonts.ready);
    const measurements = await tab.locator('.page').evaluateAll((elements) => elements.map((element, index) => ({
      page: index + 1, overflow: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1,
    })));
    assert.ok(measurements.every((item) => !item.overflow), JSON.stringify(measurements));
    await tab.pdf({ path: `${directory}EmployeePortal-Database-Schema.pdf`, printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    console.log(`PDF generated; all ${pages.length} pages fit without overflow.`);
  } finally { await browser.close(); }
}
