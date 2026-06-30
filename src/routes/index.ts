import { Router } from 'express';
import saveRoutes from './save';
import leaderboardRoutes from './leaderboard';

const router = Router();

// API Routes
router.use('/save', saveRoutes);
router.use('/leaderboard', leaderboardRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

export default router;
