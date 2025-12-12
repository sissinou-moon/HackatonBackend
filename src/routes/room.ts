import express, { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

const router = express.Router();

// Extended Request interface with user
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email?: string;
        [key: string]: any;
    };
}

/**
 * Authentication Middleware
 * Extracts and validates the Bearer token from Authorization header
 * Attaches user info to the request object
 */
const authenticateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please provide a valid access token.',
            });
        }

        const token = authHeader.split(' ')[1];

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired access token.',
            });
        }

        // Attach user to request
        req.user = data.user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed.',
        });
    }
};

// Apply authentication middleware to all routes
router.use(authenticateUser);

/**
 * GET /api/room
 * Get all rooms (history entries) for the authenticated user
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const { data, error } = await supabase
            .from('history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching rooms:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        res.json({
            success: true,
            rooms: data,
            count: data?.length || 0,
        });
    } catch (error) {
        console.error('Get rooms error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

/**
 * GET /api/room/:id
 * Get a single room by ID (only if owned by the authenticated user)
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const { data, error } = await supabase
            .from('history')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId) // Ensure user owns this room
            .single();

        if (error) {
            console.error('Error fetching room:', error);
            return res.status(404).json({
                success: false,
                error: 'Room not found or access denied',
            });
        }

        res.json({
            success: true,
            room: data,
        });
    } catch (error) {
        console.error('Get room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

/**
 * POST /api/room
 * Create a new room for the authenticated user
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { title, aiAnswers, userAnswers } = req.body;
        const userId = req.user!.id;

        if (!title || typeof title !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Title is required and must be a string',
            });
        }

        const { data, error } = await supabase
            .from('history')
            .insert({
                title,
                aiAnswers: aiAnswers || [],
                userAnswers: userAnswers || [],
                user_id: userId, // Associate room with authenticated user
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating room:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        res.status(201).json({
            success: true,
            room: data,
            message: 'Room created successfully',
        });
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

/**
 * PUT /api/room/:id
 * Update an existing room (only if owned by the authenticated user)
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { title, aiAnswers, userAnswers } = req.body;
        const userId = req.user!.id;

        // First verify ownership
        const { data: existingRoom, error: fetchError } = await supabase
            .from('history')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !existingRoom) {
            return res.status(404).json({
                success: false,
                error: 'Room not found or access denied',
            });
        }

        // Build update object with only provided fields
        const updateData: Record<string, any> = {};
        if (title !== undefined) updateData.title = title;
        if (aiAnswers !== undefined) updateData.aiAnswers = aiAnswers;
        if (userAnswers !== undefined) updateData.userAnswers = userAnswers;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one field (title, aiAnswers, or userAnswers) is required for update',
            });
        }

        const { data, error } = await supabase
            .from('history')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId) // Double-check ownership
            .select()
            .single();

        if (error) {
            console.error('Error updating room:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        res.json({
            success: true,
            room: data,
            message: 'Room updated successfully',
        });
    } catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

/**
 * DELETE /api/room/:id
 * Delete a room (only if owned by the authenticated user)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        // First verify ownership
        const { data: existingRoom, error: fetchError } = await supabase
            .from('history')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !existingRoom) {
            return res.status(404).json({
                success: false,
                error: 'Room not found or access denied',
            });
        }

        const { error } = await supabase
            .from('history')
            .delete()
            .eq('id', id)
            .eq('user_id', userId); // Double-check ownership

        if (error) {
            console.error('Error deleting room:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        res.json({
            success: true,
            message: 'Room deleted successfully',
        });
    } catch (error) {
        console.error('Delete room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

export default router;