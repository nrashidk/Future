import type { Assessment, Career } from "@shared/schema";
import type { RiasecScores, KolbScores } from "./matching";

/**
 * Premium Narrative Generator
 * Generates enhanced, personalized career insights for premium-tier assessments
 * using Kolb learning style, RIASEC personality, and CVQ values data
 */

interface NarrativeContext {
  assessment: Assessment;
  career: Career;
  kolbScores?: KolbScores;
  riasecScores?: RiasecScores;
  cvqScores?: Record<string, any>;
  overallScore: number;
}

/**
 * Generate expanded "Why This Career?" reasoning (5-6 paragraphs)
 * Combines personality, learning style, values, and practical fit
 */
export function generateEnhancedReasoning(context: NarrativeContext): string {
  const { assessment, career, kolbScores, riasecScores, cvqScores, overallScore } = context;
  const paragraphs: string[] = [];

  // Paragraph 1: Overall Match & Personalized Introduction
  paragraphs.push(
    `${career.title} is a ${overallScore >= 80 ? 'highly compatible' : overallScore >= 70 ? 'strong' : 'good'} match for you, scoring ${overallScore.toFixed(1)}% based on your comprehensive assessment. This career aligns with your unique combination of interests, learning preferences, and personal values.`
  );

  // Paragraph 2: RIASEC Personality Match
  if (riasecScores) {
    const topThemes = getTopRiasecThemes(riasecScores);
    const personalityInsight = generateRiasecCareerInsight(topThemes, career);
    paragraphs.push(personalityInsight);
  }

  // Paragraph 3: Learning Style Fit (Kolb)
  if (kolbScores?.learningStyle) {
    const learningInsight = generateKolbCareerInsight(kolbScores.learningStyle, career);
    paragraphs.push(learningInsight);
  }

  // Paragraph 4: Values Alignment (CVQ)
  if (cvqScores?.top3 && Array.isArray(cvqScores.top3)) {
    const valuesInsight = generateValuesCareerInsight(cvqScores.top3, career);
    paragraphs.push(valuesInsight);
  }

  // Paragraph 5: Subject & Skills Connection
  if (assessment.favoriteSubjects) {
    const subjectInsight = generateSubjectCareerInsight(
      assessment.favoriteSubjects as string[],
      career
    );
    paragraphs.push(subjectInsight);
  }

  // Paragraph 6: Future Outlook & Growth Potential
  paragraphs.push(
    `Looking ahead, ${career.title} offers strong growth potential in the UAE job market. The skills you'll develop—including ${career.requiredSkills.slice(0, 3).join(', ')}—are increasingly valuable as industries modernize. This career path provides opportunities for continuous learning and professional advancement aligned with your strengths.`
  );

  return paragraphs.join('\n\n');
}

/**
 * Generate "Your Work Style Fit" section
 * Details about ideal work environment, team dynamics, and daily tasks
 */
export function generateWorkStyleFit(context: NarrativeContext): string {
  const { kolbScores, riasecScores, career } = context;
  const sections: string[] = [];

  // Team Collaboration Style
  if (riasecScores) {
    const topTheme = getTopRiasecThemes(riasecScores)[0];
    const collaborationStyle = getRiasecCollaborationStyle(topTheme);
    sections.push(`**Team Collaboration:** ${collaborationStyle}`);
  }

  // Ideal Work Environment
  if (kolbScores?.learningStyle) {
    const environment = getKolbIdealEnvironment(kolbScores.learningStyle);
    sections.push(`**Ideal Work Environment:** ${environment}`);
  }

  // Daily Task Preferences
  if (riasecScores) {
    const topTheme = getTopRiasecThemes(riasecScores)[0];
    const taskPrefs = getRiasecTaskPreferences(topTheme, career);
    sections.push(`**Daily Tasks:** ${taskPrefs}`);
  }

  return sections.join('\n\n');
}

/**
 * Generate "Personal Strengths & Growth Areas" section
 * Actionable insights based on assessment results
 */
export function generateStrengthsGrowth(context: NarrativeContext): string {
  const { kolbScores, riasecScores, cvqScores } = context;
  const sections: string[] = [];

  // Core Strengths
  const strengths: string[] = [];
  if (riasecScores) {
    const topThemes = getTopRiasecThemes(riasecScores).slice(0, 2);
    topThemes.forEach(theme => {
      strengths.push(getRiasecStrength(theme));
    });
  }
  if (strengths.length > 0) {
    sections.push(`**Your Core Strengths:**\n${strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }

  // Growth Opportunities
  const growthAreas: string[] = [];
  if (kolbScores?.learningStyle) {
    growthAreas.push(getKolbGrowthArea(kolbScores.learningStyle));
  }
  if (cvqScores?.top3) {
    const lowestValue = cvqScores.top3[cvqScores.top3.length - 1];
    growthAreas.push(getValueGrowthArea(lowestValue));
  }
  if (growthAreas.length > 0) {
    sections.push(`**Areas for Growth:**\n${growthAreas.map((g, i) => `${i + 1}. ${g}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Generate enhanced action steps (7-8 detailed steps with timelines)
 */
export function generateEnhancedActionSteps(context: NarrativeContext): string[] {
  const { assessment, career, kolbScores } = context;
  const steps: string[] = [];

  // Immediate Next Steps (Now - 3 months)
  steps.push(
    `**This Month:** Research ${career.title} careers by watching day-in-the-life videos and reading professional profiles to understand daily responsibilities`
  );

  steps.push(
    `**Next 3 Months:** Connect with a ${career.title} professional for a 20-minute informational interview to learn about their career journey and advice`
  );

  // Academic Foundation (6-12 months)
  if (assessment.favoriteSubjects && (assessment.favoriteSubjects as string[]).length > 0) {
    const topSubject = (assessment.favoriteSubjects as string[])[0];
    steps.push(
      `**Next 6 Months:** Excel in ${topSubject} by seeking advanced projects or competitions to build foundational knowledge for this career`
    );
  }

  steps.push(
    `**Next Year:** Start building key skills like ${career.requiredSkills.slice(0, 2).join(' and ')} through online courses, school clubs, or personal projects`
  );

  // Skill Development (1-2 years)
  if (kolbScores?.learningStyle) {
    const learningTip = getKolbLearningTip(kolbScores.learningStyle);
    steps.push(
      `**Year 2:** ${learningTip} This approach aligns with your ${kolbScores.learningStyle} learning style and will help you master complex concepts`
    );
  }

  // Experience Building (2-3 years)
  steps.push(
    `**Years 2-3:** Gain hands-on experience through internships, volunteer work, or part-time opportunities in ${career.category} to build your resume and network`
  );

  // Education Path (3-4 years)
  steps.push(
    `**Year 3-4:** Research and apply to universities offering strong programs in ${career.category}, focusing on institutions with industry connections and practical training`
  );

  // Professional Development (4+ years)
  steps.push(
    `**Beyond Year 4:** After completing ${career.educationLevel}, pursue certifications or specialized training in emerging areas within ${career.category} to stay competitive`
  );

  return steps;
}

// ===== Helper Functions =====

function getTopRiasecThemes(scores: RiasecScores): string[] {
  const themes = [
    { code: 'R', score: scores.R },
    { code: 'I', score: scores.I },
    { code: 'A', score: scores.A },
    { code: 'S', score: scores.S },
    { code: 'E', score: scores.E },
    { code: 'C', score: scores.C },
  ];
  return themes.sort((a, b) => b.score - a.score).map(t => t.code).slice(0, 3);
}

function generateRiasecCareerInsight(topThemes: string[], career: Career): string {
  const themeDescriptions: Record<string, string> = {
    R: "You have a Realistic personality—you prefer hands-on work and practical problem-solving",
    I: "You have an Investigative personality—you enjoy analyzing data and solving complex problems",
    A: "You have an Artistic personality—you value creativity and self-expression",
    S: "You have a Social personality—you thrive on helping others and building relationships",
    E: "You have an Enterprising personality—you enjoy leading projects and persuading others",
    C: "You have a Conventional personality—you excel at organization and attention to detail",
  };

  const careerFit: Record<string, string> = {
    R: `${career.title} roles often involve tangible outcomes and technical skills that match your practical nature`,
    I: `${career.title} requires the analytical thinking and research skills that energize you`,
    A: `${career.title} provides opportunities for creative problem-solving and innovative thinking that engage your artistic mindset`,
    S: `${career.title} involves meaningful interactions and helping others, which aligns perfectly with your people-oriented nature`,
    E: `${career.title} offers leadership opportunities and the chance to drive initiatives, matching your entrepreneurial spirit`,
    C: `${career.title} values the structured approach and precise work that you naturally excel at`,
  };

  const primary = topThemes[0];
  return `${themeDescriptions[primary]}. ${careerFit[primary]}. Your personality profile suggests you'll find this work naturally engaging and fulfilling.`;
}

function generateKolbCareerInsight(learningStyle: string, career: Career): string {
  const insights: Record<string, string> = {
    Diverging: `With your Diverging learning style, you learn best through observation and reflection. In ${career.title} roles, you'll excel at understanding diverse perspectives, brainstorming creative solutions, and adapting approaches based on real-world feedback. Your ability to see situations from multiple angles will be invaluable when tackling complex challenges.`,
    Assimilating: `Your Assimilating learning style means you thrive on logical analysis and systematic thinking. ${career.title} careers will engage your love of building frameworks, understanding theoretical concepts, and organizing information into coherent models. You'll be the person colleagues turn to for well-reasoned strategies and clear explanations.`,
    Converging: `As a Converging learner, you excel at practical application and problem-solving. In ${career.title}, you'll shine when implementing technical solutions, testing ideas through experimentation, and finding efficient ways to achieve concrete results. Your hands-on, results-oriented approach matches perfectly with the demands of this field.`,
    Accommodating: `Your Accommodating learning style drives you to learn through hands-on experience and trial-and-error. ${career.title} roles will suit your adaptive, action-oriented nature—you'll thrive in dynamic situations that require quick thinking, flexibility, and the courage to try new approaches. Your willingness to take calculated risks will drive innovation.`,
  };

  return insights[learningStyle] || `Your learning approach aligns well with the demands of ${career.title}.`;
}

function generateValuesCareerInsight(top3Values: string[], career: Career): string {
  const valueDescriptions: Record<string, string> = {
    achievement: "success and personal accomplishment",
    benevolence: "helping others and making a positive impact",
    universalism: "fairness, equality, and social justice",
    self_direction: "independence and creative freedom",
    security: "stability and safety",
    power: "influence and leadership",
    hedonism: "enjoyment and work-life balance",
  };

  const careerAlignment: Record<string, string> = {
    achievement: `${career.title} provides clear benchmarks for success and opportunities to demonstrate your competence through measurable results`,
    benevolence: `${career.title} allows you to contribute meaningfully to others' lives and make a tangible difference in your community`,
    universalism: `${career.title} offers opportunities to promote fairness and contribute to creating a more just and equitable society`,
    self_direction: `${career.title} provides autonomy in decision-making and room for creative problem-solving that respects your independence`,
    security: `${career.title} offers stable career prospects with clear professional pathways and reliable working conditions`,
    power: `${career.title} provides opportunities to take on leadership roles and influence important decisions in your field`,
    hedonism: `${career.title} can offer work-life balance and the flexibility to enjoy life while building a fulfilling career`,
  };

  const primary = top3Values[0];
  const primaryDesc = valueDescriptions[primary] || primary;
  const alignment = careerAlignment[primary] || `aligns with your values`;

  return `What matters most to you—${primaryDesc}—is reflected in this career choice. ${alignment}. This values alignment means you're more likely to find long-term satisfaction and meaning in your work.`;
}

function generateSubjectCareerInsight(subjects: string[], career: Career): string {
  const relevantSubjects = subjects.filter(s => 
    career.relatedSubjects.includes(s)
  );

  if (relevantSubjects.length === 0) {
    return `The analytical and problem-solving skills you're developing in your coursework will transfer well to ${career.title}.`;
  }

  const subjectList = relevantSubjects.slice(0, 3).join(', ');
  return `Your interest in ${subjectList} directly supports this career path. The concepts and skills from these subjects form the foundation for ${career.title} work. As you advance, you'll see how classroom knowledge applies to real-world professional challenges, making your studies more purposeful and engaging.`;
}

function getRiasecCollaborationStyle(theme: string): string {
  const styles: Record<string, string> = {
    R: "You work well independently or in small technical teams where roles are clearly defined and communication is direct and practical.",
    I: "You thrive in collaborative environments where ideas are debated intellectually, and team members value evidence-based decision-making.",
    A: "You excel in creative teams that encourage brainstorming, value diverse perspectives, and allow for individual expression within group projects.",
    S: "You're a natural team player who builds strong relationships, facilitates group harmony, and helps bring out the best in your colleagues.",
    E: "You naturally take leadership roles, enjoy coordinating team efforts, and excel at motivating others toward shared goals.",
    C: "You contribute best in structured teams with clear procedures, where your organizational skills and attention to detail keep projects on track.",
  };
  return styles[theme] || "You adapt well to various team structures and collaboration styles.";
}

function getKolbIdealEnvironment(learningStyle: string): string {
  const environments: Record<string, string> = {
    Diverging: "You'll thrive in open, creative workspaces that encourage reflection and discussion. Flexible schedules that allow time for observation and thoughtful analysis will help you perform at your best.",
    Assimilating: "You perform best in quiet, organized environments where you can focus deeply on analysis and planning. Access to resources, research materials, and time for systematic thinking are essential for your success.",
    Converging: "You excel in hands-on, well-equipped workspaces where you can test ideas and see immediate results. Environments that balance technical tools with problem-solving challenges will keep you engaged.",
    Accommodating: "You thrive in dynamic, fast-paced environments where you can take initiative and adapt quickly. Settings that reward action, flexibility, and real-time problem-solving match your energetic approach.",
  };
  return environments[learningStyle] || "You're adaptable to various work environments.";
}

function getRiasecTaskPreferences(theme: string, career: Career): string {
  const preferences: Record<string, string> = {
    R: `As a ${career.title}, you'll enjoy tasks like building prototypes, troubleshooting technical issues, and working with tools or equipment—all of which align with your practical, hands-on preferences.`,
    I: `Your typical day might include analyzing data, researching solutions to complex problems, and developing evidence-based recommendations—tasks that satisfy your intellectual curiosity.`,
    A: `You'll gravitate toward tasks that involve creative design, developing innovative solutions, and crafting compelling presentations—work that engages your artistic sensibilities.`,
    S: `Your workday might involve mentoring others, facilitating team meetings, and building stakeholder relationships—activities that leverage your interpersonal strengths.`,
    E: `You'll thrive on tasks like pitching ideas, leading project teams, and negotiating with partners—work that uses your persuasive and leadership abilities.`,
    C: `Your day will likely include organizing systems, ensuring quality control, and maintaining detailed records—tasks that utilize your exceptional organizational skills.`,
  };
  return preferences[theme] || `Your daily tasks in ${career.title} will engage your natural strengths and interests.`;
}

function getRiasecStrength(theme: string): string {
  const strengths: Record<string, string> = {
    R: "Practical problem-solving and hands-on technical skills—you can troubleshoot issues and create tangible solutions",
    I: "Analytical thinking and research abilities—you excel at gathering information and drawing logical conclusions",
    A: "Creative innovation and original thinking—you bring fresh perspectives and imaginative solutions to challenges",
    S: "Interpersonal skills and empathy—you understand people's needs and build strong, supportive relationships",
    E: "Leadership and persuasion—you can motivate others and drive initiatives forward with confidence",
    C: "Organization and attention to detail—you create order from complexity and ensure accuracy in your work",
  };
  return strengths[theme] || "Strong professional capabilities";
}

function getKolbGrowthArea(learningStyle: string): string {
  const growthAreas: Record<string, string> = {
    Diverging: "Consider developing your ability to make quick decisions without extensive reflection. Practice setting deadlines for analysis phases to ensure timely action on your insights.",
    Assimilating: "Work on translating your theoretical understanding into practical action more quickly. Seek opportunities to test your frameworks in real-world situations rather than perfecting them in theory.",
    Converging: "Challenge yourself to consider multiple perspectives before settling on solutions. Engage with colleagues who have different problem-solving styles to broaden your approach.",
    Accommodating: "Develop patience for systematic planning and analysis before taking action. Building this skill will help you avoid costly trial-and-error when tackling complex challenges.",
  };
  return growthAreas[learningStyle] || "Continue developing well-rounded professional skills.";
}

function getValueGrowthArea(lowestValue: string): string {
  const suggestions: Record<string, string> = {
    achievement: "Consider setting specific professional goals to channel your strengths into measurable accomplishments and build confidence through visible successes.",
    benevolence: "Explore volunteer opportunities or mentoring roles to develop your capacity for helping others—a skill that enhances leadership and teamwork.",
    universalism: "Engage with diverse perspectives and communities to develop broader understanding of social issues and build cultural competence.",
    self_direction: "Practice making independent decisions in low-stakes situations to build confidence in your autonomous thinking and creative problem-solving.",
    security: "Develop contingency planning skills and financial literacy to build a stronger foundation for long-term stability and risk management.",
    power: "Seek leadership opportunities in clubs or projects to develop your influence skills and comfort with authority and decision-making.",
    hedonism: "Remember to prioritize self-care and work-life balance—sustainable performance requires time for rest and enjoyment.",
  };
  return suggestions[lowestValue] || "Continue developing a balanced set of personal values.";
}

function getKolbLearningTip(learningStyle: string): string {
  const tips: Record<string, string> = {
    Diverging: "Seek mentorship and observe experienced professionals in action to learn from their approaches.",
    Assimilating: "Study industry frameworks, take structured courses, and build systematic knowledge through reading and research.",
    Converging: "Pursue hands-on internships, lab work, or technical projects where you can apply concepts practically.",
    Accommodating: "Jump into real-world experiences, learn from mistakes, and adapt your approach based on results.",
  };
  return tips[learningStyle] || "Engage with learning opportunities that match your strengths.";
}
