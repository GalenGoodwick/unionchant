// Test that voting continues through Tier 3, 4, 5, etc.
// Instead of declaring winner too early

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

async function testMultiTier() {
    console.log('🧪 Testing Multi-Tier Progression\n');
    console.log('Goal: Verify voting continues through Tier 3, 4, 5...');
    console.log('=' .repeat(70) + '\n');

    // Reset
    console.log('Resetting...');
    await request('POST', '/api/reset');
    await sleep(200);

    // Add 100 participants
    console.log('Adding 100 participants...');
    for (let i = 1; i <= 100; i++) {
        await request('POST', '/api/add-participant', { name: `P${i}` });
    }
    console.log('✓ 100 participants added\n');

    // Start voting
    console.log('Starting voting...');
    await request('POST', '/api/start-voting');

    let tierCount = 1;
    let state = await request('GET', '/api/state');

    while (state.phase === 'voting') {
        const currentTierCells = state.cells.filter(c => c.tier === tierCount);
        const activeIdeas = state.ideas.filter(i => i.tier === tierCount && i.status === 'in-voting');

        console.log(`\nTIER ${tierCount}:`);
        console.log('-'.repeat(70));
        console.log(`Cells: ${currentTierCells.length}`);
        console.log(`Ideas: ${activeIdeas.length}`);
        console.log(`Participants voting: ${state.totalParticipants}`);

        // Auto-vote all cells
        console.log('Auto-voting all cells...');
        await request('POST', '/api/auto-vote-all');

        // Complete tier
        console.log('Completing tier...');
        const result = await request('POST', '/api/complete-tier', { tier: tierCount });

        if (result.winner) {
            console.log(`\n🏆 WINNER: ${result.winner.id} - ${result.winner.text}`);
            console.log(`Winner declared after Tier ${tierCount}\n`);
            break;
        }

        console.log(`✓ Advanced to Tier ${result.nextTier}`);
        console.log(`✓ ${result.advancingIdeas} ideas advancing`);

        tierCount++;
        state = await request('GET', '/api/state');

        if (tierCount > 10) {
            console.log('\n⚠️  Stopped at Tier 10 to prevent infinite loop\n');
            break;
        }
    }

    console.log('=' .repeat(70));
    if (tierCount >= 3) {
        console.log('✅ SUCCESS: Voting continued through Tier 3+');
        console.log(`   Total tiers: ${tierCount}`);
    } else {
        console.log('❌ FAILED: Winner declared too early');
        console.log(`   Only reached Tier ${tierCount}`);
    }
    console.log('=' .repeat(70) + '\n');
}

testMultiTier().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
