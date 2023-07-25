const WebSocket = require('ws');
const { Player, Group, PlayerState, GroupState } = require('./models');
let { playerCnt, groupCnt, players, groups } = require('./data');
const { isInHands } = require('./utils');

// describe('utils', () => {
// 	let pid = null;
// 	beforeAll(() => {
// 		pid = playerCnt++;
// 		players.push(new Player(null));
// 	});
// 	test('is in hands', () => {
// 		players[pid].cards = [1, 1, 1, 2, 13, 13];
// 		expect(isInHands(pid, [])).toBe(true);
// 		expect(isInHands(pid, [1, 1])).toBe(true);
// 		expect(isInHands(pid, [1, 1, 1])).toBe(true);
// 		expect(isInHands(pid, [1, 13, 2])).toBe(true);

// 		expect(isInHands(pid, [1, 1, 1, 1])).toBe(false);
// 		expect(isInHands(pid, [3])).toBe(false);
// 	});
// 	afterAll(() => {
// 		players.pop();
// 		playerCnt--;
// 	});
// });

describe('socket test', () => {
	let clients = [];
	beforeAll(async () => {
		const connPromise = [];
		for(let i = 0; i < 4; ++i) {
			const client = new WebSocket("ws://localhost:80");
			clients.push(client);

			const promise = new Promise((resolve, reject) => {
				client.on('open', () => { resolve(); });
				client.on('error', () => { reject(); });
			});
			connPromise.push(promise);
		}
		await Promise.all(connPromise);
	});
	afterAll(() => {
		for(const client of clients) {
			client.close();
		}
	});
	test('connection', () => {
		for(let i = 0; i < 4; ++i) {
			clients[i].send(JSON.stringify({ type: 'test', data: `hello world ${i}` }));
		}
	});
	test('setName', () => {
		for(let i = 0; i < 4; ++i) {
			clients[i].send(JSON.stringify({
				type: 'name',
				data: `player ${i}`,
			}));
		}
	});
	test('group', async () => {
		// TODO: async bug

		// const newGroupPromise = [ new Promise((resolve, reject) => {
		// 	clients[0].send(
		// 		JSON.stringify({
		// 			type: 'newGroup',
		// 			data: 'group name 0',
		// 		},
		// 		() => { resolve(); }));
		// })];
		// await Promise.all(newGroupPromise);

		// const enterPromise = [[1, 2, 3].forEach((i) => {
		// 	new Promise((resolve, reject) => {
		// 		clients[i].send(JSON.stringify({
		// 			type: 'enter',
		// 			data: 0,
		// 		}), () => { resolve(); });
		// 	});
		// })];
		// await Promise.all(enterPromise);

		// const readyPromise = [[0, 1, 2, 3].forEach((i) => {
		// 	new Promise((resolve, reject) => {
		// 		clients[i].send(JSON.stringify({
		// 			type: 'ready',
		// 			data: null,
		// 		}, (err) => { err ? reject(err) : resolve(); }));
		// 	});
		// })];
		// await Promise.all(readyPromise);
	});
});
