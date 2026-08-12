const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { loginRateLimit, recoveryRateLimit } = require('../middleware/auth-rate-limit.middleware');

router.post('/login', loginRateLimit, authController.login);
router.post('/refresh', authController.refreshSession);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/me/password', requireAuth, authController.changePassword);
router.post('/me/security-question', requireAuth, authController.changeSecurityQuestion);
router.post('/first-login/password', requireAuth, authController.firstLoginPassword);
router.get('/security-questions', authController.securityQuestions);
router.post('/first-login/security-question', requireAuth, authController.firstLoginSecurityQuestion);
router.post('/recovery/start', recoveryRateLimit, authController.recoveryStart);
router.post('/recovery/reset', recoveryRateLimit, authController.recoveryReset);

module.exports = router;
