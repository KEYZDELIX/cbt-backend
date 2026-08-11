const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const tenantContext = require('../middleware/tenantContext');

// Public routes
router.post('/login', authController.login);
router.post('/register', tenantContext, authController.registerCandidate);

// Authenticated routes
router.get('/me', auth, authController.getMe);
router.put('/change-password', auth, authController.changePassword);

module.exports = router;