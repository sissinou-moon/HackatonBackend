import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user with email and password
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, metadata } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required',
            });
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata || {},
            },
        });

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: data.user,
                session: data.session,
            },
        });
    } catch (error: any) {
        console.error('Registration error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during registration',
        });
    }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required',
            });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: data.user,
                session: data.session,
            },
        });
    } catch (error: any) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during login',
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout the current user
 */
router.post('/logout', async (req: Request, res: Response) => {
    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error: any) {
        console.error('Logout error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during logout',
        });
    }
});

/**
 * GET /api/auth/user
 * Get current user from access token
 */
router.get('/user', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No access token provided',
            });
        }

        const token = authHeader.split(' ')[1];

        const { data, error } = await supabase.auth.getUser(token);

        if (error) {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                user: data.user,
            },
        });
    } catch (error: any) {
        console.error('Get user error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token is required',
            });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token,
        });

        if (error) {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                session: data.session,
                user: data.user,
            },
        });
    } catch (error: any) {
        console.error('Refresh token error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Send password reset email
 */
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required',
            });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email);

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Password reset email sent',
        });
    } catch (error: any) {
        console.error('Reset password error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

/**
 * POST /api/auth/update-password
 * Update password for authenticated user
 */
router.post('/update-password', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        const { password } = req.body;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No access token provided',
            });
        }

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'New password is required',
            });
        }

        const token = authHeader.split(' ')[1];

        // First verify the token
        const { error: authError } = await supabase.auth.getUser(token);
        if (authError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
            });
        }

        const { data, error } = await supabase.auth.updateUser({
            password,
        });

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Password updated successfully',
            data: {
                user: data.user,
            },
        });
    } catch (error: any) {
        console.error('Update password error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

export default router;
