import { storage } from "./storage";

export async function seedDatabase() {
  console.log("🌱 Seeding database...");

  // Seed Countries
  const countries = [
    {
      id: "saudi-arabia",
      name: "Saudi Arabia",
      code: "SAU",
      flag: "🇸🇦",
      mission: "To reduce oil dependence and diversify the economy through three core pillars: a vibrant society, a thriving economy, and an ambitious nation.",
      vision: "Transform Saudi Arabia into a global investment powerhouse and a hub connecting three continents by 2030.",
      visionPlan: "Vision 2030",
      prioritySectors: ["Renewable Energy", "Tourism & Entertainment", "Mining", "Technology & Innovation", "Healthcare", "Manufacturing", "Financial Services"],
      nationalGoals: [
        "Increase private sector contribution from 40% to 65% of GDP",
        "Increase non-oil revenue sources",
        "Raise SME contribution from 20% to 35% of GDP",
        "Expand Umrah capacity from 8M to 30M visitors annually"
      ],
      targets: {
        climate: [
          { metric: "Renewable Energy", value: "50%", year: 2030, focusArea: "Energy" }
        ],
        economic: [
          { metric: "Private Sector GDP", value: "65%", year: 2030, focusArea: "Economy" },
          { metric: "SME GDP Contribution", value: "35%", year: 2030, focusArea: "Business" }
        ],
        social: [
          { metric: "Women Workforce Participation", value: "Significant increase", year: 2030, focusArea: "Equality" },
          { metric: "Umrah Visitors", value: "30 million", year: 2030, focusArea: "Tourism" }
        ]
      }
    },
    {
      id: "uae",
      name: "United Arab Emirates",
      code: "UAE",
      flag: "🇦🇪",
      mission: "To establish the UAE as having the best government, education, and economy in the world through four key pillars: future-focused government, excellent education, diversified knowledge economy, and happy cohesive society.",
      vision: "To be the best country in the world by the UAE's 100th anniversary in 2071, leading in AI, space exploration, and sustainable development.",
      visionPlan: "UAE Centennial 2071",
      prioritySectors: ["Artificial Intelligence", "Space Exploration", "Biotechnology", "Renewable Energy", "Education", "Technology"],
      nationalGoals: [
        "100% AI reliance for government services by 2031",
        "50% clean energy by 2050",
        "Double GDP from AED 1.49 trillion to AED 3 trillion",
        "Mars colonization by 2117"
      ],
      targets: {
        climate: [
          { metric: "Clean Energy", value: "50%", year: 2050, focusArea: "Energy" },
          { metric: "Emissions Reduction", value: "47%", year: 2035, focusArea: "Climate" }
        ],
        tech: [
          { metric: "AI in Government", value: "100%", year: 2031, focusArea: "Digital Gov" },
          { metric: "AI GDP Contribution", value: "$96B (14%)", year: 2030, focusArea: "Economy" }
        ],
        economic: [
          { metric: "GDP", value: "AED 3 trillion", year: 2031, focusArea: "Economy" }
        ]
      }
    },
    {
      id: "singapore",
      name: "Singapore",
      code: "SGP",
      flag: "🇸🇬",
      mission: "To create a thriving digital future for all through tech-enabled solutions, supporting better living, stronger communities, and creating opportunities.",
      vision: "Become the world's first Smart Nation by 2030, leveraging AI, IoT, and data analytics for sustainable and inclusive growth.",
      visionPlan: "Smart Nation 2.0",
      prioritySectors: ["Artificial Intelligence", "Cybersecurity", "Healthcare Technology", "FinTech", "Smart Cities", "Education Technology"],
      nationalGoals: [
        "Expand AI workforce from 4,500 to 15,000 practitioners by 2029",
        "AI market to reach $4.5B by 2030",
        "80% of buildings achieve green certification by 2030",
        "70% recycling rate by 2030"
      ],
      targets: {
        tech: [
          { metric: "AI Practitioners", value: "15,000", year: 2029, focusArea: "Workforce" },
          { metric: "AI Market Size", value: "$4.5 billion", year: 2030, focusArea: "Economy" }
        ],
        climate: [
          { metric: "Green Buildings", value: "80%", year: 2030, focusArea: "Sustainability" },
          { metric: "Recycling Rate", value: "70%", year: 2030, focusArea: "Environment" }
        ],
        social: [
          { metric: "Seniors Digitally Trained", value: "210,000+", year: 2025, focusArea: "Inclusion" }
        ]
      }
    },
    {
      id: "canada",
      name: "Canada",
      code: "CAN",
      flag: "🇨🇦",
      mission: "To achieve the UN's 17 Sustainable Development Goals by 2030 while ensuring no one is left behind, with focus on reconciliation, climate action, and economic prosperity.",
      vision: "Build a sustainable, inclusive, and prosperous nation achieving net-zero emissions by 2050 and leading global climate action.",
      visionPlan: "2030 Agenda for Sustainable Development",
      prioritySectors: ["Clean Technology", "Natural Resources", "Digital Economy", "Healthcare", "Education", "Infrastructure"],
      nationalGoals: [
        "Reduce GHG emissions by 40-45% below 2005 levels by 2030",
        "Achieve net-zero carbon operations by 2050",
        "Support Indigenous self-determination",
        "Reduce poverty in all its forms"
      ],
      targets: {
        climate: [
          { metric: "GHG Emissions Reduction", value: "40-45%", year: 2030, focusArea: "Climate" },
          { metric: "Net-Zero Emissions", value: "100%", year: 2050, focusArea: "Climate" }
        ],
        social: [
          { metric: "Poverty Reduction", value: "Continued decrease", year: 2030, focusArea: "Social Equity" }
        ],
        economic: [
          { metric: "Circular Economy", value: "Transition", year: 2050, focusArea: "Sustainability" }
        ]
      }
    },
    {
      id: "australia",
      name: "Australia",
      code: "AUS",
      flag: "🇦🇺",
      mission: "To achieve the UN Sustainable Development Goals by 2030 while addressing climate change, fostering innovation, and ensuring inclusive economic growth.",
      vision: "Build a prosperous, sustainable, and inclusive nation achieving net-zero emissions by 2050 and halting biodiversity loss by 2030.",
      visionPlan: "Australia's 2030 Agenda",
      prioritySectors: ["Advanced Manufacturing", "Renewable Energy", "Digital Technology", "Health Sciences", "Mining Technology", "Education"],
      nationalGoals: [
        "43% emissions reduction below 2005 levels by 2030",
        "Net-zero emissions by 2050",
        "Halt and reverse biodiversity loss by 2030",
        "First trillion-dollar state economy (NSW) by 2030"
      ],
      targets: {
        climate: [
          { metric: "Emissions Reduction", value: "43%", year: 2030, focusArea: "Climate" },
          { metric: "Net-Zero Emissions", value: "100%", year: 2050, focusArea: "Climate" }
        ],
        environment: [
          { metric: "Biodiversity", value: "Halt decline", year: 2030, focusArea: "Nature" }
        ],
        economic: [
          { metric: "NSW Economy", value: "$1 trillion", year: 2030, focusArea: "Growth" }
        ]
      }
    },
    {
      id: "germany",
      name: "Germany",
      code: "DEU",
      flag: "🇩🇪",
      mission: "To achieve climate neutrality through the Energiewende energy transition, industrial transformation, and alignment with UN Sustainable Development Goals.",
      vision: "Become climate-neutral by 2045 through renewable energy, green hydrogen, and sustainable industrial transformation.",
      visionPlan: "Climate Action Plan 2050",
      prioritySectors: ["Renewable Energy", "Green Hydrogen", "Advanced Manufacturing", "Automotive", "Biotechnology", "Clean Technology"],
      nationalGoals: [
        "65% GHG reduction vs 1990 levels by 2030",
        "Climate neutrality by 2045",
        "100% renewable electricity by 2050",
        "Coal phase-out by 2038"
      ],
      targets: {
        climate: [
          { metric: "GHG Reduction", value: "65%", year: 2030, focusArea: "Emissions" },
          { metric: "Climate Neutrality", value: "100%", year: 2045, focusArea: "Net-Zero" },
          { metric: "Renewable Electricity", value: "100%", year: 2050, focusArea: "Energy" }
        ],
        energy: [
          { metric: "Coal Phase-out", value: "Complete", year: 2038, focusArea: "Fossil Fuels" },
          { metric: "Green Hydrogen Capacity", value: "5 GW", year: 2030, focusArea: "Hydrogen" }
        ]
      }
    },
    {
      id: "japan",
      name: "Japan",
      code: "JPN",
      flag: "🇯🇵",
      mission: "To create a super-smart society that achieves economic growth and solves social problems through AI, IoT, robotics, and big data, aligned with UN SDGs.",
      vision: "Build Society 5.0 - a human-centered society balancing economic advancement with solutions to social challenges by 2030.",
      visionPlan: "Society 5.0",
      prioritySectors: ["Artificial Intelligence", "Robotics", "Healthcare Technology", "Smart Cities", "Quantum Computing", "Automation"],
      nationalGoals: [
        "Achieve all 17 UN SDGs by 2030",
        "Address aging population through technology",
        "Lead in ethical AI and data governance",
        "Foster innovation ecosystems"
      ],
      targets: {
        tech: [
          { metric: "AI Market Growth", value: "$4.5B+", year: 2030, focusArea: "Technology" },
          { metric: "Science & Tech Budget", value: "¥4.2 trillion", year: 2030, focusArea: "R&D" }
        ],
        social: [
          { metric: "SDG Achievement", value: "All 17 Goals", year: 2030, focusArea: "Development" },
          { metric: "Aging Care Solutions", value: "AI-driven", year: 2030, focusArea: "Healthcare" }
        ]
      }
    },
    {
      id: "south-korea",
      name: "South Korea",
      code: "KOR",
      flag: "🇰🇷",
      mission: "To transform Korea through the Korean New Deal, integrating digital innovation and green growth to create 1.9 million jobs and achieve carbon neutrality.",
      vision: "Set the foundation for Korea's next 100 years through digital transformation, green energy transition, and strengthened social safety nets.",
      visionPlan: "Korean New Deal 2025",
      prioritySectors: ["Digital Technology", "AI & Big Data", "Renewable Energy", "Green Manufacturing", "Electric Vehicles", "Smart Cities"],
      nationalGoals: [
        "Create 1.9 million jobs by 2025",
        "40% GHG reduction below 2018 levels by 2030",
        "Carbon neutrality by 2050",
        "20% renewables in generation capacity by 2030"
      ],
      targets: {
        economic: [
          { metric: "Job Creation", value: "1.9 million", year: 2025, focusArea: "Employment" },
          { metric: "Investment", value: "160 trillion won", year: 2025, focusArea: "Economy" }
        ],
        climate: [
          { metric: "GHG Reduction", value: "40%", year: 2030, focusArea: "Emissions" },
          { metric: "Carbon Neutrality", value: "100%", year: 2050, focusArea: "Net-Zero" },
          { metric: "Renewables", value: "20%", year: 2030, focusArea: "Energy" }
        ],
        tech: [
          { metric: "Smart Factories", value: "30,000", year: 2022, focusArea: "Manufacturing" },
          { metric: "Hydrogen Vehicles", value: "200,000", year: 2025, focusArea: "Transport" }
        ]
      }
    },
    {
      id: "usa",
      name: "United States",
      code: "USA",
      flag: "🇺🇸",
      mission: "To preserve freedom, promote prosperity, and provide security for all Americans through democratic governance and economic opportunity.",
      vision: "Maintain global leadership in innovation, technology, and economic development while ensuring equal opportunities for all citizens.",
      visionPlan: "National Development Strategy",
      prioritySectors: ["Technology & Innovation", "Healthcare", "Clean Energy", "Manufacturing", "Aerospace", "Financial Services"],
      nationalGoals: ["Lead in technological innovation", "Transition to clean energy", "Strengthen domestic manufacturing", "Improve healthcare access"],
      targets: {
        tech: [
          { metric: "Innovation Leadership", value: "Global #1", year: 2030, focusArea: "Technology" }
        ],
        climate: [
          { metric: "Clean Energy Transition", value: "Ongoing", year: 2050, focusArea: "Energy" }
        ]
      }
    },
    {
      id: "uk",
      name: "United Kingdom",
      code: "GBR",
      flag: "🇬🇧",
      mission: "To build a fair, prosperous, and secure nation that works for everyone, promoting innovation, education, and sustainable growth.",
      vision: "Be a global leader in science, technology, and creative industries while maintaining strong international partnerships.",
      visionPlan: "UK National Strategy",
      prioritySectors: ["Financial Services", "Technology", "Life Sciences", "Creative Industries", "Advanced Manufacturing", "Green Energy"],
      nationalGoals: ["Achieve net zero emissions by 2050", "Strengthen digital infrastructure", "Advance life sciences research", "Promote creative exports"],
      targets: {
        climate: [
          { metric: "Net-Zero Emissions", value: "100%", year: 2050, focusArea: "Climate" }
        ],
        tech: [
          { metric: "Digital Infrastructure", value: "World-class", year: 2030, focusArea: "Technology" }
        ]
      }
    },
    {
      id: "india",
      name: "India",
      code: "IND",
      flag: "🇮🇳",
      mission: "To transform India into a developed nation by 2047 through inclusive growth, innovation, and sustainable development.",
      vision: "Create a self-reliant, technologically advanced nation providing quality education, healthcare, and economic opportunities for all.",
      visionPlan: "Vision 2047",
      prioritySectors: ["Information Technology", "Manufacturing", "Agriculture Technology", "Healthcare", "Education", "Renewable Energy"],
      nationalGoals: ["Become a $5 trillion economy", "Digital India transformation", "Make in India initiative", "Skill development for youth"],
      targets: {
        economic: [
          { metric: "Economy Size", value: "$5 trillion", year: 2030, focusArea: "GDP" }
        ],
        tech: [
          { metric: "Digital Transformation", value: "National scale", year: 2030, focusArea: "Technology" }
        ]
      }
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
