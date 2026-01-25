// Union Chant v7 - STABLE - Scalable Multi-Tier Model
// Everyone votes in every tier, ideas compress logarithmically
// Natural reduction: only top vote-getter(s) advance, ties go to next round

const http = require('http');
const PORT = 3008;

// State
let participants = [];
let ideas = [];
let cells = [];
let votes = [];
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

    // Calculate max ideas each cell can receive (min of cellSize and 7)
    const MAX_IDEAS_PER_CELL = 7;
    const cellMaxIdeas = cellSizes.map(size => Math.min(size, MAX_IDEAS_PER_CELL));
    const totalCapacity = cellMaxIdeas.reduce((sum, max) => sum + max, 0);

    let participantIndex = 0;
    let ideaIndex = 0;
    const ideasRemaining = ideas.length;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];
        const maxIdeasForCell = cellMaxIdeas[i];

        // Assign participants
        const cellParticipants = participants.slice(participantIndex, participantIndex + cellSize);
        participantIndex += cellSize;

        // Calculate how many ideas this cell should get
        // Distribute proportionally but respect the max constraint
        const ideasLeft = ideas.length - ideaIndex;
        const cellsLeft = numCells - i;
        const fairShare = Math.ceil(ideasLeft / cellsLeft);
        const cellIdeaCount = Math.min(fairShare, maxIdeasForCell, ideasLeft);

        // Assign ideas (different ideas per cell)
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

function formNextTierCells(advancingIdeas, tier) {
    console.log(`\n📊 Forming Tier ${tier} architecture:`);
    console.log(`   Participants: ${participants.length} (EVERYONE votes again)`);
    console.log(`   Ideas: ${advancingIdeas.length} (SAME ideas across ALL cells)`);

    // Cell structure based on PARTICIPANTS (stays constant)
    const cellSizes = calculateCellSizes(participants.length);
    const numCells = cellSizes.length;

    console.log(`   Cells: ${cellSizes.join(', ')}`);

    // Mark ideas as in this tier
    advancingIdeas.forEach(idea => {
        idea.tier = tier;
        idea.status = 'in-voting';
    });

    let participantIndex = 0;

    for (let i = 0; i < numCells; i++) {
        const cellSize = cellSizes[i];

        // Assign participants
        const cellParticipants = participants.slice(participantIndex, participantIndex + cellSize);
        participantIndex += cellSize;

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: tier,
            participants: cellParticipants.map(p => p.id),
            ideaIds: advancingIdeas.map(idea => idea.id), // ALL cells vote on SAME ideas
            votesNeeded: cellSize,
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 ${cell.id}: ${cellParticipants.length} participants voting on ${cell.ideaIds.length} ideas`);
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

        const voteCount = votes.filter(v => v.cellId === cellId).length;

        if (voteCount >= cell.votesNeeded) {
            cell.status = 'completed';
            console.log(`✅ ${cellId} completed`);

            // Calculate winner for this cell
            const cellVotes = votes.filter(v => v.cellId === cellId);
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);
            console.log(`   Cell winner: ${winner} with ${tally[winner]} votes`);

            // Mark as cell winner (for Tier 1 only)
            if (cell.tier === 1) {
                const winnerIdea = ideas.find(i => i.id === winner);
                if (winnerIdea) {
                    winnerIdea.status = 'cell-winner';
                    winnerIdea.tier = cell.tier;
                }
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
            console.log(`   Cell winner: ${winner} with ${tally[winner]} votes`);

            if (cell.tier === 1) {
                const winnerIdea = ideas.find(i => i.id === winner);
                if (winnerIdea) {
                    winnerIdea.status = 'cell-winner';
                    winnerIdea.tier = cell.tier;
                }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, votesAdded: availableParticipants.length }));
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
            const tally = {};
            cellVotes.forEach(v => {
                tally[v.ideaId] = (tally[v.ideaId] || 0) + 1;
            });

            const winner = Object.keys(tally).reduce((a, b) => tally[a] > tally[b] ? a : b);

            if (cell.tier === 1) {
                const winnerIdea = ideas.find(i => i.id === winner);
                if (winnerIdea) {
                    winnerIdea.status = 'cell-winner';
                    winnerIdea.tier = cell.tier;
                }
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

        if (tier === 1) {
            // Tier 1: Get cell winners
            const cellWinners = ideas.filter(i => i.tier === tier && i.status === 'cell-winner');
            console.log(`   ${cellWinners.length} cell winners from Tier 1`);

            if (cellWinners.length === 1) {
                console.log(`\n🏆 WINNER: ${cellWinners[0].id} - ${cellWinners[0].text}`);
                phase = 'completed';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    winner: cellWinners[0],
                    message: 'Winner declared!'
                }));
                return;
            }

            // Calculate constraints for next tier
            const nextTierCellSizes = calculateCellSizes(participants.length);
            const minCellSize = Math.min(...nextTierCellSizes);
            const MAX_IDEAS_PER_CELL = 7;
            const maxAdvancingIdeas = Math.min(MAX_IDEAS_PER_CELL, minCellSize);

            console.log(`   Next tier: min cell size = ${minCellSize}, max ideas = ${maxAdvancingIdeas}`);

            // Take top N based on vote counts in each cell
            const winnerVoteCounts = cellWinners.map(winner => {
                const winnerCell = cells.find(c => c.ideaIds.includes(winner.id) && c.tier === tier);
                const cellVotes = votes.filter(v => v.cellId === winnerCell.id && v.ideaId === winner.id);
                return { idea: winner, votes: cellVotes.length };
            });

            winnerVoteCounts.sort((a, b) => b.votes - a.votes);

            const numAdvancing = Math.min(cellWinners.length, maxAdvancingIdeas);
            const advancingIdeas = winnerVoteCounts.slice(0, numAdvancing).map(w => w.idea);

            console.log(`   Advancing top ${advancingIdeas.length} of ${cellWinners.length} cell winners`);

            if (advancingIdeas.length === 1) {
                console.log(`\n🏆 WINNER: ${advancingIdeas[0].id} - ${advancingIdeas[0].text}`);
                phase = 'completed';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    winner: advancingIdeas[0],
                    message: 'Winner declared!'
                }));
                return;
            }

            // Advance to Tier 2
            formNextTierCells(advancingIdeas, 2);
            currentTier = 2;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                nextTier: 2,
                advancingIdeas: advancingIdeas.length
            }));
        } else {
            // Tier 2+: Cross-cell tallying
            const tierVotes = votes.filter(v =>
                completedCells.some(c => c.id === v.cellId)
            );

            const crossCellTally = {};
            tierVotes.forEach(v => {
                crossCellTally[v.ideaId] = (crossCellTally[v.ideaId] || 0) + 1;
            });

            console.log(`   📊 Cross-cell tally:`, crossCellTally);

            const sortedIdeas = Object.keys(crossCellTally)
                .sort((a, b) => crossCellTally[b] - crossCellTally[a]);

            // Check if we already have only 1 idea (winner!)
            if (sortedIdeas.length === 1) {
                const winnerId = sortedIdeas[0];
                const winner = ideas.find(i => i.id === winnerId);

                console.log(`\n🎉 FINAL WINNER: ${winnerId} with ${crossCellTally[winnerId]} total votes`);
                phase = 'completed';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    winner: { ...winner, totalVotes: crossCellTally[winnerId] },
                    message: 'Winner declared!'
                }));
                return;
            }

            // Find the top vote count
            const topVoteCount = crossCellTally[sortedIdeas[0]];

            // Advance ALL ideas tied for the top vote count
            const topIdeasIds = sortedIdeas.filter(ideaId => crossCellTally[ideaId] === topVoteCount);
            const topIdeas = topIdeasIds.map(id => ideas.find(i => i.id === id));

            // Check constraints for next tier
            const nextTierCellSizes = calculateCellSizes(participants.length);
            const minCellSize = Math.min(...nextTierCellSizes);
            const MAX_IDEAS_PER_CELL = 7;
            const maxAdvancingIdeas = Math.min(MAX_IDEAS_PER_CELL, minCellSize);

            console.log(`   Top vote count: ${topVoteCount}`);
            console.log(`   Ideas with top votes: ${topIdeasIds.length} (${topIdeasIds.join(', ')})`);

            // Check if we can fit advancing ideas in next tier
            if (topIdeas.length > maxAdvancingIdeas) {
                console.log(`   ⚠️  Too many tied ideas (${topIdeas.length}) for next tier (max ${maxAdvancingIdeas})`);
                console.log(`   This is a highly unusual tie - advancing top ${maxAdvancingIdeas} only`);
                topIdeas.length = maxAdvancingIdeas; // Truncate to fit constraint
            }

            console.log(`   Advancing ${topIdeas.length} idea(s) to next tier`);

            // If only 1 idea is advancing, declare it the winner
            if (topIdeas.length === 1) {
                const winner = topIdeas[0];
                console.log(`\n🎉 FINAL WINNER: ${winner.id} with ${topVoteCount} total votes`);
                phase = 'completed';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    winner: { ...winner, totalVotes: topVoteCount },
                    message: 'Winner declared!'
                }));
                return;
            }

            // Multiple ideas advancing - form next tier
            formNextTierCells(topIdeas, tier + 1);
            currentTier++;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                nextTier: currentTier,
                advancingIdeas: topIdeas.length
            }));
        }
    });
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
    } else if (req.url === '/' || req.url === '/index-v7-stable.html') {
        const fs = require('fs');
        fs.readFile('./index-v7-stable.html', (err, data) => {
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
    console.log(`🚀 Union Chant v7 (SCALABLE) running at http://localhost:${PORT}`);
    console.log('');
    console.log('SCALABLE MODEL:');
    console.log('1. Everyone votes in EVERY tier');
    console.log('2. Cell structure stays constant (~5 people)');
    console.log('3. Ideas compress through cross-cell tallying');
    console.log('4. Cells = small discussion groups');
    console.log('5. Scales to millions of participants');
});
