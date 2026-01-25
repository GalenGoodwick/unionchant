// Union Chant v5 - Batch Mode (Clean Implementation)
const http = require('http');

// Settings
const CELL_SIZE = 5;

// State
let participants = [];
let ideas = [];
let cells = [];
let votes = [];
let currentTier = 1;
let phase = 'submission'; // 'submission', 'voting', 'completed'

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
    else if (url.pathname === '/api/submit-idea' && req.method === 'POST') {
        submitIdea(req, res);
    }
    else if (url.pathname === '/api/add-participant' && req.method === 'POST') {
        addParticipant(req, res);
    }
    else if (url.pathname === '/api/start-voting' && req.method === 'POST') {
        startVoting(req, res);
    }
    else if (url.pathname === '/api/vote' && req.method === 'POST') {
        vote(req, res);
    }
    else if (url.pathname === '/api/auto-vote' && req.method === 'POST') {
        autoVote(req, res);
    }
    else if (url.pathname === '/api/complete-tier' && req.method === 'POST') {
        completeTier(req, res);
    }
    else if (url.pathname === '/api/state' && req.method === 'GET') {
        getState(res);
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
    phase = 'submission';

    console.log('🔄 System reset');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
}

function submitIdea(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { text, author } = JSON.parse(body);

        if (phase !== 'submission') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Not in submission phase' }));
            return;
        }

        const idea = {
            id: `idea-${ideas.length + 1}`,
            text: text || `Idea ${ideas.length + 1}`,
            author: author || 'Anonymous',
            tier: 1,
            status: 'submitted',
            createdAt: Date.now()
        };

        ideas.push(idea);
        console.log(`💡 ${idea.id} submitted by ${idea.author}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ idea }));
    });
}

function addParticipant(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { name } = JSON.parse(body);

        if (phase !== 'submission') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Not in submission phase' }));
            return;
        }

        const participant = {
            id: `p-${participants.length + 1}`,
            name: name || `P${participants.length + 1}`,
            joinedAt: Date.now()
        };

        participants.push(participant);
        console.log(`✅ ${participant.name} joined (Total: ${participants.length})`);

        // Auto-create idea for this participant
        const idea = {
            id: `idea-${ideas.length + 1}`,
            text: `Idea from ${participant.name}`,
            author: participant.name,
            tier: 1,
            status: 'submitted',
            createdAt: Date.now()
        };

        ideas.push(idea);
        console.log(`💡 ${idea.id} auto-created for ${participant.name}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ participant, idea }));
    });
}

function startVoting(req, res) {
    if (phase !== 'submission') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Not in submission phase' }));
        return;
    }

    const MIN_PARTICIPANTS = 3;
    if (participants.length < MIN_PARTICIPANTS) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `Need at least ${MIN_PARTICIPANTS} participants` }));
        return;
    }

    if (ideas.length < MIN_PARTICIPANTS) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: `Need at least ${MIN_PARTICIPANTS} ideas` }));
        return;
    }

    console.log(`\n🚀 Starting voting with ${participants.length} participants and ${ideas.length} ideas`);

    formTier1Cells();
    phase = 'voting';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: true,
        cellsFormed: cells.length,
        phase: 'voting'
    }));
}

function calculateCellSizes(totalParticipants) {
    // Calculate optimal cell sizes with constraints:
    // - Target: 5 per cell
    // - Range: 3-7 per cell
    // - Never: 1, 2, or 8+ per cell

    if (totalParticipants < 3) {
        return []; // Can't form any valid cells
    }

    // Handle small participant counts explicitly
    if (totalParticipants === 3) return [3];
    if (totalParticipants === 4) return [4];

    // Start with all cells of 5
    let numCells = Math.floor(totalParticipants / 5);
    let remainder = totalParticipants % 5;

    if (remainder === 0) {
        // Perfect: all cells are 5
        return Array(numCells).fill(5);
    }

    if (remainder === 1) {
        // e.g., 16: 3*5 + 1 = [5,5,5,1] ❌
        // Solution: reduce one cell, combine with remainder
        // [5,5] + 6 = [5,5,6] ✅
        if (numCells > 0) {
            numCells--;
            remainder += 5;
            return [...Array(numCells).fill(5), remainder];
        }
    }

    if (remainder === 2) {
        // e.g., 17: 3*5 + 2 = [5,5,5,2] ❌
        // Solution: reduce one cell, combine with remainder
        // [5,5] + 7 = [5,5,7] ✅
        if (numCells > 0) {
            numCells--;
            remainder += 5;
            return [...Array(numCells).fill(5), remainder];
        }
    }

    if (remainder === 3) {
        // e.g., 18: 3*5 + 3 = [5,5,5,3] ✅
        return [...Array(numCells).fill(5), 3];
    }

    if (remainder === 4) {
        // e.g., 19: 3*5 + 4 = [5,5,5,4] ✅
        return [...Array(numCells).fill(5), 4];
    }

    return Array(numCells).fill(5);
}

function formTier1Cells() {
    // Calculate optimal cell structure
    const cellSizes = calculateCellSizes(participants.length);
    const numCells = cellSizes.length;
    const numIdeas = ideas.length;

    console.log(`\n📊 Forming Tier 1 architecture:`);
    console.log(`   Participants: ${participants.length} → Cells: ${cellSizes.join(', ')}`);
    console.log(`   Ideas: ${numIdeas}`);

    // Distribute ideas across cells
    const ideasPerCell = Math.floor(numIdeas / numCells);
    const extraIdeas = numIdeas % numCells;

    console.log(`   Idea distribution: ${ideasPerCell} base, ${extraIdeas} extra`);

    let participantIndex = 0;
    let ideaIndex = 0;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];

        // Assign participants
        const cellParticipants = participants.slice(participantIndex, participantIndex + cellSize);
        participantIndex += cellSize;

        // Assign ideas
        const cellIdeaCount = ideasPerCell + (i < extraIdeas ? 1 : 0);
        const cellIdeas = ideas.slice(ideaIndex, ideaIndex + cellIdeaCount);
        ideaIndex += cellIdeaCount;

        // Mark ideas as in this cell
        cellIdeas.forEach(idea => {
            idea.status = 'in-voting';
        });

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: 1,
            participants: cellParticipants.map(p => p.id),
            ideaIds: cellIdeas.map(idea => idea.id),
            votesNeeded: cellSize, // Match cell size
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id}: ${cellParticipants.length} participants, ${cellIdeas.length} ideas`);
    }
}

function vote(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { cellId, participantId, ideaId } = JSON.parse(body);

        if (phase !== 'voting') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Not in voting phase' }));
            return;
        }

        const cell = cells.find(c => c.id === cellId);
        if (!cell) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Cell not found' }));
            return;
        }

        // Check if already voted
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

        // Check if cell is complete
        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';
            console.log(`✅ ${cellId} completed`);

            // Tally votes
            const cellVotes = votes.filter(v => v.cellId === cellId);
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Winner: ${winner} with ${tally[winner]} votes`);

            // Mark winner
            const winnerIdea = ideas.find(i => i.id === winner);
            if (winnerIdea) {
                winnerIdea.status = 'winner';
                winnerIdea.tier = cell.tier;
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, voteCount }));
    });
}

function autoVote(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { cellId } = JSON.parse(body);

        const cell = cells.find(c => c.id === cellId);
        if (!cell || cell.status !== 'voting') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Cell not available for voting' }));
            return;
        }

        const votedParticipants = votes.filter(v => v.cellId === cellId).map(v => v.participantId);
        const availableParticipants = cell.participants.filter(p => !votedParticipants.includes(p));

        availableParticipants.forEach(participantId => {
            const randomIdea = cell.ideaIds[Math.floor(Math.random() * cell.ideaIds.length)];
            votes.push({
                id: `vote-${votes.length + 1}`,
                cellId,
                participantId,
                ideaId: randomIdea,
                votedAt: Date.now()
            });
        });

        console.log(`🤖 Auto-voted ${availableParticipants.length} times in ${cellId}`);

        const voteCount = votes.filter(v => v.cellId === cellId).length;

        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';
            console.log(`✅ ${cellId} completed`);

            const cellVotes = votes.filter(v => v.cellId === cellId);
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Winner: ${winner} with ${tally[winner]} votes`);

            const winnerIdea = ideas.find(i => i.id === winner);
            if (winnerIdea) {
                winnerIdea.status = 'winner';
                winnerIdea.tier = cell.tier;
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, votesAdded: availableParticipants.length }));
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
        console.log(`   ${completedCells.length}/${tierCells.length} cells completed`);

        if (completedCells.length < tierCells.length) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: `Not all cells completed (${completedCells.length}/${tierCells.length})` }));
            return;
        }

        // Get winners from this tier
        const winners = ideas.filter(i => i.tier === tier && i.status === 'winner');
        console.log(`   ${winners.length} winners from Tier ${tier}`);

        if (tier === 1) {
            // Tier 1: Form Tier 2 cells
            if (winners.length === 1) {
                console.log(`\n🏆 WINNER: ${winners[0].id}`);
                phase = 'completed';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    winner: winners[0],
                    message: 'Winner declared!'
                }));
                return;
            }

            formTier2Cells(winners);
            currentTier = 2;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                nextTier: 2,
                advancingIdeas: winners.length
            }));
        } else {
            // Tier 2+: Cross-cell tally
            const tierVotes = votes.filter(v =>
                completedCells.some(c => c.id === v.cellId)
            );

            const crossCellTally = {};
            tierVotes.forEach(v => {
                crossCellTally[v.ideaId] = (crossCellTally[v.ideaId] || 0) + 1;
            });

            console.log(`   📊 Cross-cell tally:`, crossCellTally);

            const winner = Object.keys(crossCellTally).reduce((a, b) =>
                crossCellTally[a] > crossCellTally[b] ? a : b
            );

            const winnerIdea = ideas.find(i => i.id === winner);
            console.log(`\n🎉 FINAL WINNER: ${winner} with ${crossCellTally[winner]} total votes`);

            phase = 'completed';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                winner: { ...winnerIdea, totalVotes: crossCellTally[winner] },
                message: 'Winner declared!'
            }));
        }
    });
}

function formTier2Cells(advancingIdeas) {
    console.log(`\n📊 Forming Tier 2 architecture:`);
    console.log(`   Ideas: ${advancingIdeas.length} (all cells vote on SAME ideas)`);

    // Calculate optimal cell structure using flexible sizing
    const cellSizes = calculateCellSizes(participants.length);
    const numCells = cellSizes.length;
    console.log(`   Participants: ${participants.length} → Cells: ${cellSizes.join(', ')}`);

    // Mark ideas as in Tier 2
    advancingIdeas.forEach(idea => {
        idea.tier = 2;
        idea.status = 'in-voting';
    });

    let participantIndex = 0;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];
        const cellParticipants = participants.slice(participantIndex, participantIndex + cellSize);
        participantIndex += cellSize;

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: 2,
            participants: cellParticipants.map(p => p.id),
            ideaIds: advancingIdeas.map(idea => idea.id), // ALL cells vote on SAME ideas
            votesNeeded: cellSize, // Match actual cell size
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id}: ${cellParticipants.length} participants voting on ${cell.ideaIds.join(', ')}`);
    }
}

function getState(res) {
    const state = {
        phase,
        participants: participants.length,
        currentTier,
        ideas: ideas.map(i => ({
            id: i.id,
            text: i.text,
            author: i.author,
            tier: i.tier,
            status: i.status
        })),
        cells: cells.map(c => {
            const votesCast = votes.filter(v => v.cellId === c.id).length;
            const cellVotes = votes.filter(v => v.cellId === c.id);

            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const participantsWhoVoted = cellVotes.map(v => v.participantId);

            return {
                id: c.id,
                tier: c.tier,
                participants: c.participants,
                participantsWhoVoted,
                ideaIds: c.ideaIds,
                voteTally: tally,
                votesNeeded: c.votesNeeded,
                votesCast,
                status: c.status
            };
        })
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
}

const PORT = 3003;
server.listen(PORT, () => {
    console.log(`🚀 Union Chant v5 (BATCH MODE) running at http://localhost:${PORT}`);
    console.log(`\nBATCH WORKFLOW:`);
    console.log(`1. Submit ideas`);
    console.log(`2. Add participants`);
    console.log(`3. Click "Start Voting" - calculates architecture`);
    console.log(`4. Vote in cells`);
    console.log(`5. Complete tier when ready`);
});
