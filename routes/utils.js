const redis = require('redis');
const {promisify} = require('util');
const client = redis.createClient();
const getAsync = promisify(client.get).bind(client);

async function checkBan(req, res, next) {
    const ip = req.header('x-forwarded-for') || req.connection.remoteAddress;
    // client.flushdb( function (err, succeeded) {
    //     // console.log(succeeded); // will be true if successfull
    // });
    try {
      const blackList = [
      ];
      let banned = await getAsync(`ban${ip}`);
      console.log(banned);
      if (banned || blackList.includes(ip)) {
        console.log(`ip baneada ${ip}`);
        res.status(403).send('Banned');
        return;
      }
    } catch (e) {
      console.error('error con ip baneada', e);
    }
    next();
  }

let maxUltimoMin = 0;
let ipMin = '';
let maxUltimo5Mins = 0;
let ip5Mins = '';
const posiblesBots = {};
const ACTIVATE_BAN_LOGS = true;

async function checkIp(req, res, next) {
    const ip = req.header('x-forwarded-for') || req.connection.remoteAddress;

    client.multi([
        ['incr', ip],
        ['expire', ip, '60'],
        ['incr', `${ip}:5min`],
        ['expire', `${ip}:5min`, '300'],
        ]).exec((err, replies) => {
        const ultimoMinuto = replies[0];
        const ultimos5Minutos = replies[2];
        if (maxUltimoMin < ultimoMinuto) {
            maxUltimoMin = ultimoMinuto;
            ipMin = ip;
        }

        if (maxUltimo5Mins < ultimos5Minutos) {
            maxUltimo5Mins = ultimos5Minutos;
            ip5Mins = ip;
        }

        if (ultimoMinuto > 10) {
            if (ACTIVATE_BAN_LOGS) {
            console.log(`posible BAN ban${ip}, mas de 10 request en un minuto`);
            }
            posiblesBots[ip] = (posiblesBots[ip] || 0) + 1;
            client.set(`ban${ip}`, '1', 'EX', 60 * 60 * 12);
        }

        if (ultimos5Minutos > 30) {
            if (ACTIVATE_BAN_LOGS) {
            console.log(`posible BAN ban${ip}, mas de 30 request en 5 minutos`);
            }
            posiblesBots[ip] = (posiblesBots[ip] || 0) + 1;
            client.set(`ban${ip}`, '1', 'EX', 60 * 60 * 12);
        }

        if (ultimoMinuto > 200) {
            if (ACTIVATE_BAN_LOGS) {
            console.log(`BAN KEY ban${ip}, mas de 200 request en un minuto`);
            }
            // lo baneo por 12 horas
            client.set(`ban${ip}`, '1');
        }

        if (ultimos5Minutos > 2000) {
            if (ACTIVATE_BAN_LOGS) {
            console.log(`BAN KEY ban${ip}, mas de 2000 reques en 5 min`);
            }
            // lo baneo por 12 horas
            client.set(`ban${ip}`, '1', 'EX', 60 * 60 * 12);
        }

        if (Object.keys(posiblesBots).length > 0) {
            console.log({ posiblesBots });
        }

        if (ACTIVATE_BAN_LOGS) {
            console.log('requests', { maxUltimoMin, ipMin }, { maxUltimo5Mins, ip5Mins });
        }
    });
    next();
}

module.exports = {
    checkBan,
    checkIp
  };