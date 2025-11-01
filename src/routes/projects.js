/**
 * Projects and Pixels Management Routes for Cloudflare Workers
 * Handles CRUD operations for projects and their associated pixels
 */

import { Hono } from 'hono';
import { managementRateLimit } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../utils/workerLogger.js';

const app = new Hono();

// Apply rate limiting and authentication to management routes
app.use('*', managementRateLimit);
app.use('*', requireAuth);

/**
 * Utility functions
 */
// Using crypto.randomUUID() for Cloudflare Workers
const generateUUID = () => crypto.randomUUID();

/**
 * GET / - List all projects
 */
app.get('/', async (c) => {
  try {
    const projects = await c.env.DB.prepare(`
      SELECT 
        p.*,
        COUNT(px.id) as pixel_count
      FROM projects p
      LEFT JOIN pixels px ON p.id = px.project_id AND px.active = 1
      WHERE p.active = 1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();

    return c.json({
      success: true,
      data: projects.results || []
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to list projects', {
      error: error.message,
      stack: error.stack,
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve projects'
    }, 500);
  }
});

/**
 * POST / - Create a new project
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate required fields
    if (!body.name) {
      return c.json({
        success: false,
        error: 'Name is required'
      }, 400);
    }

    const projectId = generateUUID();
    const configuration = JSON.stringify(body.configuration || {});

    await c.env.DB.prepare(`
      INSERT INTO projects (id, name, configuration)
      VALUES (?, ?, ?)
    `).bind(projectId, body.name, configuration).run();

    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(projectId).first();

    return c.json({
      success: true,
      message: 'Project created successfully',
      data: project
    }, 201);

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to create project', {
      error: error.message,
      stack: error.stack,
      project_name: body.name,
      path: c.req.path
    }).catch(() => {});
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        error: 'Project name already exists'
      }, 409);
    }

    return c.json({
      success: false,
      error: 'Failed to create project'
    }, 500);
  }
});

/**
 * GET /:id - Get a specific project
 */
app.get('/:id', async (c) => {
  try {
    const projectId = c.req.param('id');
    
    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ? AND active = 1
    `).bind(projectId).first();

    if (!project) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404);
    }

    // Get project pixels
    const pixels = await c.env.DB.prepare(`
      SELECT * FROM pixels 
      WHERE project_id = ? AND active = 1
      ORDER BY created_at DESC
    `).bind(projectId).all();

    return c.json({
      success: true,
      data: {
        ...project,
        pixels: pixels.results || []
      }
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to get project', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('id'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve project'
    }, 500);
  }
});

/**
 * PUT /:id - Update a project
 */
app.put('/:id', async (c) => {
  try {
    const projectId = c.req.param('id');
    const body = await c.req.json();

    // Check if project exists
    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ? AND active = 1
    `).bind(projectId).first();

    if (!project) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404);
    }

    // Update project
    const configuration = body.configuration ? JSON.stringify(body.configuration) : project.configuration;
    
    await c.env.DB.prepare(`
      UPDATE projects 
      SET name = ?, configuration = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.name || project.name,
      configuration,
      projectId
    ).run();

    const updatedProject = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ?
    `).bind(projectId).first();

    return c.json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to update project', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('id'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to update project'
    }, 500);
  }
});

/**
 * DELETE /:id - Soft delete a project
 */
app.delete('/:id', async (c) => {
  try {
    const projectId = c.req.param('id');

    // Check if project exists
    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ? AND active = 1
    `).bind(projectId).first();

    if (!project) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404);
    }

    // Soft delete project and its pixels
    await c.env.DB.prepare(`
      UPDATE projects SET active = 0, updated_at = datetime('now') WHERE id = ?
    `).bind(projectId).run();

    await c.env.DB.prepare(`
      UPDATE pixels SET active = 0, updated_at = datetime('now') WHERE project_id = ?
    `).bind(projectId).run();

    return c.json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to delete project', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('id'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to delete project'
    }, 500);
  }
});

/**
 * Pixel Management Routes
 */

/**
 * GET /:projectId/pixels - List pixels for a project
 */
app.get('/:projectId/pixels', async (c) => {
  try {
    const projectId = c.req.param('projectId');

    // Verify project exists
    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ? AND active = 1
    `).bind(projectId).first();

    if (!project) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404);
    }

    const pixels = await c.env.DB.prepare(`
      SELECT * FROM pixels 
      WHERE project_id = ? AND active = 1
      ORDER BY created_at DESC
    `).bind(projectId).all();

    return c.json({
      success: true,
      data: pixels.results || []
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to list pixels', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('projectId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve pixels'
    }, 500);
  }
});

/**
 * POST /:projectId/pixels - Create a new pixel
 */
app.post('/:projectId/pixels', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const body = await c.req.json();

    // Verify project exists
    const project = await c.env.DB.prepare(`
      SELECT * FROM projects WHERE id = ? AND active = 1
    `).bind(projectId).first();

    if (!project) {
      return c.json({
        success: false,
        error: 'Project not found'
      }, 404);
    }

    // Validate required fields
    if (!body.name) {
      return c.json({
        success: false,
        error: 'Pixel name is required'
      }, 400);
    }

    const pixelId = generateUUID();
    const configuration = JSON.stringify(body.configuration || {});

    await c.env.DB.prepare(`
      INSERT INTO pixels (id, project_id, name, website_url, configuration)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      pixelId,
      projectId,
      body.name,
      body.website_url || null,
      configuration
    ).run();

    const pixel = await c.env.DB.prepare(`
      SELECT * FROM pixels WHERE id = ?
    `).bind(pixelId).first();

    return c.json({
      success: true,
      message: 'Pixel created successfully',
      data: pixel
    }, 201);

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to create pixel', {
      error: error.message,
      stack: error.stack,
      project_id: c.req.param('projectId'),
      path: c.req.path
    }).catch(() => {});
    
    if (error.message.includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        error: 'Pixel name already exists in this project'
      }, 409);
    }

    return c.json({
      success: false,
      error: 'Failed to create pixel'
    }, 500);
  }
});

/**
 * GET /pixels/:pixelId - Get a specific pixel
 */
app.get('/pixels/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');

    const pixel = await c.env.DB.prepare(`
      SELECT p.*, pr.name as project_name
      FROM pixels p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = ? AND p.active = 1
    `).bind(pixelId).first();

    if (!pixel) {
      return c.json({
        success: false,
        error: 'Pixel not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: pixel
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to get pixel', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to retrieve pixel'
    }, 500);
  }
});

/**
 * PUT /pixels/:pixelId - Update a pixel
 */
app.put('/pixels/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');
    const body = await c.req.json();

    // Check if pixel exists
    const pixel = await c.env.DB.prepare(`
      SELECT * FROM pixels WHERE id = ? AND active = 1
    `).bind(pixelId).first();

    if (!pixel) {
      return c.json({
        success: false,
        error: 'Pixel not found'
      }, 404);
    }

    // Update pixel
    const configuration = body.configuration ? JSON.stringify(body.configuration) : pixel.configuration;

    await c.env.DB.prepare(`
      UPDATE pixels 
      SET name = ?, website_url = ?, configuration = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      body.name || pixel.name,
      body.website_url || pixel.website_url,
      configuration,
      pixelId
    ).run();

    const updatedPixel = await c.env.DB.prepare(`
      SELECT * FROM pixels WHERE id = ?
    `).bind(pixelId).first();

    return c.json({
      success: true,
      message: 'Pixel updated successfully',
      data: updatedPixel
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to update pixel', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to update pixel'
    }, 500);
  }
});

/**
 * DELETE /pixels/:pixelId - Soft delete a pixel
 */
app.delete('/pixels/:pixelId', async (c) => {
  try {
    const pixelId = c.req.param('pixelId');

    // Check if pixel exists
    const pixel = await c.env.DB.prepare(`
      SELECT * FROM pixels WHERE id = ? AND active = 1
    `).bind(pixelId).first();

    if (!pixel) {
      return c.json({
        success: false,
        error: 'Pixel not found'
      }, 404);
    }

    // Soft delete pixel
    await c.env.DB.prepare(`
      UPDATE pixels SET active = 0, updated_at = datetime('now') WHERE id = ?
    `).bind(pixelId).run();

    return c.json({
      success: true,
      message: 'Pixel deleted successfully'
    });

  } catch (error) {
    const logger = createLogger(c.env);
    logger.error('Failed to delete pixel', {
      error: error.message,
      stack: error.stack,
      pixel_id: c.req.param('pixelId'),
      path: c.req.path
    }).catch(() => {});
    return c.json({
      success: false,
      error: 'Failed to delete pixel'
    }, 500);
  }
});

export default app; 