// Union Chant v3 - CORRECT Prime Cell Logic
const http = require('http');

// Core Settings
const CELL_SIZE = 5; // Fixed cell size

// State
let participants = [];
let ideas = []; // Ideas advancing through tiers
let cells = [];
let votes = [];
let currentTier = 1;

// Create server
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/reset' && req.method === 'POST') {
        reset(res);
    }
    else if (url.pathname === '/api/add-participant' && req.method === 'POST') {
        addParticipant(req, res);
    }
    else if (url.pathname === '/api/state' && req.method === 'GET') {
        getState(res);
    }
    else if (url.pathname === '/api/vote' && req.method === 'POST') {
        vote(req, res);
    }
    else if (url.pathname === '/api/complete-tier' && req.method === 'POST') {
        completeTier(req, res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

function reset(res) {
    participants = [];
    ideas = [];
    cells = [];
    votes = [];
    currentTier = 1;

    console.log('System reset');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
}

function addParticipant(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { name } = JSON.parse(body);

        const participant = {
            id: `p-${participants.length + 1}`,
            name: name || `P${participants.length + 1}`,
            joinedAt: Date.now()
        };

        participants.push(participant);
        console.log(`✅ ${participant.name} joined (Total: ${participants.length})`);

        // Try to form cells in Tier 1
        if (currentTier === 1) {
            tryFormTier1Cells();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            participant,
            totalParticipants: participants.length
        }));
    });
}

function tryFormTier1Cells() {
    // For Tier 1: Form cells as participants join
    const tier1Cells = cells.filter(c => c.tier === 1);
    const participantsInCells = tier1Cells.length * CELL_SIZE;
    const availableParticipants = participants.length - participantsInCells;

    if (availableParticipants >= CELL_SIZE) {
        const cellParticipants = participants.slice(participantsInCells, participantsInCells + CELL_SIZE);

        // For Tier 1, each cell votes on different ideas
        // Create dummy idea IDs for now (in real version, these would be actual ideas)
        const numIdeasInCell = CELL_SIZE;
        const cellIdeas = [];
        for (let i = 0; i < numIdeasInCell; i++) {
            cellIdeas.push(`idea-${tier1Cells.length}-${i + 1}`);
        }

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: 1,
            participants: cellParticipants.map(p => p.id),
            ideaIds: cellIdeas, // Ideas this cell is voting on
            votesNeeded: CELL_SIZE,
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id} formed in Tier 1 with ${CELL_SIZE} participants`);
        console.log(`   Voting on ideas: ${cellIdeas.join(', ')}`);
    }
}

function vote(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { cellId, participantId, ideaId } = JSON.parse(body);

        const cell = cells.find(c => c.id === cellId);
        if (!cell) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Cell not found' }));
            return;
        }

        // Check if already voted in this cell
        const alreadyVoted = votes.some(v => v.cellId === cellId && v.participantId === participantId);
        if (alreadyVoted) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Already voted in this cell' }));
            return;
        }

        const vote = {
            id: `vote-${votes.length + 1}`,
            cellId,
            participantId,
            ideaId,
            votedAt: Date.now()
        };

        votes.push(vote);
        console.log(`🗳️  Vote cast in ${cellId} for ${ideaId}`);

        const voteCount = votes.filter(v => v.cellId === cellId).length;
        console.log(`   Progress: ${voteCount}/${cell.votesNeeded}`);

        // Check if cell is complete
        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';
            console.log(`✅ ${cell.id} completed`);

            // Tally votes for this cell
            const cellVotes = votes.filter(v => v.cellId === cellId);
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Winner: ${winner} with ${tally[winner]} votes`);

            // Add winner to ideas advancing to next tier
            if (!ideas.some(i => i.id === winner)) {
                ideas.push({
                    id: winner,
                    tier: cell.tier + 1,
                    totalVotes: tally[winner]
                });
                console.log(`   ${winner} advances to Tier ${cell.tier + 1}`);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, voteCount }));
    });
}

function completeTier(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { tier } = JSON.parse(body);

        const tierCells = cells.filter(c => c.tier === tier);
        const completedCells = tierCells.filter(c => c.status === 'completed');

        console.log(`\n🎯 Completing Tier ${tier}`);
        console.log(`   ${completedCells.length} cells completed`);

        // Check if we have 3, 5, or 7 completed cells
        const shouldAdvance = completedCells.length === 3 || completedCells.length === 5 || completedCells.length === 7;

        if (!shouldAdvance) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: `Need 3, 5, or 7 completed cells (have ${completedCells.length})` }));
            return;
        }

        // Get ideas advancing from this tier
        const advancingIdeas = ideas.filter(i => i.tier === tier + 1);
        console.log(`   ${advancingIdeas.length} ideas advancing to Tier ${tier + 1}`);

        if (advancingIdeas.length === 1) {
            console.log(`\n🏆 WINNER: ${advancingIdeas[0].id}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                winner: advancingIdeas[0],
                message: 'Winner declared!'
            }));
            return;
        }

        // Form new cells for next tier
        // All participants subdivided into cells
        // All cells vote on the SAME set of advancing ideas
        const nextTier = tier + 1;
        const numCells = Math.floor(participants.length / CELL_SIZE);

        for (let i = 0; i < numCells; i++) {
            const cellParticipants = participants.slice(i * CELL_SIZE, (i + 1) * CELL_SIZE);

            const cell = {
                id: `cell-${cells.length + 1}`,
                tier: nextTier,
                participants: cellParticipants.map(p => p.id),
                ideaIds: advancingIdeas.map(idea => idea.id), // All cells vote on SAME ideas
                votesNeeded: CELL_SIZE,
                status: 'voting',
                createdAt: Date.now()
            };

            cells.push(cell);
            console.log(`📦 ${cell.id} formed in Tier ${nextTier}`);
            console.log(`   Participants: ${cellParticipants.map(p => p.name).join(', ')}`);
            console.log(`   Voting on: ${advancingIdeas.map(i => i.id).join(', ')}`);
        }

        currentTier = nextTier;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            nextTier,
            cellsCreated: numCells,
            ideasToVoteOn: advancingIdeas.length
        }));
    });
}

function getState(res) {
    const state = {
        participants: participants.length,
        currentTier,
        cells: cells.map(c => {
            const votesCast = votes.filter(v => v.cellId === c.id).length;
            const cellVotes = votes.filter(v => v.cellId === c.id);

            // Tally votes by idea
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            // Track which participants voted
            const participantsWhoVoted = cellVotes.map(v => v.participantId);

            return {
                id: c.id,
                tier: c.tier,
                participantCount: c.participants.length,
                participants: c.participants,
                participantsWhoVoted: participantsWhoVoted,
                ideaIds: c.ideaIds,
                voteTally: tally,
                votesNeeded: c.votesNeeded,
                votesCast: votesCast,
                status: c.status
            };
        }),
        ideas: ideas.map(i => {
            // Count TOTAL votes across ALL cells in current tier
            const tierCells = cells.filter(c => c.tier === currentTier && c.ideaIds.includes(i.id));
            const totalVotes = votes.filter(v =>
                tierCells.some(tc => tc.id === v.cellId) && v.ideaId === i.id
            ).length;

            return {
                id: i.id,
                tier: i.tier,
                totalVotes: totalVotes
            };
        })
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
}

const PORT = 3002;
server.listen(PORT, () => {
    console.log(`🚀 Union Chant v3 (CORRECTED) running at http://localhost:${PORT}`);
    console.log(`\nCORRECT FLOW:`);
    console.log(`- Everyone always votes as individuals`);
    console.log(`- All cells in a tier vote on SAME ideas`);
    console.log(`- Tallies counted ACROSS all cells`);
    console.log(`- Winner = idea with most total votes`);
});
