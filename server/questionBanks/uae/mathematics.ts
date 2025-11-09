import type { SubjectQuestionBank } from "../../../shared/questionTypes";

export const mathematics: SubjectQuestionBank = {
  subject: "Mathematics",
  grades: {
    "8-9": [
      {
        question: "Solve for x: 3x + 7 = 22",
        questionType: "multiple_choice",
        options: ["x = 3", "x = 5", "x = 7", "x = 9"],
        correctAnswer: "x = 5",
        explanation: "Subtract 7 from both sides: 3x = 15. Divide by 3: x = 5",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Algebra - Linear Equations",
        difficulty: "easy",
        cognitiveLevel: "application"
      },
      {
        question: "What is the area of a circle with radius 7 cm? (Use π ≈ 3.14)",
        questionType: "multiple_choice",
        options: ["153.86 cm²", "43.96 cm²", "21.98 cm²", "615.44 cm²"],
        correctAnswer: "153.86 cm²",
        explanation: "Area = πr² = 3.14 × 7² = 3.14 × 49 = 153.86 cm²",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Geometry - Circles",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "A shop offers a 25% discount on an item priced at AED 200. What is the final price?",
        questionType: "multiple_choice",
        options: ["AED 150", "AED 175", "AED 160", "AED 180"],
        correctAnswer: "AED 150",
        explanation: "Discount = 25% of 200 = 50. Final price = 200 - 50 = AED 150",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Financial Literacy - Percentages",
        difficulty: "easy",
        cognitiveLevel: "application"
      },
      {
        question: "In a survey of 50 students, 30 like football and 25 like basketball. If 10 like both, how many like only football?",
        questionType: "multiple_choice",
        options: ["20 students", "15 students", "25 students", "30 students"],
        correctAnswer: "20 students",
        explanation: "Only football = Total football - Both = 30 - 10 = 20 students",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Data - Set Theory",
        difficulty: "medium",
        cognitiveLevel: "analysis"
      },
      {
        question: "What is the probability of rolling a number greater than 4 on a standard six-sided die?",
        questionType: "multiple_choice",
        options: ["1/3", "1/2", "2/3", "1/6"],
        correctAnswer: "1/3",
        explanation: "Favorable outcomes: 5 and 6 (2 outcomes). Total outcomes: 6. Probability = 2/6 = 1/3",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Probability - Basic Probability",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      },
      {
        question: "Simplify: 2x² + 3x - 5 + 4x² - x + 2",
        questionType: "multiple_choice",
        options: ["6x² + 2x - 3", "6x² + 4x - 7", "2x² + 2x - 3", "6x² + 2x + 3"],
        correctAnswer: "6x² + 2x - 3",
        explanation: "Combine like terms: (2x² + 4x²) + (3x - x) + (-5 + 2) = 6x² + 2x - 3",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Algebra - Polynomials",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "The ratio of boys to girls in a class is 3:2. If there are 15 boys, how many girls are there?",
        questionType: "multiple_choice",
        options: ["10 girls", "12 girls", "8 girls", "6 girls"],
        correctAnswer: "10 girls",
        explanation: "3:2 means for every 3 boys there are 2 girls. 15÷3=5, so multiply 2×5=10 girls",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Numbers - Ratios and Proportions",
        difficulty: "easy",
        cognitiveLevel: "application"
      },
      {
        question: "What is the median of the data set: 5, 12, 8, 15, 3, 9?",
        questionType: "multiple_choice",
        options: ["8.5", "9", "8", "12"],
        correctAnswer: "8.5",
        explanation: "Arrange in order: 3, 5, 8, 9, 12, 15. Median is average of middle two: (8+9)/2 = 8.5",
        subject: "Mathematics",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Data - Measures of Central Tendency",
        difficulty: "medium",
        cognitiveLevel: "analysis"
      }
    ],
    "10-12": [
      {
        question: "Solve the system of equations: 2x + y = 7 and x - y = 2",
        questionType: "multiple_choice",
        options: ["x = 3, y = 1", "x = 2, y = 3", "x = 4, y = -1", "x = 1, y = 5"],
        correctAnswer: "x = 3, y = 1",
        explanation: "Add equations: 3x = 9, so x = 3. Substitute: 3 - y = 2, so y = 1",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Algebra - Systems of Equations",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "What is the value of sin(30°)?",
        questionType: "multiple_choice",
        options: ["1/2", "√3/2", "1", "√2/2"],
        correctAnswer: "1/2",
        explanation: "sin(30°) = 1/2 is a standard trigonometric value for special angles",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Trigonometry - Special Angles",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Find the 10th term of the arithmetic sequence: 3, 7, 11, 15, ...",
        questionType: "multiple_choice",
        options: ["39", "43", "47", "35"],
        correctAnswer: "39",
        explanation: "First term a = 3, common difference d = 4. Formula: an = a + (n-1)d = 3 + 9(4) = 39",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Sequences and Series - Arithmetic Sequences",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "If f(x) = 2x² - 3x + 1, what is f(3)?",
        questionType: "multiple_choice",
        options: ["10", "12", "8", "15"],
        correctAnswer: "10",
        explanation: "f(3) = 2(3)² - 3(3) + 1 = 2(9) - 9 + 1 = 18 - 9 + 1 = 10",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Functions - Polynomial Functions",
        difficulty: "easy",
        cognitiveLevel: "application"
      },
      {
        question: "What is the equation of a line with slope 2 passing through point (1, 3)?",
        questionType: "multiple_choice",
        options: ["y = 2x + 1", "y = 2x + 3", "y = 2x - 1", "y = 2x + 5"],
        correctAnswer: "y = 2x + 1",
        explanation: "Using point-slope form: y - 3 = 2(x - 1), simplify: y = 2x + 1",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Coordinate Geometry - Linear Functions",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "A box contains 5 red balls and 3 blue balls. If two balls are drawn without replacement, what is the probability both are red?",
        questionType: "multiple_choice",
        options: ["5/14", "10/28", "5/8", "25/64"],
        correctAnswer: "5/14",
        explanation: "P(both red) = (5/8) × (4/7) = 20/56 = 5/14",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Probability - Dependent Events",
        difficulty: "hard",
        cognitiveLevel: "analysis"
      },
      {
        question: "Factor completely: x² - 9",
        questionType: "multiple_choice",
        options: ["(x - 3)(x + 3)", "(x - 9)(x + 1)", "(x - 3)²", "Cannot be factored"],
        correctAnswer: "(x - 3)(x + 3)",
        explanation: "This is difference of squares: a² - b² = (a - b)(a + b), so x² - 9 = (x - 3)(x + 3)",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Algebra - Factoring Polynomials",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      },
      {
        question: "The mean of five numbers is 12. If four of the numbers are 8, 10, 14, and 15, what is the fifth number?",
        questionType: "multiple_choice",
        options: ["13", "11", "12", "14"],
        correctAnswer: "13",
        explanation: "Sum = 12 × 5 = 60. Known sum = 8 + 10 + 14 + 15 = 47. Fifth number = 60 - 47 = 13",
        subject: "Mathematics",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Statistics - Mean and Average",
        difficulty: "medium",
        cognitiveLevel: "analysis"
      }
    ]
  }
};
