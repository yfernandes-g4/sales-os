const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve('resources');
const target = path.resolve('dist/resources');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log('Resources copied to dist/resources');
