// Union Chant v6 - Delegation Model
// Participants scale with ideas through delegation

const http = require('http');
const PORT = 3006;

// State
let participants = [];
let ideas = [];
let cells = [];
let votes = [];
let delegates = []; // Tracks active delegates per tier
let phase = 'submission'; // 'submission', 'voting', 'completed'
let currentTier = 1;

const CELL_SIZE = 5; // Target cell size

// Flexible cell sizing algorithm
function calculateCellSizes(totalParticipants) {
    if (totalParticipants < 3) return [];
    if (totalParticipants === 3) return [3];
    if (totalParticipants === 4) return [4];

    let numCells = Math.floor(totalParticipants / 5);
    let remainder = totalParticipants % 5;

    if (remainder === 0) return Array(numCells).fill(5);

    if (remainder === 1) {
        if (numCells > 0) {
            numCells--;
            remainder += 5;
            return [...Array(numCells).fill(5), remainder];
        }
    }

    if (remainder === 2) {
        if (numCells > 0) {
            numCells--;
            remainder += 5;
            return [...Array(numCells).fill(5), remainder];
        }
    }

    if (remainder === 3) return [...Array(numCells).fill(5), 3];
    if (remainder === 4) return [...Array(numCells).fill(5), 4];

    return Array(numCells).fill(5);
}

function reset(req, res) {
    participants = [];
    ideas = [];
    cells = [];
    votes = [];
    delegates = [];
    phase = 'submission';
    currentTier = 1;

    console.log('🔄 System reset');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
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
            name,
            joinedAt: Date.now()
        };

        participants.push(participant);
        console.log(`✅ ${participant.name} joined (Total: ${participants.length})`);

        // Auto-create idea for this participant
        const idea = {
            id: `idea-${ideas.length + 1}`,
            text: `Idea from ${participant.name}`,
            author: participant.name,
            authorId: participant.id,
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

function formTier1Cells() {
    console.log(`\n📊 Forming Tier 1 architecture:`);
    console.log(`   Participants: ${participants.length} (EVERYONE votes)`);
    console.log(`   Ideas: ${ideas.length}`);

    const cellSizes = calculateCellSizes(participants.length);
    const numCells = cellSizes.length;

    console.log(`   Cells: ${cellSizes.join(', ')}`);

    // Distribute ideas across cells (~5 per cell, different per cell)
    const ideasPerCell = Math.floor(ideas.length / numCells);
    const extraIdeas = ideas.length % numCells;

    let participantIndex = 0;
    let ideaIndex = 0;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];

        // Assign participants
        const cellParticipants = participants.slice(participantIndex, participantIndex + cellSize);
        participantIndex += cellSize;

        // Assign ideas (different ideas per cell)
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
            votesNeeded: cellSize,
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id}: ${cellParticipants.length} participants, ${cellIdeas.length} ideas`);
    }
}

function formNextTierCells(delegatesForTier, advancingIdeas, tier) {
    console.log(`\n📊 Forming Tier ${tier} architecture:`);
    console.log(`   Delegates: ${delegatesForTier.length} (from Tier ${tier - 1})`);
    console.log(`   Ideas: ${advancingIdeas.length} (winning ideas)`);

    const cellSizes = calculateCellSizes(delegatesForTier.length);
    const numCells = cellSizes.length;

    console.log(`   Cells: ${cellSizes.join(', ')}`);

    // Distribute ideas across cells (~5 per cell, different per cell)
    const ideasPerCell = Math.floor(advancingIdeas.length / numCells);
    const extraIdeas = advancingIdeas.length % numCells;

    let delegateIndex = 0;
    let ideaIndex = 0;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];

        // Assign delegates as participants
        const cellDelegates = delegatesForTier.slice(delegateIndex, delegateIndex + cellSize);
        delegateIndex += cellSize;

        // Assign ideas (different ideas per cell)
        const cellIdeaCount = ideasPerCell + (i < extraIdeas ? 1 : 0);
        const cellIdeas = advancingIdeas.slice(ideaIndex, ideaIndex + cellIdeaCount);
        ideaIndex += cellIdeaCount;

        // Mark ideas as in this tier
        cellIdeas.forEach(idea => {
            idea.tier = tier;
            idea.status = 'in-voting';
        });

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: tier,
            participants: cellDelegates.map(d => d.id),
            ideaIds: cellIdeas.map(idea => idea.id),
            votesNeeded: cellSize,
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id}: ${cellDelegates.length} delegates, ${cellIdeas.length} ideas`);
    }
}

// Helper function to calculate weighted tally
function calculateWeightedTally(cellVotes) {
    const tally = {};
    cellVotes.forEach(v => {
        // Get the participant/delegate who voted
        const voter = participants.find(p => p.id === v.participantId);
        const weight = voter && voter.weight ? voter.weight : 1;

        tally[v.ideaId] = (tally[v.ideaId] || 0) + weight;
    });
    return tally;
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

        const voteCount = votes.filter(v => v.cellId === cellId).length;

        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';
            console.log(`✅ ${cellId} completed`);

            // Calculate winner using WEIGHTED votes
            const cellVotes = votes.filter(v => v.cellId === cellId);
            const tally = calculateWeightedTally(cellVotes);

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Winner: ${winner} with ${tally[winner]} weighted votes`);

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
            const tally = calculateWeightedTally(cellVotes);

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Winner: ${winner} with ${tally[winner]} weighted votes`);

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

        // Get winners from this tier (1 per cell)
        const winners = ideas.filter(i => i.tier === tier && i.status === 'winner');
        console.log(`   ${winners.length} winners from Tier ${tier}`);

        if (winners.length === 1) {
            // FINAL WINNER!
            console.log(`\n🏆 WINNER: ${winners[0].id} - ${winners[0].text}`);
            phase = 'completed';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                winner: winners[0],
                message: 'Winner declared!'
            }));
            return;
        }

        // Create delegates for next tier
        // Delegate = author of winning idea + weight = number of people they represent
        const nextTierDelegates = winners.map(winner => {
            const delegate = participants.find(p => p.id === winner.authorId);
            const winningCell = completedCells.find(c => c.ideaIds.includes(winner.id));

            // Weight = number of participants in their cell (for Tier 1)
            // OR cumulative weight from previous tier (for Tier 2+)
            let weight;
            if (tier === 1) {
                // Tier 1: weight = cell size
                weight = winningCell.participants.length;
            } else {
                // Tier 2+: inherit weight from delegate
                const existingDelegate = participants.find(p => p.id === delegate.id);
                weight = existingDelegate.weight || 1;
            }

            return {
                ...delegate,
                representingIdea: winner.id,
                fromTier: tier,
                weight: weight  // Number of people this delegate represents
            };
        });

        const totalWeight = nextTierDelegates.reduce((sum, d) => sum + d.weight, 0);
        console.log(`   ${nextTierDelegates.length} delegates advance to Tier ${tier + 1} (representing ${totalWeight} people)`);

        // Form next tier cells
        formNextTierCells(nextTierDelegates, winners, tier + 1);
        currentTier = tier + 1;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            nextTier: currentTier,
            delegateCount: nextTierDelegates.length,
            advancingIdeas: winners.length
        }));
    });
}

function autoVoteAll(req, res) {
    if (phase !== 'voting') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Not in voting phase' }));
        return;
    }

    const activeCells = cells.filter(c => c.tier === currentTier && c.status === 'voting');

    if (activeCells.length === 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'No active cells to vote in' }));
        return;
    }

    console.log(`\n🤖 Auto-voting ALL cells in Tier ${currentTier}`);

    let totalVotes = 0;

    activeCells.forEach(cell => {
        const votedParticipants = votes.filter(v => v.cellId === cell.id).map(v => v.participantId);
        const availableParticipants = cell.participants.filter(p => !votedParticipants.includes(p));

        availableParticipants.forEach(participantId => {
            const randomIdea = cell.ideaIds[Math.floor(Math.random() * cell.ideaIds.length)];
            votes.push({
                id: `vote-${votes.length + 1}`,
                cellId: cell.id,
                participantId,
                ideaId: randomIdea,
                votedAt: Date.now()
            });
            totalVotes++;
        });

        // Mark cell as completed
        const voteCount = votes.filter(v => v.cellId === cell.id).length;

        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';

            const cellVotes = votes.filter(v => v.cellId === cell.id);
            const tally = calculateWeightedTally(cellVotes);

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);

            const winnerIdea = ideas.find(i => i.id === winner);
            if (winnerIdea) {
                winnerIdea.status = 'winner';
                winnerIdea.tier = cell.tier;
            }

            console.log(`   ✅ ${cell.id} completed - Winner: ${winner}`);
        }
    });

    console.log(`   Total: ${totalVotes} votes cast across ${activeCells.length} cells`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: true,
        cellsCompleted: activeCells.length,
        votesAdded: totalVotes
    }));
}

function getState(res) {
    const state = {
        phase,
        totalParticipants: participants.length,
        currentTier,
        ideas: ideas.map(i => ({
            id: i.id,
            text: i.text,
            author: i.author,
            authorId: i.authorId,
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

// HTTP Server
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/api/reset' && req.method === 'POST') {
        reset(req, res);
    } else if (req.url === '/api/add-participant' && req.method === 'POST') {
        addParticipant(req, res);
    } else if (req.url === '/api/start-voting' && req.method === 'POST') {
        startVoting(req, res);
    } else if (req.url === '/api/vote' && req.method === 'POST') {
        vote(req, res);
    } else if (req.url === '/api/auto-vote' && req.method === 'POST') {
        autoVote(req, res);
    } else if (req.url === '/api/auto-vote-all' && req.method === 'POST') {
        autoVoteAll(req, res);
    } else if (req.url === '/api/complete-tier' && req.method === 'POST') {
        completeTier(req, res);
    } else if (req.url === '/api/state' && req.method === 'GET') {
        getState(res);
    } else if (req.url === '/' || req.url === '/index-v6-delegation.html') {
        const fs = require('fs');
        fs.readFile('./index-v6-delegation.html', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Union Chant v6 (DELEGATION MODE) running at http://localhost:${PORT}`);
    console.log('');
    console.log('DELEGATION MODEL:');
    console.log('1. Tier 1: Everyone votes');
    console.log('2. Winners become delegates');
    console.log('3. Tier 2+: Only delegates vote');
    console.log('4. Always small groups (~5 people, ~5 ideas)');
    console.log('5. Scales logarithmically to millions');
});
