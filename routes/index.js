const path = require('path');

const express = require('express');

const redis = require('redis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const redisClient = redis.createClient({
  enable_offline_queue: false,
});

const router = express.Router();

const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 10;

const limiterSlowBruteByIP = new RateLimiterRedis({
  redis: redisClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterRedis({
  redis: redisClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60 * 24 * 90, // Store number for 90 days since first fail
});

async function loginRoute(req, res) {
    const ipAddr = req.connection.remoteAddress;
  
    const [resUsernameAndIP, resSlowByIP] = await Promise.all([
      limiterConsecutiveFailsByUsernameAndIP.get(ipAddr),
      limiterSlowBruteByIP.get(ipAddr),
    ]);
    let retrySecs = 0;
    // Check if IP or Username + IP is already blocked
    if (resSlowByIP !== null && resSlowByIP.consumedPoints > maxWrongAttemptsByIPperDay) {
      retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1;
    } else if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > maxConsecutiveFailsByUsernameAndIP) {
      retrySecs = Math.round(resUsernameAndIP.msBeforeNext / 1000) || 1;
    }

    const user = { isLoggedIn: false, exists: true, delete: false };

    if (retrySecs > 0) {
        res.set('Retry-After', String(retrySecs));
        res.status(429).send('Too Many Requests');
    } else {
        if (!user.isLoggedIn) {
            // Consume 1 point from limiters on wrong attempt and block if limits reached
            try {
                const promises = [limiterSlowBruteByIP.consume(ipAddr)];
                if (user.exists) {
                    // Count failed attempts by Username + IP only for registered users
                    promises.push(limiterConsecutiveFailsByUsernameAndIP.consume(ipAddr));
                }

                await Promise.all(promises);

                res.status(400).end('email or password is wrong');
            } catch (rlRejected) {
                if (rlRejected instanceof Error) {
                    throw rlRejected;
                } else {
                    res.set('Retry-After', String(Math.round(rlRejected.msBeforeNext / 1000)) || 1);
                    res.status(429).send('Too Many Requests');
                }
            }
        }

        if (user.isLoggedIn) {
            if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > 0) {
                // Reset on successful authorisation
                await limiterConsecutiveFailsByUsernameAndIP.delete(ipAddr);
            }

            res.end('authorized');
        }
    }

    if (user.delete) {
        limiterConsecutiveFailsByUsernameAndIP.delete(ipAddr);
        limiterSlowBruteByIP.delete(ipAddr);
    }
    
    res.status(200).send('Good');
    
}

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