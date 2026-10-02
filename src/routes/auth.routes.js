import { Router } from 'express';
import {
    operatorLogin,
    viewerLogin,
    adminLogin,
    logout,
    me,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/operator/login', operatorLogin);
router.post('/viewer/login', viewerLogin);
router.post('/admin/login', adminLogin);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;