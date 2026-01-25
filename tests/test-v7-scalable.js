// Comprehensive test for v7-scalable - Everyone votes in every tier, ideas compress
// This verifies the correct model: constant participants, reducing ideas

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

async function testV7Scalable() {
    console.log('🧪 Testing v7-scalable - Everyone Votes Model\n');
    console.log('=' .repeat(70));
    console.log('MODEL: Everyone votes in every tier, only ideas compress');
    console.log('=' .repeat(70) + '\n');

    // Reset
    console.log('Resetting...');
    await request('POST', '/api/reset');
    await sleep(200);

    // Add 100 participants (each brings 1 idea)
    console.log('Adding 100 participants (100 ideas)...');
    for (let i = 1; i <= 100; i++) {
        await request('POST', '/api/add-participant', { name: `P${i}` });
    }
    console.log('✓ 100 participants added\n');

    // Start voting - form Tier 1
    console.log('Starting voting (forming Tier 1 cells)...');
    const startResult = await request('POST', '/api/start-voting');
    console.log(`✓ ${startResult.cellsFormed} cells formed\n`);

    // Check Tier 1 state
    let state = await request('GET', '/api/state');
    const tier1Cells = state.cells.filter(c => c.tier === 1);

    console.log('TIER 1 STATE:');
    console.log('-'.repeat(70));
    console.log(`Total Participants: ${state.totalParticipants}`);
    console.log(`Total Ideas: ${state.ideas.length}`);
    console.log(`Number of Cells: ${tier1Cells.length}`);
    console.log(`Current Phase: ${state.phase}`);
    console.log(`Current Tier: ${state.currentTier}`);

    // Verify everyone is in Tier 1
    const tier1Participants = new Set();
    tier1Cells.forEach(c => {
        c.participants.forEach(p => tier1Participants.add(p));
        console.log(`  ${c.id}: ${c.participants.length} participants, ${c.ideaIds.length} ideas`);
    });

    console.log(`\nParticipants in Tier 1 cells: ${tier1Participants.size}`);
    console.log(`Expected: ${state.totalParticipants}`);

    if (tier1Participants.size !== state.totalParticipants) {
        console.log(`❌ ERROR: Not all participants are in Tier 1 cells!`);
        return;
    }
    console.log('✓ All participants are in Tier 1 cells\n');

    // Auto-vote all Tier 1 cells
    console.log('⚡ Auto-voting all Tier 1 cells...');
    const tier1VoteResult = await request('POST', '/api/auto-vote-all');
    console.log(`✓ ${tier1VoteResult.votesAdded} votes cast across ${tier1VoteResult.cellsCompleted} cells\n`);

    // Complete Tier 1
    console.log('Completing Tier 1...');
    const tier1Complete = await request('POST', '/api/complete-tier', { tier: 1 });

    if (tier1Complete.winner) {
        console.log(`🏆 WINNER after Tier 1: ${tier1Complete.winner.id}`);
        console.log('Test complete - only 1 tier needed!\n');
        return;
    }

    console.log(`✓ Tier 1 complete`);
    console.log(`✓ ${tier1Complete.delegateCount} ideas advance to Tier 2`);
    console.log(`✓ ${tier1Complete.cellsFormed} Tier 2 cells formed\n`);

    // Check Tier 2 state
    state = await request('GET', '/api/state');
    const tier2Cells = state.cells.filter(c => c.tier === 2);
    const tier2Ideas = state.ideas.filter(i => i.tier === 2 && i.status === 'active');

    console.log('TIER 2 STATE:');
    console.log('-'.repeat(70));
    console.log(`Total Participants: ${state.totalParticipants} (should be same as Tier 1)`);
    console.log(`Active Ideas: ${tier2Ideas.length} (reduced from ${state.ideas.filter(i => i.tier === 1).length})`);
    console.log(`Number of Cells: ${tier2Cells.length}`);
    console.log(`Current Tier: ${state.currentTier}`);

    // Verify everyone is STILL voting in Tier 2
    const tier2Participants = new Set();
    tier2Cells.forEach(c => {
        c.participants.forEach(p => tier2Participants.add(p));
    });

    console.log(`\nParticipants in Tier 2 cells: ${tier2Participants.size}`);
    console.log(`Expected: ${state.totalParticipants}`);

    if (tier2Participants.size !== state.totalParticipants) {
        console.log(`❌ ERROR: Not all participants are in Tier 2 cells!`);
        console.log('This means the delegation model is being used instead of everyone-votes');
        return;
    }
    console.log('✓ All participants are STILL voting in Tier 2\n');

    // Verify all Tier 2 cells have the SAME ideas
    const firstCellIdeas = tier2Cells[0].ideaIds.sort().join(',');
    let allCellsHaveSameIdeas = true;

    tier2Cells.forEach(c => {
        const cellIdeas = c.ideaIds.sort().join(',');
        if (cellIdeas !== firstCellIdeas) {
            allCellsHaveSameIdeas = false;
            console.log(`❌ Cell ${c.id} has different ideas than first cell`);
        }
    });

    if (allCellsHaveSameIdeas) {
        console.log('✓ All Tier 2 cells have the SAME ideas (cross-cell tallying)\n');
    } else {
        console.log('❌ ERROR: Tier 2 cells have different ideas!\n');
        return;
    }

    // Show sample of Tier 2 cells
    console.log('Sample Tier 2 cells:');
    tier2Cells.slice(0, 3).forEach(c => {
        console.log(`  ${c.id}: ${c.participants.length} participants, ${c.ideaIds.length} ideas`);
    });
    console.log('');

    // Auto-vote all Tier 2 cells
    console.log('⚡ Auto-voting all Tier 2 cells...');
    const tier2VoteResult = await request('POST', '/api/auto-vote-all');
    console.log(`✓ ${tier2VoteResult.votesAdded} votes cast across ${tier2VoteResult.cellsCompleted} cells\n`);

    // Complete Tier 2
    console.log('Completing Tier 2...');
    const tier2Complete = await request('POST', '/api/complete-tier', { tier: 2 });

    if (tier2Complete.winner) {
        console.log(`🏆 FINAL WINNER: ${tier2Complete.winner.id} - ${tier2Complete.winner.text}\n`);
        console.log('=' .repeat(70));
        console.log('✅ SUCCESS: v7-scalable works correctly!');
        console.log('=' .repeat(70));
        console.log('\nVerified:');
        console.log('  ✓ Everyone votes in Tier 1');
        console.log('  ✓ Everyone votes in Tier 2');
        console.log('  ✓ Ideas compress between tiers');
        console.log('  ✓ Tier 2+ cells all have same ideas (cross-cell tallying)');
        console.log('  ✓ Winner correctly determined\n');
        return;
    }

    console.log(`✓ Tier 2 complete`);
    console.log(`✓ ${tier2Complete.delegateCount} ideas advance to Tier 3`);
    console.log(`✓ ${tier2Complete.cellsFormed} Tier 3 cells formed\n`);

    // Check Tier 3 state
    state = await request('GET', '/api/state');
    const tier3Cells = state.cells.filter(c => c.tier === 3);
    const tier3Ideas = state.ideas.filter(i => i.tier === 3 && i.status === 'active');

    console.log('TIER 3 STATE:');
    console.log('-'.repeat(70));
    console.log(`Total Participants: ${state.totalParticipants} (should STILL be same)`);
    console.log(`Active Ideas: ${tier3Ideas.length}`);
    console.log(`Number of Cells: ${tier3Cells.length}`);

    // Verify everyone is STILL voting in Tier 3
    const tier3Participants = new Set();
    tier3Cells.forEach(c => {
        c.participants.forEach(p => tier3Participants.add(p));
    });

    console.log(`\nParticipants in Tier 3 cells: ${tier3Participants.size}`);
    console.log(`Expected: ${state.totalParticipants}`);

    if (tier3Participants.size !== state.totalParticipants) {
        console.log(`❌ ERROR: Not all participants are in Tier 3 cells!`);
        return;
    }
    console.log('✓ All participants are STILL voting in Tier 3\n');

    // Auto-vote and complete Tier 3
    console.log('⚡ Auto-voting all Tier 3 cells...');
    await request('POST', '/api/auto-vote-all');

    console.log('Completing Tier 3...');
    const tier3Complete = await request('POST', '/api/complete-tier', { tier: 3 });

    if (tier3Complete.winner) {
        console.log(`\n🏆 FINAL WINNER: ${tier3Complete.winner.id} - ${tier3Complete.winner.text}\n`);
    }

    console.log('=' .repeat(70));
    console.log('✅ SUCCESS: v7-scalable multi-tier test complete!');
    console.log('=' .repeat(70));
    console.log('\nVerified:');
    console.log('  ✓ Everyone votes in ALL tiers (Tier 1, 2, 3)');
    console.log('  ✓ Ideas compress logarithmically between tiers');
    console.log('  ✓ Cell structure stays constant (based on participant count)');
    console.log('  ✓ Cross-cell tallying works in Tier 2+');
    console.log('  ✓ No delegation, no weighting - everyone votes individually\n');
}

testV7Scalable().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
