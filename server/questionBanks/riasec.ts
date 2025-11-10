/**
 * RIASEC (Holland Code) Scoring System
 * Calculates career personality scores from assessment responses
 */

export type Theme = "R" | "I" | "A" | "S" | "E" | "C";

export interface RiasecScores {
  R: number; // Realistic (0-100)
  I: number; // Investigative (0-100)
  A: number; // Artistic (0-100)
  S: number; // Social (0-100)
  E: number; // Enterprising (0-100)
  C: number; // Conventional (0-100)
  top3: Theme[];
  ranking: Theme[];
}

/**
 * Calculate RIASEC scores from raw response object
 * 
 * @param responses - Object with question IDs as keys and Likert responses (1-5) as values
 *                    Can be either individual responses or pre-calculated scores object
 * @returns Normalized RIASEC scores (0-100) with ranking
 */
export function calculateRiasecScores(responses: Record<string, number> | RiasecScores): RiasecScores {
  // If already calculated scores passed in (from frontend), return as-is
  if ('top3' in responses && 'ranking' in responses) {
    return responses as RiasecScores;
  }
  
  // Calculate from individual responses
  const rawScores: Record<Theme, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  
  // Map question IDs to themes
  Object.entries(responses).forEach(([questionId, value]) => {
    const theme = questionId.charAt(0) as Theme;
    if (theme in rawScores) {
      rawScores[theme] += value;
    }
  });
  
  // Normalize raw scores (5-25) to 0-100
  const normalized: Record<Theme, number> = {
    R: Math.round(((rawScores.R - 5) / 20) * 100),
    I: Math.round(((rawScores.I - 5) / 20) * 100),
    A: Math.round(((rawScores.A - 5) / 20) * 100),
    S: Math.round(((rawScores.S - 5) / 20) * 100),
    E: Math.round(((rawScores.E - 5) / 20) * 100),
    C: Math.round(((rawScores.C - 5) / 20) * 100),
  };
  
  // Rank themes by score
  const ranking = (Object.keys(normalized) as Theme[]).sort(
    (a, b) => normalized[b] - normalized[a]
  );
  
  const top3 = ranking.slice(0, 3);
  
  return {
    R: normalized.R,
    I: normalized.I,
    A: normalized.A,
    S: normalized.S,
    E: normalized.E,
    C: normalized.C,
    top3,
    ranking,
  };
}

/**
 * Get descriptive information about a RIASEC theme
 */
export function getThemeInfo(theme: Theme): { name: string; description: string } {
  const info: Record<Theme, { name: string; description: string }> = {
    R: {
      name: "Realistic",
      description: "Practical, hands-on work with tools, machines, or outdoors. Prefers concrete tasks with tangible results."
    },
    I: {
      name: "Investigative",
      description: "Analytical, research-oriented work involving ideas, theories, and problem-solving. Enjoys exploring how things work."
    },
    A: {
      name: "Artistic",
      description: "Creative, expressive work in design, arts, writing, or music. Values freedom and unconventional thinking."
    },
    S: {
      name: "Social",
      description: "People-oriented work focused on helping, teaching, counseling, or serving others. Thrives in collaborative environments."
    },
    E: {
      name: "Enterprising",
      description: "Leadership and influence-focused work in business, sales, or management. Comfortable taking initiative and making decisions."
    },
    C: {
      name: "Conventional",
      description: "Organized, detail-oriented work with data, procedures, and systems. Prefers structure and clear guidelines."
    },
  };
  
  return info[theme];
}
