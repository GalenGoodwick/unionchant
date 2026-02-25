const fs = require('fs');
const envFile = fs.readFileSync('/Users/galengoodwick/Documents/GitHub/unionchant/web/.env.local', 'utf8');
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk').default;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const anthropic = new Anthropic();

// Use the chant we already created with ideas
const CHANT_ID = 'cmly8g5cn0000vcuf9j7oqhnr';
const QUESTION = 'What should be the front door of Unity Chant?';

async function callHaiku(system, user) {
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return r.content[0].text.trim();
}

async function main() {
  // Get participants
  const children = await prisma.shell.findMany({
    where: { status: 'active', originDeliberationId: { not: null } },
    select: { id: true, name: true, champion: true, ownerId: true }
  });
  const shell = await prisma.shell.findFirst({
    where: { status: 'active', originDeliberationId: null },
    select: { id: true, name: true, champion: true, ownerId: true }
  });
  const agents = await prisma.user.findMany({
    where: { isAI: true },
    select: { id: true, name: true, aiPersonality: true, ideology: true },
    take: 5
  });

  const parentUserId = children[0].ownerId;
  // All unique user IDs that are in the chant
  const allUserIds = [parentUserId, ...agents.map(a => a.id)];

  // Get ideas
  const ideas = await prisma.idea.findMany({
    where: { deliberationId: CHANT_ID },
    select: { id: true, text: true, authorId: true }
  });
  console.log(`${ideas.length} ideas in chant\n`);

  // Update all ideas to IN_VOTING
  await prisma.idea.updateMany({
    where: { deliberationId: CHANT_ID },
    data: { status: 'IN_VOTING', tier: 1 }
  });

  // Shuffle ideas into cells of 5
  const shuffled = ideas.sort(() => Math.random() - 0.5);
  const cellSize = 5;
  const numCells = Math.ceil(shuffled.length / cellSize);

  // Build voter pool — we need 5 voters per cell
  // Each "voter" is a perspective: a child, Shell, or agent
  const voterPool = [];
  // Shell
  if (shell) voterPool.push({ userId: parentUserId, name: shell.name, perspective: shell.champion || '' });
  // Children (all share parentUserId but have distinct perspectives)
  for (const c of children) {
    voterPool.push({ userId: parentUserId, name: c.name, perspective: c.champion || '' });
  }
  // Agents
  for (const a of agents) {
    voterPool.push({ userId: a.id, name: a.name, perspective: a.ideology || a.aiPersonality || '' });
  }

  console.log(`--- TIER 1: ${numCells} cells ---\n`);

  const cellWinners = [];

  for (let i = 0; i < numCells; i++) {
    const cellIdeas = shuffled.slice(i * cellSize, (i + 1) * cellSize);
    if (cellIdeas.length === 0) continue;

    // Pick 5 voters for this cell (round-robin from pool)
    const cellVoters = [];
    for (let v = 0; v < 5; v++) {
      cellVoters.push(voterPool[(i * 5 + v) % voterPool.length]);
    }

    // Create cell
    const cell = await prisma.cell.create({
      data: {
        deliberationId: CHANT_ID,
        tier: 1,
        status: 'VOTING',
        votingStartedAt: new Date(),
      }
    });

    // Add ideas
    for (const idea of cellIdeas) {
      await prisma.cellIdea.create({ data: { cellId: cell.id, ideaId: idea.id } });
    }

    // Add participants (unique userIds only)
    const addedUsers = new Set();
    for (const voter of cellVoters) {
      if (!addedUsers.has(voter.userId)) {
        await prisma.cellParticipation.create({
          data: { cellId: cell.id, userId: voter.userId, status: 'ACTIVE' }
        }).catch(() => {});
        addedUsers.add(voter.userId);
      }
    }

    console.log(`Cell ${i + 1}: ${cellIdeas.map(ci => ci.text.slice(1, ci.text.indexOf(']')).trim()).join(', ')}`);

    // Each voter distributes 10 XP across ideas
    const ideaXP = {};
    cellIdeas.forEach(ci => { ideaXP[ci.id] = 0; });

    for (const voter of cellVoters) {
      const ideaList = cellIdeas.map((ci, idx) => `${idx + 1}. ${ci.text.slice(0, 80)}`).join('\n');

      const response = await callHaiku(
        `You are ${voter.name}. Perspective: "${voter.perspective.slice(0, 150)}". Distribute exactly 10 XP across these ideas. Give more XP to better ideas. Format: "1:4, 2:3, 3:2, 4:1, 5:0" (must sum to 10). Numbers only.`,
        `"${QUESTION}"\n\n${ideaList}\n\nYour XP distribution:`
      );

      // Parse XP distribution
      const xpMap = {};
      const matches = response.matchAll(/(\d+)\s*[:=]\s*(\d+)/g);
      for (const m of matches) {
        const idx = parseInt(m[1]) - 1;
        const xp = parseInt(m[2]);
        if (idx >= 0 && idx < cellIdeas.length && xp >= 0) {
          xpMap[idx] = xp;
        }
      }

      // Create votes
      for (const [idxStr, xp] of Object.entries(xpMap)) {
        const idx = parseInt(idxStr);
        if (xp > 0) {
          await prisma.vote.create({
            data: { cellId: cell.id, userId: voter.userId, ideaId: cellIdeas[idx].id, xpPoints: xp }
          }).catch(() => {}); // ignore dupes (same userId voting on same idea)
          ideaXP[cellIdeas[idx].id] = (ideaXP[cellIdeas[idx].id] || 0) + xp;
        }
      }
      console.log(`  ${voter.name}: ${response.slice(0, 50)}`);
    }

    // Find winner (highest XP)
    const sorted = Object.entries(ideaXP).sort((a, b) => b[1] - a[1]);
    const winnerId = sorted[0][0];
    const winnerXP = sorted[0][1];
    const winnerIdea = cellIdeas.find(ci => ci.id === winnerId);

    await prisma.idea.update({ where: { id: winnerId }, data: { status: 'ADVANCING', totalXP: winnerXP } });
    for (const [id, xp] of sorted.slice(1)) {
      await prisma.idea.update({ where: { id }, data: { status: 'ELIMINATED', totalXP: xp } });
    }
    await prisma.cell.update({ where: { id: cell.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

    cellWinners.push(winnerIdea);
    console.log(`  WINNER: ${winnerIdea.text.slice(0, 80)} (${winnerXP} XP)\n`);
  }

  // --- TIER 2: FINAL SHOWDOWN ---
  console.log(`\n=== TIER 2: FINAL SHOWDOWN (${cellWinners.length} ideas) ===\n`);

  // Reset advancing ideas for tier 2
  await prisma.idea.updateMany({
    where: { id: { in: cellWinners.map(w => w.id) } },
    data: { status: 'IN_VOTING', tier: 2, totalXP: 0, totalVotes: 0 }
  });

  // Create final cell
  const finalCell = await prisma.cell.create({
    data: { deliberationId: CHANT_ID, tier: 2, status: 'VOTING', votingStartedAt: new Date() }
  });

  for (const idea of cellWinners) {
    await prisma.cellIdea.create({ data: { cellId: finalCell.id, ideaId: idea.id } });
  }

  // All voters participate in final
  const addedFinal = new Set();
  for (const voter of voterPool) {
    if (!addedFinal.has(voter.userId)) {
      await prisma.cellParticipation.create({
        data: { cellId: finalCell.id, userId: voter.userId, status: 'ACTIVE' }
      }).catch(() => {});
      addedFinal.add(voter.userId);
    }
  }

  const ideaList = cellWinners.map((ci, idx) => `${idx + 1}. ${ci.text.slice(0, 100)}`).join('\n');
  console.log(`Finalists:\n${ideaList}\n`);

  const finalXP = {};
  cellWinners.forEach(ci => { finalXP[ci.id] = 0; });

  // ALL voters vote in final
  for (const voter of voterPool) {
    const response = await callHaiku(
      `You are ${voter.name}. Perspective: "${voter.perspective.slice(0, 150)}". FINAL VOTE. Distribute exactly 10 XP. Best idea gets most. Format: "1:5, 2:3, 3:2" etc. Must sum to 10.`,
      `"${QUESTION}"\n\nFinalists:\n${ideaList}\n\nYour final XP distribution:`
    );

    const xpMap = {};
    const matches = response.matchAll(/(\d+)\s*[:=]\s*(\d+)/g);
    for (const m of matches) {
      const idx = parseInt(m[1]) - 1;
      const xp = parseInt(m[2]);
      if (idx >= 0 && idx < cellWinners.length && xp >= 0) xpMap[idx] = xp;
    }

    for (const [idxStr, xp] of Object.entries(xpMap)) {
      const idx = parseInt(idxStr);
      if (xp > 0) {
        await prisma.vote.create({
          data: { cellId: finalCell.id, userId: voter.userId, ideaId: cellWinners[idx].id, xpPoints: xp }
        }).catch(() => {});
        finalXP[cellWinners[idx].id] = (finalXP[cellWinners[idx].id] || 0) + xp;
      }
    }
    console.log(`  ${voter.name}: ${response.slice(0, 50)}`);
  }

  // Declare champion
  const finalSorted = Object.entries(finalXP).sort((a, b) => b[1] - a[1]);
  const championId = finalSorted[0][0];
  const championXP = finalSorted[0][1];
  const champion = cellWinners.find(w => w.id === championId);

  await prisma.idea.update({ where: { id: championId }, data: { status: 'WINNER', isChampion: true, totalXP: championXP } });
  for (const [id, xp] of finalSorted.slice(1)) {
    await prisma.idea.update({ where: { id }, data: { status: 'ELIMINATED', totalXP: xp } });
  }

  await prisma.cell.update({ where: { id: finalCell.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await prisma.deliberation.update({
    where: { id: CHANT_ID },
    data: { phase: 'COMPLETED', currentTier: 2, championId, completedAt: new Date() }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CHAMPION: ${champion.text}`);
  console.log(`XP: ${championXP}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('FINAL STANDINGS:');
  for (let i = 0; i < finalSorted.length; i++) {
    const idea = cellWinners.find(w => w.id === finalSorted[i][0]);
    console.log(`  ${i + 1}. [${finalSorted[i][1]} XP] ${idea.text.slice(0, 100)}`);
  }

  console.log(`\nChant: ${CHANT_ID}`);
  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
