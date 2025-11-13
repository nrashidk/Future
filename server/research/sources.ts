/**
 * Research Sources Registry
 * 
 * Centralized registry of all research sources, frameworks, and methodologies
 * used in the Future Pathways career guidance system, particularly for the
 * WEF 16 Skills Framework integration.
 */

export interface ResearchSource {
  id: string;
  title: string;
  author: string;
  organization?: string;
  year: number;
  type: 'report' | 'framework' | 'research_paper' | 'government_document' | 'assessment_tool';
  url?: string;
  doi?: string;
  citation: string;
  usedFor: string[];
  notes?: string;
}

export const RESEARCH_SOURCES: Record<string, ResearchSource> = {
  WEF_FUTURE_OF_JOBS_2025: {
    id: 'wef_future_of_jobs_2025',
    title: 'The Future of Jobs Report 2025',
    author: 'World Economic Forum',
    organization: 'World Economic Forum',
    year: 2025,
    type: 'report',
    url: 'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',
    citation: 'World Economic Forum. (2025). The Future of Jobs Report 2025. Geneva: World Economic Forum.',
    usedFor: [
      '16 Future Skills Framework',
      'Career-to-WEF Skills affinity mappings',
      'Skills categories (Foundational Literacies & Core Competencies)',
    ],
    notes: 'Primary framework for identifying essential future-ready skills across industries',
  },

  HOLLAND_RIASEC: {
    id: 'holland_riasec',
    title: 'Making Vocational Choices: A Theory of Vocational Personalities and Work Environments',
    author: 'John L. Holland',
    year: 1997,
    type: 'framework',
    citation: 'Holland, J. L. (1997). Making Vocational Choices: A Theory of Vocational Personalities and Work Environments (3rd ed.). Odessa, FL: Psychological Assessment Resources.',
    usedFor: [
      'RIASEC personality assessment',
      'RIASEC to WEF skills correlations',
      'Career affinity scoring based on Holland Codes',
    ],
    notes: 'Six personality themes: Realistic, Investigative, Artistic, Social, Enterprising, Conventional',
  },

  KOLB_LEARNING_STYLES: {
    id: 'kolb_learning_styles',
    title: 'Experiential Learning: Experience as the Source of Learning and Development',
    author: 'David A. Kolb',
    year: 1984,
    type: 'framework',
    citation: 'Kolb, D. A. (1984). Experiential Learning: Experience as the Source of Learning and Development. Englewood Cliffs, NJ: Prentice Hall.',
    usedFor: [
      'Learning style assessment (24 questions)',
      'Kolb learning styles to WEF skills correlations',
      'Study tips and learning strategy recommendations',
    ],
    notes: 'Four learning styles: Diverging, Assimilating, Converging, Accommodating',
  },

  CVQ_VALUES_QUESTIONNAIRE: {
    id: 'cvq_values',
    title: "Children's Values Questionnaire (CVQ)",
    author: 'Döring, A. K., Schwartz, S. H., Cieciuch, J., Groenen, P. J. F., Glatzel, V., Harasimczuk, J., Janowicz, N., Nyagolova, M., Scheefer, E. R., Allritz, M., Milfont, T. L., & Bilsky, W.',
    year: 2015,
    type: 'assessment_tool',
    doi: '10.1080/15374416.2015.1020541',
    citation: 'Döring, A. K., et al. (2015). Cross-cultural evidence of value structures and priorities in childhood. British Journal of Psychology, 106(4), 675-699.',
    usedFor: [
      'Personal values assessment (21 items)',
      'CVQ value domains to WEF skills correlations',
      'Value-based career alignment',
    ],
    notes: 'Adapted from Schwartz Value Survey for children, measuring 10 basic human values',
  },

  UAE_CENTENNIAL_2071: {
    id: 'uae_centennial_2071',
    title: 'UAE Centennial 2071',
    author: 'UAE Government',
    organization: 'United Arab Emirates Government',
    year: 2017,
    type: 'government_document',
    url: 'https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/federal-governments-strategies-and-plans/uae-centennial-2071',
    citation: 'United Arab Emirates Government. (2017). UAE Centennial 2071. Abu Dhabi: UAE Government.',
    usedFor: [
      'UAE priority sectors definition',
      'National vision alignment scoring',
      'Sector-to-WEF skills importance mappings',
    ],
    notes: 'Long-term strategic plan focusing on AI, space exploration, clean energy, and education excellence',
  },

  SAUDI_VISION_2030: {
    id: 'saudi_vision_2030',
    title: 'Saudi Vision 2030',
    author: 'Kingdom of Saudi Arabia',
    organization: 'Saudi Arabian Government',
    year: 2016,
    type: 'government_document',
    url: 'https://www.vision2030.gov.sa/',
    citation: 'Kingdom of Saudi Arabia. (2016). Saudi Vision 2030. Riyadh: Saudi Arabian Government.',
    usedFor: [
      'Saudi Arabia national goals and priority sectors',
      'Economic diversification targets',
    ],
    notes: 'Blueprint to reduce oil dependence and diversify economy through vibrant society, thriving economy, and ambitious nation',
  },

  OECD_SKILLS_FRAMEWORK: {
    id: 'oecd_skills_2030',
    title: 'OECD Learning Compass 2030',
    author: 'Organisation for Economic Co-operation and Development',
    organization: 'OECD',
    year: 2019,
    type: 'framework',
    url: 'https://www.oecd.org/education/2030-project/',
    citation: 'OECD. (2019). OECD Learning Compass 2030. Paris: OECD Publishing.',
    usedFor: [
      'Cross-validation of WEF skills framework',
      'Competency-based education alignment',
    ],
    notes: 'Complementary framework emphasizing transformative competencies for 2030',
  },

  UAE_CURRICULUM_FRAMEWORK: {
    id: 'uae_curriculum',
    title: 'UAE National Curriculum Framework',
    author: 'Ministry of Education - UAE',
    organization: 'United Arab Emirates Ministry of Education',
    year: 2023,
    type: 'government_document',
    url: 'https://www.moe.gov.ae/',
    citation: 'Ministry of Education - UAE. (2023). UAE National Curriculum Framework. Abu Dhabi: Ministry of Education.',
    usedFor: [
      'Subject competency quiz questions (240 questions)',
      'Grade-appropriate content standards (Grades 8-12)',
      'Subject-to-WEF skills correlations',
    ],
    notes: 'Standards-aligned curriculum covering Math, Science, English, Arabic, Social Studies, and Computer Science',
  },
};

/**
 * Get a formatted citation for a specific research source
 */
export function getCitation(sourceId: string): string {
  const source = RESEARCH_SOURCES[sourceId];
  return source ? source.citation : '';
}

/**
 * Get all sources used for a specific feature
 */
export function getSourcesForFeature(feature: string): ResearchSource[] {
  return Object.values(RESEARCH_SOURCES).filter(
    source => source.usedFor.some(use => use.toLowerCase().includes(feature.toLowerCase()))
  );
}

/**
 * Get all citations formatted for a report
 */
export function getAllCitations(): string {
  return Object.values(RESEARCH_SOURCES)
    .sort((a, b) => a.author.localeCompare(b.author))
    .map(source => source.citation)
    .join('\n\n');
}

/**
 * Get research attribution text for WEF integration
 */
export function getWEFAttributionText(): string {
  return `This career guidance system integrates the World Economic Forum's Future of Jobs Report 2025 framework, 
which identifies 16 essential future-ready skills across two categories: Foundational Literacies and Core Competencies. 
Student assessments are scientifically mapped to these skills using research-validated correlations from established 
frameworks including Holland's RIASEC personality model, Kolb's experiential learning theory, and the Children's Values 
Questionnaire (CVQ).`;
}

/**
 * Get research sources summary for UI display
 */
export function getResearchSourcesSummary(): {
  total: number;
  byType: Record<string, number>;
  featured: ResearchSource[];
} {
  const sources = Object.values(RESEARCH_SOURCES);
  const byType = sources.reduce((acc, source) => {
    acc[source.type] = (acc[source.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const featured = sources.filter(s => 
    ['wef_future_of_jobs_2025', 'holland_riasec', 'kolb_learning_styles', 'cvq_values'].includes(s.id)
  );

  return {
    total: sources.length,
    byType,
    featured,
  };
}
