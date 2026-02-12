#!/bin/bash
# Reset votes for Galen in a specific deliberation
# Usage: ./scripts/reset-votes.sh [deliberation_id]

DELIB_ID="${1:-cmliapy9v000ay6rq9pxmg7ff}"
USER_ID="cmkyz8jva000030rqzrxi0vqm"
DB_URL="postgresql://neondb_owner:npg_FlPID9ObQ6yn@ep-dawn-base-ahmiakdo-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

cd /Users/galengoodwick/Desktop/Union-Rolling/web

node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: '$DB_URL' });

async function main() {
  const userId = '$USER_ID';
  const delibId = '$DELIB_ID';

  const { rows: cells } = await pool.query('SELECT id FROM \"Cell\" WHERE \"deliberationId\" = \$1', [delibId]);
  const cellIds = cells.map(c => c.id);
  console.log('Cells:', cellIds.length);

  if (cellIds.length === 0) { console.log('No cells found.'); process.exit(0); }

  const v = await pool.query('DELETE FROM \"Vote\" WHERE \"userId\" = \$1 AND \"cellId\" = ANY(\$2)', [userId, cellIds]);
  console.log('Deleted votes:', v.rowCount);

  const p = await pool.query('DELETE FROM \"CellParticipation\" WHERE \"userId\" = \$1 AND \"cellId\" = ANY(\$2)', [userId, cellIds]);
  console.log('Deleted participations:', p.rowCount);

  console.log('Done.');
  await pool.end();
}
main();
"
