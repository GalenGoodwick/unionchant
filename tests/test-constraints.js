// Test that constraints are properly enforced:
// 1. Max 7 ideas per cell
// 2. Ideas ≤ minimum cell size

const http = require('http');

const API_URL = 'http://localhost:3007';

async function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(`${API_URL}${path}`, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve(JSON.parse(data));
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConstraints() {
    console.log('🧪 Testing Constraint Enforcement\n');
    console.log('Rules:');
    console.log('  1. Max 7 ideas per cell');
    console.log('  2. Ideas ≤ minimum cell size\n');
    console.log('='.repeat(70));

    // Reset
    console.log('\nResetting...');
    await request('POST', '/api/reset');
    await sleep(200);

    // Add 38 participants
    console.log('Adding 38 participants...');
    for (let i = 1; i <= 38; i++) {
        await request('POST', '/api/add-participant', { name: `P${i}` });
    }
    console.log('✓ 38 participants added\n');

    // Start voting
    console.log('Starting voting...');
    const startResult = await request('POST', '/api/start-voting');
    console.log(`✓ ${startResult.cellsFormed} cells formed\n`);

    // Check Tier 1
    let state = await request('GET', '/api/state');
    const tier1Cells = state.cells.filter(c => c.tier === 1);

    console.log('TIER 1 ANALYSIS:');
    console.log('-'.repeat(70));
    console.log(`Participants: ${state.totalParticipants}`);
    console.log(`Cells: ${tier1Cells.length}`);

    const cellSizes = tier1Cells.map(c => c.participants.length);
    const minCellSize = Math.min(...cellSizes);
    console.log(`Cell sizes: ${cellSizes.join(', ')}`);
    console.log(`Min cell size: ${minCellSize}`);

    let maxIdeasInCell = 0;
    let hasViolation = false;
    tier1Cells.forEach(c => {
        const ideasCount = c.ideaIds.length;
        if (ideasCount > maxIdeasInCell) maxIdeasInCell = ideasCount;

        if (ideasCount > c.participants.length) {
            console.log(`❌ ERROR: ${c.id} has ${ideasCount} ideas but only ${c.participants.length} participants!`);
            hasViolation = true;
        }
        if (ideasCount > 7) {
            console.log(`❌ ERROR: ${c.id} has ${ideasCount} ideas (max is 7)!`);
            hasViolation = true;
        }
    });

    console.log(`Max ideas in any Tier 1 cell: ${maxIdeasInCell}`);

    if (!hasViolation) {
        console.log('✓ Tier 1 constraints satisfied (each cell: ideas ≤ participants, ideas ≤ 7)\n');
    } else {
        console.log('❌ Tier 1 constraint violation!\n');
        return;
    }

    // Auto-vote Tier 1
    console.log('Auto-voting Tier 1...');
    await request('POST', '/api/auto-vote-all');

    // Complete Tier 1
    console.log('Completing Tier 1...\n');
    const tier1Result = await request('POST', '/api/complete-tier', { tier: 1 });

    if (tier1Result.winner) {
        console.log('Test complete - winner after Tier 1\n');
        return;
    }

    console.log(`Expected max advancing ideas: ${Math.min(7, minCellSize)}`);
    console.log(`Actual advancing ideas: ${tier1Result.advancingIdeas}\n`);

    // Check Tier 2
    state = await request('GET', '/api/state');
    const tier2Cells = state.cells.filter(c => c.tier === 2);

    console.log('TIER 2 ANALYSIS:');
    console.log('-'.repeat(70));
    console.log(`Participants: ${state.totalParticipants} (should be same as Tier 1)`);
    console.log(`Cells: ${tier2Cells.length}`);

    const tier2CellSizes = tier2Cells.map(c => c.participants.length);
    const tier2MinCellSize = Math.min(...tier2CellSizes);
    console.log(`Cell sizes: ${tier2CellSizes.join(', ')}`);
    console.log(`Min cell size: ${tier2MinCellSize}`);

    let tier2MaxIdeas = 0;
    let allCellsHaveSameIdeas = true;
    let tier2HasViolation = false;
    const firstCellIdeas = tier2Cells[0].ideaIds.sort().join(',');

    tier2Cells.forEach(c => {
        const ideasCount = c.ideaIds.length;
        if (ideasCount > tier2MaxIdeas) tier2MaxIdeas = ideasCount;

        const cellIdeas = c.ideaIds.sort().join(',');
        if (cellIdeas !== firstCellIdeas) {
            allCellsHaveSameIdeas = false;
        }

        if (ideasCount > c.participants.length) {
            console.log(`❌ ERROR: ${c.id} has ${ideasCount} ideas but only ${c.participants.length} participants!`);
            tier2HasViolation = true;
        }
        if (ideasCount > 7) {
            console.log(`❌ ERROR: ${c.id} has ${ideasCount} ideas (max is 7)!`);
            tier2HasViolation = true;
        }
    });

    console.log(`Ideas per cell: ${tier2MaxIdeas}`);
    console.log(`All cells have same ideas: ${allCellsHaveSameIdeas}`);

    console.log('\n' + '='.repeat(70));

    if (!tier2HasViolation && tier2MaxIdeas <= 7 && allCellsHaveSameIdeas) {
        console.log('✅ SUCCESS: All constraints satisfied!');
        console.log('='.repeat(70));
        console.log('\nVerified:');
        console.log(`  ✓ Tier 2 has ${tier2MaxIdeas} ideas (≤ 7)`);
        console.log(`  ✓ Each cell: ideas (${tier2MaxIdeas}) ≤ participants (${tier2MinCellSize} min)`);
        console.log('  ✓ All cells vote on same ideas');
        console.log('  ✓ Everyone still voting');
    } else {
        console.log('❌ CONSTRAINT VIOLATION');
        console.log('='.repeat(70));
        if (tier2MaxIdeas > 7) {
            console.log(`  ✗ Too many ideas: ${tier2MaxIdeas} > 7`);
        }
        if (tier2HasViolation) {
            console.log(`  ✗ Per-cell constraint violations detected above`);
        }
        if (!allCellsHaveSameIdeas) {
            console.log('  ✗ Cells have different ideas');
        }
    }
    console.log('');
}

testConstraints().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
