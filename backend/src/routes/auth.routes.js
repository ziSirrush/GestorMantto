const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/me/password', requireAuth, authController.changePassword);
router.post('/me/security-question', requireAuth, authController.changeSecurityQuestion);
router.post('/first-login/password', authController.firstLoginPassword);
router.get('/security-questions', authController.securityQuestions);
router.post('/first-login/security-question', authController.firstLoginSecurityQuestion);
router.post('/recovery/start', authController.recoveryStart);
router.post('/recovery/reset', authController.recoveryReset);

module.exports = router;