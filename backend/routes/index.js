var express = require('express');
var router = express.Router();
const mysql = require('mysql2');
const config = require('../config');


function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('landing', { session : req.session});
});

router.post('/login', function(req, res, next){

    var username = req.body.username
    console.log(username)
    var password = req.body.password

    const con = mysql.createConnection({
      host: config.database.host,
      user: config.database.user,
      password: config.database.password,
      database: config.database.name
    })
    
    con.connect(function(err) {
      if (err) throw err;
      console.log('Connected');
    });
    const query = 'SELECT * FROM users WHERE user_name= ? ';
    con.query(query, [username], function(err, results) { // User 정보를 내부 DB 에 접근해서 찾아본다.
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error retrieving data from the database');// 내부 DB error 핸들링
        return;
      } 
      
      else 
      {
          if (results.length == 0){ // 유저가 내부 DB에 없는 경우 자동으로 회원가입을 시켜버린다 강제임 ㅋㅋ


            const user_id = getRandomInt(1000, 9999);
              const insertQuery = 'INSERT INTO users (user_id, user_name, playedgame, wongame) VALUES (?, ?, ?, ?)';
              con.query(insertQuery, [user_id, username, 0, 0], function(err, insertResult) {
                  if (err) {
                      console.error('Error executing insert query:', err);
                      res.status(500).send('Error inserting data into the database');
                  } else {
                      console.log('User inserted successfully');
                      // const ouruser = { user_id: user_id }
                      // const access_token = jwt.sign(ouruser, process.env.ACCESS_TOKEN_SECRET)
                      // console.log(access_token)
                      // res.redirect('/auth/success/'+ access_token)
                  }
              });


          } else { // 유저가 DB에 있는 경우, 이미 우리 회원이므로 정보 추출
              console.log(results)
              // const ouruser = { user_id: user_id }
              // const access_token = jwt.sign(ouruser, process.env.ACCESS_TOKEN_SECRET)
              // console.log(access_token)
              // res.redirect('/auth/success/' + user_id);
              // res.json({access_token : access_token})
              // res.set('Authorization', access_token)
              // res.redirect('/auth/success/'+ access_token)
          }
          
      }
    });
    
    // res.redirect('/');
});

router.get('/login', function(req, res, next) {
  res.render('login');
  const con = mysql.createConnection({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name
  });
  
  con.connect(function(err) {
    if (err) throw err;
    console.log('Connected');
  });
  const query = 'SELECT * FROM users';
  con.query(query, function(err, results) {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).send('Error retrieving data from the database');
      return;
    } else {
        console.log(results)
        //res.send(results);
    }
  });
  
});

router.get('/gameselect', function(req, res, next) {
  res.render('gameselect');
});




module.exports = router;
