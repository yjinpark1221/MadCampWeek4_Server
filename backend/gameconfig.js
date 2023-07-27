let userNumber = 0;
let roomsInfo = { roomNumber: 0, rooms: { open: {}, hide: {} } };

class Player {
  constructor(nickname, sid, cur_room) {
    this.nickname = nickname;
    this.cur_room = cur_room;
    this.seat = -1; // = order
    this.ready = false;
    this.hand = [];
    this.order = -1;
    this.sid = sid;
  }

  reset() {
    this.hand = [];
    this.ready = false;
  }

  setOrder(i) {
    this.order = i;
  }

  leaveRoom() {
    this.seat = -1;
    this.cur_room = "waiting room";
  }
}

var game_state = {
  WAITING: 0,
  PLAYING: 1,
  REVOLUTION: 2,
};

class Game {
  constructor() {
    this.state = game_state.WAITING;
    this.readyCount = 0;
    this.deck = this.prepareDeck();
    this.cur_order_idx = -1;
    this.round = -1;
    this.revolutionList = [];
    this.taxSkip = false;
  }

  updateOrder(omit_i) {
    this.order[omit_i] = false;
    this.cur_order[omit_i] = -1;
  }

  start(roomData) {
    let obj = roomData.sockets;
    for (let i = 0; i < 8; ++i) {
      roomData.seats[i] = (i < Object.keys(obj).length);
    }
    let cnt = 0;
    for (const sid in obj) {
      console.log(`gameconfig.js: ${JSON.stringify(roomData)}`);
      roomData.sockets[sid].seat = roomData.sockets[sid].order;
      if(roomData.sockets[sid].seat < 0)  roomData.sockets[sid].seat = cnt++;
    }

    this.revolutionList = [];
    this.state = game_state.REVOLUTION;
    this.round++;

    // order: order for the whole game
    // cur_order: currunt round order (in case of passes)
    this.order = new Array(8).fill(false);
    this.cur_order = new Array(8).fill(-1);

    // get ready
    for (const [sid, userData] of Object.entries(roomData.sockets)) {
      if (userData.ready) {
        this.order[userData.seat] = true;
      }
    }

    // set cur order
    // -1 not in game
    // 0 pass
    // 1 in game
    for (let i = 0; i < this.order.length; i++) {
      if (this.order[i]) this.cur_order[i] = 1;
      else this.cur_order[i] = -1;
    }

    this.cur_order_idx = 0;

    // shuffle deck
    this.deck = this.shuffle(this.deck);
  }

  end() {
    this.state = game_state.WAITING;
    this.readyCount = 0;
    delete this.order;
    delete this.cur_order;
    delete this.last;
  }

  nextRound() {
    // renwe cur_order
    for (let i = 0; i < this.order.length; i++) {
      if (this.order[i]) this.cur_order[i] = 1;
      else this.cur_order[i] = -1;
    }

    delete this.last;
    return true;
  }

  nextPlayer(selected_card) {
    if (!this.cur_order) return;
    this.cur_order_idx = (this.cur_order_idx + 1) % this.cur_order.length;
    while (this.cur_order[this.cur_order_idx] < 1)
      this.cur_order_idx = (this.cur_order_idx + 1) % this.cur_order.length;
    // if not playable increment until it is

    // update last hand(field) if not pass
    if (Object.keys(selected_card).length > 0) {
      this.last = selected_card;
      let count = 0;
      for (const [card, val] of Object.entries(this.last)) {
        if (card != 13) this.last.num = card;
        count += val;
      }
      this.last.count = count;
    }

    // if it comes to the same user, the round finishes
    let still_playing = 0;
    for (let i = 0; i < this.cur_order.length; i++) {
      if (this.cur_order[i] == 1) still_playing++; // count playable user
    }

    if (still_playing == 1) {
      return this.nextRound();
    }

  }

  isOneLeft() {
    let cnt = 0;
    for (let i = 0; i < this.order.length; i++) if (this.order[i]) cnt++;

    return cnt <= 1;
  }

  shuffle(array) {
    // array.sort((a, b) => b - a);
    array.sort(() => Math.random() - 0.5);
    return array;
  }

  prepareDeck() {
    let deck = new Array(80);
    let i = 0;
    for (let card = 12; card >= 1; card--) {
      for (let cnt = card; cnt >= 1; cnt--) {
        deck[i] = card;
        i++;
      }
    }
    deck[i++] = 13;
    deck[i] = 13;

    return deck;
  }
}

module.exports = {
  Player,
  game_state,
  Game,
  userNumber,
  roomsInfo,
};
