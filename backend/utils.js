const { MAX_NUM } = require('./constants');
const { players } = require('./data');
const { MAX_NUM, JOKER } = require('./constants');

const cards = [JOKER, JOKER];
for (let i = 1; i <= MAX_NUM; ++i) {
    for (let j = 0; j < i; ++j) {
        cards.push(i);
    }
}


function shuffle(array) {
    array.sort(() => Math.random() - 0.5);
}


// 80장의 카드를 플레이어 수(playerNum)에 맞게 섞어서 반환
function shuffleCards(playerNum) {
    if (playerNum < MIN_PLAYERS || playerNum > MAX_PLAYERS) {
        return;
    }
    shuffle(cards);
    let res = [];
    for (let i = 0; i < playerNum; ++i) {
        res.push([]);
    }
    for (let i = 0; i < cards.length(); ++i) {
        res[i % playerNum].push(cards[i]);
    }
    return res;
}


// 그룹 내에서 플레이어 차례인지 확인
function isTurn(pid) {
    let gid = players[pid].gid;
    return (groups[gid].turn == pid);
}


// usedCards가 플레이어(pid)의 핸드에 있는 카드인지 확인
function isInHands(pid, usedCards) {
    let inHandCards = players[pid].cards;
    for(let i = 1; i <= 13; ++i) {
        let handCnts = inHandCards.filter((x) => x == i).length;
        let usedCnts = usedCards.filter((x) => x == i).length;
        if(handCnts < usedCnts) {
            return false;
        }
    }
    return true;
}


module.exports = {
	shuffle,
	shuffleCards,
    isTurn,
    isValidCard,
};
