import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

import {
    listCircles,
    createCircle,
    updateCircle,
    deleteCircle,
} from '../controllers/circle.controller.js';

import {
    listSubstations,
    createSubstation,
    updateSubstation,
    deleteSubstation,
} from '../controllers/substation.controller.js';

import {
    listUsers,
    getUser,
    createUser,
    updateUser,
    resetPassword,
    deleteUser,
} from '../controllers/user.controller.js';

import {
    getAlwaysOpen,
    updateAlwaysOpen,
    getAllSettings,
} from '../controllers/settings.controller.js';

const router = Router();

// Everything under /admin requires admin auth
router.use(requireAuth, requireAdmin);

// ---- Circles ----
router.get('/circles', listCircles);
router.post('/circles', createCircle);
router.patch('/circles/:id', updateCircle);
router.delete('/circles/:id', deleteCircle);

// ---- Substations ----
router.get('/substations', listSubstations);
router.post('/substations', createSubstation);
router.patch('/substations/:id', updateSubstation);
router.delete('/substations/:id', deleteSubstation);

// ---- Users ----
router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUser);
router.patch('/users/:id', updateUser);
router.patch('/users/:id/password', resetPassword);
router.delete('/users/:id', deleteUser);

// ---- Settings ----
router.get('/settings/all', getAllSettings);
router.get('/settings/always-open-slots', getAlwaysOpen);
router.put('/settings/always-open-slots', updateAlwaysOpen);

export default router;