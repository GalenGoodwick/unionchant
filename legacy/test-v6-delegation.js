// Union Chant v6 - Delegation Model Tests

const http = require('http');

const API_URL = 'http://localhost:3006';

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

async function startVoting() {
    return await request('POST', '/api/start-voting');
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

async function testBasicDelegation() {
    console.log('\n✅ TEST 1: Basic Delegation (15 Participants)');
    console.log('   Everyone votes in Tier 1, winners become delegates\n');

    await reset();

    // Add 15 participants
    for (let i = 1; i <= 15; i++) {
        await addParticipant(`P${i}`);
    }

    await startVoting();
    let state = await getState();

    // Verify Tier 1
    const tier1Cells = state.cells.filter(c => c.tier === 1);
    console.log(`   Tier 1: ${tier1Cells.length} cells`);

    // Check that all 15 participants are in Tier 1 cells
    const tier1Participants = new Set();
    tier1Cells.forEach(cell => {
        cell.participants.forEach(p => tier1Participants.add(p));
    });

    if (tier1Participants.size !== 15) {
        console.log(`   ❌ FAIL: Expected 15 participants, got ${tier1Participants.size}`);
        return false;
    }
    console.log(`   ✓ All 15 participants in Tier 1 cells`);

    // Auto-complete Tier 1
    for (const cell of tier1Cells) {
        await autoVoteCell(cell.id);
        await sleep(50);
    }

    state = await getState();
    const tier1Winners = state.ideas.filter(i => i.tier === 1 && i.status === 'winner');
    console.log(`   ✓ ${tier1Winners.length} winners from Tier 1`);

    // Complete Tier 1
    await completeTier(1);
    state = await getState();

    // Verify Tier 2
    const tier2Cells = state.cells.filter(c => c.tier === 2);
    console.log(`   Tier 2: ${tier2Cells.length} cells`);

    // Count Tier 2 participants (should be only delegates)
    const tier2Participants = new Set();
    tier2Cells.forEach(cell => {
        cell.participants.forEach(p => tier2Participants.add(p));
    });

    console.log(`   ✓ ${tier2Participants.size} delegates in Tier 2 (${((tier2Participants.size / 15) * 100).toFixed(0)}% of population)`);

    if (tier2Participants.size > 15) {
        console.log(`   ❌ FAIL: More Tier 2 participants than original population`);
        return false;
    }

    if (tier2Participants.size === 0) {
        console.log(`   ❌ FAIL: No delegates in Tier 2`);
        return false;
    }

    console.log('   ✅ PASS: Delegation working correctly\n');
    return true;
}

async function testMultiTierDelegation() {
    console.log('\n✅ TEST 2: Multi-Tier Delegation (100 Participants)');
    console.log('   Verify logarithmic reduction through tiers\n');

    await reset();

    // Add 100 participants
    console.log('   Adding 100 participants...');
    for (let i = 1; i <= 100; i++) {
        await addParticipant(`P${i}`);
    }

    await startVoting();
    let state = await getState();

    const tierStats = [];

    // Tier 1
    let tierCells = state.cells.filter(c => c.tier === 1);
    let tierParticipants = new Set();
    tierCells.forEach(c => c.participants.forEach(p => tierParticipants.add(p)));

    tierStats.push({
        tier: 1,
        cells: tierCells.length,
        participants: tierParticipants.size,
        participationPercent: (tierParticipants.size / 100 * 100).toFixed(0)
    });

    console.log(`   Tier 1: ${tierCells.length} cells, ${tierParticipants.size} participants (${tierStats[0].participationPercent}%)`);

    // Auto-complete and advance through tiers
    let currentTier = 1;
    let maxTiers = 10;

    while (currentTier <= maxTiers) {
        tierCells = state.cells.filter(c => c.tier === currentTier && c.status !== 'completed');

        if (tierCells.length === 0) break;

        // Auto-complete all cells in this tier
        for (const cell of tierCells) {
            await autoVoteCell(cell.id);
            await sleep(20);
        }

        // Complete tier
        const result = await completeTier(currentTier);

        if (result.winner) {
            console.log(`   🏆 Winner declared at Tier ${currentTier}`);
            break;
        }

        currentTier++;
        state = await getState();

        // Get next tier stats
        tierCells = state.cells.filter(c => c.tier === currentTier);
        if (tierCells.length > 0) {
            tierParticipants = new Set();
            tierCells.forEach(c => c.participants.forEach(p => tierParticipants.add(p)));

            tierStats.push({
                tier: currentTier,
                cells: tierCells.length,
                participants: tierParticipants.size,
                participationPercent: (tierParticipants.size / 100 * 100).toFixed(2)
            });

            console.log(`   Tier ${currentTier}: ${tierCells.length} cells, ${tierParticipants.size} participants (${tierStats[currentTier - 1].participationPercent}%)`);
        }
    }

    console.log('\n   Tier progression summary:');
    tierStats.forEach(t => {
        console.log(`     Tier ${t.tier}: ${t.participants} participants → ${t.cells} cells`);
    });

    // Verify logarithmic reduction
    if (tierStats.length < 2) {
        console.log('   ❌ FAIL: Not enough tiers to verify reduction');
        return false;
    }

    const reductionFactors = [];
    for (let i = 1; i < tierStats.length; i++) {
        const factor = tierStats[i - 1].participants / tierStats[i].participants;
        reductionFactors.push(factor);
    }

    const avgReduction = reductionFactors.reduce((a, b) => a + b, 0) / reductionFactors.length;
    console.log(`\n   Average reduction per tier: 1/${avgReduction.toFixed(1)} (~${((1 - 1/avgReduction) * 100).toFixed(0)}% reduction)`);

    if (avgReduction < 3 || avgReduction > 10) {
        console.log('   ❌ FAIL: Reduction factor out of expected range (3-10)');
        return false;
    }

    console.log('   ✅ PASS: Logarithmic reduction verified\n');
    return true;
}

async function testSmallGroupVoting() {
    console.log('\n✅ TEST 3: Small Group Voting');
    console.log('   Verify cell sizes always 3-7, ideas per cell ~5\n');

    await reset();

    // Add 47 participants (should create interesting distribution)
    for (let i = 1; i <= 47; i++) {
        await addParticipant(`P${i}`);
    }

    await startVoting();
    const state = await getState();

    const tier1Cells = state.cells.filter(c => c.tier === 1);

    console.log(`   Tier 1: ${tier1Cells.length} cells`);

    let invalidCells = [];

    tier1Cells.forEach(cell => {
        const cellSize = cell.participants.length;
        const ideasCount = cell.ideaIds.length;

        console.log(`   ${cell.id}: ${cellSize} participants, ${ideasCount} ideas`);

        if (cellSize < 3 || cellSize > 7) {
            invalidCells.push({ cell: cell.id, size: cellSize, reason: 'participants out of range' });
        }

        if (ideasCount < 3 || ideasCount > 7) {
            invalidCells.push({ cell: cell.id, ideas: ideasCount, reason: 'ideas out of range' });
        }
    });

    if (invalidCells.length > 0) {
        console.log('   ❌ FAIL: Invalid cell sizes detected:');
        invalidCells.forEach(i => console.log(`     ${i.cell}: ${i.reason}`));
        return false;
    }

    console.log('   ✅ PASS: All cells have 3-7 participants and ideas\n');
    return true;
}

async function testDifferentIdeasPerCell() {
    console.log('\n✅ TEST 4: Different Ideas Per Cell');
    console.log('   Verify each cell votes on different ideas\n');

    await reset();

    for (let i = 1; i <= 25; i++) {
        await addParticipant(`P${i}`);
    }

    await startVoting();
    const state = await getState();

    const tier1Cells = state.cells.filter(c => c.tier === 1);

    console.log(`   Tier 1: ${tier1Cells.length} cells`);

    // Check for idea overlap between cells
    const allIdeas = new Set();
    let overlaps = 0;

    tier1Cells.forEach(cell => {
        cell.ideaIds.forEach(ideaId => {
            if (allIdeas.has(ideaId)) {
                overlaps++;
                console.log(`   ⚠️  ${ideaId} appears in multiple cells`);
            }
            allIdeas.add(ideaId);
        });
    });

    if (overlaps > 0) {
        console.log(`   ❌ FAIL: Found ${overlaps} idea overlaps between cells`);
        return false;
    }

    console.log(`   ✓ All ${allIdeas.size} ideas distributed uniquely`);
    console.log('   ✅ PASS: Different ideas per cell\n');
    return true;
}

async function testScalability() {
    console.log('\n✅ TEST 5: Scalability (1000 Participants)');
    console.log('   Verify system handles large scale\n');

    await reset();

    console.log('   Adding 1000 participants...');
    for (let i = 1; i <= 1000; i++) {
        await addParticipant(`P${i}`);
        if (i % 100 === 0) {
            console.log(`     ${i}/1000 added`);
        }
    }

    console.log('   Starting voting...');
    await startVoting();
    const state = await getState();

    const tier1Cells = state.cells.filter(c => c.tier === 1);

    console.log(`   Tier 1: ${tier1Cells.length} cells formed`);
    console.log(`   Expected tiers to reach winner: ~${Math.ceil(Math.log(1000) / Math.log(5))} tiers`);

    if (tier1Cells.length === 0) {
        console.log('   ❌ FAIL: No cells formed');
        return false;
    }

    // Check cell sizes
    const cellSizes = tier1Cells.map(c => c.participants.length);
    const minSize = Math.min(...cellSizes);
    const maxSize = Math.max(...cellSizes);

    console.log(`   Cell sizes: min=${minSize}, max=${maxSize}`);

    if (minSize < 3 || maxSize > 7) {
        console.log('   ❌ FAIL: Cell sizes out of range');
        return false;
    }

    console.log('   ✅ PASS: System handles 1000 participants\n');
    return true;
}

async function runAllTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Union Chant v6 - Delegation Tests   ║');
    console.log('╚════════════════════════════════════════╝');

    const tests = [
        testBasicDelegation,
        testMultiTierDelegation,
        testSmallGroupVoting,
        testDifferentIdeasPerCell,
        testScalability
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
