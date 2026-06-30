import { Router } from 'express';
import saveRoutes from './save';
import leaderboardRoutes from './leaderboard';
import walletRoutes from './wallet';
import marketRoutes from './market';
import pvpRoutes from './pvp';
import bossRoutes from './boss';
import skillsRoutes from './skills';
import inventoryRoutes from './inventory';
import systemRoutes from './system';

const router = Router();

// Game Data
router.use('/save', saveRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/skills', skillsRoutes);

// Gameplay
router.use('/pvp', pvpRoutes);
router.use('/boss', bossRoutes);
router.use('/market', marketRoutes);
router.use('/wallet', walletRoutes);

// System
router.use('/system', systemRoutes);
router.use('/stats', systemRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

export default router;
