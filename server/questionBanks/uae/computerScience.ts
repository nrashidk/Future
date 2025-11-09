import type { SubjectQuestionBank } from "../../../shared/questionTypes";

export const computerScience: SubjectQuestionBank = {
  subject: "Computer Science",
  grades: {
    "8-9": [
      {
        question: "What does CPU stand for in computer terminology?",
        questionType: "multiple_choice",
        options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Computer Processing Unit"],
        correctAnswer: "Central Processing Unit",
        explanation: "CPU stands for Central Processing Unit, the brain of the computer",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Computer Basics - Hardware",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "Which of these is an example of an input device?",
        questionType: "multiple_choice",
        options: ["Keyboard", "Monitor", "Printer", "Speaker"],
        correctAnswer: "Keyboard",
        explanation: "A keyboard is an input device used to enter data into a computer",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Computer Basics - Input/Output",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      },
      {
        question: "What is the primary purpose of an operating system?",
        questionType: "multiple_choice",
        options: ["To manage computer hardware and software resources", "To browse the internet", "To create documents", "To play games"],
        correctAnswer: "To manage computer hardware and software resources",
        explanation: "An operating system manages hardware and software, providing services for computer programs",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Software - Operating Systems",
        difficulty: "easy",
        cognitiveLevel: "comprehension"
      },
      {
        question: "In programming, what is a 'variable'?",
        questionType: "multiple_choice",
        options: ["A named storage location that holds data", "A type of loop", "A function", "An error"],
        correctAnswer: "A named storage location that holds data",
        explanation: "A variable is a container that stores data values that can change during program execution",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Programming - Basic Concepts",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What does HTML stand for?",
        questionType: "multiple_choice",
        options: ["HyperText Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"],
        correctAnswer: "HyperText Markup Language",
        explanation: "HTML stands for HyperText Markup Language, used to create web pages",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Web Development - HTML",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What is the correct order of problem-solving steps in computational thinking?",
        questionType: "multiple_choice",
        options: ["Understand, Plan, Execute, Review", "Execute, Plan, Review, Understand", "Plan, Execute, Understand, Review", "Review, Understand, Plan, Execute"],
        correctAnswer: "Understand, Plan, Execute, Review",
        explanation: "The problem-solving cycle involves understanding the problem, planning a solution, executing it, and reviewing the results",
        subject: "Computer Science",
        gradeBand: "8-9",
        countryId: "uae",
        topic: "Computational Thinking - Problem Solving",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      }
    ],
    "10-12": [
      {
        question: "What is the time complexity of binary search algorithm?",
        questionType: "multiple_choice",
        options: ["O(log n)", "O(n)", "O(n²)", "O(1)"],
        correctAnswer: "O(log n)",
        explanation: "Binary search has logarithmic time complexity O(log n) because it divides the search space in half each iteration",
        subject: "Computer Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Algorithms - Searching",
        difficulty: "medium",
        cognitiveLevel: "knowledge"
      },
      {
        question: "In object-oriented programming, what is encapsulation?",
        questionType: "multiple_choice",
        options: ["Bundling data and methods that operate on that data within a single unit", "Inheriting properties from parent class", "Using multiple forms of a method", "Creating objects from classes"],
        correctAnswer: "Bundling data and methods that operate on that data within a single unit",
        explanation: "Encapsulation is the concept of bundling data and methods together and restricting access to internal details",
        subject: "Computer Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Programming - OOP Concepts",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "What does AI stand for, and what is its primary goal in UAE Vision 2071?",
        questionType: "multiple_choice",
        options: ["Artificial Intelligence - to achieve 100% AI reliance in government by 2031", "Automated Integration - to automate all industries", "Advanced Innovation - to lead in innovation", "Artificial Integration - to integrate all systems"],
        correctAnswer: "Artificial Intelligence - to achieve 100% AI reliance in government by 2031",
        explanation: "UAE aims for 100% AI-powered government services by 2031 as part of Vision 2071",
        subject: "Computer Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "AI - UAE National Strategy",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      },
      {
        question: "What is the difference between a stack and a queue data structure?",
        questionType: "multiple_choice",
        options: ["Stack is LIFO, Queue is FIFO", "Stack is FIFO, Queue is LIFO", "Both are LIFO", "Both are FIFO"],
        correctAnswer: "Stack is LIFO, Queue is FIFO",
        explanation: "Stack follows Last-In-First-Out (LIFO) principle, while Queue follows First-In-First-Out (FIFO)",
        subject: "Computer Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Data Structures - Stack and Queue",
        difficulty: "medium",
        cognitiveLevel: "comprehension"
      },
      {
        question: "In databases, what does SQL stand for?",
        questionType: "multiple_choice",
        options: ["Structured Query Language", "Simple Question Language", "Standard Query Logic", "System Query Language"],
        correctAnswer: "Structured Query Language",
        explanation: "SQL stands for Structured Query Language, used to manage and query databases",
        subject: "Computer Science",
        gradeBand: "10-12",
        countryId: "uae",
        topic: "Databases - SQL",
        difficulty: "easy",
        cognitiveLevel: "knowledge"
      }
    ]
  }
};
