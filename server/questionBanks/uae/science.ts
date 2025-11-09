import type { SubjectQuestionBank } from "../../../shared/questionTypes";

export const science: SubjectQuestionBank = {
  subject: "Science",
  grades: {
    "8-9": [
      {
        question: "What is the process by which plants make their own food using sunlight?",
        questionType: "multiple_choice",
        options: ["Photosynthesis", "Respiration", "Digestion", "Fermentation"],
        correctAnswer: "Photosynthesis",
        explanation: "Photosynthesis is the process where plants convert sunlight, water, and carbon dioxide into glucose and oxygen",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Biology - Photosynthesis",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Which state of matter has a definite volume but no definite shape?",
        questionType: "multiple_choice",
        options: ["Liquid", "Solid", "Gas", "Plasma"],
        correctAnswer: "Liquid",
        explanation: "Liquids have a definite volume but take the shape of their container",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Chemistry - States of Matter",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      },
      {
        question: "What type of energy is stored in food?",
        questionType: "multiple_choice",
        options: ["Chemical energy", "Kinetic energy", "Light energy", "Sound energy"],
        correctAnswer: "Chemical energy",
        explanation: "Food stores chemical energy in the bonds between atoms that is released during digestion",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Physics - Energy Forms",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What is the chemical formula for water?",
        questionType: "multiple_choice",
        options: ["H₂O", "CO₂", "O₂", "H₂O₂"],
        correctAnswer: "H₂O",
        explanation: "Water consists of two hydrogen atoms and one oxygen atom: H₂O",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Chemistry - Chemical Formulas",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Which organ in the human body pumps blood?",
        questionType: "multiple_choice",
        options: ["Heart", "Lungs", "Liver", "Kidneys"],
        correctAnswer: "Heart",
        explanation: "The heart is the organ responsible for pumping blood throughout the body",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Biology - Human Body Systems",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What happens to the volume of a gas when temperature increases (at constant pressure)?",
        questionType: "multiple_choice",
        options: ["Volume increases", "Volume decreases", "Volume stays the same", "Gas becomes liquid"],
        correctAnswer: "Volume increases",
        explanation: "According to Charles's Law, at constant pressure, the volume of a gas increases as temperature increases",
        subject: "Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Physics - Gas Laws",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      }
    ],
    "10-12": [
      {
        question: "What is the acceleration of an object with mass 5 kg when a force of 20 N is applied? (Use F = ma)",
        questionType: "multiple_choice",
        options: ["4 m/s²", "100 m/s²", "25 m/s²", "0.25 m/s²"],
        correctAnswer: "4 m/s²",
        explanation: "Using Newton's second law F = ma: a = F/m = 20/5 = 4 m/s²",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Physics - Newton's Laws of Motion",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "In a redox reaction, what happens to the oxidizing agent?",
        questionType: "multiple_choice",
        options: ["It is reduced", "It is oxidized", "It remains unchanged", "It decomposes"],
        correctAnswer: "It is reduced",
        explanation: "The oxidizing agent accepts electrons and is itself reduced in the process",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Chemistry - Redox Reactions",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "Which organelle is known as the 'powerhouse of the cell'?",
        questionType: "multiple_choice",
        options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi apparatus"],
        correctAnswer: "Mitochondria",
        explanation: "Mitochondria produce ATP through cellular respiration, providing energy for the cell",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Biology - Cell Biology",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What is the SI unit for electric current?",
        questionType: "multiple_choice",
        options: ["Ampere (A)", "Volt (V)", "Ohm (Ω)", "Watt (W)"],
        correctAnswer: "Ampere (A)",
        explanation: "The ampere (A) is the SI base unit for measuring electric current",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Physics - Electricity",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "According to Mendel's law of segregation, what happens to alleles during gamete formation?",
        questionType: "multiple_choice",
        options: ["They separate so each gamete receives one allele", "They combine together", "They mutate", "They duplicate"],
        correctAnswer: "They separate so each gamete receives one allele",
        explanation: "Mendel's law of segregation states that allele pairs separate during gamete formation, with each gamete receiving one allele",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Biology - Genetics",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "What is the voltage across a resistor with resistance 10 Ω carrying a current of 2 A? (Use Ohm's Law: V = IR)",
        questionType: "multiple_choice",
        options: ["20 V", "5 V", "12 V", "0.2 V"],
        correctAnswer: "20 V",
        explanation: "Using Ohm's Law: V = IR = 2 × 10 = 20 V",
        subject: "Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Physics - Ohm's Law",
        difficulty: "easy",
        cognitiveLevel: "application"
      }
    ]
  }
};
