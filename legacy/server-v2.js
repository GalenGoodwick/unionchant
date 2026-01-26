// Union Chant Server v2 - Live AI Simulation
const http = require('http');
const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Settings
const IDEAL_CELL_SIZE = 5; // Target size
const MIN_CELL_SIZE = 3; // Minimum viable cell
const MAX_CELL_SIZE = 7; // Maximum cell size
const TOTAL_IDEAS = 25; // Default for AI generation
const AI_VOTE_DELAY_MIN = 1000; // 1 second - fast voting
const AI_VOTE_DELAY_MAX = 3000; // 3 seconds - stagger votes
const TIER_1_DEADLINE = 5 * 60 * 1000; // 5 minutes for tier 1
const TIER_N_DEADLINE = 3 * 60 * 1000; // 3 minutes for other tiers

// In-memory data store (for demo - use real DB in production)
let decisions = [];
let ideas = [];
let cells = [];
let votes = [];
let reservations = [];
let activities = []; // Live activity feed
let aiAgents = []; // Active AI agents
let tiers = {}; // Track tier status and deadlines
let tierTimers = {}; // Tier deadline timers
let totalParticipants = 0; // Track total number of participants
let humanVotedInTiers = {}; // Track which tiers the human has voted in
let allIdeasJoined = false; // Track when all ideas have joined in Tier 1

// WebSocket-like connections (simple polling for demo)
let liveConnections = [];

// Create server
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // Routes
    if (url.pathname === '/api/init' && req.method === 'POST') {
        initializeDecision(req, res);
    }
    else if (url.pathname === '/api/ideas' && req.method === 'POST') {
        submitIdea(req, res);
    }
    else if (url.pathname === '/api/generate-ideas' && req.method === 'POST') {
        generateIdeas(req, res);
    }
    else if (url.pathname === '/api/start-simulation' && req.method === 'POST') {
        startSimulation(req, res);
    }
    else if (url.pathname === '/api/find-cell' && req.method === 'POST') {
        findOptimalCell(req, res);
    }
    else if (url.pathname === '/api/reserve-cell' && req.method === 'POST') {
        reserveCell(req, res);
    }
    else if (url.pathname.startsWith('/api/cells/') && req.method === 'GET') {
        const cellId = url.pathname.split('/')[3];
        getCellDetails(cellId, res);
    }
    else if (url.pathname === '/api/vote' && req.method === 'POST') {
        castVote(req, res);
    }
    else if (url.pathname === '/api/tier-progress' && req.method === 'GET') {
        const tier = parseInt(url.searchParams.get('tier'));
        getTierProgress(tier, res);
    }
    else if (url.pathname === '/api/activities' && req.method === 'GET') {
        getActivities(res);
    }
    else if (url.pathname === '/api/user-stats' && req.method === 'GET') {
        const userId = url.searchParams.get('userId');
        getUserStats(userId, res);
    }
    else if (url.pathname === '/api/browse-cells' && req.method === 'GET') {
        const tier = parseInt(url.searchParams.get('tier'));
        browseCells(tier, res);
    }
    else if (url.pathname === '/api/tier-status' && req.method === 'GET') {
        const tier = parseInt(url.searchParams.get('tier'));
        getTierStatus(tier, res);
    }
    else if (url.pathname === '/api/check-winner' && req.method === 'GET') {
        checkWinner(res);
    }
    else if (url.pathname === '/api/reset' && req.method === 'POST') {
        resetSystem(res);
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Initialize a new decision
function initializeDecision(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { prompt } = JSON.parse(body);

        const decision = {
            id: 'decision-1',
            prompt,
            status: 'active',
            createdAt: Date.now(),
            settings: {
                idealCellSize: IDEAL_CELL_SIZE,
                minCellSize: MIN_CELL_SIZE,
                maxCellSize: MAX_CELL_SIZE,
                reservationDuration: 90,
                tieHandling: 'advance-both'
            }
        };

        decisions = [decision];
        ideas = [];
        cells = [];
        votes = [];
        reservations = [];
        activities = [];
        humanVotedInTiers = {};

        addActivity('decision-created', `New decision started: "${prompt}"`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(decision));
    });
}

// Submit an idea
function submitIdea(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { text, author, userId } = JSON.parse(body);

        const idea = {
            id: `idea-${ideas.length + 1}`,
            text,
            author,
            authorId: userId,
            tier: 1,
            status: 'queued',
            timesPresented: 0,
            totalVotes: 0,
            createdAt: Date.now()
        };

        ideas.push(idea);
        addActivity('idea-submitted', `${author} submitted an idea`, userId);

        // Try to form cells
        formCellsIfPossible();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(idea));
    });
}

// Generate AI ideas
function generateIdeas(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { prompt } = JSON.parse(body);

        const message = `Generate EXACTLY 25 diverse, realistic community ideas for: "${prompt}"

Return ONLY valid JSON array with exactly 25 items in this format:
[
  {"author": "Sarah (Teacher)", "text": "Build STEM lab with robotics equipment for hands-on learning."},
  {"author": "Mike (Parent)", "text": "Install speed bumps near schools for child safety."},
  ...exactly 25 total...
]

Each idea must be 1-2 sentences, specific and actionable.`;

        callClaude(message, (err, response) => {
            if (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
                return;
            }

            try {
                const content = response.content[0].text;
                const jsonMatch = content.match(/\[[\s\S]*\]/);
                const generatedIdeas = JSON.parse(jsonMatch[0]);

                // Add all ideas
                generatedIdeas.forEach((ideaData, idx) => {
                    const idea = {
                        id: `idea-${ideas.length + 1}`,
                        text: ideaData.text,
                        author: ideaData.author,
                        authorId: `ai-${idx}`,
                        tier: 1,
                        status: 'queued',
                        timesPresented: 0,
                        totalVotes: 0,
                        createdAt: Date.now()
                    };
                    ideas.push(idea);

                    // Create AI agent for each idea author
                    aiAgents.push({
                        id: `ai-${idx}`,
                        name: ideaData.author,
                        isActive: true
                    });
                });

                addActivity('ai-ideas-generated', `${generatedIdeas.length} AI ideas generated`);

                // Form cells
                formCellsIfPossible();

                // Start AI voting
                startAIVoting();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ count: generatedIdeas.length }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to parse AI response: ' + e.message }));
            }
        });
    });
}

// Start live simulation with gradual participant joining
function startSimulation(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { prompt, totalParticipants: numParticipants, joinRateSeconds, tier1DeadlineMinutes, otherTierDeadlineMinutes, userIdea } = JSON.parse(body);

        // Store tier settings
        decisions[0].tierSettings = {
            tier1Deadline: tier1DeadlineMinutes * 60 * 1000,
            otherTierDeadline: otherTierDeadlineMinutes * 60 * 1000
        };

        // Store total participants count (module-level variable)
        totalParticipants = numParticipants;

        // Check if user submitted their own idea
        let userSubmittedIdea = false;
        if (userIdea && userIdea.author && userIdea.text) {
            // Add user's idea immediately
            const idea = {
                id: `idea-${ideas.length + 1}`,
                text: userIdea.text,
                author: userIdea.author,
                authorId: 'user-human',
                tier: 1,
                status: 'queued',
                timesPresented: 0,
                totalVotes: 0,
                createdAt: Date.now()
            };
            ideas.push(idea);
            userSubmittedIdea = true;
            addActivity('idea-submitted', `${userIdea.author} submitted an idea`);
            console.log(`User submitted idea: "${userIdea.text}"`);
        }

        // Calculate AI ideas
        // If user submitted idea: generate (numParticipants * 0.6 - 1) AI ideas
        // If user didn't submit: generate (numParticipants * 0.6) AI ideas
        const targetIdeas = Math.floor(numParticipants * 0.6);
        const numIdeas = userSubmittedIdea ? Math.max(targetIdeas - 1, 10) : Math.max(targetIdeas, 10);

        console.log(`Generating ${numIdeas} AI ideas for ${numParticipants} total participants${userSubmittedIdea ? ' (including your idea)' : ''}`);

        const message = `Generate EXACTLY ${numIdeas} diverse, realistic community ideas for: "${prompt}"

CRITICAL: Return ONLY a valid JSON array. No extra text before or after.

Format (use DOUBLE QUOTES only, no single quotes):
[
  {"author": "Sarah (Teacher)", "text": "Build STEM lab with robotics equipment for hands-on learning"},
  {"author": "Mike (Parent)", "text": "Install speed bumps near schools for child safety"}
]

Rules:
- Use double quotes, not single quotes
- No trailing commas
- No periods at end of text (causes issues)
- Keep text under 100 characters
- Return exactly ${numIdeas} items`;

        callClaude(message, (err, response) => {
            if (err) {
                console.error('Claude API error:', err);
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
                return;
            }

            try {
                const content = response.content[0].text;
                console.log('Claude response received, parsing ideas...');

                // Extract JSON array from response
                const jsonMatch = content.match(/\[[\s\S]*\]/);
                if (!jsonMatch) {
                    throw new Error('No JSON array found in Claude response');
                }

                // Clean up common JSON formatting issues
                let jsonStr = jsonMatch[0];

                // Remove trailing commas before closing brackets/braces
                jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');

                // Remove any control characters that might break parsing
                jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');

                let generatedIdeas;
                try {
                    console.log('Attempting to parse JSON...');
                    generatedIdeas = JSON.parse(jsonStr);
                    console.log(`Successfully parsed ${generatedIdeas.length} ideas`);
                } catch (parseError) {
                    console.error('JSON parse failed, attempting manual extraction:', parseError.message);

                    // Fallback: manually extract author/text pairs
                    generatedIdeas = [];
                    const authorMatches = jsonStr.matchAll(/"author"\s*:\s*"([^"]+)"/g);
                    const textMatches = jsonStr.matchAll(/"text"\s*:\s*"([^"]+)"/g);

                    const authors = Array.from(authorMatches).map(m => m[1]);
                    const texts = Array.from(textMatches).map(m => m[1]);

                    const count = Math.min(authors.length, texts.length);
                    for (let i = 0; i < count; i++) {
                        generatedIdeas.push({
                            author: authors[i],
                            text: texts[i]
                        });
                    }

                    console.log(`Manually extracted ${generatedIdeas.length} ideas from malformed JSON`);

                    if (generatedIdeas.length === 0) {
                        throw new Error('Could not extract any ideas from response');
                    }
                }

                // Schedule gradual participant joining
                let participantsJoined = 0;
                const joinInterval = setInterval(() => {
                    if (participantsJoined >= numParticipants) {
                        clearInterval(joinInterval);
                        allIdeasJoined = true; // Mark that all ideas have joined
                        addActivity('simulation-complete', `All ${numParticipants} participants have joined!`);
                        // Now form cells with optimal sizing
                        formCellsIfPossible();
                        return;
                    }

                    // Add a participant
                    if (participantsJoined < generatedIdeas.length) {
                        // This participant submits an idea
                        const ideaData = generatedIdeas[participantsJoined];
                        const idea = {
                            id: `idea-${ideas.length + 1}`,
                            text: ideaData.text,
                            author: ideaData.author,
                            authorId: `ai-${participantsJoined}`,
                            tier: 1,
                            status: 'queued',
                            timesPresented: 0,
                            totalVotes: 0,
                            createdAt: Date.now()
                        };
                        ideas.push(idea);

                        // Create AI agent
                        aiAgents.push({
                            id: `ai-${participantsJoined}`,
                            name: ideaData.author,
                            isActive: true,
                            hasIdea: true
                        });

                        addActivity('participant-joined', `${ideaData.author} joined and submitted an idea`);
                    } else {
                        // This participant just votes (no idea)
                        const voterNames = ['Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor', 'Jamie', 'Avery', 'Quinn', 'Dakota'];
                        const voterRoles = ['Resident', 'Neighbor', 'Community Member', 'Voter', 'Citizen'];
                        const voterName = `${voterNames[Math.floor(Math.random() * voterNames.length)]} (${voterRoles[Math.floor(Math.random() * voterRoles.length)]})`;

                        aiAgents.push({
                            id: `ai-${participantsJoined}`,
                            name: voterName,
                            isActive: true,
                            hasIdea: false
                        });

                        addActivity('participant-joined', `${voterName} joined to vote`);
                    }

                    participantsJoined++;

                    // Try to form cells with new ideas
                    formCellsIfPossible();

                }, joinRateSeconds * 1000);

                // Start AI voting immediately
                console.log('AI voting system starting now');
                startAIVoting();

                // Start tier 1 timer
                startTierTimer(1);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    started: true,
                    totalParticipants: numParticipants,
                    expectedIdeas: numIdeas,
                    joinRateSeconds,
                    tier1DeadlineMinutes,
                    otherTierDeadlineMinutes
                }));
            } catch (e) {
                console.error('Error in startSimulation:', e);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to parse AI response: ' + e.message }));
            }
        });
    });
}

// Find optimal cell for user
function findOptimalCell(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { userId, tier } = JSON.parse(body);

        // Check for final vote first (highest priority)
        const finalVote = cells.find(c => c.isFinalVote && c.status === 'voting');
        if (finalVote) {
            const alreadyVoted = votes.some(v => v.userId === userId && v.cellId === finalVote.id);
            if (!alreadyVoted) {
                const voteCount = votes.filter(v => v.cellId === finalVote.id).length;
                const activeReservations = reservations.filter(r =>
                    r.cellId === finalVote.id &&
                    r.expiresAt > Date.now()
                ).length;

                if (voteCount + activeReservations < finalVote.votesNeeded) {
                    // Return final vote!
                    const cellIdeas = finalVote.ideaIds.map(id => ideas.find(i => i.id === id));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        cell: {
                            ...finalVote,
                            ideas: cellIdeas,
                            voteCount
                        }
                    }));
                    return;
                }
            }
        }

        // Get eligible cells (normal tier cells)
        const eligibleCells = cells.filter(cell => {
            if (cell.isFinalVote) return false; // Skip final vote, we handled it above
            if (cell.tier !== tier) return false;
            if (cell.status !== 'voting') return false;

            // Check if user already voted in this tier
            const alreadyVoted = votes.some(v =>
                v.userId === userId &&
                cells.find(c => c.id === v.cellId && c.tier === tier)
            );
            if (alreadyVoted) return false;

            // Check if cell has user's own idea
            const cellIdeas = cell.ideaIds.map(id => ideas.find(i => i.id === id));
            const hasOwnIdea = cellIdeas.some(idea => idea.authorId === userId);
            if (hasOwnIdea) return false;

            // Check if cell is full (votes + reservations)
            const voteCount = votes.filter(v => v.cellId === cell.id).length;
            const activeReservations = reservations.filter(r =>
                r.cellId === cell.id &&
                r.expiresAt > Date.now()
            ).length;
            if (voteCount + activeReservations >= cell.votesNeeded) return false;

            return true;
        });

        if (eligibleCells.length === 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cell: null, message: 'No cells available' }));
            return;
        }

        // Priority: almost full cells first
        eligibleCells.sort((a, b) => {
            const aVotes = votes.filter(v => v.cellId === a.id).length;
            const bVotes = votes.filter(v => v.cellId === b.id).length;

            // Almost full (6 votes) = highest priority
            if (aVotes === 6) return -1;
            if (bVotes === 6) return 1;
            if (aVotes === 5 && bVotes < 5) return -1;
            if (bVotes === 5 && aVotes < 5) return 1;

            // Otherwise random
            return Math.random() - 0.5;
        });

        const optimalCell = eligibleCells[0];
        const cellIdeas = optimalCell.ideaIds.map(id => ideas.find(i => i.id === id));
        const voteCount = votes.filter(v => v.cellId === optimalCell.id).length;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            cell: {
                ...optimalCell,
                ideas: cellIdeas,
                voteCount
            }
        }));
    });
}

// Reserve a spot in a cell
function reserveCell(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { userId, cellId } = JSON.parse(body);

        // Check if cell is still available
        const cell = cells.find(c => c.id === cellId);
        if (!cell || cell.status !== 'voting') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Cell not available' }));
            return;
        }

        const voteCount = votes.filter(v => v.cellId === cellId).length;
        const activeReservations = reservations.filter(r =>
            r.cellId === cellId &&
            r.expiresAt > Date.now()
        ).length;

        if (voteCount + activeReservations >= cell.votesNeeded) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Cell is full' }));
            return;
        }

        // Create reservation
        const reservation = {
            id: `res-${reservations.length + 1}`,
            userId,
            cellId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (90 * 1000) // 90 seconds
        };

        reservations.push(reservation);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reservation }));
    });
}

// Get cell details
function getCellDetails(cellId, res) {
    const cell = cells.find(c => c.id === cellId);
    if (!cell) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Cell not found' }));
        return;
    }

    const cellIdeas = cell.ideaIds.map(id => ideas.find(i => i.id === id));
    const cellVotes = votes.filter(v => v.cellId === cellId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        cell: {
            ...cell,
            ideas: cellIdeas,
            votes: cellVotes
        }
    }));
}

// Cast a vote
function castVote(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const { userId, cellId, ideaId, comment, reactions } = JSON.parse(body);

        // Validate
        const cell = cells.find(c => c.id === cellId);
        if (!cell || cell.status !== 'voting') {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Cell not available' }));
            return;
        }

        // Check if already voted
        const alreadyVoted = votes.some(v => v.userId === userId && v.cellId === cellId);
        if (alreadyVoted) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Already voted in this cell' }));
            return;
        }

        // Remove reservation
        reservations = reservations.filter(r => !(r.userId === userId && r.cellId === cellId));

        // Cast vote
        const vote = {
            id: `vote-${votes.length + 1}`,
            userId,
            cellId,
            ideaId,
            comment: comment || '',
            reactions: reactions || [],
            votedAt: Date.now()
        };

        votes.push(vote);

        // Update idea stats
        const idea = ideas.find(i => i.id === ideaId);
        idea.totalVotes++;

        const voteCount = votes.filter(v => v.cellId === cellId).length;

        // Get user name for activity
        const userIdea = ideas.find(i => i.authorId === userId);
        const userName = userIdea ? userIdea.author.split(' (')[0] : 'Someone';

        // Check if this is the human user (not an AI agent)
        const isHuman = !aiAgents.some(agent => agent.id === userId);
        if (isHuman) {
            humanVotedInTiers[cell.tier] = true;
            console.log(`✅ Human voted in tier ${cell.tier}`);
        }

        addActivity('vote-cast', `${userName} voted in Cell #${cell.id.split('-')[1]}`, userId);

        // Check if cell is complete
        if (voteCount === cell.votesNeeded) {
            completeCell(cellId);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            voteCount,
            cellComplete: voteCount === cell.votesNeeded
        }));
    });
}

// Complete a cell
function completeCell(cellId) {
    const cell = cells.find(c => c.id === cellId);
    cell.status = 'completed';
    cell.completedAt = Date.now();

    const cellVotes = votes.filter(v => v.cellId === cellId);

    // Tally votes
    const voteCounts = {};
    cellVotes.forEach(vote => {
        voteCounts[vote.ideaId] = (voteCounts[vote.ideaId] || 0) + 1;
    });

    // Find winner(s)
    const maxVotes = Math.max(...Object.values(voteCounts));
    const winnerIds = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

    // Handle final vote differently
    if (cell.isFinalVote) {
        // CRITICAL: Check if human has voted in the final vote
        const humanVotedInFinal = cellVotes.some(v => !aiAgents.some(agent => agent.id === v.userId));

        if (!humanVotedInFinal && voteCount < cell.votesNeeded) {
            console.log('⏳ Final vote has votes but human hasn\'t voted yet - waiting...');
            // Don't complete yet - wait for human
            return;
        }

        // This is the final vote - declare the winner!
        winnerIds.forEach(winnerId => {
            const idea = ideas.find(i => i.id === winnerId);
            idea.status = 'final-winner';
            addActivity('final-winner', `🏆 FINAL WINNER: "${idea.text}"`);
        });

        // Mark losers
        Object.keys(voteCounts).forEach(ideaId => {
            if (!winnerIds.includes(ideaId)) {
                const idea = ideas.find(i => i.id === ideaId);
                idea.status = 'final-runner-up';
            }
        });

        cell.winnerIds = winnerIds;
        addActivity('final-vote-completed', `🎉 Final vote completed! Winner${winnerIds.length > 1 ? 's' : ''} determined!`);
        return;
    }

    // Normal cell completion (not final vote)
    // Advance winners to next tier
    winnerIds.forEach(winnerId => {
        const idea = ideas.find(i => i.id === winnerId);
        idea.tier++;
        idea.status = 'queued';

        addActivity('idea-advanced', `"${idea.text.substring(0, 50)}..." advanced to Tier ${idea.tier}`);
    });

    // Handle recycling (2+ votes but didn't win)
    Object.keys(voteCounts).forEach(ideaId => {
        if (!winnerIds.includes(ideaId) && voteCounts[ideaId] >= 2) {
            const idea = ideas.find(i => i.id === ideaId);
            if (idea.timesPresented < 3) {
                idea.status = 'recycled';
                idea.tier = cell.tier; // Stay in same tier
                addActivity('idea-recycled', `"${idea.text.substring(0, 50)}..." gets another chance`);
            } else {
                idea.status = 'eliminated';
            }
        } else if (!winnerIds.includes(ideaId)) {
            const idea = ideas.find(i => i.id === ideaId);
            idea.status = 'eliminated';
        }
    });

    cell.winnerIds = winnerIds;

    addActivity('cell-completed', `Cell #${cell.id.split('-')[1]} completed in Tier ${cell.tier}!`);

    // Try to form new cells
    formCellsIfPossible();

    // Check if we should declare a winner (in case too few ideas advanced)
    setTimeout(() => {
        checkForFinalVote(cell.tier);
    }, 2000);
}

// Form cells if we have enough ideas (flexible sizing)
function formCellsIfPossible() {
    for (let tier = 1; tier <= 5; tier++) {
        const queuedIdeas = ideas.filter(i =>
            i.tier === tier &&
            (i.status === 'queued' || i.status === 'recycled') &&
            i.timesPresented < 3
        );

        // For Tier 1: Wait until all ideas have joined before forming cells
        // This ensures we get optimal 5-idea cells instead of rushing with 3
        if (tier === 1 && !allIdeasJoined) {
            continue; // Skip Tier 1 cell formation until all ideas have joined
        }

        // Form cells using flexible sizing
        while (queuedIdeas.length >= MIN_CELL_SIZE) {
            let cellSize;

            // Determine optimal cell size
            if (queuedIdeas.length >= IDEAL_CELL_SIZE) {
                // Try to form ideal-sized cells
                cellSize = IDEAL_CELL_SIZE;
            } else if (queuedIdeas.length >= MIN_CELL_SIZE) {
                // Form a smaller cell with remaining ideas
                cellSize = Math.min(queuedIdeas.length, MAX_CELL_SIZE);
            } else {
                // Not enough ideas, wait for more
                break;
            }

            const cellIdeas = queuedIdeas.splice(0, cellSize);

            // Calculate votes needed:
            // Tier 1: votes needed = cell size (5 ideas = 5 votes)
            // Tier 2+: votes needed = totalParticipants ÷ number of Tier 1 cells
            let votesNeeded;
            if (tier === 1) {
                votesNeeded = cellSize;
            } else {
                // Count how many cells were in Tier 1
                const tier1CellCount = cells.filter(c => c.tier === 1 && c.status === 'completed').length;
                if (tier1CellCount > 0) {
                    votesNeeded = Math.ceil(totalParticipants / tier1CellCount);
                } else {
                    // Fallback if somehow no tier 1 cells completed yet
                    votesNeeded = cellSize;
                }
            }

            const cell = {
                id: `cell-${cells.length + 1}`,
                tier,
                status: 'voting',
                ideaIds: cellIdeas.map(i => i.id),
                votesNeeded: votesNeeded,
                createdAt: Date.now(),
                votingDeadline: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
            };

            cells.push(cell);

            // Mark ideas as in-cell
            cellIdeas.forEach(idea => {
                idea.status = 'in-cell';
                idea.timesPresented++;
            });

            addActivity('cell-formed', `✨ New ${cellSize}-idea cell ready for voting in Tier ${tier}!`);

            // Start tier timer if this is the first cell in this tier
            if (!tiers[tier]) {
                startTierTimer(tier);
            }
        }
    }
}

// Start tier deadline timer
function startTierTimer(tier) {
    if (tiers[tier] || tierTimers[tier]) return; // Already started

    const deadline = tier === 1
        ? (decisions[0]?.tierSettings?.tier1Deadline || TIER_1_DEADLINE)
        : (decisions[0]?.tierSettings?.otherTierDeadline || TIER_N_DEADLINE);

    tiers[tier] = {
        startedAt: Date.now(),
        deadline: Date.now() + deadline,
        status: 'active'
    };

    addActivity('tier-started', `⏰ Tier ${tier} started! Deadline in ${Math.round(deadline / 60000)} minutes`);

    // Set timer to complete tier when deadline expires
    tierTimers[tier] = setTimeout(() => {
        completeTier(tier);
    }, deadline);
}

// Complete a tier (deadline expired)
function completeTier(tier) {
    if (!tiers[tier] || tiers[tier].status === 'completed') return;

    // Check if human has voted in this tier
    if (!humanVotedInTiers[tier]) {
        console.log(`⏳ Tier ${tier} deadline reached, but human hasn't voted yet. Extending deadline by 30 seconds...`);
        // Extend the deadline by 30 seconds
        tiers[tier].deadline = Date.now() + 30000;
        addActivity('tier-extended', `⏳ Tier ${tier} deadline extended - waiting for human vote`);

        // Set a new timer
        tierTimers[tier] = setTimeout(() => {
            completeTier(tier);
        }, 30000);
        return;
    }

    tiers[tier].status = 'completed';
    addActivity('tier-completed', `⏱️ Tier ${tier} deadline reached!`);

    // Force complete all incomplete cells in this tier
    const incompleteCells = cells.filter(c => c.tier === tier && c.status === 'voting');

    incompleteCells.forEach(cell => {
        const voteCount = votes.filter(v => v.cellId === cell.id).length;

        if (voteCount >= 2) {
            // Has at least 2 votes, can determine winner
            completeCell(cell.id);
            addActivity('cell-force-completed', `Cell #${cell.id.split('-')[1]} completed due to tier deadline`);
        } else {
            // Not enough votes, eliminate all ideas in this cell
            cell.status = 'abandoned';
            cell.ideaIds.forEach(ideaId => {
                const idea = ideas.find(i => i.id === ideaId);
                idea.status = 'eliminated';
            });
        }
    });

    // Wait a bit for cells to complete, then try to form new cells and check for final vote
    setTimeout(() => {
        formCellsIfPossible();

        // Give a moment for new cells to form, then check if we're done
        setTimeout(() => {
            // Check all higher tiers for winner conditions too
            for (let t = tier; t <= 10; t++) {
                checkForFinalVote(t);
            }
        }, 1000);
    }, 1000);
}

// Check if we need a final consolidation vote
function checkForFinalVote(tier) {
    // FIRST: Check if the CURRENT tier still has active cells voting
    const currentTierActiveCells = cells.filter(c => c.tier === tier && c.status === 'voting');
    if (currentTierActiveCells.length > 0) {
        console.log(`Tier ${tier} still has ${currentTierActiveCells.length} active cells voting, not finalizing yet`);
        return;
    }

    // Check if this tier is still active (deadline not reached)
    const tierInfo = tiers[tier + 1];
    if (tierInfo && tierInfo.status === 'active') {
        console.log(`Tier ${tier + 1} is still active (deadline not reached), not finalizing yet`);
        return;
    }

    // Check if there are any active cells in higher tiers
    const hasHigherTierCells = cells.some(c => c.tier > tier && (c.status === 'voting' || c.status === 'in-cell'));

    // Check if there are queued ideas in the next tier that could form cells
    const nextTierQueuedIdeas = ideas.filter(i => i.tier === tier + 1 && (i.status === 'queued' || i.status === 'recycled'));

    // Check if next tier has active cells
    const nextTierActiveCells = cells.filter(c => c.tier === tier + 1 && c.status === 'voting');

    // NEW: Check ALL higher tiers for any queued ideas
    const allHigherTierIdeas = ideas.filter(i => i.tier > tier && (i.status === 'queued' || i.status === 'recycled' || i.status === 'in-cell'));

    console.log(`Tier ${tier} check: Next tier has ${nextTierQueuedIdeas.length} queued ideas, ${nextTierActiveCells.length} active cells, ${allHigherTierIdeas.length} total higher tier ideas`);

    // If there are active cells or enough ideas to form cells in higher tiers, don't finalize yet
    if (hasHigherTierCells || nextTierActiveCells.length > 0 || nextTierQueuedIdeas.length >= MIN_CELL_SIZE) {
        console.log(`Waiting for tier ${tier + 1} to complete before finalizing...`);
        return;
    }

    // Get all ideas that advanced from this tier (for final vote consideration)
    const advancedIdeas = ideas.filter(i => i.tier === tier + 1 && i.status === 'queued');

    console.log(`Tier ${tier + 1} has ${advancedIdeas.length} queued ideas - checking if we should finalize`);

    // CRITICAL: Don't finalize if human hasn't voted in this tier yet
    if (!humanVotedInTiers[tier]) {
        console.log(`❌ Cannot finalize tier ${tier} - human hasn't voted yet`);
        return;
    }

    // If 2-7 ideas remain and no higher tier activity, create final vote
    if (advancedIdeas.length >= 2 && advancedIdeas.length <= MAX_CELL_SIZE) {
        // Check if final vote already exists
        const existingFinalVote = cells.find(c => c.isFinalVote);
        if (existingFinalVote) {
            console.log('Final vote already exists, skipping');
            return;
        }

        console.log(`Creating final vote with ${advancedIdeas.length} ideas`);
        // Create final consolidation vote
        setTimeout(() => {
            createFinalVote(advancedIdeas);
        }, 2000);
    } else if (advancedIdeas.length === 1) {
        // Only one idea left - declare winner!
        const winner = advancedIdeas[0];

        // Don't re-declare if already a winner
        const existingWinner = ideas.find(i => i.status === 'final-winner');
        if (existingWinner) {
            console.log('Winner already declared, skipping');
            return;
        }

        console.log(`Declaring winner: "${winner.text}"`);
        winner.status = 'final-winner';

        // Create a special "winner announcement" cell so users can see results
        const winnerCell = {
            id: `cell-winner`,
            tier: 'winner',
            status: 'completed',
            ideaIds: [winner.id],
            winnerIds: [winner.id],
            votesNeeded: 0,
            createdAt: Date.now(),
            isWinnerAnnouncement: true
        };
        cells.push(winnerCell);

        addActivity('final-winner', `🏆 FINAL WINNER: "${winner.text}"`);
        console.log(`Final winner declared: ${winner.text}`);
    } else if (advancedIdeas.length === 0 && allHigherTierIdeas.length === 0) {
        // No ideas left at all - this shouldn't happen but handle it
        console.log('WARNING: No ideas remain in any tier!');
    }
}

// Create final consolidation vote for remaining top ideas
function createFinalVote(finalIdeas) {
    const finalCell = {
        id: `cell-final`,
        tier: 'final',
        status: 'voting',
        ideaIds: finalIdeas.map(i => i.id),
        votesNeeded: totalParticipants || finalIdeas.length, // Need ALL participants to vote
        createdAt: Date.now(),
        isFinalVote: true,
        reservedForHumans: Date.now() + (60 * 1000) // Reserve for 60 seconds for human voters
    };

    cells.push(finalCell);

    finalIdeas.forEach(idea => {
        idea.status = 'in-final-vote';
        idea.tier = 'final';
    });

    addActivity('final-vote-created', `🗳️ FINAL VOTE: ${finalIdeas.length} top ideas competing for the win! All participants please vote!`);
}

// Get tier progress
function getTierProgress(tier, res) {
    const tierCells = cells.filter(c => c.tier === tier);
    const completedCells = tierCells.filter(c => c.status === 'completed');
    const votingCells = tierCells.filter(c => c.status === 'voting');

    const totalVotes = votes.filter(v => {
        const cell = cells.find(c => c.id === v.cellId);
        return cell && cell.tier === tier;
    }).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        tier,
        totalCells: tierCells.length,
        completedCells: completedCells.length,
        votingCells: votingCells.length,
        totalVotes,
        progress: tierCells.length > 0 ? (completedCells.length / tierCells.length) : 0
    }));
}

// Get tier status (deadline info)
function getTierStatus(tier, res) {
    const tierInfo = tiers[tier];

    if (!tierInfo) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ active: false }));
        return;
    }

    const timeRemaining = tierInfo.deadline - Date.now();
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    const secondsRemaining = Math.floor((timeRemaining % 60000) / 1000);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        active: true,
        status: tierInfo.status,
        deadline: tierInfo.deadline,
        timeRemaining,
        minutesRemaining,
        secondsRemaining,
        expired: timeRemaining <= 0
    }));
}

// Check if there's a winner
function checkWinner(res) {
    const winner = ideas.find(i => i.status === 'final-winner');
    const finalVote = cells.find(c => c.isFinalVote);
    const winnerCell = cells.find(c => c.isWinnerAnnouncement);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        hasWinner: !!winner,
        winner: winner || null,
        hasFinalVote: !!finalVote && finalVote.status === 'voting',
        finalVoteCompleted: !!finalVote && finalVote.status === 'completed',
        winnerCell: winnerCell || null
    }));
}

// Reset system
function resetSystem(res) {
    // Clear all data
    decisions = [];
    ideas = [];
    cells = [];
    votes = [];
    reservations = [];
    activities = [];
    aiAgents = [];
    tiers = {};
    totalParticipants = 0;
    humanVotedInTiers = {};
    allIdeasJoined = false;

    // Clear all timers
    Object.values(tierTimers).forEach(timer => clearTimeout(timer));
    tierTimers = {};

    console.log('System reset completed');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
}

// Get activities
function getActivities(res) {
    const recent = activities.slice(-20).reverse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ activities: recent }));
}

// Get user stats
function getUserStats(userId, res) {
    const userVotes = votes.filter(v => v.userId === userId);
    const userIdea = ideas.find(i => i.authorId === userId);

    // Calculate success rate (how many of their picks advanced)
    let successCount = 0;
    userVotes.forEach(vote => {
        const cell = cells.find(c => c.id === vote.cellId);
        if (cell && cell.winnerIds && cell.winnerIds.includes(vote.ideaId)) {
            successCount++;
        }
    });

    const stats = {
        votescast: userVotes.length,
        successRate: userVotes.length > 0 ? (successCount / userVotes.length) : 0,
        ideaStatus: userIdea ? userIdea.status : null,
        ideaTier: userIdea ? userIdea.tier : null,
        commentsLeft: userVotes.filter(v => v.comment).length,
        achievements: []
    };

    // Achievements
    if (userVotes.length > 0) stats.achievements.push('⭐ Participant');
    if (stats.commentsLeft >= 2) stats.achievements.push('💬 Thoughtful');
    if (stats.successRate === 1 && userVotes.length >= 2) stats.achievements.push('🎯 Consensus Builder');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stats }));
}

// Add activity to feed
function addActivity(type, message, userId = null) {
    activities.push({
        id: `activity-${activities.length + 1}`,
        type,
        message,
        userId,
        timestamp: Date.now()
    });
}

// Call Claude API
function callClaude(userMessage, callback) {
    const data = JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [{ role: 'user', content: userMessage }]
    });

    const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length': data.length
        }
    };

    const apiReq = https.request(options, (apiRes) => {
        let responseData = '';
        apiRes.on('data', chunk => responseData += chunk);
        apiRes.on('end', () => {
            try {
                const response = JSON.parse(responseData);
                callback(null, response);
            } catch (e) {
                callback(e, null);
            }
        });
    });

    apiReq.on('error', (e) => callback(e, null));
    apiReq.write(data);
    apiReq.end();
}

// Browse all cells in a tier
function browseCells(tier, res) {
    const tierCells = cells.filter(c => c.tier === tier);

    const cellsWithDetails = tierCells.map(cell => {
        const cellIdeas = cell.ideaIds.map(id => ideas.find(i => i.id === id));
        const voteCount = votes.filter(v => v.cellId === cell.id).length;

        return {
            ...cell,
            ideas: cellIdeas,
            voteCount
        };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cells: cellsWithDetails }));
}

// AI Voting System
function startAIVoting() {
    console.log('🤖 AI voting system started');

    // Check for cells needing votes every 2 seconds (faster but prevents race conditions)
    setInterval(() => {
        voteWithAI();
    }, 2000);
}

async function voteWithAI() {
    // Find cells that need votes
    const votingCells = cells.filter(c => {
        if (c.status !== 'voting') return false;

        // Skip final vote if still reserved for humans
        if (c.isFinalVote && c.reservedForHumans && Date.now() < c.reservedForHumans) {
            return false;
        }

        const voteCount = votes.filter(v => v.cellId === c.id).length;
        return voteCount < c.votesNeeded;
    });

    for (const cell of votingCells) {
        const voteCount = votes.filter(v => v.cellId === cell.id).length;
        const activeReservations = reservations.filter(r =>
            r.cellId === cell.id &&
            r.expiresAt > Date.now()
        ).length;
        const spotsNeeded = cell.votesNeeded - voteCount - activeReservations;

        // Skip if no spots available (all taken by votes or reservations)
        if (spotsNeeded <= 0) continue;

        // Find AI agents who haven't voted in this tier yet
        const availableAgents = aiAgents.filter(agent => {
            // Each agent votes ONCE per tier (except final vote where all vote together)
            const alreadyVotedInTier = votes.some(v => {
                const voteCell = cells.find(c => c.id === v.cellId);
                return v.userId === agent.id && voteCell && voteCell.tier === cell.tier;
            });

            if (alreadyVotedInTier) return false;

            // Check if cell has agent's own idea
            const cellIdeas = cell.ideaIds.map(id => ideas.find(i => i.id === id));
            const hasOwnIdea = cellIdeas.some(idea => idea.authorId === agent.id);

            return !hasOwnIdea;
        });

        if (availableAgents.length > 0 && spotsNeeded > 0) {
            // Pick ONE random agent to vote (prevents race conditions from simultaneous votes)
            const randomAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];

            // Vote after a random delay
            const delay = AI_VOTE_DELAY_MIN + Math.random() * (AI_VOTE_DELAY_MAX - AI_VOTE_DELAY_MIN);

            setTimeout(() => {
                castAIVote(randomAgent, cell);
            }, delay);
        }
    }
}

function castAIVote(agent, cell) {
    // CRITICAL: Check if this agent already voted in this cell
    const alreadyVotedInCell = votes.some(v => v.userId === agent.id && v.cellId === cell.id);
    if (alreadyVotedInCell) {
        console.log(`Agent ${agent.name} already voted in cell ${cell.id}, skipping`);
        return; // Already voted, skip
    }

    // Check if this agent already voted in this tier (one vote per tier rule)
    // Note: voteWithAI() already filters for this, but double-check to prevent race conditions
    const alreadyVotedInTier = votes.some(v => {
        if (v.userId !== agent.id) return false;
        const voteCell = cells.find(c => c.id === v.cellId);
        return voteCell && voteCell.tier === cell.tier;
    });
    if (alreadyVotedInTier) {
        console.log(`Agent ${agent.name} already voted in tier ${cell.tier}, skipping`);
        return; // Already voted in this tier, skip
    }

    // Check if cell still needs votes (including reservations)
    const voteCount = votes.filter(v => v.cellId === cell.id).length;
    const activeReservations = reservations.filter(r =>
        r.cellId === cell.id &&
        r.expiresAt > Date.now()
    ).length;

    // Don't vote if cell is full or has reservations
    if (voteCount + activeReservations >= cell.votesNeeded) {
        if (activeReservations > 0) {
            console.log(`⏳ AI agent ${agent.name} waiting - Cell #${cell.id.split('-')[1]} has ${activeReservations} reservation(s)`);
        }
        return;
    }

    // Pick a random idea to vote for
    const cellIdeas = cell.ideaIds
        .map(id => ideas.find(i => i.id === id))
        .filter(idea => idea.authorId !== agent.id); // Don't vote for own idea

    if (cellIdeas.length === 0) return;

    const randomIdea = cellIdeas[Math.floor(Math.random() * cellIdeas.length)];

    // Cast vote
    const vote = {
        id: `vote-${votes.length + 1}`,
        userId: agent.id,
        cellId: cell.id,
        ideaId: randomIdea.id,
        comment: '', // AI doesn't comment for now
        reactions: getRandomReactions(),
        votedAt: Date.now()
    };

    votes.push(vote);

    // Update idea stats
    randomIdea.totalVotes++;

    const newVoteCount = votes.filter(v => v.cellId === cell.id).length;

    addActivity('vote-cast', `${agent.name.split(' (')[0]} voted in Cell #${cell.id.split('-')[1]}`, agent.id);

    // Check if cell is complete
    if (newVoteCount === cell.votesNeeded) {
        completeCell(cell.id);
    }
}

function getRandomReactions() {
    const allReactions = ['practical', 'creative', 'sustainable', 'affordable', 'inclusive', 'high-impact'];
    const count = Math.floor(Math.random() * 3) + 1; // 1-3 reactions
    const selected = [];

    for (let i = 0; i < count; i++) {
        const reaction = allReactions[Math.floor(Math.random() * allReactions.length)];
        if (!selected.includes(reaction)) {
            selected.push(reaction);
        }
    }

    return selected;
}

// Clean up expired reservations periodically
setInterval(() => {
    const before = reservations.length;
    reservations = reservations.filter(r => r.expiresAt > Date.now());
    if (reservations.length < before) {
        console.log(`Cleaned up ${before - reservations.length} expired reservations`);
    }
}, 10000); // Every 10 seconds

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Union Chant Server v2 running at http://localhost:${PORT}`);
    console.log(`\n✨ Optimized for engagement and fairness!\n`);
});
