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
	const 役Map = new Map();

	const count役s = (record) => {
		const 役s = get役s(record).split('・');
		for (const 役 of 役s) {
			if (役.startsWith('ドラ')) {
				continue;
			}

			if (!役Map.has(役)) {
				役Map.set(役, 0);
			}

			役Map.set(役, 役Map.get(役) + 1);
		}
	};

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
					type: match[1].slice(0, -3),
				});
				current配牌者 = null;
				current手牌 = 'https://placehold.it/900x120';
				和了Count++;
				count役s(record);
				continue;
			}

			if (match = record.text.match(/(錯和|聴牌|不聴罰符|流局)/)) {
				urls.push(current手牌);
				results.push({
					配牌者: current配牌者,
					time: new Date(parseFloat(record.ts) * 1000),
					手牌: `images/${md5(current手牌)}.png`,
					point: getPoint(record),
					result: record.text.includes('不聴立直') ? '錯和' : match[1].replace('罰符', ''),
					type: record.text.includes('不聴立直') ? '錯和' : match[1].replace('罰符', ''),
				});
				current配牌者 = null;
				current手牌 = 'https://placehold.it/900x120';
				continue;
			}

			if (parseFloat(record.ts) < 1507109783.0004 && record.text.includes('現在の得点')) {
				urls.push(current手牌);
				results.push({
					配牌者: current配牌者,
					time: new Date(parseFloat(record.ts) * 1000),
					手牌: `images/${md5(current手牌)}.png`,
					point: getPoint(record),
					result: `ツモ ${get役s(record)}`,
					type: 'ツモ',
				});
				current配牌者 = null;
				current手牌 = 'https://placehold.it/900x120';
				和了Count++;
				count役s(record);
			}
		}
	}

	const ranking = new Map();
	for (const result of results) {
		if (!ranking.has(result.配牌者)) {
			ranking.set(result.配牌者, {
				balance: 0,
				balanceWith錯和: 0,
				配牌Count: 0,
				和了Count: 0,
				聴牌Count: 0,
			});
		}

		const rank = ranking.get(result.配牌者);
		ranking.set(result.配牌者, {
			balance: rank.balance + (result.type === '錯和' ? 0 : result.point),
			balanceWith錯和: rank.balanceWith錯和 + result.point,
			配牌Count: rank.配牌Count + 1,
			和了Count: rank.和了Count + (result.type === 'ツモ' || result.type === 'ロン' ? 1 : 0),
			聴牌Count: rank.聴牌Count + (result.type === '錯和' || result.type === '不聴' ? 0 : 1),
		});
	}

	const 和了Stat = new Map(['和了', '聴牌', '不聴', '錯和'].map((name) => [name, 0]));
	for (const result of results) {
		if (result.type === 'ツモ' || result.type === 'ロン') {
			和了Stat.set('和了', 和了Stat.get('和了') + 1);
		} else if (result.type === '聴牌' || result.type === '流局') {
			和了Stat.set('聴牌', 和了Stat.get('聴牌') + 1);
		} else if (result.type === '不聴') {
			和了Stat.set('不聴', 和了Stat.get('不聴') + 1);
		} else if (result.type === '錯和') {
			和了Stat.set('錯和', 和了Stat.get('錯和') + 1);
		}
	}

	const pointStat = new Map(['一翻', '二翻', '三翻', '四翻', '満貫', '跳満', '倍満', '三倍満', '役満'].map((name) => [name, 0]));
	for (const result of results) {
		if (result.type === 'ツモ' || result.type === 'ロン') {
			if (result.point >= 48000) {
				pointStat.set('役満', pointStat.get('役満') + 1);
			} else if (result.point >= 36000) {
				pointStat.set('三倍満', pointStat.get('三倍満') + 1);
			} else if (result.point >= 24000) {
				pointStat.set('倍満', pointStat.get('倍満') + 1);
			} else if (result.point >= 18000) {
				pointStat.set('跳満', pointStat.get('跳満') + 1);
			} else if (result.point >= 12000) {
				pointStat.set('満貫', pointStat.get('満貫') + 1);
			} else if (result.point >= 7800) {
				pointStat.set('四翻', pointStat.get('四翻') + 1);
			} else if (result.point >= 3900) {
				pointStat.set('三翻', pointStat.get('三翻') + 1);
			} else if (result.point >= 2100) {
				pointStat.set('二翻', pointStat.get('二翻') + 1);
			} else {
				pointStat.set('一翻', pointStat.get('一翻') + 1);
			}
		}
	}

	const template = pug.compileFile('index.pug');

	const html = template({
		results,
		ranking: Array.from(ranking).map(([user, data]) => ({...data, user})).filter((d) => d.user !== null).sort((a, b) => b.balance - a.balance),
		役s: Array.from(役Map).sort((a, b) => b[1] - a[1]),
		和了Count,
		和了Stat,
		pointStat,
	});

	fs.writeFileSync('index.html', html);

	fs.writeFileSync('urls.json', JSON.stringify(urls));
})();
