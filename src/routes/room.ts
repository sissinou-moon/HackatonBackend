import express, { Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = express.Router();

// Get all rooms (history entries)
router.get('/', async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('history')
            .select('*')
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
        });
    } catch (error) {
        console.error('Get rooms error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

// Get a single room by ID
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('history')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching room:', error);
            return res.status(404).json({
                success: false,
                error: 'Room not found',
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

// Create a new room
router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, aiAnswers, userAnswers } = req.body;

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
        });
    } catch (error) {
        console.error('Create room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

// Update an existing room
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, aiAnswers, userAnswers } = req.body;

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
            .select()
            .single();

        if (error) {
            console.error('Error updating room:', error);
            return res.status(500).json({
                success: false,
                error: error.message,
            });
        }

        if (!data) {
            return res.status(404).json({
                success: false,
                error: 'Room not found',
            });
        }

        res.json({
            success: true,
            room: data,
        });
    } catch (error) {
        console.error('Update room error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

// Delete a room
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('history')
            .delete()
            .eq('id', id);

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