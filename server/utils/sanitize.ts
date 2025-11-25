import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize a string value by removing potentially dangerous HTML/JS content.
 * Uses DOMPurify with text-only mode to prevent XSS attacks.
 */
export function sanitizeString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  // DOMPurify with ALLOWED_TAGS empty produces text-only output
  return DOMPurify.sanitize(String(value), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  }).trim();
}

/**
 * Sanitize an array of strings.
 */
export function sanitizeStringArray(arr: string[] | null | undefined): string[] | null {
  if (!arr || !Array.isArray(arr)) {
    return null;
  }
  return arr.map(item => sanitizeString(item) || "").filter(Boolean);
}

/**
 * Recursively sanitize all string values in an object.
 * Useful for sanitizing entire request bodies.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj !== "object") {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === "string") {
        return sanitizeString(item);
      }
      if (typeof item === "object" && item !== null) {
        return sanitizeObject(item);
      }
      return item;
    }) as T;
  }
  
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}

/**
 * Fields that should NOT be sanitized (e.g., IDs, tokens, hashed values)
 */
const SKIP_SANITIZE_FIELDS = new Set([
  "id", "userId", "assessmentId", "careerId", "quizId", "questionId",
  "guestToken", "guestSessionId", "token", "password", "passwordHash",
  "csrfToken", "_csrf", "sessionId"
]);

/**
 * Sanitize request body while preserving special fields.
 * This is the main function to use in route handlers.
 */
export function sanitizeRequestBody<T extends Record<string, any>>(body: T): T {
  if (!body || typeof body !== "object") {
    return body;
  }
  
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(body)) {
    // Skip sanitization for special fields
    if (SKIP_SANITIZE_FIELDS.has(key)) {
      result[key] = value;
      continue;
    }
    
    if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      // For arrays of strings, sanitize each
      result[key] = value.map(item => {
        if (typeof item === "string") {
          return sanitizeString(item);
        }
        if (typeof item === "object" && item !== null) {
          return sanitizeRequestBody(item);
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeRequestBody(value);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}
