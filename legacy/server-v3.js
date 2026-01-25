// Union Chant v3 - Core Prime Cell Logic Only
const http = require('http');

// Core Settings
const CELL_SIZE = 5; // Fixed cell size for simplicity

// State
let participants = [];
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
    else if (url.pathname === '/api/complete-cell' && req.method === 'POST') {
        completeCell(req, res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

function reset(res) {
    participants = [];
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
            name: name || `Participant ${participants.length + 1}`,
            joinedAt: Date.now()
        };

        participants.push(participant);
        console.log(`✅ ${participant.name} joined (Total: ${participants.length})`);

        // Try to form cells
        tryFormCells();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            participant,
            totalParticipants: participants.length
        }));
    });
}

function tryFormCells() {
    // For Tier 1: Check if we have enough participants without cells
    const tier1Cells = cells.filter(c => c.tier === 1);
    const participantsInTier1Cells = tier1Cells.length * CELL_SIZE;
    const availableForNewCell = participants.length - participantsInTier1Cells;

    if (availableForNewCell >= CELL_SIZE) {
        // Form a new Tier 1 cell
        const cellParticipants = participants.slice(participantsInTier1Cells, participantsInTier1Cells + CELL_SIZE);

        const cell = {
            id: `cell-${cells.length + 1}`,
            tier: 1,
            participants: cellParticipants.map(p => p.id),
            votesNeeded: CELL_SIZE, // Tier 1: cell size
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(cell);
        console.log(`📦 Cell ${cell.id} formed in Tier 1 with ${CELL_SIZE} participants`);
        console.log(`   Participants: ${cellParticipants.map(p => p.name).join(', ')}`);
    }
}

function vote(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { cellId, participantId } = JSON.parse(body);

        const cell = cells.find(c => c.id === cellId);
        if (!cell) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Cell not found' }));
            return;
        }

        // For Tier 2+: Check which group this participant belongs to
        let groupId = null;
        if (cell.tier >= 2 && cell.votingGroups) {
            const group = cell.votingGroups.find(g => g.participants.includes(participantId));
            if (group) {
                groupId = group.groupId;

                // Check if this group already voted
                const groupAlreadyVoted = votes.some(v => v.cellId === cellId && v.groupId === groupId);
                if (groupAlreadyVoted) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Your group already voted' }));
                    return;
                }
            }
        } else {
            // Tier 1: Check individual vote
            const alreadyVoted = votes.some(v => v.cellId === cellId && v.participantId === participantId);
            if (alreadyVoted) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Already voted' }));
                return;
            }
        }

        const vote = {
            id: `vote-${votes.length + 1}`,
            cellId,
            participantId,
            groupId: groupId, // null for Tier 1, set for Tier 2+
            votedAt: Date.now()
        };

        votes.push(vote);

        if (groupId) {
            console.log(`🗳️  Group vote cast in ${cellId} (Group: ${groupId})`);
        } else {
            console.log(`🗳️  Individual vote cast in ${cellId}`);
        }

        // Count votes based on tier
        let voteCount;
        if (cell.tier >= 2) {
            // Tier 2+: Count unique groups that voted
            const uniqueGroups = new Set(votes.filter(v => v.cellId === cellId).map(v => v.groupId));
            voteCount = uniqueGroups.size;
        } else {
            // Tier 1: Count individual votes
            voteCount = votes.filter(v => v.cellId === cellId).length;
        }

        console.log(`   Vote count: ${voteCount}/${cell.votesNeeded}`);

        // Auto-complete cell if it has enough votes
        if (voteCount >= cell.votesNeeded) {
            advanceCell(cell);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, voteCount }));
    });
}

function completeCell(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { cellId } = JSON.parse(body);

        const cell = cells.find(c => c.id === cellId);
        if (!cell) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Cell not found' }));
            return;
        }

        advanceCell(cell);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    });
}

function advanceCell(cell) {
    cell.status = 'completed';
    console.log(`✅ ${cell.id} completed in Tier ${cell.tier}`);

    // Check if we should create next tier cells
    // Only advance when we have 3, 5, or 7 completed cells in current tier
    const completedInCurrentTier = cells.filter(c => c.tier === cell.tier && c.status === 'completed');
    const completedCount = completedInCurrentTier.length;

    console.log(`   ${completedCount} cells completed in Tier ${cell.tier}`);

    // Check if we've hit a prime number (3, 5, or 7)
    const shouldAdvance = completedCount === 3 || completedCount === 5 || completedCount === 7;

    if (!shouldAdvance) {
        console.log(`   Waiting for more cells to complete (need 3, 5, or 7 total)`);
        return;
    }

    console.log(`🎯 ${completedCount} cells completed - creating Tier ${cell.tier + 1}!`);

    // Create next tier cells
    const nextTier = cell.tier + 1;

    // For Tier 2+: Gather groups from completed cells
    let allGroups = [];

    if (nextTier === 2) {
        // Tier 2: Each completed Tier 1 cell becomes a voting group
        allGroups = completedInCurrentTier.map(c => ({
            groupId: c.id, // Use the tier 1 cell ID as group ID
            participants: c.participants
        }));
    } else {
        // Tier 3+: Gather groups from completed tier 2+ cells
        completedInCurrentTier.forEach(c => {
            if (c.votingGroups) {
                allGroups.push(...c.votingGroups);
            }
        });
    }

    console.log(`   Total groups to distribute: ${allGroups.length}`);

    // Form cells from groups (just like we form Tier 1 cells from individuals)
    // Try to form cells of 3, 5, or 7 groups
    let groupsRemaining = [...allGroups];
    let cellsCreated = 0;

    while (groupsRemaining.length >= 3) {
        let cellSize;

        if (groupsRemaining.length >= 5) {
            cellSize = 5;
        } else if (groupsRemaining.length >= 3) {
            cellSize = 3;
        } else {
            break;
        }

        const cellGroups = groupsRemaining.splice(0, cellSize);

        // Gather all participants from these groups
        const cellParticipants = [];
        cellGroups.forEach(g => cellParticipants.push(...g.participants));

        const newCell = {
            id: `cell-${cells.length + 1}`,
            tier: nextTier,
            participants: cellParticipants,
            votingGroups: cellGroups,
            votesNeeded: cellSize, // One vote per group in this cell
            status: 'voting',
            createdAt: Date.now()
        };

        cells.push(newCell);
        cellsCreated++;

        console.log(`📦 ${newCell.id} created in Tier ${nextTier}`);
        console.log(`   Groups in this cell: ${cellGroups.length}`);
        console.log(`   Participants: ${cellParticipants.length}`);
        console.log(`   Votes needed: ${cellSize}`);
    }

    if (groupsRemaining.length > 0) {
        console.log(`   ⚠️  ${groupsRemaining.length} groups remaining (not enough to form a cell)`);
    }

    console.log(`   Created ${cellsCreated} cells in Tier ${nextTier}`);
    currentTier = Math.max(currentTier, nextTier);
}

function getState(res) {
    const state = {
        participants: participants.length,
        cells: cells.map(c => {
            let votesCast;
            if (c.tier >= 2) {
                // Tier 2+: Count unique groups that voted
                const cellVotes = votes.filter(v => v.cellId === c.id);
                const uniqueGroups = new Set(cellVotes.map(v => v.groupId));
                votesCast = uniqueGroups.size;
            } else {
                // Tier 1: Count individual votes
                votesCast = votes.filter(v => v.cellId === c.id).length;
            }

            return {
                id: c.id,
                tier: c.tier,
                participantCount: c.participants.length,
                groupCount: c.votingGroups ? c.votingGroups.length : null,
                groups: c.votingGroups ? c.votingGroups.map(g => ({
                    groupId: g.groupId,
                    participants: g.participants,
                    participantCount: g.participants.length,
                    hasVoted: votes.some(v => v.cellId === c.id && v.groupId === g.groupId)
                })) : null,
                votesNeeded: c.votesNeeded,
                votesCast: votesCast,
                status: c.status,
                votingType: c.tier === 1 ? 'individual' : 'group'
            };
        }),
        currentTier
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
}

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Union Chant v3 (Core Logic) running at http://localhost:${PORT}`);
});
