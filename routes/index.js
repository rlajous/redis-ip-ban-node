const { checkBan, checkIp } = require('./utils');
const path = require('path');

const express = require('express');

const router = express.Router();

router.use(checkBan);

router.use(checkIp);

router.get('/', (req, res, next) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
});

router.get('/users', (req, res, next) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'users.html'));
});

router.get('/login', async (req, res) => {
    try {
        await loginRoute(req, res);
      } catch (err) {
        res.status(500).end();
      }
    }
);
    
module.exports = router;