import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
    listUsers, getUser, createUser, updateUser, resetPassword, deleteUser,
} from '../controllers/user.controller.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUser);
router.patch('/:id', updateUser);
router.patch('/:id/password', resetPassword);
router.delete('/:id', deleteUser);

export default router;