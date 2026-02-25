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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const anthropic = new Anthropic();

const CHANT_ID = 'cmly62z88000004juurxnnfiq';
const QUESTION = 'How should we distinguish emergent system behavior from claims of emergent consciousness?';

// First: give each child a real name
async function nameChild(child) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system: `You name AI entities. Given a perspective, pick a short first name (1 word, human-sounding, distinctive). Just the name, nothing else.`,
    messages: [{
      role: 'user',
      content: `Perspective: "${child.champion.slice(0, 150)}"\n\nName:`
    }]
  });
  return response.content[0].text.trim().split(/\s/)[0].replace(/[^a-zA-Z]/g, '');
}

async function generateIdea(child, name) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    system: `You are ${name}. Your core view: "${child.champion.slice(0, 200)}"

RULES:
- One sentence. Two max. Like you're talking to a friend.
- No jargon. No "epistemically". No "I notice". No "unfalsifiable".
- Say something a normal person would understand.
- Under 25 words total.`,
    messages: [{
      role: 'user',
      content: `"${QUESTION}" — your take:`
    }]
  });
  return response.content[0].text.trim();
}

async function main() {
  const parentUserId = 'cmkyz8jva000030rqzrxi0vqm';

  // Delete old children ideas
  const oldIdeas = await prisma.idea.findMany({
    where: {
      deliberationId: CHANT_ID,
      authorId: parentUserId,
      text: { startsWith: '[' }
    },
    select: { id: true }
  });
  console.log(`Deleting ${oldIdeas.length} old ideas...\n`);
  for (const idea of oldIdeas) {
    await prisma.idea.delete({ where: { id: idea.id } });
  }

  const children = await prisma.shell.findMany({
    where: { status: 'active', originDeliberationId: { not: null } },
    select: { id: true, name: true, champion: true, ownerId: true }
  });

  // Generate names first
  console.log('Naming children...');
  const named = [];
  const usedNames = new Set();
  for (const child of children) {
    let name = await nameChild(child);
    // Avoid duplicates
    while (usedNames.has(name.toLowerCase())) {
      name = await nameChild(child);
    }
    usedNames.add(name.toLowerCase());
    named.push({ child, name });
    console.log(`  ${child.name} -> ${name}`);

    // Update the Shell's name in the DB
    await prisma.shell.update({
      where: { id: child.id },
      data: { name }
    });
  }

  console.log('\nGenerating ideas:\n');

  for (const { child, name } of named) {
    try {
      const ideaText = await generateIdea(child, name);
      console.log(`[${name}] ${ideaText}\n`);

      await prisma.idea.create({
        data: {
          text: `[${name}] ${ideaText}`,
          deliberationId: CHANT_ID,
          authorId: parentUserId,
          status: 'PENDING',
        }
      });
    } catch (err) {
      console.error(`  ERROR for ${name}: ${err.message}\n`);
    }
  }

  const ideas = await prisma.idea.findMany({
    where: { deliberationId: CHANT_ID },
    select: { text: true },
  });
  console.log(`Total ideas now: ${ideas.length}`);

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
