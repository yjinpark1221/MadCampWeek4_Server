const { MAX_NUM } = require('./config');

const cards = [13, 13];
for (let i = 1; i <= MAX_NUM; ++i) {
    for (let j = 0; j < i; ++j) {
        cards.push(i);
    }
}

function shuffle(array) {
    array.sort(() => Math.random() - 0.5);
  }


function shuffleCards(num) {
    if (num < MIN_PLAYERS || num > MAX_PLAYERS) {
        return;
    }
    shuffle(cards);
    let res = [];
    for (let i = 0; i < num; ++i) {
        res.push([]);
    }
    for (let i = 0; i < cards.length(); ++i) {
        res[i % num].push(cards[i]);
    }
    return res;
}

module.exports = {
	shuffle,
	shuffleCards,
};
