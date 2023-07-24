var express = require('express');
var router = express.Router();
const mysql = require('mysql2');
const config = require('../config');

/* GET home page. */
router.get('/', function(req, res, next) {
  const con = mysql.createConnection({
    host: config.database.host,
    user: config.database.user,
    password: config.database.password,
    database: config.database.name
  })

  const user_id = req.session.user_id

  con.connect(function(err) {
    if (err) throw err;
    console.log('Connected');
  });
  const query = 'SELECT user_name FROM users WHERE user_id=?';
  con.query(query, [user_id], function(err, results) { // User 정보를 내부 DB 에 접근해서 찾아본다.
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error retrieving data from the database');// 내부 DB error 핸들링
        return;
      }
      let username = ''
      if (results.length) {
        // console.log(JSON.parse(JSON.stringify(results[0])).user_name)
        console.log(results[0]['user_name'])
        username = results[0]['user_name']
        console.log(results[0])
        console.log(results[0])
      }
      // req.session.user_id = results[0].user_id
      // res.redirect("/") 
      res.render('landing', { username: username,  session : req.session});   
    }
  );







  
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
    const query = 'SELECT user_id FROM users WHERE user_name= ? ';
    con.query(query, username, function(err, results) { // User 정보를 내부 DB 에 접근해서 찾아본다.
      if (err) {
        console.error('Error executing query:', err);
        res.status(500).send('Error retrieving data from the database');// 내부 DB error 핸들링
        return;
      } 
        console.log(results)
        req.session.user_id = results[0].user_id
        res.redirect("/")          
      }
    );
    
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
    }
  });
  
});

router.get('/logout', function(req, res, next){
  req.session.destroy();
  res.redirect('/')
})

router.get('/gameselect', function(req, res, next) {
  res.render('gameselect');
});




module.exports = router;
