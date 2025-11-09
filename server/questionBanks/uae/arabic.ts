import type { SubjectQuestionBank } from "../../../shared/questionTypes";

export const arabic: SubjectQuestionBank = {
  subject: "Arabic",
  grades: {
    "8-9": [
      {
        question: "What is the correct plural form of (كتاب) 'book' in Arabic?",
        questionType: "multiple_choice",
        options: ["كتب", "كتابان", "كتابات", "كتبة"],
        correctAnswer: "كتب",
        explanation: "The broken plural of كتاب (kitāb) is كتب (kutub)",
        subject: "Arabic",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Grammar - Plurals",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Which word means 'school' in Arabic?",
        questionType: "multiple_choice",
        options: ["مدرسة", "بيت", "مكتب", "مستشفى"],
        correctAnswer: "مدرسة",
        explanation: "مدرسة (madrasa) means school in Arabic",
        subject: "Arabic",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Vocabulary - Common Words",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What is the dual form of (طالب) 'student'?",
        questionType: "multiple_choice",
        options: ["طالبان", "طلاب", "طالبين", "طالبات"],
        correctAnswer: "طالبان",
        explanation: "The dual nominative form of طالب is طالبان",
        subject: "Arabic",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Grammar - Dual Forms",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "Which sentence is grammatically correct?",
        questionType: "multiple_choice",
        options: ["الطالب يدرس في المدرسة", "يدرس الطالب المدرسة في", "في المدرسة الطالب يدرس", "المدرسة في يدرس الطالب"],
        correctAnswer: "الطالب يدرس في المدرسة",
        explanation: "The correct word order in Arabic is Subject-Verb-Object: The student studies at school",
        subject: "Arabic",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Grammar - Sentence Structure",
        difficulty: "medium",
        cognitiveLevel: "application"
      },
      {
        question: "What type of noun is (محمد) 'Muhammad' in Arabic grammar?",
        questionType: "multiple_choice",
        options: ["اسم علم (proper noun)", "اسم نكرة (common noun)", "اسم فعل (verbal noun)", "اسم إشارة (demonstrative)"],
        correctAnswer: "اسم علم (proper noun)",
        explanation: "محمد is a proper noun (اسم علم) referring to a specific person",
        subject: "Arabic",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Grammar - Types of Nouns",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      }
    ],
    "10-12": [
      {
        question: "What is the مصدر (masdar/verbal noun) of the verb (كتب) 'to write'?",
        questionType: "multiple_choice",
        options: ["كتابة", "مكتوب", "كاتب", "كتب"],
        correctAnswer: "كتابة",
        explanation: "The مصدر (infinitive/verbal noun) of كتب is كتابة (writing)",
        subject: "Arabic",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Grammar - Verbal Nouns",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "Which is the correct passive voice form of (قرأ الطالب الكتاب) 'The student read the book'?",
        questionType: "multiple_choice",
        options: ["قُرِئَ الكتاب", "قرأ الكتاب", "يقرأ الكتاب", "قارئ الكتاب"],
        correctAnswer: "قُرِئَ الكتاب",
        explanation: "The passive form changes the verb pattern and the object becomes the subject",
        subject: "Arabic",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Grammar - Passive Voice",
        difficulty: "hard",
        cognitiveLevel: "application"
      },
      {
        question: "In Arabic poetry, what is (البحر) al-bahr?",
        questionType: "multiple_choice",
        options: ["The meter/rhythm pattern", "The sea/ocean", "The rhyme scheme", "The theme"],
        correctAnswer: "The meter/rhythm pattern",
        explanation: "In Arabic prosody, البحر refers to the metrical pattern of a poem",
        subject: "Arabic",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Literature - Arabic Poetry",
        difficulty: "medium",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What does (التشبيه) at-tashbīh mean in Arabic rhetoric?",
        questionType: "multiple_choice",
        options: ["Simile/comparison", "Metaphor", "Exaggeration", "Personification"],
        correctAnswer: "Simile/comparison",
        explanation: "التشبيه is a rhetorical device using explicit comparison (like 'as' or 'like')",
        subject: "Arabic",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Literature - Rhetoric",
        difficulty: "medium",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Which case ending is used for the subject (فاعل) in Arabic?",
        questionType: "multiple_choice",
        options: ["الرفع (nominative/raf')", "النصب (accusative/nasb)", "الجر (genitive/jarr)", "الجزم (jussive/jazm)"],
        correctAnswer: "الرفع (nominative/raf')",
        explanation: "The فاعل (subject/doer) always takes الرفع (nominative case)",
        subject: "Arabic",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Grammar - Case Endings",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      }
    ]
  }
};
