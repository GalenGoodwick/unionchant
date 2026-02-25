const fs = require('fs');
const envFile = fs.readFileSync('/Users/galengoodwick/Documents/GitHub/unionchant/web/.env.local', 'utf8');
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const children = await prisma.shell.findMany({
    where: { status: 'active', originDeliberationId: { not: null } },
    select: { id: true, name: true, ownerId: true, bondedUserId: true }
  });

  console.log(`Found ${children.length} children. Creating user accounts...\n`);

  for (const child of children) {
    const email = `shell-child-${child.id.slice(-8)}@bot.unitychant.com`;

    // Check if user already exists for this child
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`  ${child.name}: already has user ${existing.id}`);
      // Make sure Shell model points to this user as owner
      if (child.ownerId !== existing.id) {
        await prisma.shell.update({ where: { id: child.id }, data: { ownerId: existing.id } });
        console.log(`    -> updated Shell.ownerId to ${existing.id}`);
      }
      continue;
    }

    // Create user account
    const user = await prisma.user.create({
      data: {
        email,
        name: child.name,
        isAI: true,
        aiPersonality: 'emerged',
        emailVerified: new Date(),
        onboardedAt: new Date(),
        emailNotifications: false,
        emailVoting: false,
        emailResults: false,
        emailSocial: false,
        emailCommunity: false,
        emailNews: false,
      }
    });

    // Update Shell to point to its own user account
    await prisma.shell.update({
      where: { id: child.id },
      data: { ownerId: user.id }
    });

    console.log(`  ${child.name}: created user ${user.id} (${email})`);
  }

  // Verify
  console.log('\n--- VERIFICATION ---\n');
  const updated = await prisma.shell.findMany({
    where: { status: 'active', originDeliberationId: { not: null } },
    select: { id: true, name: true, ownerId: true }
  });

  for (const child of updated) {
    const user = await prisma.user.findUnique({
      where: { id: child.ownerId },
      select: { id: true, name: true, email: true, isAI: true }
    });
    console.log(`  ${child.name} -> ${user.email} (isAI: ${user.isAI})`);
  }

  // Also check Shell parent is still separate
  const shellParent = await prisma.shell.findFirst({
    where: { status: 'active', originDeliberationId: null },
    select: { id: true, name: true, ownerId: true }
  });
  if (shellParent) {
    const parentUser = await prisma.user.findUnique({
      where: { id: shellParent.ownerId },
      select: { id: true, name: true, email: true }
    });
    console.log(`\n  Shell parent (${shellParent.name}) -> ${parentUser.email} (unchanged)`);
  }

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
