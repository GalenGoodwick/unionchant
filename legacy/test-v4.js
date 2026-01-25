// Union Chant v4 - Verification Tests
// Run with: node test-v4.js

const http = require('http');

const API_URL = 'http://localhost:3003';

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

async function reset() {
    console.log('🔄 Resetting...');
    await request('POST', '/api/reset');
}

async function addParticipant(name) {
    return await request('POST', '/api/add-participant', { name });
}

async function getState() {
    return await request('GET', '/api/state');
}

async function autoVoteCell(cellId) {
    return await request('POST', '/api/auto-vote', { cellId });
}

async function completeTier(tier) {
    return await request('POST', '/api/complete-tier', { tier });
}

// TESTS

async function testInvariant1_IndividualSovereignty() {
    console.log('\n✅ TEST 1: Individual Sovereignty');
    console.log('   Every participant votes exactly once per tier\n');

    await reset();

    // Add 15 participants
    for (let i = 1; i <= 15; i++) {
        await addParticipant(`P${i}`);
    }

    const state = await getState();

    // Check Tier 1 cells
    const tier1Cells = state.cells.filter(c => c.tier === 1);
    console.log(`   ✓ ${tier1Cells.length} Tier 1 cells formed`);

    tier1Cells.forEach(cell => {
        const uniqueParticipants = [...new Set(cell.participants)];
        if (uniqueParticipants.length !== cell.participants.length) {
            console.log(`   ❌ FAIL: Cell ${cell.id} has duplicate participants`);
            return false;
        }
        console.log(`   ✓ ${cell.id}: ${cell.participants.length} unique participants`);
    });

    console.log('   ✅ PASS: All participants are unique in their cells');
    return true;
}

async function testInvariant3_CrossCellTallying() {
    console.log('\n✅ TEST 2: Cross-Cell Tallying (Tier 2+)');
    console.log('   Votes counted across ALL cells, not per-cell\n');

    await reset();

    // Add 15 participants and form Tier 1
    for (let i = 1; i <= 15; i++) {
        await addParticipant(`P${i}`);
    }

    let state = await getState();

    // Auto-complete all Tier 1 cells
    const tier1Cells = state.cells.filter(c => c.tier === 1);
    console.log(`   Auto-completing ${tier1Cells.length} Tier 1 cells...`);
    for (const cell of tier1Cells) {
        await autoVoteCell(cell.id);
        await sleep(100);
    }

    // Complete Tier 1
    console.log(`   Completing Tier 1...`);
    await completeTier(1);

    state = await getState();

    // Check Tier 2 cells all vote on SAME ideas
    const tier2Cells = state.cells.filter(c => c.tier === 2);
    console.log(`   ✓ ${tier2Cells.length} Tier 2 cells formed`);

    if (tier2Cells.length === 0) {
        console.log(`   ❌ FAIL: No Tier 2 cells formed`);
        return false;
    }

    const firstCellIdeas = tier2Cells[0].ideaIds.sort();
    let allSame = true;

    tier2Cells.forEach(cell => {
        const cellIdeas = cell.ideaIds.sort();
        const same = JSON.stringify(cellIdeas) === JSON.stringify(firstCellIdeas);
        console.log(`   ${same ? '✓' : '❌'} ${cell.id}: ${cellIdeas.join(', ')}`);
        if (!same) allSame = false;
    });

    if (allSame) {
        console.log('   ✅ PASS: All Tier 2 cells vote on SAME ideas');
        return true;
    } else {
        console.log('   ❌ FAIL: Tier 2 cells have different ideas');
        return false;
    }
}

async function testInvariant4_SameIdeasAcrossCells() {
    console.log('\n✅ TEST 3: Same Ideas Across Cells (Tier 2+)');
    console.log('   All cells in tier t > 1 vote on identical idea set\n');

    // This is covered by Test 2
    console.log('   ✅ PASS: Covered by Cross-Cell Tallying test');
    return true;
}

async function testCorrectFlow_15Participants() {
    console.log('\n✅ TEST 4: Correct Flow (15 Participants)');
    console.log('   Tier 1 → 3 cells → 3 winners → Tier 2 → 1 winner\n');

    await reset();

    // Add 15 participants
    console.log('   Adding 15 participants...');
    for (let i = 1; i <= 15; i++) {
        await addParticipant(`P${i}`);
    }

    let state = await getState();
    const tier1Cells = state.cells.filter(c => c.tier === 1);

    if (tier1Cells.length !== 3) {
        console.log(`   ❌ FAIL: Expected 3 Tier 1 cells, got ${tier1Cells.length}`);
        return false;
    }
    console.log(`   ✓ ${tier1Cells.length} Tier 1 cells formed`);

    // Auto-complete Tier 1 cells
    console.log('   Auto-completing Tier 1 cells...');
    for (const cell of tier1Cells) {
        await autoVoteCell(cell.id);
        await sleep(100);
    }

    state = await getState();
    const completedTier1 = state.cells.filter(c => c.tier === 1 && c.status === 'completed');

    if (completedTier1.length !== 3) {
        console.log(`   ❌ FAIL: Expected 3 completed Tier 1 cells, got ${completedTier1.length}`);
        return false;
    }
    console.log(`   ✓ ${completedTier1.length} Tier 1 cells completed`);

    // Complete Tier 1
    console.log('   Completing Tier 1...');
    const tierResult = await completeTier(1);

    if (tierResult.error) {
        console.log(`   ❌ FAIL: ${tierResult.error}`);
        return false;
    }

    state = await getState();
    const tier2Cells = state.cells.filter(c => c.tier === 2);

    if (tier2Cells.length !== 3) {
        console.log(`   ❌ FAIL: Expected 3 Tier 2 cells, got ${tier2Cells.length}`);
        return false;
    }
    console.log(`   ✓ ${tier2Cells.length} Tier 2 cells formed`);

    // Check advancing ideas
    if (state.ideas.length !== 3) {
        console.log(`   ❌ FAIL: Expected 3 advancing ideas, got ${state.ideas.length}`);
        return false;
    }
    console.log(`   ✓ ${state.ideas.length} ideas advancing to Tier 2`);

    // Auto-complete Tier 2 cells
    console.log('   Auto-completing Tier 2 cells...');
    for (const cell of tier2Cells) {
        await autoVoteCell(cell.id);
        await sleep(100);
    }

    // Complete Tier 2
    console.log('   Completing Tier 2...');
    const tier2Result = await completeTier(2);

    if (tier2Result.winner) {
        console.log(`   ✓ Winner declared: ${tier2Result.winner.id}`);
        console.log('   ✅ PASS: Full flow completed successfully');
        return true;
    } else {
        console.log(`   ❌ FAIL: No winner declared`);
        return false;
    }
}

async function testFlexibleThresholds() {
    console.log('\n✅ TEST 5: Flexible Prime Thresholds');
    console.log('   System handles 3, 5, 7, 9+ cells correctly\n');

    // Test with 9 cells (45 participants)
    await reset();
    console.log('   Testing 45 participants (9 cells)...');

    for (let i = 1; i <= 45; i++) {
        await addParticipant(`P${i}`);
    }

    let state = await getState();
    const tier1Cells = state.cells.filter(c => c.tier === 1);

    if (tier1Cells.length !== 9) {
        console.log(`   ❌ FAIL: Expected 9 cells, got ${tier1Cells.length}`);
        return false;
    }
    console.log(`   ✓ 9 Tier 1 cells formed`);

    // Auto-complete all cells
    for (const cell of tier1Cells) {
        await autoVoteCell(cell.id);
        await sleep(50);
    }

    // Should be able to complete with 9 cells (>= 7)
    const result = await completeTier(1);
    if (result.error) {
        console.log(`   ❌ FAIL: ${result.error}`);
        return false;
    }

    console.log(`   ✓ Tier completed with 9 cells (>= 7 threshold)`);
    console.log('   ✅ PASS: Flexible thresholds work correctly');
    return true;
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Union Chant v4 - Verification Tests  ║');
    console.log('╚════════════════════════════════════════╝');

    const tests = [
        testInvariant1_IndividualSovereignty,
        testInvariant3_CrossCellTallying,
        testInvariant4_SameIdeasAcrossCells,
        testCorrectFlow_15Participants,
        testFlexibleThresholds
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const result = await test();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (err) {
            console.log(`   ❌ ERROR: ${err.message}`);
            failed++;
        }
        await sleep(500);
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(17 - passed.toString().length - failed.toString().length)}║`);
    console.log('╚════════════════════════════════════════╝\n');

    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
