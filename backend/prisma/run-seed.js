// `npm run seed`: uses the build output when present (production image has no src/), else ts-node (development).
const fs = require('fs');
const path = require('path');
const compiled = path.join(__dirname, '..', 'dist', '_seed', 'prisma', 'seed.js');
if (fs.existsSync(compiled)) require(compiled);
else { require('ts-node/register/transpile-only'); require('./seed.ts'); }
