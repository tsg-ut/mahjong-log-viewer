const fs = require('fs');
const crypto = require('crypto');
const {promisify} = require('util');
const download = require('download');
const urls = require('./urls.json');

const md5 = (data) => {
	const hash = crypto.createHash('md5');
	hash.update(String(data));
	return hash.digest('hex');
};

(async () => {
	for (const url of urls) {
		if (!url) {
			continue;
		}

		try {
			await promisify(fs.access)(`images/${md5(url)}.png`, fs.constants.R_OK);
		} catch (error) {
			const newUrl = url.replace('https://mahjong.hakatashi.com/', 'http://localhost:8080/');
			console.log(`Downloading ${newUrl}...`);
			const data = await download(newUrl);
			await promisify(fs.writeFile)(`images/${md5(url)}.png`, data);
		}
	}
})();
