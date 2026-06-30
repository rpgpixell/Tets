import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { perUserLimiter, saveLimiter } from '../middleware/security';
import { getUserData, saveGameData } from '../services/UserService';
import { logger } from '../utils/logger';
import { GAME_CONSTANTS } from '../config/constants';

const router = Router();

interface MarketListing {
  listingId: string;
  sellerId: string;
  sellerName: string;
  itemId: number;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  buyerId?: string;
  createdAt: number;
  expiresAt: number;
}

const marketListings = new Map<string, MarketListing>();

/**
 * POST /api/market/list
 * Create market listing
 */
router.post(
  '/list',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { itemId, price } = req.body;

    // Validate
    if (!itemId || typeof itemId !== 'number') {
      throw new AppError(400, 'Invalid item ID', 'INVALID_ITEM_ID');
    }

    if (!price || typeof price !== 'number' || price < 1) {
      throw new AppError(400, 'Price must be >= 1', 'INVALID_PRICE');
    }

    // Get user data
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Find item in inventory
    const item = user.data.inventory?.find((i) => i.id === itemId);
    if (!item) {
      throw new AppError(404, 'Item not found in inventory', 'ITEM_NOT_FOUND');
    }

    // Check market is unlocked
    if (!user.data.marketUnlocked) {
      throw new AppError(403, 'Market not unlocked', 'MARKET_LOCKED');
    }

    // Check active listings count
    const activeListings = Array.from(marketListings.values()).filter(
      (l) => l.sellerId === tgId && l.status === 'active',
    );
    if (activeListings.length >= GAME_CONSTANTS.MARKET_MAX_LOTS) {
      throw new AppError(400, 'Max listings reached', 'MAX_LISTINGS');
    }

    // Create listing
    const listingId = `${tgId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const listing: MarketListing = {
      listingId,
      sellerId: tgId,
      sellerName: user.username || `Player ${tgId.slice(-4)}`,
      itemId,
      price,
      status: 'active',
      createdAt: Date.now(),
      expiresAt: Date.now() + GAME_CONSTANTS.MARKET_TTL_MS,
    };

    marketListings.set(listingId, listing);

    // Remove item from inventory
    if (user.data.inventory) {
      user.data.inventory = user.data.inventory.filter((i) => i.id !== itemId);
      await saveGameData(tgId, user.data);
    }

    logger.info('[Market] Listing created', { listingId, price });

    res.json({
      ok: true,
      listing: {
        listingId,
        itemId,
        price,
        expiresAt: listing.expiresAt,
      },
    });
  }),
);

/**
 * GET /api/market/listings
 * Get active listings
 */
router.get(
  '/listings',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = 20;

    // Get active listings
    const now = Date.now();
    const active = Array.from(marketListings.values()).filter(
      (l) => l.status === 'active' && l.expiresAt > now,
    );

    // Sort by newest
    active.sort((a, b) => b.createdAt - a.createdAt);

    const start = (page - 1) * pageSize;
    const listings = active.slice(start, start + pageSize);

    res.json({
      ok: true,
      listings,
      page,
      hasMore: start + pageSize < active.length,
      total: active.length,
    });
  }),
);

/**
 * POST /api/market/buy
 * Buy listing
 */
router.post(
  '/buy',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { listingId } = req.body;

    if (!listingId) {
      throw new AppError(400, 'No listing ID', 'NO_LISTING_ID');
    }

    const listing = marketListings.get(listingId);
    if (!listing || listing.status !== 'active') {
      throw new AppError(404, 'Listing not found', 'LISTING_NOT_FOUND');
    }

    // Can't buy own listing
    if (listing.sellerId === tgId) {
      throw new AppError(400, 'Cannot buy own listing', 'OWN_LISTING');
    }

    // Check expiry
    if (listing.expiresAt < Date.now()) {
      listing.status = 'cancelled';
      throw new AppError(400, 'Listing expired', 'LISTING_EXPIRED');
    }

    // Get buyer data
    const buyer = await getUserData(tgId);
    if (!buyer?.data) {
      throw new AppError(404, 'Buyer not found', 'NO_SAVE');
    }

    // Check gold
    if ((buyer.data.gold || 0) < listing.price) {
      throw new AppError(400, 'Not enough gold', 'NO_GOLD');
    }

    // Get seller data
    const seller = await getUserData(listing.sellerId);
    if (!seller?.data) {
      throw new AppError(404, 'Seller not found', 'SELLER_NOT_FOUND');
    }

    // Transaction
    const commission = Math.floor(listing.price * GAME_CONSTANTS.MARKET_COMMISSION);
    const sellerGets = listing.price - commission;

    // Update buyer
    buyer.data.gold = (buyer.data.gold || 0) - listing.price;
    if (!buyer.data.inventory) buyer.data.inventory = [];
    buyer.data.inventory.push({
      id: Math.max(0, ...buyer.data.inventory.map((i) => i.id)) + 1,
      slot: 'weapon',
      name: `Listing #${listingId.slice(-6)}`,
      icon: '',
      rarity: 'common',
      level: 1,
      stats: {},
    });
    buyer.data.updatedAt = Date.now();
    await saveGameData(tgId, buyer.data);

    // Update seller
    seller.data.gold = (seller.data.gold || 0) + sellerGets;
    seller.data.updatedAt = Date.now();
    await saveGameData(listing.sellerId, seller.data);

    // Mark listing as sold
    listing.status = 'sold';
    listing.buyerId = tgId;

    logger.info('[Market] Item sold', {
      listingId,
      price: listing.price,
      commission,
      seller: listing.sellerId,
      buyer: tgId,
    });

    res.json({
      ok: true,
      transaction: {
        listingId,
        price: listing.price,
        commission,
      },
    });
  }),
);

/**
 * GET /api/market/my-listings
 * Get user's listings
 */
router.get(
  '/my-listings',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;

    const myListings = Array.from(marketListings.values()).filter(
      (l) => l.sellerId === tgId,
    );

    res.json({
      ok: true,
      listings: myListings,
    });
  }),
);

export default router;
