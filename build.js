require('dotenv').config()

const fs = require('fs');
const crypto = require('crypto');
const pug = require('pug');
const csvParse = require('csv-parse/lib/sync');
const {WebClient} = require('@slack/client');

(async () => {
	const csvData = fs.readFileSync(process.argv[2] || 'messages.csv');
	const records = csvParse(csvData, {columns: true}).slice(1).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

	const slack = new WebClient(process.env.SLACK_TOKEN);
	const {members} = await slack.users.list();
	const membersMap = new Map(members.map((member) => [member.id, member]));

	const md5 = (data) => {
		const hash = crypto.createHash('md5');
		hash.update(String(data));
		return hash.digest('hex');
	};

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

		return null;
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
	const urls = [];
	let 和了Count = 0;

	let current配牌者 = null;
	let current手牌 = 'https://placehold.it/900x120';
	for (const record of records) {
		if (current配牌者 === null && record.text === '配牌') {
			current配牌者 = membersMap.get(record.user || record.usr);
		}

		if (record.usr === 'null' || (record.subtype === 'bot_message' && record.username === 'mahjong')) {
			let match;
			const 手牌 = get手牌(record);
			if (手牌 !== null) {
				current手牌 = 手牌;
			}

			if (match = record.text.match(/(ツモ!!!|ロン!!!)/)) {
				urls.push(current手牌);
				results.push({
					配牌者: current配牌者,
					time: new Date(parseFloat(record.ts) * 1000),
					手牌: `images/${md5(current手牌)}.png`,
					point: getPoint(record),
					result: `${match[1].slice(0, -3)} ${get役s(record)}`,
				});
				current配牌者 = null;
				current手牌 = 'https://placehold.it/900x120';
				和了Count++;
			}

			if (match = record.text.match(/(錯和|聴牌|不聴罰符|流局)/)) {
				urls.push(current手牌);
				results.push({
					配牌者: current配牌者,
					time: new Date(parseFloat(record.ts) * 1000),
					手牌: `images/${md5(current手牌)}.png`,
					point: getPoint(record),
					result: record.text.includes('不聴立直') ? '錯和' : match[1].replace('罰符', ''),
				});
				current配牌者 = null;
				current手牌 = 'https://placehold.it/900x120';
			}
		}
	}

	const ranking = new Map();
	for (const result of results) {
		if (!ranking.has(result.配牌者)) {
			ranking.set(result.配牌者, {
				balance: 0,
				配牌Count: 0,
				和了Count: 0,
			});
		}

		const rank = ranking.get(result.配牌者);
		ranking.set(result.配牌者, {
			balance: rank.balance + result.point,
			配牌Count: rank.配牌Count + 1,
			和了Count: rank.和了Count + (result.result.match(/(ツモ|ロン)/) ? 1 : 0),
		});
	}

	const template = pug.compileFile('index.pug');

	const html = template({
		results,
		ranking: Array.from(ranking).map(([user, data]) => ({...data, user})).filter((d) => d.user !== null).sort((a, b) => b.balance - a.balance),
	});

	fs.writeFileSync('index.html', html);

	fs.writeFileSync('urls.json', JSON.stringify(urls));
})();
