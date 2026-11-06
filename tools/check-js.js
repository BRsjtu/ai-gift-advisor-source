const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const ignored = new Set(['node_modules', 'tmp', 'miniprogram_npm', '.git'])
const jsFiles = []
const jsonFiles = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue
    }
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      jsFiles.push(full)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(full)
    }
  }
}

walk(root)

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'))
}

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status || 1)
  }
}

console.log(`checked ${jsFiles.length} js files and ${jsonFiles.length} json files`)
