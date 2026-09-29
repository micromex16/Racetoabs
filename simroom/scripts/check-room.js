// Validate a room.json without starting the app:  npm run check -- path\to\room.json
// With no argument it checks the bundled sample room.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { RoomStore, DEFAULT_ROOM_FILE } = require('../src/main/store');

const file = path.resolve(process.argv[2] || DEFAULT_ROOM_FILE);
const store = new RoomStore(path.dirname(file));
const result = store.parse(fs.readFileSync(file, 'utf8'));
if (result.ok) {
  console.log(`OK: ${file}`);
  for (const w of result.warnings) console.log(`  warning: ${w}`);
} else {
  console.log(`${result.error.title}:`);
  for (const d of result.error.details) console.log(`  - ${d}`);
  process.exitCode = 1;
}
