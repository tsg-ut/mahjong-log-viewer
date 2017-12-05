const fs = require('fs');
const pug = require('pug');
const csvParse = require('csv-parse/lib/sync');

const csvData = fs.readFileSync(process.argv[2] || 'messages.csv');
const records = csvParse(csvData, {columns: true}).slice(1).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

const get手牌 = (record) => {
	if (record.attachments) {
		const attachments = JSON.parse(record.attachments);
		if (attachments.length !== 0) {
			return attachments[0].image_url;
		}
	}

	let match;
	if (match = record.text.match(/<(https:\/\/mahjong\.hakatashi\.com\/.+?)>/)) {
		return match[1];
	}

	return 'https://placehold.it/900x120';
};

const getPoint = (record) => {
	let match;
	if (match = record.text.match(/(-?\d+)点/)) {
		return parseInt(match[1]);
	}

	return 0;
};

const get役s = (record) => {
	let match;
	if (match = record.text.match(/(.+)\n\d+点/)) {
		return match[1];
	}

	return '';
}

const results = [];
let 和了Count = 0;

let current配牌者 = null;
for (const record of records) {
	if (current配牌者 === null && record.text === '配牌') {
		current配牌者 = record.user || record.usr;
	}

	if (record.usr === 'null' || (record.subtype === 'bot_message' && record.username === 'mahjong')) {
		let match;

		if (match = record.text.match(/(ツモ!!!|ロン!!!)/)) {
			results.push({
				配牌者: current配牌者,
				time: new Date(parseFloat(record.ts) * 1000),
				手牌: get手牌(record),
				point: getPoint(record),
				result: `${match[1].slice(0, -3)} ${get役s(record)}`,
			});
			current配牌者 = null;
			和了Count++;
		}

		if (match = record.text.match(/(錯和|聴牌|不聴罰符|流局)/)) {
			results.push({
				配牌者: current配牌者,
				time: new Date(parseFloat(record.ts) * 1000),
				手牌: get手牌(record),
				point: getPoint(record),
				result: record.text.includes('不聴立直') ? '錯和' : match[1].replace('罰符', ''),
			});
			current配牌者 = null;
		}
	}
}

const template = pug.compileFile('index.pug');

const html = template({
	name: 'fuga',
});

fs.writeFileSync('index.html', html);
