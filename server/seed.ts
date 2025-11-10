import { storage } from "./storage";
import { uaeQuestionBank } from "./questionBanks/uae";
import { validateQuestionBank, checkCoverage } from "../shared/questionTypes";
import { RIASEC_CAREER_AFFINITIES } from "./riasecAffinities";

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
      abbreviation: "UAE",
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
      id: "bahrain",
      name: "Bahrain",
      code: "BHR",
      flag: "🇧🇭",
      mission: "To shift from an oil-dependent economy to a productive, globally competitive, private-sector-led economy that improves living standards for all Bahrainis through sustainability, competitiveness, and fairness.",
      vision: "Transform Bahrain into a regional financial and commercial hub by 2030 with doubled household income and sustainable government finances.",
      visionPlan: "Economic Vision 2030",
      prioritySectors: ["Financial Services", "Tourism", "ICT & Digital Economy", "Manufacturing", "Logistics", "Healthcare", "Education"],
      nationalGoals: [
        "Double household income by 2030",
        "Strengthen non-oil GDP growth and diversification",
        "Create high-wage skilled jobs for Bahrainis",
        "Achieve fiscal balance and sustainable government finances"
      ],
      targets: {
        economic: [
          { metric: "Household Income", value: "100% increase", year: 2030, focusArea: "Living Standards" },
          { metric: "FDI", value: "BHD 1.1 billion", year: 2030, focusArea: "Investment" },
          { metric: "Non-oil Sectors Growth", value: "High value-added focus", year: 2030, focusArea: "Diversification" }
        ],
        social: [
          { metric: "Life Expectancy", value: "75 years", year: 2030, focusArea: "Healthcare" },
          { metric: "Skills Training", value: "95,000 Bahrainis", year: 2030, focusArea: "Workforce Development" },
          { metric: "Business Support", value: "35,000 businesses", year: 2030, focusArea: "Entrepreneurship" }
        ]
      }
    },
    {
      id: "kuwait",
      name: "Kuwait",
      code: "KWT",
      flag: "🇰🇼",
      mission: "To transform Kuwait into a regional financial, commercial, and cultural hub through seven strategic pillars focused on sustainable economic diversification and private sector growth.",
      vision: "Position Kuwait as a leading economic powerhouse and global petrochemical hub by 2035 with increased FDI, non-oil sector expansion, and modernized infrastructure.",
      visionPlan: "Kuwait Vision 2035 (New Kuwait)",
      prioritySectors: ["Renewable Energy", "Information Technology", "Financial Services", "Logistics & Trade", "Tourism", "Healthcare", "Petrochemicals"],
      nationalGoals: [
        "Increase private sector employment by 69%",
        "Increase FDI by 300% (400M+ Kuwaiti Dinars)",
        "Expand road network from 6,000 km to 9,000 km",
        "Increase higher education enrollment from 30% to 40%"
      ],
      targets: {
        economic: [
          { metric: "Private Sector Employment", value: "+69%", year: 2035, focusArea: "Job Creation" },
          { metric: "FDI", value: "400M+ KWD", year: 2035, focusArea: "Investment" }
        ],
        social: [
          { metric: "Hospital Beds", value: "3.5 per 1,000", year: 2035, focusArea: "Healthcare" },
          { metric: "Government Housing", value: "50% of citizens", year: 2035, focusArea: "Housing" }
        ],
        tech: [
          { metric: "Renewable Energy", value: "15% of consumption", year: 2035, focusArea: "Energy" },
          { metric: "Digital Transformation", value: "Smart Kuwait", year: 2035, focusArea: "Technology" }
        ]
      }
    },
    {
      id: "oman",
      name: "Oman",
      code: "OMN",
      flag: "🇴🇲",
      mission: "To achieve sustainable development across four core pillars: People & Society, Economy & Development, Governance, and Sustainable Environment, positioning Oman as a knowledge-based economy.",
      vision: "Transform Oman into a diversified, knowledge-based economy with 91.6% non-oil GDP contribution, net-zero emissions by 2050, and top-tier global education ranking.",
      visionPlan: "Oman Vision 2040",
      prioritySectors: ["Tourism", "Logistics & Trade", "Manufacturing", "Mining", "Renewable Energy", "Fisheries", "Technology & Innovation"],
      nationalGoals: [
        "Increase non-oil GDP from 61% to 91.6% by 2040",
        "Attract 5+ million tourists annually by 2040",
        "Achieve 30% renewable electricity by 2040",
        "Reach top 10 globally in education by 2040"
      ],
      targets: {
        economic: [
          { metric: "Non-oil GDP", value: "91.6%", year: 2040, focusArea: "Diversification" },
          { metric: "FDI", value: "10% of GDP", year: 2040, focusArea: "Investment" },
          { metric: "Tourism Revenue", value: "RO 20 billion", year: 2040, focusArea: "Tourism" }
        ],
        social: [
          { metric: "Tourism Jobs", value: "560,000 (75% Omani)", year: 2040, focusArea: "Employment" },
          { metric: "Education Ranking", value: "Top 10 globally", year: 2040, focusArea: "Education" }
        ],
        climate: [
          { metric: "Renewable Energy", value: "30%", year: 2040, focusArea: "Energy" },
          { metric: "Net-Zero Emissions", value: "100%", year: 2050, focusArea: "Climate" }
        ]
      }
    },
    {
      id: "qatar",
      name: "Qatar",
      code: "QAT",
      flag: "🇶🇦",
      mission: "To transform Qatar into an advanced society capable of achieving sustainable development through four pillars: Human Development, Social Development, Economic Development, and Environmental Development.",
      vision: "Achieve a high standard of living for all generations by 2030 through a diversified knowledge-based economy, world-class education and healthcare, and environmental sustainability.",
      visionPlan: "Qatar National Vision 2030",
      prioritySectors: ["Finance & Business Services", "Technology & Innovation", "Tourism & Hospitality", "Education & Research", "Healthcare", "Energy", "Infrastructure"],
      nationalGoals: [
        "Diversify economy away from hydrocarbon dependence",
        "Build world-class educational and healthcare systems",
        "100% electric bus fleet by 2030",
        "Qatarization across all workforce sectors"
      ],
      targets: {
        economic: [
          { metric: "Private Sector GDP", value: "Enhanced contribution", year: 2030, focusArea: "Diversification" },
          { metric: "R&D Investment", value: "2.8% of budget", year: 2030, focusArea: "Innovation" },
          { metric: "Airport Capacity", value: "53 million passengers", year: 2030, focusArea: "Infrastructure" }
        ],
        social: [
          { metric: "Education Standards", value: "Global benchmark", year: 2030, focusArea: "Education" },
          { metric: "National Workforce", value: "Qatarization across sectors", year: 2030, focusArea: "Employment" },
          { metric: "Healthcare Facilities", value: "Expanded hospitals & clinics", year: 2030, focusArea: "Health" }
        ],
        climate: [
          { metric: "Electric Public Transport", value: "100%", year: 2030, focusArea: "Mobility" },
          { metric: "Renewable Energy", value: "Increased share", year: 2030, focusArea: "Energy" }
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
      abbreviation: "USA",
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
      abbreviation: "UK",
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

  // Template-based quiz question generator
  const countryData = {
    "saudi-arabia": { name: "Saudi Arabia", vision: "Vision 2030", keyFocus: "tourism and entertainment" },
    "uae": { name: "UAE", vision: "UAE Centennial 2071", keyFocus: "technology and innovation" },
    "bahrain": { name: "Bahrain", vision: "Economic Vision 2030", keyFocus: "financial services" },
    "kuwait": { name: "Kuwait", vision: "Vision 2035", keyFocus: "private sector growth" },
    "oman": { name: "Oman", vision: "Vision 2040", keyFocus: "logistics and tourism" },
    "qatar": { name: "Qatar", vision: "National Vision 2030", keyFocus: "knowledge economy" },
    "singapore": { name: "Singapore", vision: "Smart Nation 2.0", keyFocus: "digital innovation" },
    "canada": { name: "Canada", vision: "Innovation Nation", keyFocus: "research and technology" },
    "australia": { name: "Australia", vision: "Future Made in Australia", keyFocus: "clean energy" },
    "germany": { name: "Germany", vision: "Energiewende 2050", keyFocus: "renewable energy" },
    "japan": { name: "Japan", vision: "Society 5.0", keyFocus: "AI and robotics" },
    "south-korea": { name: "South Korea", vision: "Korean New Deal", keyFocus: "green technology" },
    "usa": { name: "USA", vision: "National Strategy", keyFocus: "infrastructure" },
    "uk": { name: "UK", vision: "Levelling Up", keyFocus: "regional development" },
    "india": { name: "India", vision: "Atmanirbhar Bharat", keyFocus: "manufacturing" }
  };

  const generateTemplateQuestions = (): any[] => {
    const generated: any[] = [];
    
    // Template for each (domain, grade band) combination
    const templates = {
      vision_awareness_8_9: (country: any, countryId: string) => ({
        question: `What is a main goal of ${country.name}'s ${country.vision}?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: `Develop ${country.keyFocus}` },
          { id: "b", text: "Stop all progress" },
          { id: "c", text: "Avoid technology" },
          { id: "d", text: "Reduce education" }
        ],
        correctAnswer: "a",
        gradeBand: "8-9",
        domain: "vision_awareness",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["National Development"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
      }),
      vision_awareness_10_12: (country: any, countryId: string) => ({
        question: `${country.name}'s ${country.vision} emphasizes ${country.keyFocus}. Why is this important for the country's future?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "To create economic opportunities and prepare for the future" },
          { id: "b", text: "To eliminate all jobs" },
          { id: "c", text: "To stop development" },
          { id: "d", text: "To reduce innovation" }
        ],
        correctAnswer: "a",
        gradeBand: "10-12",
        domain: "vision_awareness",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Economic Development", "Innovation"],
        cognitiveLevel: "comprehension",
        outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
      }),
      sector_competency_8_9: (country: any, countryId: string) => ({
        question: `To work in ${country.keyFocus} in ${country.name}, what skills would be helpful?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "Technology skills and continuous learning" },
          { id: "b", text: "No skills needed" },
          { id: "c", text: "Avoiding education" },
          { id: "d", text: "Only manual labor" }
        ],
        correctAnswer: "a",
        gradeBand: "8-9",
        domain: "sector_competency",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Technology", "Learning"],
        cognitiveLevel: "comprehension",
        outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
      }),
      sector_competency_10_12: (country: any, countryId: string) => ({
        question: `Which competency is most valuable for careers aligned with ${country.name}'s focus on ${country.keyFocus}?`,
        questionType: "multiple_choice",
        options: [
          { id: "a", text: "Adaptability, technical skills, and innovation mindset" },
          { id: "b", text: "Resisting all change" },
          { id: "c", text: "Avoiding technology" },
          { id: "d", text: "No competency needed" }
        ],
        correctAnswer: "a",
        gradeBand: "10-12",
        domain: "sector_competency",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Innovation", "Technology"],
        cognitiveLevel: "analysis",
        outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
      }),
      personal_alignment_8_9: (country: any, countryId: string) => ({
        question: `If you care about ${country.keyFocus}, how motivated are you to learn more about careers in this area?`,
        questionType: "rating",
        options: [
          { id: "1", text: "1 - Not interested" },
          { id: "2", text: "2 - Slightly interested" },
          { id: "3", text: "3 - Moderately interested" },
          { id: "4", text: "4 - Very interested" },
          { id: "5", text: "5 - Extremely interested" }
        ],
        correctAnswer: null,
        gradeBand: "8-9",
        domain: "personal_alignment",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["Career Exploration"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
      }),
      personal_alignment_10_12: (country: any, countryId: string) => ({
        question: `How important is contributing to ${country.name}'s ${country.vision} in your career choice?`,
        questionType: "rating",
        options: [
          { id: "1", text: "1 - Not important" },
          { id: "2", text: "2 - Slightly important" },
          { id: "3", text: "3 - Moderately important" },
          { id: "4", text: "4 - Very important" },
          { id: "5", text: "5 - Extremely important" }
        ],
        correctAnswer: null,
        gradeBand: "10-12",
        domain: "personal_alignment",
        countryId,
        sectorTags: [country.keyFocus],
        interestTags: ["National Development", "Purpose"],
        cognitiveLevel: "knowledge",
        outcomeWeights: { vision: 0.3, sector: 0.1, motivation: 0.6 }
      })
    };

    // Generate questions for each country × grade band × domain
    for (const [countryId, country] of Object.entries(countryData)) {
      generated.push(templates.vision_awareness_8_9(country, countryId));
      generated.push(templates.vision_awareness_10_12(country, countryId));
      generated.push(templates.sector_competency_8_9(country, countryId));
      generated.push(templates.sector_competency_10_12(country, countryId));
      generated.push(templates.personal_alignment_8_9(country, countryId));
      generated.push(templates.personal_alignment_10_12(country, countryId));
    }

    return generated;
  };

  // Seed Quiz Questions - combining manual questions with template-generated ones
  const quizQuestions = [
    // VISION AWARENESS - Grade 8-9 - Global
    {
      question: "What does 'sustainable development' mean for a country's future?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Growing the economy as fast as possible" },
        { id: "b", text: "Meeting today's needs without harming future generations" },
        { id: "c", text: "Focusing only on environmental protection" },
        { id: "d", text: "Reducing all technology use" }
      ],
      correctAnswer: "b",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: null,
      sectorTags: ["Environment", "Sustainability"],
      interestTags: ["Science", "Environment"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.6, sector: 0.2, motivation: 0.2 }
    },
    // VISION AWARENESS - Grade 8-9 - UAE
    {
      question: "The UAE wants to be among the world's best countries by 2071. Which of these is a key part of their plan?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Leading in AI and space exploration" },
        { id: "b", text: "Focusing only on oil production" },
        { id: "c", text: "Avoiding all new technology" },
        { id: "d", text: "Reducing tourism" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "uae",
      sectorTags: ["Artificial Intelligence", "Space Exploration", "Technology"],
      interestTags: ["Technology", "Science"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 8-9 - Saudi Arabia
    {
      question: "Saudi Arabia's Vision 2030 aims to reduce dependence on oil. What is one way they're doing this?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Developing tourism and entertainment sectors" },
        { id: "b", text: "Selling more oil" },
        { id: "c", text: "Closing schools" },
        { id: "d", text: "Stopping all construction" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "saudi-arabia",
      sectorTags: ["Tourism & Entertainment", "Renewable Energy", "Technology & Innovation"],
      interestTags: ["Business", "Tourism", "Technology"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 10-12 - Global
    {
      question: "Many countries are investing heavily in renewable energy. What is the primary long-term benefit of this shift?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Lower electricity bills for everyone immediately" },
        { id: "b", text: "Reducing carbon emissions and ensuring energy security" },
        { id: "c", text: "Eliminating all traditional jobs" },
        { id: "d", text: "Making energy more expensive" }
      ],
      correctAnswer: "b",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: null,
      sectorTags: ["Renewable Energy", "Sustainability"],
      interestTags: ["Environment", "Engineering"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.6, sector: 0.3, motivation: 0.1 }
    },
    // VISION AWARENESS - Grade 10-12 - Singapore
    {
      question: "Singapore's Smart Nation 2.0 initiative focuses on using technology to improve citizens' lives. What is a key challenge they must address?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Balancing innovation with data privacy and security" },
        { id: "b", text: "Avoiding all digital technologies" },
        { id: "c", text: "Reducing education standards" },
        { id: "d", text: "Limiting internet access" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "singapore",
      sectorTags: ["Technology", "ICT & Digital Economy"],
      interestTags: ["Technology", "Government"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    
    // SECTOR COMPETENCY - Grade 8-9 - Global
    {
      question: "If you enjoy solving puzzles and building things, which career path might suit you?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Engineering or Computer Science" },
        { id: "b", text: "Writing or Journalism" },
        { id: "c", text: "Sales or Marketing" },
        { id: "d", text: "Teaching Literature" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: null,
      sectorTags: ["Technology", "Engineering"],
      interestTags: ["Problem Solving", "Building", "Technology"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.1, sector: 0.7, motivation: 0.2 }
    },
    // SECTOR COMPETENCY - Grade 8-9 - UAE
    {
      question: "The UAE is investing heavily in space exploration. Which skills would be most valuable for someone wanting to work in this sector?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Math, physics, and engineering" },
        { id: "b", text: "Only drawing and art" },
        { id: "c", text: "Only sports training" },
        { id: "d", text: "Only language skills" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "uae",
      sectorTags: ["Space Exploration", "Technology", "Engineering"],
      interestTags: ["Science", "Technology", "Space"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // SECTOR COMPETENCY - Grade 10-12 - Saudi Arabia
    {
      question: "Saudi Arabia's Vision 2030 prioritizes renewable energy. Which combination of subjects would best prepare you for a career in this sector?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Physics, Chemistry, and Environmental Science" },
        { id: "b", text: "History and Literature only" },
        { id: "c", text: "Physical Education only" },
        { id: "d", text: "Art and Music only" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "saudi-arabia",
      sectorTags: ["Renewable Energy", "Engineering"],
      interestTags: ["Science", "Environment", "Technology"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
    },
    // SECTOR COMPETENCY - Grade 10-12 - USA
    {
      question: "The USA's tech industry is rapidly evolving with AI and machine learning. What mindset is crucial for success in this field?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Continuous learning and adaptability" },
        { id: "b", text: "Avoiding all new technologies" },
        { id: "c", text: "Working only independently" },
        { id: "d", text: "Focusing only on past methods" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "usa",
      sectorTags: ["Technology", "Artificial Intelligence"],
      interestTags: ["Technology", "Innovation", "Learning"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.1, sector: 0.6, motivation: 0.3 }
    },
    
    // PERSONAL ALIGNMENT - Grade 8-9 - Global
    {
      question: "How important is it to you to help solve environmental problems through your future career?",
      questionType: "rating",
      options: [
        { id: "1", text: "Not important at all" },
        { id: "2", text: "Slightly important" },
        { id: "3", text: "Moderately important" },
        { id: "4", text: "Very important" },
        { id: "5", text: "Extremely important" }
      ],
      correctAnswer: null,
      gradeBand: "8-9",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: ["Environment", "Sustainability"],
      interestTags: ["Environment", "Science", "Social Impact"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
    },
    // PERSONAL ALIGNMENT - Grade 8-9 - Global
    {
      question: "I prefer working on projects that:",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Have a clear impact on helping people" },
        { id: "b", text: "Involve creating or building new things" },
        { id: "c", text: "Focus on analyzing data and finding patterns" },
        { id: "d", text: "Allow me to work outdoors or with nature" }
      ],
      correctAnswer: null,
      gradeBand: "8-9",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Social Impact", "Building", "Analysis", "Environment"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.1, sector: 0.3, motivation: 0.6 }
    },
    // PERSONAL ALIGNMENT - Grade 10-12 - Global
    {
      question: "When choosing a career, how important is it that your work aligns with your country's national development goals?",
      questionType: "rating",
      options: [
        { id: "1", text: "Not important - I'll choose based only on personal interest" },
        { id: "2", text: "Slightly important - Nice to have but not essential" },
        { id: "3", text: "Moderately important - I'd like some alignment" },
        { id: "4", text: "Very important - Strong alignment matters to me" },
        { id: "5", text: "Extremely important - It's a top priority" }
      ],
      correctAnswer: null,
      gradeBand: "10-12",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Government", "Social Impact", "National Development"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.4, sector: 0.1, motivation: 0.5 }
    },
    // PERSONAL ALIGNMENT - Grade 10-12 - Global
    {
      question: "I am most motivated by:",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Making a positive impact on society" },
        { id: "b", text: "Earning a high salary" },
        { id: "c", text: "Creative expression and innovation" },
        { id: "d", text: "Job security and stability" }
      ],
      correctAnswer: null,
      gradeBand: "10-12",
      domain: "personal_alignment",
      countryId: null,
      sectorTags: null,
      interestTags: ["Social Impact", "Finance", "Creativity", "Stability"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.2, motivation: 0.6 }
    },

    // Additional country-specific questions for remaining 11 countries
    // Bahrain
    {
      question: "Bahrain's Economic Vision 2030 focuses on shifting from oil dependence. Which sector is a key priority?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Financial Services and ICT" },
        { id: "b", text: "Agriculture only" },
        { id: "c", text: "Coal mining" },
        { id: "d", text: "Textile manufacturing only" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "bahrain",
      sectorTags: ["Financial Services", "ICT & Digital Economy"],
      interestTags: ["Finance", "Technology"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Kuwait
    {
      question: "Kuwait Vision 2035 aims to transform the country into a financial and trade hub. Which area is emphasized?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Private sector development and economic diversification" },
        { id: "b", text: "Only government jobs" },
        { id: "c", text: "Reducing all trade" },
        { id: "d", text: "Closing borders" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "kuwait",
      sectorTags: ["Financial Services", "Trade"],
      interestTags: ["Business", "Finance"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Oman
    {
      question: "Oman Vision 2040 prioritizes economic diversification. Which skills are increasingly important?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Technology, logistics, and tourism expertise" },
        { id: "b", text: "Only oil extraction" },
        { id: "c", text: "No new skills needed" },
        { id: "d", text: "Only traditional crafts" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "oman",
      sectorTags: ["Technology", "Logistics", "Tourism"],
      interestTags: ["Technology", "Tourism", "Business"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Qatar
    {
      question: "Qatar National Vision 2030 emphasizes knowledge economy. Which field is crucial?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Education, research, and technology innovation" },
        { id: "b", text: "Only sports" },
        { id: "c", text: "Reducing education" },
        { id: "d", text: "Avoiding technology" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "qatar",
      sectorTags: ["Education", "Technology", "Research"],
      interestTags: ["Education", "Technology", "Science"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // Canada
    {
      question: "Canada's Innovation Nation strategy focuses on becoming a global leader in innovation. Which mindset is essential?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Continuous learning and embracing new technologies" },
        { id: "b", text: "Avoiding all innovation" },
        { id: "c", text: "Only traditional methods" },
        { id: "d", text: "Rejecting change" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "canada",
      sectorTags: ["Technology", "Innovation", "Research"],
      interestTags: ["Technology", "Innovation", "Learning"],
      cognitiveLevel: "analysis",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Australia
    {
      question: "Australia's 'Future Made in Australia' plan emphasizes clean energy and manufacturing. What's important?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Sustainability skills and advanced manufacturing knowledge" },
        { id: "b", text: "Only mining coal" },
        { id: "c", text: "Avoiding renewable energy" },
        { id: "d", text: "No manufacturing" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "australia",
      sectorTags: ["Renewable Energy", "Manufacturing", "Sustainability"],
      interestTags: ["Environment", "Engineering", "Technology"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    },
    // Germany
    {
      question: "Germany's Energiewende (Energy Transition) 2050 aims for climate neutrality. Which career path aligns with this?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Renewable energy engineering and environmental science" },
        { id: "b", text: "Only fossil fuel extraction" },
        { id: "c", text: "Avoiding green technology" },
        { id: "d", text: "No environmental careers" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "germany",
      sectorTags: ["Renewable Energy", "Environment", "Engineering"],
      interestTags: ["Environment", "Engineering", "Science"],
      cognitiveLevel: "application",
      outcomeWeights: { vision: 0.6, sector: 0.3, motivation: 0.1 }
    },
    // Japan
    {
      question: "Japan's Society 5.0 vision integrates cyber and physical spaces. What skills are vital?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "AI, robotics, and IoT expertise" },
        { id: "b", text: "Only traditional crafts" },
        { id: "c", text: "Avoiding all technology" },
        { id: "d", text: "No digital skills" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "sector_competency",
      countryId: "japan",
      sectorTags: ["Artificial Intelligence", "Robotics", "Technology"],
      interestTags: ["Technology", "Engineering", "Innovation"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.2, sector: 0.7, motivation: 0.1 }
    },
    // South Korea
    {
      question: "South Korea's Korean New Deal focuses on digital and green transformation. Which field is emphasized?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Digital technology and renewable energy" },
        { id: "b", text: "Only heavy industry" },
        { id: "c", text: "Avoiding digital transformation" },
        { id: "d", text: "No green energy" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "vision_awareness",
      countryId: "south-korea",
      sectorTags: ["Technology", "Renewable Energy", "Digital Economy"],
      interestTags: ["Technology", "Environment", "Innovation"],
      cognitiveLevel: "knowledge",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // United Kingdom
    {
      question: "The UK's Levelling Up initiative aims to reduce regional inequality. What does this create opportunities in?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Infrastructure, technology, and regional development" },
        { id: "b", text: "Only London-based jobs" },
        { id: "c", text: "Reducing investment" },
        { id: "d", text: "No regional development" }
      ],
      correctAnswer: "a",
      gradeBand: "10-12",
      domain: "vision_awareness",
      countryId: "uk",
      sectorTags: ["Infrastructure", "Technology", "Regional Development"],
      interestTags: ["Government", "Technology", "Social Impact"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.7, sector: 0.2, motivation: 0.1 }
    },
    // India
    {
      question: "India's Atmanirbhar Bharat (Self-Reliant India) promotes domestic manufacturing. Which skills matter?",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "Manufacturing, technology, and entrepreneurship" },
        { id: "b", text: "Only importing goods" },
        { id: "c", text: "Avoiding manufacturing" },
        { id: "d", text: "No technology skills" }
      ],
      correctAnswer: "a",
      gradeBand: "8-9",
      domain: "sector_competency",
      countryId: "india",
      sectorTags: ["Manufacturing", "Technology", "Entrepreneurship"],
      interestTags: ["Business", "Technology", "Innovation"],
      cognitiveLevel: "comprehension",
      outcomeWeights: { vision: 0.2, sector: 0.6, motivation: 0.2 }
    }
  ];

  // Seed UAE curriculum questions
  console.log("📚 Seeding UAE curriculum questions...");
  
  // Validate question bank
  const validation = validateQuestionBank(uaeQuestionBank);
  if (!validation.valid) {
    console.error("❌ UAE question bank validation failed:");
    validation.errors.forEach(err => console.error(`  - ${err}`));
    throw new Error("Invalid question bank");
  }
  
  // Check coverage
  const coverage = checkCoverage(uaeQuestionBank);
  console.log(`✓ Total questions: ${coverage.totalQuestions}`);
  console.log(`✓ Coverage by subject:`);
  Object.entries(coverage.bySubject).forEach(([subject, counts]) => {
    console.log(`  - ${subject}: Grade 8-9 (${counts["8-9"]}), Grade 10-12 (${counts["10-12"]}), Total (${counts.total})`);
  });
  
  if (coverage.warnings.length > 0) {
    console.log("⚠️ Coverage warnings:");
    coverage.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  // Flatten all questions for seeding
  const allQuestions = uaeQuestionBank.subjects.flatMap(subject => [
    ...subject.grades["8-9"],
    ...subject.grades["10-12"]
  ]);
  
  const existingQuestions = await storage.getAllQuizQuestions?.() || [];
  const existingQuestionTexts = new Set(existingQuestions.map((q: any) => q.question));

  let createdCount = 0;
  for (const question of allQuestions) {
    if (!existingQuestionTexts.has(question.question)) {
      try {
        // Set countryId to null to make questions global (subject competency is universal)
        await storage.createQuizQuestion({ ...question, countryId: null });
        createdCount++;
      } catch (error) {
        console.log(`Error creating quiz question:`, error);
      }
    }
  }
  
  console.log(`✓ Created ${createdCount} new quiz questions (total: ${allQuestions.length})`);

  // Seed Assessment Components (RIASEC)
  console.log("\n📋 Seeding assessment components...");
  
  // Try to create component, or fetch if it already exists
  let riasecComponent;
  try {
    riasecComponent = await storage.createAssessmentComponent({
      name: "RIASEC (Holland Code)",
      key: "riasec",
      description: "Career personality assessment based on Holland's RIASEC model (Realistic, Investigative, Artistic, Social, Enterprising, Conventional)",
      weight: 10, // Default 10% weight in matching algorithm
      isActive: true,
      requiresPremium: true,
      displayOrder: 2, // After Kolb (displayOrder: 1)
    });
    console.log(`✓ Created assessment component: ${riasecComponent.name}`);
  } catch (error: any) {
    if (error?.message?.includes('unique') || error?.code === '23505') {
      // Component already exists - fetch it
      const components = await storage.getAllAssessmentComponents?.() || [];
      riasecComponent = components.find(c => c.key === 'riasec');
      console.log("  RIASEC component already exists");
    } else {
      // Unexpected error - log and continue
      console.error("  Error creating RIASEC component:", error);
    }
  }
  
  // Seed RIASEC career affinities (regardless of whether component was created or fetched)
  if (riasecComponent) {
    console.log("\n🎯 Seeding RIASEC career affinities...");
    const allCareers = await storage.getAllCareers();
    
    for (const mapping of RIASEC_CAREER_AFFINITIES) {
      const career = allCareers.find(c => c.title === mapping.careerTitle);
      if (!career) {
        console.log(`⚠️  Career not found: ${mapping.careerTitle}`);
        continue;
      }
      
      try {
        await storage.createCareerComponentAffinity({
          careerId: career.id,
          componentId: riasecComponent.id,
          affinityData: mapping.affinities, // Store all 6 theme scores as jsonb
        });
        console.log(`✓ Created RIASEC affinities for: ${career.title}`);
      } catch (error: any) {
        if (error?.message?.includes('unique') || error?.code === '23505') {
          // Affinity already exists - silently continue
        } else {
          console.error(`  Error creating affinity for ${career.title}:`, error);
        }
      }
    }
  } else {
    console.error("⚠️  Failed to create or fetch RIASEC component");
  }

  console.log("✅ Database seeded successfully!");
}
