// @ts-check
// Bonnes adresses autour des SAMU-SAS (hébergement, restaurant, bar) : /api/poi
import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { asyncHandler as h } from '../../middlewares/error-handler.js';
import * as ctrl from './poi.controller.js';

const router = Router();

router.get('/poi/places', requireAuth, h(ctrl.searchPlaces));
router.get('/poi/meta', requireAuth, h(ctrl.meta));
router.get('/poi', requireAuth, h(ctrl.list));
router.post('/poi', requireAuth, h(ctrl.create));
// Commentaires (avant /poi/:id)
router.put('/poi/comments/:cid', requireAuth, h(ctrl.updateComment));
router.delete('/poi/comments/:cid', requireAuth, h(ctrl.deleteComment));
router.get('/poi/:id', requireAuth, h(ctrl.detail));
router.get('/poi/:id/route', requireAuth, h(ctrl.route));
router.put('/poi/:id', requireAuth, h(ctrl.update));
router.delete('/poi/:id', requireAuth, h(ctrl.remove));
router.put('/poi/:id/rating', requireAuth, h(ctrl.rate));
router.delete('/poi/:id/rating', requireAuth, h(ctrl.deleteRating));
router.post('/poi/:id/comments', requireAuth, h(ctrl.addComment));

export default router;
