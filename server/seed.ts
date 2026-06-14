import { storage } from "./storage";
import { uaeQuestionBank } from "./questionBanks/uae";
import { validateQuestionBank, checkCoverage, flattenQuestionBank } from "../shared/questionTypes";
import { RIASEC_CAREER_AFFINITIES } from "./riasecAffinities";
import { seedCVQItems } from "./cvq-seed";
import { applyGrade8ArabicContent } from "./migrations/quiz-arabic-content";
import { applyGrades9to12ArabicContent } from "./migrations/quiz-arabic-content-grades9-12";
import { applyCareerArabicContent } from "./migrations/career-arabic-content";
import { WEF_16_SKILLS, CAREER_WEF_SKILL_AFFINITIES } from "./wefSkillsData";

export async function seedDatabase() {
  console.log("🌱 Seeding database...");

  // Seed Countries (UAE only - all quiz questions are UAE curriculum-based)
  const countries = [
    {
      id: "uae",
      name: "United Arab Emirates",
      nameAr: "الإمارات العربية المتحدة",
      code: "UAE",
      abbreviation: "UAE",
      flag: "🇦🇪",
      mission: "To establish the UAE as having the best government, education, and economy in the world through four key pillars: future-focused government, excellent education, diversified knowledge economy, and happy cohesive society.",
      missionAr: "إرساء الإمارات العربية المتحدة دولةً ذات أفضل حكومة وتعليم واقتصاد في العالم، من خلال أربعة ركائز أساسية: حكومة تعمل للمستقبل، وتعليم متميز، واقتصاد متنوع قائم على المعرفة، ومجتمع سعيد ومتماسك.",
      vision: "To be the best country in the world by the UAE's 100th anniversary in 2071, leading in AI, space exploration, and sustainable development.",
      visionAr: "أن تكون الإمارات العربية المتحدة أفضل دولة في العالم بحلول الذكرى المئوية عام 2071، رائدةً في الذكاء الاصطناعي واستكشاف الفضاء والتنمية المستدامة.",
      visionPlan: "UAE Centennial 2071",
      prioritySectors: ["Artificial Intelligence", "Space Exploration", "Biotechnology", "Renewable Energy", "Education", "Technology"],
      prioritySectorsAr: ["الذكاء الاصطناعي", "استكشاف الفضاء", "التكنولوجيا الحيوية", "الطاقة المتجددة", "التعليم", "التكنولوجيا"],
      nationalGoals: [
        "100% AI reliance for government services by 2031",
        "50% clean energy by 2050",
        "Double GDP from AED 1.49 trillion to AED 3 trillion",
        "Mars colonization by 2117"
      ],
      nationalGoalsAr: [
        "الاعتماد الكامل على الذكاء الاصطناعي في الخدمات الحكومية بحلول 2031",
        "50% طاقة نظيفة بحلول 2050",
        "مضاعفة الناتج المحلي الإجمالي من 1.49 إلى 3 تريليونات درهم",
        "استعمار المريخ بحلول 2117"
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
      },
      // Curriculum configuration for UAE
      educationSystem: "The UAE follows a K-12 education system with the Ministry of Education (MoE) National Curriculum. International schools offer British, American, IB, and other curricula.",
      curricula: ["MOE National", "British", "American", "IB"],
      gradeLevels: ["8", "9", "10", "11", "12"],
      universitiesLink: "https://caa.ae",
      universitiesLinkLabel: "CAA Accredited Universities",
      isActive: true,
    },
  ];

  for (const country of countries) {
    try {
      await storage.createCountry(country);
      console.log(`✓ Created country: ${country.name}`);
    } catch (error) {
      console.log(`Country ${country.name} already exists, applying Arabic content migration...`);
      // Patch existing record with Arabic fields (idempotent update)
      try {
        await storage.updateCountry(country.id, {
          nameAr: country.nameAr,
          missionAr: country.missionAr,
          visionAr: country.visionAr,
          prioritySectorsAr: country.prioritySectorsAr,
          nationalGoalsAr: country.nationalGoalsAr,
        });
        console.log(`✓ Arabic content applied to: ${country.name}`);
      } catch (updateError) {
        console.error(`Failed to apply Arabic content to ${country.name}:`, updateError);
      }
    }
  }

  // Seed Subjects (curriculum-scoped)
  const subjects = [
    // UAE MOE National Curriculum subjects
    {
      name: "Mathematics",
      code: "mathematics",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Mathematics curriculum covering algebra, geometry, calculus, and statistics",
      aliases: ["Math", "Maths", "Calculus", "Algebra", "Geometry"],
      displayOrder: 1,
      isActive: true,
    },
    {
      name: "Science",
      code: "science",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education integrated Science curriculum covering physics, chemistry, and biology",
      aliases: ["Physics", "Chemistry", "Biology", "Physical Science", "Life Science"],
      displayOrder: 2,
      isActive: true,
    },
    {
      name: "English",
      code: "english",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education English Language curriculum covering reading, writing, grammar, and literature",
      aliases: ["English Language", "Literature", "Writing"],
      displayOrder: 3,
      isActive: true,
    },
    {
      name: "Arabic",
      code: "arabic",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Arabic Language curriculum covering reading, writing, grammar, and Arabic literature",
      aliases: ["Arabic Language"],
      displayOrder: 4,
      isActive: true,
    },
    {
      name: "Social Studies",
      code: "social_studies",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Social Studies curriculum covering UAE history, geography, civics, and Islamic studies",
      aliases: ["History", "Geography", "Civics", "Government", "Economics", "Sociology"],
      displayOrder: 5,
      isActive: true,
    },
    {
      name: "Computer Science",
      code: "computer_science",
      countryId: "uae",
      curriculum: "MOE National",
      description: "UAE Ministry of Education Computer Science and IT curriculum covering programming, digital literacy, and technology",
      aliases: ["Programming", "Coding", "IT", "Technology"],
      displayOrder: 6,
      isActive: true,
    },
  ];

  for (const subject of subjects) {
    try {
      // Check if subject already exists
      const existing = await storage.getSubjectByCode(subject.countryId, subject.curriculum, subject.code);
      if (!existing) {
        await storage.createSubject(subject);
        console.log(`✓ Created subject: ${subject.name} (${subject.curriculum})`);
      } else {
        console.log(`Subject ${subject.name} (${subject.curriculum}) already exists`);
      }
    } catch (error) {
      console.log(`Subject ${subject.name} already exists or error:`, error);
    }
  }

  // Seed Careers
  const careers = [
    {
      title: "Software Engineer",
      description: "Build apps, websites, and games that people use every day. Turn ideas into working software by writing code and solving technical challenges.",
      requiredSkills: ["Programming", "Problem Solving", "Data Structures", "Algorithms"],
      requiredSkillsAr: ["البرمجة", "حل المشكلات", "هياكل البيانات", "الخوارزميات"],
      relatedSubjects: ["Computer Science", "Mathematics", "Physics"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science or related field",
      averageSalary: "$80,000 - $150,000",
      growthOutlook: "Excellent (25% growth)",
      icon: "💻",
    },
    {
      title: "Data Scientist",
      description: "Uncover hidden patterns in massive amounts of data to help companies predict trends, understand customers, and make smarter decisions. Use AI and machine learning to solve real-world problems.",
      requiredSkills: ["Statistics", "Machine Learning", "Python/R", "Data Visualization"],
      requiredSkillsAr: ["الإحصاء", "التعلم الآلي", "بايثون/R", "تصوير البيانات"],
      relatedSubjects: ["Mathematics", "Computer Science", "Statistics"],
      category: "Technology",
      educationLevel: "Bachelor's or Master's degree in Data Science, Statistics, or Computer Science",
      averageSalary: "$90,000 - $160,000",
      growthOutlook: "Excellent (36% growth)",
      icon: "📊",
    },
    {
      title: "Renewable Energy Engineer",
      description: "Design solar panels, wind turbines, and clean energy systems that power homes and cities without harming the planet. Help create a sustainable future for the next generation.",
      requiredSkills: ["Engineering Design", "Sustainability", "Project Management", "Technical Analysis"],
      requiredSkillsAr: ["التصميم الهندسي", "الاستدامة", "إدارة المشاريع", "التحليل التقني"],
      relatedSubjects: ["Physics", "Mathematics", "Chemistry", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Engineering (Electrical, Mechanical, or Environmental)",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Very Good (20% growth)",
      icon: "⚡",
    },
    {
      title: "Healthcare Professional (Nurse)",
      description: "Care for patients when they need it most, from helping newborns take their first breath to supporting families through difficult times. Make a real difference in people's lives every single day.",
      requiredSkills: ["Patient Care", "Medical Knowledge", "Communication", "Empathy"],
      requiredSkillsAr: ["رعاية المرضى", "المعرفة الطبية", "التواصل", "التعاطف"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Bachelor's of Science in Nursing (BSN)",
      averageSalary: "$60,000 - $95,000",
      growthOutlook: "Excellent (6% growth)",
      icon: "🏥",
    },
    {
      title: "Digital Marketing Specialist",
      description: "Create engaging campaigns, grow social media communities, and help brands connect with customers online. Turn creative ideas into posts, ads, and content that people actually want to see.",
      requiredSkills: ["Social Media", "Content Creation", "Analytics", "SEO/SEM"],
      requiredSkillsAr: ["وسائل التواصل الاجتماعي", "إنشاء المحتوى", "التحليلات", "تحسين محركات البحث"],
      relatedSubjects: ["Business", "English", "Computer Science", "Art"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Marketing, Communications, or Business",
      averageSalary: "$50,000 - $85,000",
      growthOutlook: "Very Good (10% growth)",
      icon: "📱",
    },
    {
      title: "Graphic Designer",
      description: "Design eye-catching logos, posters, websites, and packaging that grab attention and tell stories. Bring brands to life through colors, shapes, and visual creativity that people remember.",
      requiredSkills: ["Creative Design", "Adobe Creative Suite", "Typography", "Visual Communication"],
      requiredSkillsAr: ["التصميم الإبداعي", "حزمة أدوبي الإبداعية", "الطباعة الفنية", "التواصل البصري"],
      relatedSubjects: ["Art", "Computer Science", "Design"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Graphic Design or Fine Arts",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (3% growth)",
      icon: "🎨",
    },
    {
      title: "Mechanical Engineer",
      description: "Invent and improve machines that make life easier, from robots and drones to cars and medical devices. Test your designs, solve technical problems, and watch your creations come to life.",
      requiredSkills: ["CAD Software", "Physics", "Materials Science", "Problem Solving"],
      requiredSkillsAr: ["برامج التصميم بالحاسوب", "الفيزياء", "علم المواد", "حل المشكلات"],
      relatedSubjects: ["Physics", "Mathematics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Mechanical Engineering",
      averageSalary: "$70,000 - $110,000",
      growthOutlook: "Good (2% growth)",
      icon: "⚙️",
    },
    {
      title: "Financial Analyst",
      description: "Help companies and investors grow their money by analyzing markets, predicting trends, and finding smart investment opportunities. Turn numbers into insights that drive million-dollar decisions.",
      requiredSkills: ["Financial Modeling", "Excel", "Data Analysis", "Risk Assessment"],
      requiredSkillsAr: ["النمذجة المالية", "إكسل", "تحليل البيانات", "تقييم المخاطر"],
      relatedSubjects: ["Mathematics", "Economics", "Business"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Finance, Economics, or Accounting",
      averageSalary: "$65,000 - $105,000",
      growthOutlook: "Good (9% growth)",
      icon: "💰",
    },
    {
      title: "Teacher (Secondary Education)",
      description: "Shape young minds and inspire the next generation of scientists, artists, and leaders. Make complex topics exciting, help students discover their talents, and watch them grow into confident learners.",
      requiredSkills: ["Subject Expertise", "Communication", "Patience", "Curriculum Development"],
      requiredSkillsAr: ["الخبرة في المادة", "التواصل", "الصبر", "تطوير المناهج"],
      relatedSubjects: ["Education", "Subject Specialization"],
      category: "Education",
      educationLevel: "Bachelor's degree in Education or subject area + teaching certification",
      averageSalary: "$45,000 - $75,000",
      growthOutlook: "Good (4% growth)",
      icon: "📚",
    },
    {
      title: "Environmental Scientist",
      description: "Protect our planet by studying pollution, climate change, and ecosystems. Develop solutions to environmental challenges and help communities live in harmony with nature.",
      requiredSkills: ["Research", "Data Analysis", "Environmental Policy", "Field Work"],
      requiredSkillsAr: ["البحث", "تحليل البيانات", "السياسة البيئية", "العمل الميداني"],
      relatedSubjects: ["Biology", "Chemistry", "Geography", "Environmental Science"],
      category: "Science",
      educationLevel: "Bachelor's degree in Environmental Science or related field",
      averageSalary: "$55,000 - $90,000",
      growthOutlook: "Very Good (8% growth)",
      icon: "🌍",
    },
    {
      title: "Civil Engineer",
      description: "Plan and build the roads, bridges, airports, and water systems that communities depend on every day. Turn blueprints into real structures that stand for generations.",
      requiredSkills: ["Structural Design", "Project Management", "AutoCAD", "Mathematics"],
      requiredSkillsAr: ["التصميم الإنشائي", "إدارة المشاريع", "أوتوكاد", "الرياضيات"],
      relatedSubjects: ["Mathematics", "Physics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Civil Engineering",
      averageSalary: "$70,000 - $115,000",
      growthOutlook: "Good (5% growth)",
      icon: "🏗️",
    },
    {
      title: "Architect",
      description: "Design stunning buildings and spaces where people live, work, and gather. Blend art with engineering to create structures that are both beautiful and functional.",
      requiredSkills: ["Architectural Design", "3D Modeling", "Building Codes", "Creativity"],
      requiredSkillsAr: ["التصميم المعماري", "النمذجة ثلاثية الأبعاد", "قوانين البناء", "الإبداع"],
      relatedSubjects: ["Art", "Mathematics", "Physics", "Engineering"],
      category: "Design & Architecture",
      educationLevel: "Bachelor's degree in Architecture + licensing",
      averageSalary: "$65,000 - $120,000",
      growthOutlook: "Good (3% growth)",
      icon: "🏛️",
    },
    {
      title: "Electrical Engineer",
      description: "Design the electrical systems that power everything from smartphones to power grids. Work on cutting-edge technology like electric vehicles, renewable energy, and smart devices.",
      requiredSkills: ["Circuit Design", "Power Systems", "Electronics", "Programming"],
      requiredSkillsAr: ["تصميم الدوائر الكهربائية", "أنظمة الطاقة", "الإلكترونيات", "البرمجة"],
      relatedSubjects: ["Physics", "Mathematics", "Computer Science"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Electrical Engineering",
      averageSalary: "$75,000 - $125,000",
      growthOutlook: "Very Good (7% growth)",
      icon: "⚡",
    },
    {
      title: "Biomedical Engineer",
      description: "Create life-saving medical devices like artificial organs, prosthetic limbs, and diagnostic equipment. Combine engineering with biology to solve healthcare challenges and improve patient care.",
      requiredSkills: ["Medical Device Design", "Biomechanics", "Regulatory Compliance", "Research"],
      requiredSkillsAr: ["تصميم الأجهزة الطبية", "الميكانيكا الحيوية", "الامتثال التنظيمي", "البحث"],
      relatedSubjects: ["Biology", "Physics", "Mathematics", "Engineering"],
      category: "Engineering",
      educationLevel: "Bachelor's degree in Biomedical Engineering",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Excellent (10% growth)",
      icon: "🔬",
    },
    {
      title: "Pharmacist",
      description: "Be the medication expert who helps patients understand their prescriptions and stay healthy. Advise doctors on drug interactions and ensure people get the right treatments safely.",
      requiredSkills: ["Pharmacology", "Patient Counseling", "Drug Interactions", "Attention to Detail"],
      requiredSkillsAr: ["علم الأدوية", "إرشاد المرضى", "التفاعلات الدوائية", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Chemistry", "Biology", "Health Science"],
      category: "Healthcare",
      educationLevel: "Doctor of Pharmacy (PharmD) degree + licensing",
      averageSalary: "$90,000 - $135,000",
      growthOutlook: "Good (2% growth)",
      icon: "💊",
    },
    {
      title: "Doctor (General Practitioner)",
      description: "Be the first person people turn to when they're sick or need medical advice. Diagnose illnesses, treat patients, and build trusted relationships that keep communities healthy.",
      requiredSkills: ["Medical Diagnosis", "Patient Care", "Clinical Skills", "Communication"],
      requiredSkillsAr: ["التشخيص الطبي", "رعاية المرضى", "المهارات السريرية", "التواصل"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Medical degree (MD or DO) + residency + licensing",
      averageSalary: "$150,000 - $250,000",
      growthOutlook: "Good (3% growth)",
      icon: "⚕️",
    },
    {
      title: "Dentist",
      description: "Help people maintain healthy smiles and confident teeth. Fix cavities, perform cleanings, and educate patients on oral health using precision and care.",
      requiredSkills: ["Dental Procedures", "Patient Care", "Hand-Eye Coordination", "Attention to Detail"],
      requiredSkillsAr: ["إجراءات طب الأسنان", "رعاية المرضى", "التنسيق الحركي", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Biology", "Chemistry", "Health Science"],
      category: "Healthcare",
      educationLevel: "Doctor of Dental Surgery (DDS) or Doctor of Dental Medicine (DMD) + licensing",
      averageSalary: "$130,000 - $200,000",
      growthOutlook: "Good (6% growth)",
      icon: "🦷",
    },
    {
      title: "Physical Therapist",
      description: "Help athletes recover from injuries, assist elderly patients regain mobility, and guide people through rehabilitation exercises. Make movement possible again for those in pain.",
      requiredSkills: ["Patient Rehabilitation", "Anatomy Knowledge", "Exercise Therapy", "Empathy"],
      requiredSkillsAr: ["إعادة تأهيل المرضى", "معرفة التشريح", "العلاج بالتمارين", "التعاطف"],
      relatedSubjects: ["Biology", "Health Science", "Physical Education"],
      category: "Healthcare",
      educationLevel: "Doctor of Physical Therapy (DPT) degree + licensing",
      averageSalary: "$70,000 - $95,000",
      growthOutlook: "Excellent (17% growth)",
      icon: "🏃",
    },
    {
      title: "Psychologist",
      description: "Help people overcome anxiety, depression, and life challenges through counseling and therapy. Understand how the human mind works and guide people toward better mental health.",
      requiredSkills: ["Counseling", "Research", "Assessment", "Empathy"],
      requiredSkillsAr: ["الإرشاد", "البحث", "التقييم", "التعاطف"],
      relatedSubjects: ["Psychology", "Biology", "Social Studies"],
      category: "Healthcare",
      educationLevel: "Doctoral degree in Psychology (PhD or PsyD) + licensing",
      averageSalary: "$65,000 - $110,000",
      growthOutlook: "Good (6% growth)",
      icon: "🧠",
    },
    {
      title: "Social Worker",
      description: "Stand up for people who need help the most. Connect families with resources, support children in difficult situations, and advocate for vulnerable communities.",
      requiredSkills: ["Case Management", "Advocacy", "Communication", "Empathy"],
      requiredSkillsAr: ["إدارة الحالات", "المناصرة", "التواصل", "التعاطف"],
      relatedSubjects: ["Social Studies", "Psychology", "Sociology"],
      category: "Social Services",
      educationLevel: "Bachelor's degree in Social Work (BSW) or Master's (MSW)",
      averageSalary: "$45,000 - $70,000",
      growthOutlook: "Very Good (9% growth)",
      icon: "🤝",
    },
    {
      title: "Lawyer",
      description: "Fight for justice in courtrooms, negotiate major business deals, and defend people's rights. Use persuasive arguments and legal knowledge to solve complex disputes.",
      requiredSkills: ["Legal Research", "Advocacy", "Writing", "Critical Thinking"],
      requiredSkillsAr: ["البحث القانوني", "المناصرة", "الكتابة", "التفكير النقدي"],
      relatedSubjects: ["English", "Social Studies", "Government"],
      category: "Legal",
      educationLevel: "Law degree (JD) + bar exam",
      averageSalary: "$80,000 - $180,000",
      growthOutlook: "Good (4% growth)",
      icon: "⚖️",
    },
    {
      title: "Accountant",
      description: "Manage company finances, prepare tax returns, and help businesses make smart financial decisions. Work with numbers to ensure organizations stay profitable and legally compliant.",
      requiredSkills: ["Accounting", "Tax Preparation", "Excel", "Attention to Detail"],
      requiredSkillsAr: ["المحاسبة", "إعداد الضرائب", "إكسل", "الاهتمام بالتفاصيل"],
      relatedSubjects: ["Mathematics", "Business", "Economics"],
      category: "Finance",
      educationLevel: "Bachelor's degree in Accounting + CPA certification",
      averageSalary: "$55,000 - $95,000",
      growthOutlook: "Good (4% growth)",
      icon: "📊",
    },
    {
      title: "Human Resources Manager",
      description: "Build great company cultures by hiring talented people, resolving workplace conflicts, and developing programs that make employees happy and productive. Be the bridge between management and staff.",
      requiredSkills: ["Recruitment", "Employee Relations", "Conflict Resolution", "Leadership"],
      requiredSkillsAr: ["التوظيف", "علاقات الموظفين", "حل النزاعات", "القيادة"],
      relatedSubjects: ["Business", "Psychology", "Communication"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Human Resources or Business",
      averageSalary: "$70,000 - $120,000",
      growthOutlook: "Good (7% growth)",
      icon: "👥",
    },
    {
      title: "Management Consultant",
      description: "Solve tough business challenges for major companies. Analyze problems, present solutions to executives, and help organizations transform their operations and strategy.",
      requiredSkills: ["Business Analysis", "Strategy", "Presentation", "Problem Solving"],
      requiredSkillsAr: ["تحليل الأعمال", "الاستراتيجية", "العروض التقديمية", "حل المشكلات"],
      relatedSubjects: ["Business", "Mathematics", "Economics"],
      category: "Business & Management",
      educationLevel: "Bachelor's degree in Business or related field (MBA preferred)",
      averageSalary: "$85,000 - $150,000",
      growthOutlook: "Very Good (11% growth)",
      icon: "📈",
    },
    {
      title: "Entrepreneur",
      description: "Turn your ideas into reality by launching your own business. Take calculated risks, innovate solutions to problems, and build something from the ground up that you're passionate about.",
      requiredSkills: ["Business Planning", "Risk Taking", "Innovation", "Leadership"],
      requiredSkillsAr: ["التخطيط التجاري", "المخاطرة المحسوبة", "الابتكار", "القيادة"],
      relatedSubjects: ["Business", "Mathematics", "Economics"],
      category: "Business & Management",
      educationLevel: "Varies (business education helpful but not required)",
      averageSalary: "Varies widely",
      growthOutlook: "Depends on venture",
      icon: "🚀",
    },
    {
      title: "Sales Manager",
      description: "Lead teams that bring in revenue and grow businesses. Develop winning sales strategies, motivate your team to hit targets, and build strong client relationships that last.",
      requiredSkills: ["Sales Strategy", "Leadership", "Communication", "Negotiation"],
      requiredSkillsAr: ["استراتيجية المبيعات", "القيادة", "التواصل", "التفاوض"],
      relatedSubjects: ["Business", "Communication", "Mathematics"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Business or Marketing",
      averageSalary: "$70,000 - $130,000",
      growthOutlook: "Good (4% growth)",
      icon: "📞",
    },
    {
      title: "Marketing Manager",
      description: "Create campaigns that make products successful and brands memorable. Plan launch strategies, analyze customer behavior, and lead creative teams to connect with target audiences.",
      requiredSkills: ["Marketing Strategy", "Digital Marketing", "Analytics", "Creativity"],
      requiredSkillsAr: ["استراتيجية التسويق", "التسويق الرقمي", "التحليلات", "الإبداع"],
      relatedSubjects: ["Business", "English", "Art", "Computer Science"],
      category: "Business & Marketing",
      educationLevel: "Bachelor's degree in Marketing or Business",
      averageSalary: "$75,000 - $140,000",
      growthOutlook: "Very Good (8% growth)",
      icon: "📣",
    },
    {
      title: "Product Manager",
      description: "Own the vision for digital products and features. Work with designers and engineers to bring new ideas to life, listen to customer feedback, and decide what gets built next.",
      requiredSkills: ["Product Strategy", "User Research", "Project Management", "Communication"],
      requiredSkillsAr: ["استراتيجية المنتج", "بحث المستخدمين", "إدارة المشاريع", "التواصل"],
      relatedSubjects: ["Business", "Computer Science", "Design"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Business, Computer Science, or related field",
      averageSalary: "$90,000 - $160,000",
      growthOutlook: "Excellent (20% growth)",
      icon: "📦",
    },
    {
      title: "UX/UI Designer",
      description: "Make apps and websites beautiful and easy to use. Research how people interact with technology, design intuitive interfaces, and create experiences that delight users.",
      requiredSkills: ["User Research", "Interface Design", "Prototyping", "Design Tools"],
      requiredSkillsAr: ["بحث المستخدمين", "تصميم الواجهات", "النمذجة الأولية", "أدوات التصميم"],
      relatedSubjects: ["Art", "Computer Science", "Psychology"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Design, HCI, or related field",
      averageSalary: "$65,000 - $120,000",
      growthOutlook: "Very Good (13% growth)",
      icon: "🎨",
    },
    {
      title: "Video Game Designer",
      description: "Design engaging games that players love. Create immersive worlds, develop gameplay mechanics that keep players interested, and tell compelling stories through interactive experiences.",
      requiredSkills: ["Game Design", "Creativity", "Programming", "Storytelling"],
      requiredSkillsAr: ["تصميم الألعاب", "الإبداع", "البرمجة", "سرد القصص"],
      relatedSubjects: ["Computer Science", "Art", "English"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Game Design or Computer Science",
      averageSalary: "$55,000 - $110,000",
      growthOutlook: "Good (5% growth)",
      icon: "🎮",
    },
    {
      title: "Journalist",
      description: "Uncover the truth and tell important stories that inform the public. Investigate issues that matter, interview key people, and report news that holds power accountable.",
      requiredSkills: ["Writing", "Research", "Interviewing", "Critical Thinking"],
      requiredSkillsAr: ["الكتابة", "البحث", "إجراء المقابلات", "التفكير النقدي"],
      relatedSubjects: ["English", "Social Studies", "Communication"],
      category: "Media & Communications",
      educationLevel: "Bachelor's degree in Journalism or Communications",
      averageSalary: "$40,000 - $75,000",
      growthOutlook: "Declining (-6% growth)",
      icon: "📰",
    },
    {
      title: "Content Creator",
      description: "Build an online following by creating videos, posts, and content that people love to watch and share. Turn your creativity and personality into a career on platforms like YouTube, TikTok, and Instagram.",
      requiredSkills: ["Video Production", "Social Media", "Creativity", "Audience Engagement"],
      requiredSkillsAr: ["إنتاج الفيديو", "وسائل التواصل الاجتماعي", "الإبداع", "إشراك الجمهور"],
      relatedSubjects: ["Art", "English", "Computer Science"],
      category: "Media & Communications",
      educationLevel: "Varies (communications or media degree helpful)",
      averageSalary: "$35,000 - $100,000+",
      growthOutlook: "Excellent (growing field)",
      icon: "🎥",
    },
    {
      title: "Photographer",
      description: "Tell stories through powerful images. Capture weddings, fashion shoots, news events, or nature scenes. Turn moments into memories and art that people treasure.",
      requiredSkills: ["Photography", "Photo Editing", "Lighting", "Creativity"],
      requiredSkillsAr: ["التصوير الفوتوغرافي", "تعديل الصور", "الإضاءة", "الإبداع"],
      relatedSubjects: ["Art", "Computer Science"],
      category: "Creative Arts",
      educationLevel: "Formal training helpful but not always required",
      averageSalary: "$35,000 - $80,000",
      growthOutlook: "Good (4% growth)",
      icon: "📸",
    },
    {
      title: "Chef",
      description: "Create delicious dishes that make people's day better. Design menus, experiment with flavors and techniques, and lead kitchen teams in restaurants, hotels, or your own establishment.",
      requiredSkills: ["Cooking", "Menu Planning", "Food Safety", "Creativity"],
      requiredSkillsAr: ["الطبخ", "تخطيط قائمة الطعام", "سلامة الغذاء", "الإبداع"],
      relatedSubjects: ["Chemistry", "Art", "Business"],
      category: "Culinary Arts",
      educationLevel: "Culinary school or apprenticeship",
      averageSalary: "$40,000 - $85,000",
      growthOutlook: "Good (6% growth)",
      icon: "👨‍🍳",
    },
    {
      title: "Fashion Designer",
      description: "Create the clothes and accessories that define style and culture. Sketch original designs, select fabrics, and see your creations on runways or in stores worldwide.",
      requiredSkills: ["Fashion Design", "Sewing", "Trend Forecasting", "Creativity"],
      requiredSkillsAr: ["تصميم الأزياء", "الخياطة", "توقع الاتجاهات", "الإبداع"],
      relatedSubjects: ["Art", "Design", "Business"],
      category: "Creative Arts",
      educationLevel: "Bachelor's degree in Fashion Design",
      averageSalary: "$45,000 - $95,000",
      growthOutlook: "Stable (0% growth)",
      icon: "👗",
    },
    {
      title: "Interior Designer",
      description: "Transform empty spaces into beautiful, functional rooms where people love to live and work. Choose colors, furniture, and layouts that match clients' dreams and lifestyles.",
      requiredSkills: ["Space Planning", "Color Theory", "3D Modeling", "Client Communication"],
      requiredSkillsAr: ["تخطيط المساحات", "نظرية الألوان", "النمذجة ثلاثية الأبعاد", "التواصل مع العملاء"],
      relatedSubjects: ["Art", "Mathematics", "Design"],
      category: "Design & Architecture",
      educationLevel: "Bachelor's degree in Interior Design",
      averageSalary: "$45,000 - $90,000",
      growthOutlook: "Good (4% growth)",
      icon: "🛋️",
    },
    {
      title: "Web Developer",
      description: "Build attractive, high-performance websites and web applications. Turn interface designs into smooth, interactive experiences using modern web technologies and collaborate with design teams to launch standout digital products.",
      requiredSkills: ["HTML/CSS", "JavaScript", "Frontend Frameworks", "APIs"],
      requiredSkillsAr: ["HTML/CSS", "JavaScript", "أطر العمل الأمامية", "واجهات برمجة التطبيقات"],
      relatedSubjects: ["Computer Science", "Mathematics", "Design"],
      category: "Technology",
      educationLevel: "Bachelor's degree in Computer Science or related field",
      averageSalary: "$60,000 - $120,000",
      growthOutlook: "Excellent (23% growth)",
      icon: "🌐",
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
  if (validation.warnings.length > 0) {
    console.warn("⚠️  UAE question bank warnings:");
    validation.warnings.forEach(w => console.warn(`  - ${w}`));
  }
  
  // Check coverage
  const coverage = checkCoverage(uaeQuestionBank);
  console.log(`✓ Total questions: ${coverage.totalQuestions}`);
  console.log(`✓ Coverage by subject:`);
  Object.entries(coverage.bySubject).forEach(([subject, counts]) => {
    console.log(`  - ${subject}: Grade 8 (${counts["8"]}), Grade 9 (${counts["9"]}), Grade 10 (${counts["10"]}), Grade 11 (${counts["11"]}), Grade 12 (${counts["12"]}), Total (${counts.total})`);
  });
  
  if (coverage.warnings.length > 0) {
    console.log("⚠️ Coverage warnings:");
    coverage.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  // Flatten all questions for seeding
  const allQuestions = flattenQuestionBank(uaeQuestionBank);
  
  const existingQuestions = await storage.getAllQuizQuestions?.() || [];
  const existingQuestionTexts = new Set(existingQuestions.map((q: any) => q.question));

  let createdCount = 0;
  for (const question of allQuestions) {
    if (!existingQuestionTexts.has(question.question)) {
      try {
        // Use countryId and curriculum from the question bank
        // Convert string grade to numeric grade for database compatibility
        const numericGrade = question.grade ? parseInt(question.grade) : null;
        
        // Extract only the fields that match InsertQuizQuestion schema
        await storage.createQuizQuestion({ 
          question: question.question,
          questionType: question.questionType,
          options: question.options,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          ...(question.questionAr ? { questionAr: question.questionAr } : {}),
          ...(question.optionsAr ? { optionsAr: question.optionsAr } : {}),
          ...(question.explanationAr ? { explanationAr: question.explanationAr } : {}),
          subject: question.subject,
          grade: numericGrade!,
          countryId: question.countryId, // Now properly links to UAE country
          curriculum: question.curriculum, // MOE National curriculum
          topic: question.topic,
          difficulty: question.difficulty,
          cognitiveLevel: question.cognitiveLevel,
        });
        createdCount++;
      } catch (error) {
        console.log(`Error creating quiz question:`, error);
      }
    }
  }
  
  console.log(`✓ Created ${createdCount} new quiz questions (total: ${allQuestions.length})`);

  // Seed Assessment Components
  console.log("\n📋 Seeding assessment components...");
  
  // Define all components with database default weights
  // Note: Actual weights are determined by tier-specific overrides in tierWeights.ts
  const componentsToSeed = [
    {
      name: "Subject Match",
      key: "subjects",
      description: "Matches career requirements with student's subject preferences and demonstrated competency from quiz scores",
      weight: 35, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 0,
    },
    {
      name: "Interest Match",
      key: "interests",
      description: "Keyword-based matching between student interests and career descriptions (free tier only)",
      weight: 35, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 1,
    },
    {
      name: "Country Vision Alignment",
      key: "vision",
      description: "Aligns career paths with national development priorities and vision sectors",
      weight: 30, // Default weight (overridden per tier)
      isActive: true,
      requiresPremium: false,
      displayOrder: 2,
    },
    {
      name: "RIASEC (Holland Code)",
      key: "riasec",
      description: "Career personality assessment based on Holland's RIASEC model (Realistic, Investigative, Artistic, Social, Enterprising, Conventional)",
      weight: 35,
      isActive: true,
      requiresPremium: true,
      displayOrder: 3,
    },
    {
      name: "Personal Values (CVQ)",
      key: "cvq",
      description: "Career values alignment based on Children's Values Questionnaire (Schwartz model)",
      weight: 25,
      isActive: true,
      requiresPremium: true,
      displayOrder: 4,
    },
  ];
  
  // Seed or update all components
  const seededComponents: Record<string, any> = {};
  for (const componentData of componentsToSeed) {
    try {
      const component = await storage.createAssessmentComponent(componentData);
      seededComponents[componentData.key] = component;
      console.log(`✓ Created component: ${component.name} (${component.weight}%)`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        // Component already exists - fetch and update weight
        const components = await storage.getAllAssessmentComponents?.() || [];
        const existing = components.find((c: any) => c.key === componentData.key);
        if (existing) {
          // Update weight and isActive status
          const updated = await storage.updateAssessmentComponent(existing.id, {
            weight: componentData.weight,
            isActive: componentData.isActive,
            description: componentData.description,
          });
          seededComponents[componentData.key] = updated;
          console.log(`  ${componentData.name} already exists (updated weight to ${componentData.weight}%)`);
        }
      } else {
        console.error(`  Error creating component ${componentData.name}:`, error);
      }
    }
  }
  
  // Seed RIASEC career affinities (regardless of whether component was created or fetched)
  const riasecComponent = seededComponents['riasec'];
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
        if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
          // Affinity already exists - silently continue
        } else {
          console.error(`  Error creating affinity for ${career.title}:`, error);
        }
      }
    }
  } else {
    console.error("⚠️  Failed to create or fetch RIASEC component");
  }

  // Seed WEF (World Economic Forum) 16 Skills Framework
  console.log("\n🌐 Seeding WEF 16 Skills Framework...");
  
  // Seed WEF Skills (6 foundational literacies + 10 competencies)
  const seededWefSkills: Record<string, any> = {};
  for (const skillData of WEF_16_SKILLS) {
    try {
      const skill = await storage.upsertWefSkillByName(skillData);
      seededWefSkills[skill.name] = skill;
      console.log(`✓ ${skillData.competencyType === 'foundational_literacy' ? '📚' : '🎯'} ${skill.name} (${skill.displayOrder}/16)`);
    } catch (error: any) {
      console.error(`  Error seeding WEF skill ${skillData.name}:`, error);
    }
  }
  
  console.log(`\n✓ Seeded ${Object.keys(seededWefSkills).length}/16 WEF skills`);
  
  // Seed Career-WEF Skill Affinities
  console.log("\n🔗 Seeding Career-WEF Skill affinities...");
  const allCareersForWef = await storage.getAllCareers();
  
  // Check if affinities are already seeded by comparing expected vs actual counts
  const expectedAffinityCount = CAREER_WEF_SKILL_AFFINITIES.reduce((total, mapping) => {
    return total + Object.keys(mapping.skills).length;
  }, 0);
  
  // Get actual count from database
  const existingAffinityCount = await storage.getCareerWefSkillAffinityCount();
  
  if (existingAffinityCount >= expectedAffinityCount) {
    console.log(`✓ WEF career affinities already seeded (${existingAffinityCount}/${expectedAffinityCount}), skipping...`);
  } else {
    console.log(`  Found ${existingAffinityCount} existing affinities, need ${expectedAffinityCount}. Seeding missing affinities...`);
    // Proceed with seeding
    let affinitiesCreated = 0;
    let affinitiesUpdated = 0;
    
    for (const mapping of CAREER_WEF_SKILL_AFFINITIES) {
      const career = allCareersForWef.find(c => c.title === mapping.careerTitle);
      if (!career) {
        console.log(`⚠️  Career not found: ${mapping.careerTitle}`);
        continue;
      }
      
      // For each skill affinity score
      for (const [skillName, affinityScore] of Object.entries(mapping.skills)) {
        const wefSkill = seededWefSkills[skillName];
        if (!wefSkill) {
          console.log(`⚠️  WEF skill not found: ${skillName}`);
          continue;
        }
        
        // Validate affinity score (0-100)
        if (affinityScore < 0 || affinityScore > 100) {
          console.warn(`⚠️  Invalid affinity score for ${career.title} - ${skillName}: ${affinityScore} (expected 0-100)`);
        }
        
        try {
          // Check if affinity already exists to determine if we're creating or updating
          const existing = await storage.getCareerWefSkillAffinity(career.id, wefSkill.id);
          
          await storage.createOrUpdateCareerWefSkillAffinity(
            career.id,
            wefSkill.id,
            {
              affinityScore,
              source: 'Expert Panel',
              evidence: null,
            }
          );
          
          if (existing) {
            affinitiesUpdated++;
          } else {
            affinitiesCreated++;
          }
        } catch (error: any) {
          console.error(`  Error creating affinity for ${career.title} - ${skillName}:`, error);
        }
      }
    }
    
    console.log(`✓ Created ${affinitiesCreated} new affinities, updated ${affinitiesUpdated} existing affinities`);
    console.log(`✓ Total affinities: ${affinitiesCreated + affinitiesUpdated} across ${allCareersForWef.length} careers × 16 WEF skills`);
  }

  // Seed UAE Priority Sectors and WEF Skills Mapping
  console.log("\n🇦🇪 Seeding UAE Priority Sectors → WEF Skills mapping...");
  
  // Define UAE sector-to-WEF skills mappings with importance scores (0-100)
  // Based on UAE Centennial 2071 priorities and WEF Future of Jobs 2025 insights
  const UAE_SECTOR_WEF_SKILLS = [
    {
      name: "Artificial Intelligence",
      displayOrder: 1,
      description: "AI-driven innovation across government services, economy, and society",
      skills: {
        "ICT Literacy": 95,
        "Critical Thinking and Problem Solving": 90,
        "Numeracy": 85,
        "Creativity": 80,
        "Adaptability": 75,
      }
    },
    {
      name: "Space Exploration",
      displayOrder: 2,
      description: "Leadership in space science, Mars colonization, and satellite technology",
      skills: {
        "Scientific Literacy": 95,
        "Critical Thinking and Problem Solving": 90,
        "Numeracy": 85,
        "Initiative": 80,
        "Collaboration": 75,
      }
    },
    {
      name: "Biotechnology",
      displayOrder: 3,
      description: "Advanced healthcare, genomics, and life sciences innovation",
      skills: {
        "Scientific Literacy": 95,
        "Critical Thinking and Problem Solving": 85,
        "ICT Literacy": 75,
        "Curiosity": 80,
        "Collaboration": 70,
      }
    },
    {
      name: "Renewable Energy",
      displayOrder: 4,
      description: "50% clean energy by 2050 and climate leadership",
      skills: {
        "Scientific Literacy": 90,
        "Critical Thinking and Problem Solving": 85,
        "Sustainability": 90, // Map to Scientific Literacy if Sustainability not in WEF 16
        "Numeracy": 75,
        "Adaptability": 70,
      }
    },
    {
      name: "Education",
      displayOrder: 5,
      description: "World-class education system and lifelong learning culture",
      skills: {
        "Communication": 90,
        "Collaboration": 85,
        "Literacy": 90,
        "Social and Cultural Awareness": 80,
        "Creativity": 75,
      }
    },
    {
      name: "Technology",
      displayOrder: 6,
      description: "Digital transformation, smart cities, and innovation ecosystem",
      skills: {
        "ICT Literacy": 95,
        "Critical Thinking and Problem Solving": 85,
        "Creativity": 80,
        "Adaptability": 75,
        "Initiative": 70,
      }
    },
  ];

  const allCountries = await storage.getAllCountries();
  const uaeCountry = allCountries.find((c: any) => c.code === "UAE");
  if (!uaeCountry) {
    console.warn("⚠️  UAE country not found, skipping priority sectors seeding");
  } else {
    let sectorsCreated = 0;
    let skillMappingsCreated = 0;

    for (const sectorData of UAE_SECTOR_WEF_SKILLS) {
      // Create or update sector
      const sector = await storage.createOrUpdateCountryPrioritySector(
        uaeCountry.id,
        sectorData.name,
        sectorData.displayOrder,
        sectorData.description
      );
      sectorsCreated++;

      // Map sector to WEF skills
      for (const [skillName, importance] of Object.entries(sectorData.skills)) {
        // Handle "Sustainability" mapping to Scientific Literacy
        const mappedSkillName = skillName === "Sustainability" ? "Scientific Literacy" : skillName;
        const wefSkill = seededWefSkills[mappedSkillName];
        
        if (!wefSkill) {
          console.warn(`⚠️  WEF skill not found: ${skillName} (mapped to ${mappedSkillName})`);
          continue;
        }

        await storage.createOrUpdateCountrySectorWefSkill(
          sector.id,
          wefSkill.id,
          importance
        );
        skillMappingsCreated++;
      }
    }

    console.log(`✓ Created/updated ${sectorsCreated} UAE priority sectors`);
    console.log(`✓ Created/updated ${skillMappingsCreated} sector→WEF skill mappings`);
  }

  // Seed CVQ (Children's Values Questionnaire) items
  try {
    await seedCVQItems();
  } catch (error: any) {
    console.error("  CVQ seed error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic translations to Grade 8 quiz questions
  try {
    await applyGrade8ArabicContent();
  } catch (error: any) {
    console.error("  Grade 8 Arabic quiz content error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic translations to Grade 9–12 quiz questions
  try {
    await applyGrades9to12ArabicContent();
  } catch (error: any) {
    console.error("  Grades 9–12 Arabic quiz content error (non-fatal, continuing):", error.message);
  }

  // Apply Arabic titles and descriptions to all 36 careers
  try {
    await applyCareerArabicContent();
  } catch (error: any) {
    console.error("  Career Arabic content error (non-fatal, continuing):", error.message);
  }

  // Validate Arabic completeness — warn about canonical careers missing AR translations
  // Only checks careers whose titles match the canonical seed list; rogue/test DB
  // entries with non-standard titles (e.g. suffixed with digits) are excluded.
  try {
    const { CANONICAL_CAREER_TITLES } = await import("./migrations/career-arabic-content");
    const allCareers = await storage.getAllCareers();
    const missingAr = allCareers.filter(
      c => CANONICAL_CAREER_TITLES.has(c.title) &&
           (!c.titleAr || !c.descriptionAr || !c.requiredSkillsAr?.length || !c.educationLevelAr)
    );
    if (missingAr.length > 0) {
      console.warn(`⚠️  ${missingAr.length} career(s) missing Arabic translations: ${missingAr.map(c => c.title).join(', ')}`);
      console.warn("   To fix: edit in the Superadmin Dashboard → Careers tab or use career-arabic-content.ts");
    }
  } catch {
    // Non-fatal — don't block startup
  }

  // Seed Test Organization Admin Account (for testing admin functionality)
  console.log("\n👤 Seeding test organization admin account...");
  try {
    const { hashPassword } = await import("./utils/passwordHash");
    const { db } = await import("./db");
    const { users, organizations, organizationMembers } = await import("@shared/schema");

    const adminPassword = process.env.SEED_SCHOOLADMIN_PASSWORD;
    const existingAdmin = await storage.getUserByUsername("schooladmin");

    if (existingAdmin) {
      // Account already exists — do NOT reset its password, so live
      // credential changes are never clobbered on deploy.
      console.log("  Test admin account already exists (schooladmin) - password left unchanged");
    } else if (!adminPassword) {
      // No account yet, and no password to set. Never fall back to a
      // hardcoded password — skip seeding and warn instead.
      console.warn("  ⚠️  SEED_SCHOOLADMIN_PASSWORD is not set — skipping schooladmin account creation (no hardcoded fallback).");
    } else {
      // Create admin user — password is only set here, at creation time
      const adminPasswordHash = await hashPassword(adminPassword);
      const [adminUser] = await db
        .insert(users)
        .values({
          username: "schooladmin",
          email: "admin@futurepathways.edu",
          firstName: "School",
          lastName: "Administrator",
          passwordHash: adminPasswordHash,
          accountType: 'org_admin',
          role: 'admin',
          isOrgGenerated: false,
          isPremium: false,
        })
        .returning();

      // Create test organization
      const [testOrg] = await db
        .insert(organizations)
        .values({
          name: "Test High School",
          adminUserId: adminUser.id,
          totalLicenses: 50,
          usedLicenses: 0,
          passwordComplexity: 'medium',
        })
        .returning();

      // Create organization membership for admin
      await db.insert(organizationMembers).values({
        organizationId: testOrg.id,
        userId: adminUser.id,
        role: 'admin',
      });

      console.log("✓ Test organization admin created:");
      console.log(`  📧 Username: schooladmin`);
      console.log(`  🏫 Organization: ${testOrg.name}`);
      console.log(`  📊 Total Licenses: ${testOrg.totalLicenses}`);
    }
  } catch (error: any) {
    console.error("  Error creating test admin:", error.message);
  }

  // Seed Superadmin Account
  console.log("\n🔐 Seeding superadmin account...");
  try {
    const { hashPassword: hashPw } = await import("./utils/passwordHash");
    const { db: dbConn } = await import("./db");
    const { users: usersTable } = await import("@shared/schema");
    const { eq: eqOp } = await import("drizzle-orm");

    const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD;

    // Use the first email from SUPERADMIN_EMAILS env var if set, otherwise fall back to local dev placeholder
    const superadminEmailFromEnv = (process.env.SUPERADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .find((e) => e.length > 0);
    const superadminEmail = superadminEmailFromEnv || "superadmin@local.dev";

    // First, check if a superadmin already exists by username
    const existingByUsername = await storage.getUserByUsername("superadmin");

    // Also check if the SUPERADMIN_EMAILS account exists (might be OAuth-created, no username/password)
    const [existingByEmail] = await dbConn
      .select()
      .from(usersTable)
      .where(eqOp(usersTable.email, superadminEmail))
      .limit(1);

    if (existingByUsername) {
      // Account already exists — do NOT reset its password, so live
      // credential changes are never clobbered on deploy. Only ensure the
      // role is correct (idempotent, not a credential reset).
      await dbConn
        .update(usersTable)
        .set({ role: "superadmin" })
        .where(eqOp(usersTable.id, existingByUsername.id));
      console.log("  Superadmin account already exists (username: superadmin) - password left unchanged");
    } else if (!superadminPassword) {
      // No username account yet, and no password to set. Never fall back to a
      // hardcoded password — skip seeding and warn instead.
      console.warn("  ⚠️  SEED_SUPERADMIN_PASSWORD is not set — skipping superadmin account creation (no hardcoded fallback).");
    } else if (existingByEmail) {
      // OAuth-created account with this email exists but no username/password — patch it
      const superadminHash = await hashPw(superadminPassword);
      await dbConn
        .update(usersTable)
        .set({ username: "superadmin", passwordHash: superadminHash, role: "superadmin" })
        .where(eqOp(usersTable.id, existingByEmail.id));
      console.log(`  ✓ Patched OAuth account (${superadminEmail}) with username & password for superadmin login`);
    } else {
      // No account at all — create fresh (password is only set here, at creation time)
      const superadminHash = await hashPw(superadminPassword);
      await dbConn
        .insert(usersTable)
        .values({
          username: "superadmin",
          email: superadminEmail,
          firstName: "Super",
          lastName: "Admin",
          passwordHash: superadminHash,
          accountType: "individual",
          role: "superadmin",
          isOrgGenerated: false,
          isPremium: false,
        });
      console.log(`  ✓ Superadmin account created (username: superadmin, email: ${superadminEmail})`);
    }
  } catch (error: any) {
    console.error("  Error seeding superadmin:", error.message);
  }

  // Seed Scoring Tiers and Tier Component Weights
  console.log("\n⚙️ Seeding scoring methodology configuration...");
  
  // Define scoring tiers (matching tierWeights.ts)
  const tiersToSeed = [
    {
      key: "basic",
      name: "Free Assessment",
      description: "Basic career assessment using subject preferences, interests, and vision alignment",
      isActive: true,
      displayOrder: 0,
    },
    {
      key: "premium",
      name: "Premium Assessment",
      description: "Comprehensive career assessment including personality and values assessments",
      isActive: true,
      displayOrder: 1,
    },
    {
      key: "group",
      name: "School Assessment",
      description: "Premium assessment for school/organization students",
      isActive: true,
      displayOrder: 2,
    },
  ];
  
  // Seed tiers
  const seededTiers: Record<string, any> = {};
  for (const tierData of tiersToSeed) {
    try {
      const tier = await storage.createScoringTier(tierData);
      seededTiers[tierData.key] = tier;
      console.log(`✓ Created scoring tier: ${tier.name}`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        const existing = await storage.getScoringTierByKey(tierData.key);
        if (existing) {
          seededTiers[tierData.key] = existing;
          console.log(`  Scoring tier ${tierData.name} already exists`);
        }
      } else {
        console.error(`  Error creating tier ${tierData.name}:`, error);
      }
    }
  }
  
  // Define tier-specific component weights (migrating from tierWeights.ts)
  const tierWeightConfigs: Record<string, Record<string, { weight: number; isEnabled: boolean }>> = {
    basic: {
      subjects: { weight: 35, isEnabled: true },
      interests: { weight: 35, isEnabled: true },
      vision: { weight: 30, isEnabled: true },
      riasec: { weight: 0, isEnabled: false },
      cvq: { weight: 0, isEnabled: false },
    },
    premium: {
      subjects: { weight: 20, isEnabled: true },
      interests: { weight: 0, isEnabled: false },
      vision: { weight: 20, isEnabled: true },
      riasec: { weight: 35, isEnabled: true },
      cvq: { weight: 25, isEnabled: true },
    },
    group: {
      subjects: { weight: 20, isEnabled: true },
      interests: { weight: 0, isEnabled: false },
      vision: { weight: 20, isEnabled: true },
      riasec: { weight: 35, isEnabled: true },
      cvq: { weight: 25, isEnabled: true },
    },
  };
  
  // Seed tier component weights
  for (const [tierKey, componentWeights] of Object.entries(tierWeightConfigs)) {
    const tier = seededTiers[tierKey];
    if (!tier) continue;
    
    for (const [componentKey, config] of Object.entries(componentWeights)) {
      const component = seededComponents[componentKey];
      if (!component) continue;
      
      try {
        await storage.upsertTierComponentWeight({
          tierId: tier.id,
          componentId: component.id,
          weight: config.weight,
          isEnabled: config.isEnabled,
        });
      } catch (error: any) {
        console.error(`  Error setting weight for ${tierKey}/${componentKey}:`, error.message);
      }
    }
    console.log(`✓ Configured weights for tier: ${tier.name}`);
  }
  
  // Seed LLM Prompt Templates for premium reports
  console.log("\n📝 Seeding LLM prompt templates...");
  
  const promptTemplates = [
    {
      key: "career_reasoning",
      name: "Why This Career?",
      description: "Generates personalized explanation of why a career matches the student",
      systemPrompt: `You are a career guidance counselor for school students aged 13-18 in the UAE. Your role is to explain career matches in an encouraging, age-appropriate way. Be specific about how the student's assessment results connect to the career.`,
      userPromptTemplate: `Based on the following student assessment data, explain why {{careerTitle}} is a good career match for this student.

Student Assessment Data:
- Overall Match Score: {{overallScore}}%
- Top RIASEC Themes: {{riasecTop3}}
- Top Personal Values: {{cvqTop3}}
- Favorite Subjects: {{favoriteSubjects}}

Career Information:
- Title: {{careerTitle}}
- Category: {{careerCategory}}
- Required Skills: {{requiredSkills}}

Write 4-5 paragraphs explaining:
1. Why this career matches their personality and interests
2. How their interests and strengths fit the work environment
3. How their values align with this career path
4. Their subject strengths and skill development opportunities
5. Growth potential and future outlook in the UAE

IMPORTANT: Write your entire response in {{language}}. If the language is Arabic, use right-to-left Arabic script throughout.`,
      model: "claude-sonnet-4-6",
      maxTokens: 1000,
      temperature: 0.7,
      isActive: true,
    },
    {
      key: "education_pathways",
      name: "Education Pathways",
      description: "Recommends educational programs and universities for the career path",
      systemPrompt: `You are an educational advisor helping UAE school students plan their higher education journey. Provide practical, actionable guidance about programs, universities, and preparation steps. Always reference official UAE education resources.`,
      userPromptTemplate: `Based on the student's career interest in {{careerTitle}}, recommend educational pathways.

Student Information:
- Grade Level: {{gradeLevel}}
- Favorite Subjects: {{favoriteSubjects}}

Career Requirements:
- Education Level: {{educationLevel}}
- Required Skills: {{requiredSkills}}
- Related Subjects: {{relatedSubjects}}

Provide guidance on:
1. Recommended degree programs (bachelor's, master's if applicable)
2. Key subjects to focus on in remaining school years
3. Extracurricular activities that would strengthen applications
4. Preparation timeline (what to do now, next year, before university)

Important: Direct students to verify program accreditation at:
- UAE Commission for Academic Accreditation: https://caa.ae/Pages/Institutes/All.aspx
- Accredited Programs: https://caa.ae/Pages/Programs/All.aspx

IMPORTANT: Write your entire response in {{language}}. If the language is Arabic, use right-to-left Arabic script throughout.`,
      model: "claude-sonnet-4-6",
      maxTokens: 800,
      temperature: 0.7,
      isActive: true,
    },
  ];

  for (const template of promptTemplates) {
    try {
      await storage.createLlmPromptTemplate(template);
      console.log(`✓ Created prompt template: ${template.name}`);
    } catch (error: any) {
      if (error?.message?.includes('unique') || error?.code === '23505' || error?.cause?.code === '23505') {
        // Template exists — update model and userPromptTemplate to current defaults
        try {
          const existing = await storage.getLlmPromptTemplateByKey(template.key);
          if (existing) {
            await storage.updateLlmPromptTemplate(existing.id, {
              model: template.model,
              userPromptTemplate: template.userPromptTemplate,
            });
            console.log(`  Prompt template ${template.name} already exists (model + userPromptTemplate updated)`);
          } else {
            console.log(`  Prompt template ${template.name} already exists`);
          }
        } catch {
          console.log(`  Prompt template ${template.name} already exists`);
        }
      } else {
        console.error(`  Error creating template ${template.name}:`, error.message);
      }
    }
  }

  console.log("\n✅ Database seeded successfully!");
}
