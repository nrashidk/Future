// Kolb's Experiential Learning Theory (ELT) Question Bank
// 24 questions across 4 dimensions (6 per dimension)
// Scoring: 1=Strongly Disagree, 2=Disagree, 3=Neutral, 4=Agree, 5=Strongly Agree

export interface KolbQuestion {
  id: string;
  dimension: 'CE' | 'RO' | 'AC' | 'AE';
  text: string;
  reversed: boolean; // If true, reverse scoring (1→5, 2→4, 3→3, 4→2, 5→1)
}

export const kolbQuestions: KolbQuestion[] = [
  // Concrete Experience (CE) - Learning through feeling and experiencing
  {
    id: 'ce1',
    dimension: 'CE',
    text: 'I learn best when I can observe real situations up close.',
    reversed: false
  },
  {
    id: 'ce2',
    dimension: 'CE',
    text: 'I like to collect concrete examples before forming an opinion.',
    reversed: false
  },
  {
    id: 'ce3',
    dimension: 'CE',
    text: 'Hands-on exposure helps me "get it" faster.',
    reversed: false
  },
  {
    id: 'ce4',
    dimension: 'CE',
    text: 'I prefer stories and case studies to abstract descriptions.',
    reversed: false
  },
  {
    id: 'ce5',
    dimension: 'CE',
    text: "I'm most confident after seeing it in action.",
    reversed: false
  },
  {
    id: 'ce6',
    dimension: 'CE',
    text: 'I feel lost when learning without practical context.',
    reversed: false
  },

  // Reflective Observation (RO) - Learning through watching and reflecting
  {
    id: 'ro1',
    dimension: 'RO',
    text: 'I need quiet time to review what happened before deciding.',
    reversed: false
  },
  {
    id: 'ro2',
    dimension: 'RO',
    text: 'I often journal or take notes to process experiences.',
    reversed: false
  },
  {
    id: 'ro3',
    dimension: 'RO',
    text: 'I like to compare multiple perspectives before acting.',
    reversed: false
  },
  {
    id: 'ro4',
    dimension: 'RO',
    text: 'I prefer to watch first, then try.',
    reversed: false
  },
  {
    id: 'ro5',
    dimension: 'RO',
    text: 'I often ask clarifying questions before moving on.',
    reversed: false
  },
  {
    id: 'ro6',
    dimension: 'RO',
    text: 'I look for patterns across different experiences.',
    reversed: false
  },

  // Abstract Conceptualization (AC) - Learning through thinking and analyzing
  {
    id: 'ac1',
    dimension: 'AC',
    text: 'I enjoy building models or frameworks to explain things.',
    reversed: false
  },
  {
    id: 'ac2',
    dimension: 'AC',
    text: 'I feel confident when I can define the underlying principles.',
    reversed: false
  },
  {
    id: 'ac3',
    dimension: 'AC',
    text: 'I often turn experiences into general rules.',
    reversed: false
  },
  {
    id: 'ac4',
    dimension: 'AC',
    text: 'I prefer logic and structure over examples.',
    reversed: false
  },
  {
    id: 'ac5',
    dimension: 'AC',
    text: 'I learn well from diagrams or formal explanations.',
    reversed: false
  },
  {
    id: 'ac6',
    dimension: 'AC',
    text: 'I like to test an idea against a theory.',
    reversed: false
  },

  // Active Experimentation (AE) - Learning through doing and experimenting
  {
    id: 'ae1',
    dimension: 'AE',
    text: 'I prefer to try things quickly rather than over-analyze.',
    reversed: false
  },
  {
    id: 'ae2',
    dimension: 'AE',
    text: 'I like to run small experiments to learn what works.',
    reversed: false
  },
  {
    id: 'ae3',
    dimension: 'AE',
    text: "I'm comfortable making changes on the fly.",
    reversed: false
  },
  {
    id: 'ae4',
    dimension: 'AE',
    text: 'I often propose pilots to move from talk to action.',
    reversed: false
  },
  {
    id: 'ae5',
    dimension: 'AE',
    text: "I iterate publicly, even if it's not perfect.",
    reversed: false
  },
  {
    id: 'ae6',
    dimension: 'AE',
    text: 'I learn best when I can apply something immediately.',
    reversed: false
  }
];

// Kolb scores interface
export interface KolbScores {
  CE: number;  // Concrete Experience (6-30)
  RO: number;  // Reflective Observation (6-30)
  AC: number;  // Abstract Conceptualization (6-30)
  AE: number;  // Active Experimentation (6-30)
  X: number;   // AC - CE (thinking vs. feeling axis)
  Y: number;   // AE - RO (doing vs. watching axis)
  learningStyle: 'Diverging' | 'Assimilating' | 'Converging' | 'Accommodating';
}

// Calculate Kolb scores from responses
export function calculateKolbScores(responses: Record<string, number>): KolbScores {
  let CE = 0, RO = 0, AC = 0, AE = 0;

  kolbQuestions.forEach(question => {
    const rawScore = responses[question.id] || 3; // Default to neutral if missing
    const score = question.reversed ? (6 - rawScore) : rawScore;

    switch (question.dimension) {
      case 'CE': CE += score; break;
      case 'RO': RO += score; break;
      case 'AC': AC += score; break;
      case 'AE': AE += score; break;
    }
  });

  // Calculate axes
  const X = AC - CE;  // Positive = thinking preference, Negative = feeling preference
  const Y = AE - RO;  // Positive = doing preference, Negative = watching preference

  // Determine learning style quadrant
  let learningStyle: KolbScores['learningStyle'];
  if (X >= 0 && Y >= 0) {
    learningStyle = 'Converging';     // Thinking + Doing
  } else if (X < 0 && Y >= 0) {
    learningStyle = 'Accommodating';  // Feeling + Doing
  } else if (X >= 0 && Y < 0) {
    learningStyle = 'Assimilating';   // Thinking + Watching
  } else {
    learningStyle = 'Diverging';      // Feeling + Watching
  }

  return { CE, RO, AC, AE, X, Y, learningStyle };
}

// Get learning style description for students
export function getLearningStyleDescription(learningStyle: KolbScores['learningStyle']): {
  title: string;
  description: string;
  strengths: string[];
  studyTips: string[];
  careerTypes: string[];
} {
  const descriptions = {
    Diverging: {
      title: 'Diverging (Feeling + Watching)',
      description: 'You learn best by watching and feeling. You have a strong imagination, excel at brainstorming, and like to view situations from multiple perspectives.',
      strengths: [
        'Creative thinking and imagination',
        'Understanding people and emotions',
        'Generating new ideas',
        'Seeing situations from many angles'
      ],
      studyTips: [
        'Join group discussions and study groups',
        'Use mind maps and visual brainstorming',
        'Connect learning to real-world examples',
        'Ask "what if?" questions'
      ],
      careerTypes: [
        'Arts and Creative Fields',
        'Counseling and Social Work',
        'Humanities and Culture',
        'Design and Media'
      ]
    },
    Assimilating: {
      title: 'Assimilating (Thinking + Watching)',
      description: 'You learn best through logical thinking and careful observation. You excel at organizing information, creating theories, and understanding abstract concepts.',
      strengths: [
        'Logical and analytical thinking',
        'Creating models and frameworks',
        'Understanding complex theories',
        'Independent research'
      ],
      studyTips: [
        'Read textbooks and scholarly articles',
        'Create detailed outlines and summaries',
        'Study in quiet, focused environments',
        'Build conceptual frameworks'
      ],
      careerTypes: [
        'Research and Science',
        'Academic and Teaching',
        'Data Analysis',
        'Information Technology'
      ]
    },
    Converging: {
      title: 'Converging (Thinking + Doing)',
      description: 'You learn best by thinking through problems and testing solutions. You excel at practical problem-solving, finding technical answers, and applying ideas.',
      strengths: [
        'Practical problem-solving',
        'Technical skills',
        'Experimenting with solutions',
        'Making decisions quickly'
      ],
      studyTips: [
        'Work on practice problems and labs',
        'Use simulations and hands-on projects',
        'Focus on real-world applications',
        'Test theories through experiments'
      ],
      careerTypes: [
        'Engineering and Technology',
        'Computer Science',
        'Applied Sciences',
        'Technical Specialist Roles'
      ]
    },
    Accommodating: {
      title: 'Accommodating (Feeling + Doing)',
      description: 'You learn best by doing and feeling. You are action-oriented, rely on intuition, adapt quickly to new situations, and learn through hands-on experience.',
      strengths: [
        'Taking initiative and action',
        'Adapting to change',
        'Working with people',
        'Hands-on learning'
      ],
      studyTips: [
        'Engage in group projects and team work',
        'Learn through trial and error',
        'Get involved in practical activities',
        'Use real experiences as learning tools'
      ],
      careerTypes: [
        'Sales and Marketing',
        'Management and Leadership',
        'Operations and Field Work',
        'Entrepreneurship'
      ]
    }
  };

  return descriptions[learningStyle];
}
