import { Router } from 'express';
import {
    listSlots, getForm, submitLoad, circleTotal, currentStatus, history, reports,
} from '../controllers/load.controller.js';
import { requireAuth, requireAdminOrOperator, requireAnyRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/slots', requireAnyRole, listSlots);
router.get('/form', requireAnyRole, getForm);
router.post('/submit', requireAdminOrOperator, submitLoad);
router.get('/circle-total', requireAnyRole, circleTotal);
router.get('/current-status', requireAnyRole, currentStatus);
router.get('/history', requireAnyRole, history);
router.get('/reports', requireAnyRole, reports);

export default router;