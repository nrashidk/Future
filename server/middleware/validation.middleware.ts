import { Request, Response, NextFunction } from "express";
import { z } from "zod";

/**
 * Generic validation middleware factory
 * Creates middleware that validates request body against a Zod schema
 */
export function validateBody<T extends z.ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ 
          message: 'Validation failed', 
          errors: formattedErrors 
        });
      }
      next(error);
    }
  };
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T extends z.ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = await schema.parseAsync(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ 
          message: 'Invalid query parameters', 
          errors: formattedErrors 
        });
      }
      next(error);
    }
  };
}

/**
 * Validates route parameters against a Zod schema
 */
export function validateParams<T extends z.ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = await schema.parseAsync(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ 
          message: 'Invalid route parameters', 
          errors: formattedErrors 
        });
      }
      next(error);
    }
  };
}
