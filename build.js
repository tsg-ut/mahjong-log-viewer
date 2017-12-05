const fs = require('fs');
const pug = require('pug');

const template = pug.compileFile('index.pug');

const html = template({
	name: 'fuga',
});

fs.writeFileSync('index.html', html);
