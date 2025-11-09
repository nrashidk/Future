import { storage } from "./storage";

export async function seedDatabase() {
  console.log("🌱 Seeding database...");

  // Seed Countries
  const countries = [
    {
      id: "uae",
      name: "United Arab Emirates",
      code: "UAE",
      flag: "🇦🇪",
      mission: "To develop a competitive and resilient economy that creates opportunities for all citizens and residents, ensuring their wellbeing and happiness.",
      vision: "To be among the best countries in the world by 2071, fostering innovation, sustainability, and quality of life for future generations.",
      prioritySectors: ["Renewable Energy", "Technology & AI", "Space Exploration", "Tourism", "Healthcare", "Education"],
      nationalGoals: ["Become a global hub for innovation", "Achieve carbon neutrality by 2050", "Develop world-class infrastructure", "Foster entrepreneurship and digital economy"],
    },
    {
      id: "usa",
      name: "United States",
      code: "USA",
      flag: "🇺🇸",
      mission: "To preserve freedom, promote prosperity, and provide security for all Americans through democratic governance and economic opportunity.",
      vision: "To maintain global leadership in innovation, technology, and economic development while ensuring equal opportunities for all citizens.",
      prioritySectors: ["Technology & Innovation", "Healthcare", "Clean Energy", "Manufacturing", "Aerospace", "Financial Services"],
      nationalGoals: ["Lead in technological innovation", "Transition to clean energy", "Strengthen domestic manufacturing", "Improve healthcare access"],
    },
    {
      id: "uk",
      name: "United Kingdom",
      code: "GBR",
      flag: "🇬🇧",
      mission: "To build a fair, prosperous, and secure nation that works for everyone, promoting innovation, education, and sustainable growth.",
      vision: "To be a global leader in science, technology, and creative industries while maintaining strong international partnerships.",
      prioritySectors: ["Financial Services", "Technology", "Life Sciences", "Creative Industries", "Advanced Manufacturing", "Green Energy"],
      nationalGoals: ["Achieve net zero emissions by 2050", "Strengthen digital infrastructure", "Advance life sciences research", "Promote creative exports"],
    },
    {
      id: "india",
      name: "India",
      code: "IND",
      flag: "🇮🇳",
      mission: "To transform India into a developed nation by 2047 through inclusive growth, innovation, and sustainable development.",
      vision: "To create a self-reliant, technologically advanced nation that provides quality education, healthcare, and economic opportunities for all citizens.",
      prioritySectors: ["Information Technology", "Manufacturing", "Agriculture Technology", "Healthcare", "Education", "Renewable Energy"],
      nationalGoals: ["Become a $5 trillion economy", "Digital India transformation", "Make in India initiative", "Skill development for youth"],
    },
  ];

  for (const country of countries) {
    try {
      await storage.createCountry(country);
      console.log(`✓ Created country: ${country.name}`);
    } catch (error) {
      console.log(`Country ${country.name} already exists`);
    }
  }

  // Seed Careers
  const careers = [
    {
      title: "Software Engineer",
      description: "Design, develop, and maintain software applications and systems",
      requiredSkills: ["Programming", "Problem Solving", "Data Structures", "Algorithms"],
      relatedSubjects: ["Computer Science", "Mathematics", "Physics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science or related field",
      averageSalary: "$80,000 - $150,000",
      growthOutlook: "Excellent (25% growth)",
      icon: "💻",
    },
    {
      title: "Data Scientist",
      description: "Analyze complex data to help organizations make better decisions",
      requiredSkills: ["Statistics", "Machine Learning", "Python/R", "Data Visualization"],
      relatedSubjects: ["Mathematics", "Computer Science", "Statistics"],
      category: "Technology",
      educationLevel: "Bachelor's or Master's degree in Data Science, Statistics, or Computer Science",
      averageSalary: "$90,000 - $160,000",
      growthOutlook: "Excellent (36% growth)",
      icon: "📊",
    },
    {
      title: "Renewable Energy Engineer",
      description: "Design and implement sustainable energy solutions",
      requiredSkills: ["Engineering Design", "Sustainability", "Project Management", "Technical Analysis"],
      relatedSubjects: ["Physics", "Mathematics", "Chemistry", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Engineering (Electrical, Mechanical, or Environmental)",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Very Good (20% growth)",
      icon: "⚡",
    },
    {
      title: "Healthcare Professional (Nurse)",
      description: "Provide patient care and support in hospitals, clinics, and healthcare facilities",
      requiredSkills: ["Patient Care", "Medical Knowledge", "Communication", "Empathy"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Bachelor's of Science in Nursing (BSN)",
      averageSalary: "$60,000 - $95,000",
      growthOutlook: "Excellent (6% growth)",
      icon: "🏥",
    },
    {
      title: "Digital Marketing Specialist",
      description: "Create and manage online marketing campaigns to promote brands and products",
      requiredSkills: ["Social Media", "Content Creation", "Analytics", "SEO/SEM"],
      relatedSubjects: ["Business", "English", "Computer Science", "Art"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Marketing, Communications, or Business",
      averageSalary: "$50,000 - $85,000",
      growthOutlook: "Very Good (10% growth)",
      icon: "📱",
    },
    {
      title: "Graphic Designer",
      description: "Create visual concepts to communicate ideas that inspire and inform consumers",
      requiredSkills: ["Creative Design", "Adobe Creative Suite", "Typography", "Visual Communication"],
      relatedSubjects: ["Art", "Computer Science", "Design"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Graphic Design or Fine Arts",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (3% growth)",
      icon: "🎨",
    },
    {
      title: "Mechanical Engineer",
      description: "Design, develop, and test mechanical devices and systems",
      requiredSkills: ["CAD Software", "Physics", "Materials Science", "Problem Solving"],
      relatedSubjects: ["Physics", "Mathematics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Mechanical Engineering",
      averageSalary: "$70,000 - $110,000",
      growthOutlook: "Good (2% growth)",
      icon: "⚙️",
    },
    {
      title: "Financial Analyst",
      description: "Analyze financial data to guide business and investment decisions",
      requiredSkills: ["Financial Modeling", "Excel", "Data Analysis", "Risk Assessment"],
      relatedSubjects: ["Mathematics", "Economics", "Business"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Finance, Economics, or Accounting",
      averageSalary: "$65,000 - $105,000",
      growthOutlook: "Good (9% growth)",
      icon: "💰",
    },
    {
      title: "Teacher (Secondary Education)",
      description: "Educate and inspire students in middle and high school settings",
      requiredSkills: ["Subject Expertise", "Communication", "Patience", "Curriculum Development"],
      relatedSubjects: ["Education", "Subject Specialization"],
      category: "Education",
      educationLevel: "Bachelor's degree in Education or subject area + teaching certification",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (4% growth)",
      icon: "📚",
    },
    {
      title: "Environmental Scientist",
      description: "Study and develop solutions to environmental problems",
      requiredSkills: ["Research", "Data Analysis", "Environmental Policy", "Field Work"],
      relatedSubjects: ["Biology", "Chemistry", "Geography", "Environmental Science"],
      category: "Science",
      educationLevel: "Bachelor's degree in Environmental Science or related field",
      averageSalary: "$55,000 - $90,000",
      growthOutlook: "Very Good (8% growth)",
      icon: "🌍",
    },
  ];

  const existingCareers = await storage.getAllCareers();
  const existingCareerTitles = new Set(existingCareers.map(c => c.title));

  for (const career of careers) {
    if (!existingCareerTitles.has(career.title)) {
      try {
        const created = await storage.createCareer(career);
        console.log(`✓ Created career: ${career.title}`);
        
        // Create job market trends for each country
        for (const country of countries) {
          try {
            await storage.createJobMarketTrend({
              countryId: country.id,
              careerId: created.id,
              demandScore: 50 + Math.random() * 50, // 50-100
              growthRate: Math.random() * 30, // 0-30%
              nationalPriorityAlignment: career.relatedSubjects.some(s => 
                country.prioritySectors.some(sector => sector.toLowerCase().includes(s.toLowerCase()))
              ) ? 70 + Math.random() * 30 : 40 + Math.random() * 40, // Higher if aligned
              year: 2025,
              averageSalaryLocal: career.averageSalary,
              openings: Math.floor(Math.random() * 1000) + 100,
            });
          } catch (error) {
            // Trend might exist
          }
        }
      } catch (error) {
        console.log(`Error creating career ${career.title}:`, error);
      }
    }
  }

  console.log("✅ Database seeded successfully!");
}
