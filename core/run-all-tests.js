// Run all core engine tests
const { execSync } = require('child_process')

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║   Union Chant Core Engine - Complete Test Suite           ║')
console.log('╚════════════════════════════════════════════════════════════╝\n')

const tests = [
  { file: 'test-engine.js', name: 'Basic Functionality & Deliberation' },
  { file: 'test-constraints-core.js', name: 'Constraint Enforcement (Edge Cases)' },
  { file: 'test-100-participants.js', name: 'Multi-Tier at Scale (100 participants)' }
]

let allPassed = true

tests.forEach((test, index) => {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`TEST ${index + 1}/${tests.length}: ${test.name}`)
  console.log('='.repeat(60))

  try {
    const output = execSync(`node ${test.file}`, {
      cwd: __dirname,
      encoding: 'utf-8'
    })
    console.log(output)
    console.log(`✅ ${test.name} PASSED`)
  } catch (error) {
    console.error(`❌ ${test.name} FAILED`)
    console.error(error.stdout || error.message)
    allPassed = false
  }
})

console.log('\n' + '='.repeat(60))
console.log('FINAL RESULTS')
console.log('='.repeat(60))

if (allPassed) {
  console.log('\n✅ ALL TESTS PASSED\n')
  console.log('Core engine is verified and production ready:')
  console.log('  ✅ Cell formation working')
  console.log('  ✅ Natural reduction working')
  console.log('  ✅ Constraint enforcement working')
  console.log('  ✅ Multi-tier progression working')
  console.log('  ✅ Cross-cell tallying working')
  console.log('  ✅ Deliberation methods working')
  console.log('  ✅ Everyone votes at every tier')
  console.log('\n🚀 Ready for AI agents and React frontend!\n')
} else {
  console.log('\n❌ SOME TESTS FAILED\n')
  process.exit(1)
}
